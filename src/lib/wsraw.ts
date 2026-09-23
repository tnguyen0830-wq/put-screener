import { request as httpsRequest } from 'node:https';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import type { Socket } from 'node:net';

/**
 * Một máy khách WebSocket tối giản (RFC 6455) viết trên `node:https`.
 *
 * Vì sao không dùng `globalThis.WebSocket` của Node: ĐO ĐƯỢC ở production
 * 2026-09-23 (ảnh chụp của chủ app) — ba lần nối tới luồng từng lệnh của
 * Unusual Whales đều hỏng, 0 khung, và máy khách có sẵn KHÔNG NÓI VÌ SAO: khi
 * máy chủ trả gì khác 101 nó chỉ bắn một sự kiện `error` chung chung
 * ("non-101 status code"), vứt mất cả mã lẫn thân câu trả lời. Còn phép hỏi
 * HTTP thường của #221 thì ra `400` thân trống — một câu trả lời cho câu hỏi
 * KHÁC (một GET không có `Upgrade` bị từ chối trước khi máy chủ kịp xét khoá
 * hay gói), nên nó không phân biệt được gì.
 *
 * Tự làm bắt tay thì câu trả lời của UW cho ĐÚNG yêu cầu nâng cấp nằm trong
 * tay: mã, vài header, và thân nguyên văn. Và nếu UW trả 101 ở đây thì cũng
 * là phép thử ngược — lỗi nằm ở máy khách có sẵn chứ không ở UW — mà khi đó
 * luồng đã chạy luôn bằng chính máy khách này.
 *
 * Phạm vi cố ý hẹp: khung chữ/nhị phân, ghép mảnh, ping→pong, đóng hai chiều.
 * KHÔNG xin `permessage-deflate` (nên khung nén không bao giờ được phép tới —
 * tới thì là lỗi giao thức và được NÓI RA, không giải mã bừa). Giao diện sự
 * kiện giống `WebSocket` của trình duyệt (`onopen`/`onmessage`/`onerror`/
 * `onclose`, `send`, `close`) để `liveflowws.ts` đổi máy khách mà không đổi
 * logic.
 */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** Một thông điệp lớn hơn mức này là bất thường với một lệnh khớp; giữ trần
 *  để một luồng lỗi không nuốt hết RAM của Render. */
export const MAX_MESSAGE = 8 * 1024 * 1024;
const BODY_CLIP = 2_000;

export type Handshake = {
  /** Mã HTTP UW trả cho yêu cầu nâng cấp. 101 = nhận. */
  status: number;
  statusText: string;
  /** Vài header đáng đọc, không phải tất cả. */
  headers: Record<string, string>;
  /** Thân câu trả lời khi KHÔNG phải 101 (cắt gọn). */
  body: string | null;
};

type Ev = { message?: string; data?: string; code?: number; reason?: string };

const KEEP_HEADERS = [
  'content-type',
  'server',
  'upgrade',
  'connection',
  'sec-websocket-accept',
  'sec-websocket-extensions',
  'sec-websocket-protocol',
  'www-authenticate',
  'location',
  'retry-after',
  'x-ratelimit-remaining',
];

export function acceptFor(key: string): string {
  return createHash('sha1').update(key + GUID).digest('base64');
}

/** Dựng một khung gửi đi (máy khách BẮT BUỘC che mặt nạ). */
export function encodeFrame(opcode: number, payload: Buffer, mask = randomBytes(4)): Buffer {
  const len = payload.length;
  const head: number[] = [0x80 | opcode];
  if (len < 126) head.push(0x80 | len);
  else if (len < 65_536) head.push(0x80 | 126, (len >> 8) & 0xff, len & 0xff);
  else {
    head.push(0x80 | 127, 0, 0, 0, 0);
    head.push((len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
  }
  const out = Buffer.alloc(head.length + 4 + len);
  Buffer.from(head).copy(out, 0);
  mask.copy(out, head.length);
  for (let i = 0; i < len; i++) out[head.length + 4 + i] = payload[i] ^ mask[i & 3];
  return out;
}

export type Frame = { fin: boolean; rsv: number; opcode: number; payload: Buffer };

/** Bóc các khung trọn vẹn khỏi đầu `buf`. Trả phần còn dư (khung chưa về đủ). */
export function decodeFrames(buf: Buffer): { frames: Frame[]; rest: Buffer; tooBig: boolean } {
  const frames: Frame[] = [];
  let off = 0;
  for (;;) {
    if (buf.length - off < 2) break;
    const b0 = buf[off];
    const b1 = buf[off + 1];
    let len = b1 & 0x7f;
    let p = off + 2;
    if (len === 126) {
      if (buf.length - p < 2) break;
      len = buf.readUInt16BE(p);
      p += 2;
    } else if (len === 127) {
      if (buf.length - p < 8) break;
      const hi = buf.readUInt32BE(p);
      const lo = buf.readUInt32BE(p + 4);
      if (hi > 0 || lo > MAX_MESSAGE) return { frames, rest: Buffer.alloc(0), tooBig: true };
      len = lo;
      p += 8;
    }
    if (len > MAX_MESSAGE) return { frames, rest: Buffer.alloc(0), tooBig: true };
    const masked = (b1 & 0x80) !== 0;
    let mask: Buffer | null = null;
    if (masked) {
      if (buf.length - p < 4) break;
      mask = buf.subarray(p, p + 4);
      p += 4;
    }
    if (buf.length - p < len) break;
    let payload = Buffer.from(buf.subarray(p, p + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    frames.push({ fin: (b0 & 0x80) !== 0, rsv: (b0 >> 4) & 0x7, opcode: b0 & 0x0f, payload });
    off = p + len;
  }
  return { frames, rest: buf.subarray(off), tooBig: false };
}

export class RawWebSocket {
  onopen: ((ev: Ev) => void) | null = null;
  onmessage: ((ev: Ev) => void) | null = null;
  onerror: ((ev: Ev) => void) | null = null;
  onclose: ((ev: Ev) => void) | null = null;
  /** Câu trả lời của máy chủ cho yêu cầu nâng cấp — có ngay cả khi bị từ chối. */
  handshake: Handshake | null = null;
  readyState: 0 | 1 | 2 | 3 = 0;

  private sock: Socket | null = null;
  private buf: Buffer = Buffer.alloc(0);
  private parts: Buffer[] = [];
  private partsLen = 0;
  private closed = false;
  private sentClose = false;
  private req: ReturnType<typeof httpsRequest> | null = null;

  constructor(url: string, opts: { headers?: Record<string, string> } = {}) {
    let u: URL;
    try {
      u = new URL(url);
    } catch (e: any) {
      throw new Error(`URL WebSocket không hợp lệ: ${String(e?.message ?? e)}`);
    }
    const secure = u.protocol === 'wss:';
    if (!secure && u.protocol !== 'ws:') throw new Error(`giao thức ${u.protocol} không phải ws/wss`);
    const key = randomBytes(16).toString('base64');
    const mk = secure ? httpsRequest : httpRequest;
    const req = mk({
      host: u.hostname,
      port: u.port || (secure ? 443 : 80),
      path: `${u.pathname}${u.search}`,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key,
        'User-Agent': 'put-screener (Node)',
        ...(opts.headers ?? {}),
      },
    });
    this.req = req as any;

    req.on('upgrade', (res: IncomingMessage, socket: Socket, head: Buffer) => {
      this.handshake = snapshot(res, null);
      const accept = String(res.headers['sec-websocket-accept'] ?? '');
      if (res.statusCode !== 101 || accept !== acceptFor(key)) {
        socket.destroy();
        this.fail(
          res.statusCode !== 101
            ? `máy chủ trả ${res.statusCode} thay vì 101`
            : `Sec-WebSocket-Accept sai (${accept || 'không có'}) — máy chủ không hoàn tất bắt tay đúng chuẩn`
        );
        return;
      }
      if (res.headers['sec-websocket-extensions']) {
        // Không xin phần mở rộng nào, nên máy chủ không được tự bật. Bật thì
        // khung sẽ nén mà ta không giải được — nói ra thay vì đọc rác.
        socket.destroy();
        this.fail(`máy chủ tự bật phần mở rộng không được xin: ${String(res.headers['sec-websocket-extensions'])}`);
        return;
      }
      this.sock = socket;
      socket.setNoDelay(true);
      this.readyState = 1;
      socket.on('data', (d: Buffer) => this.onData(d));
      socket.on('error', (e: any) => this.emitError(`lỗi socket: ${e?.code ?? ''} ${e?.message ?? e}`.trim()));
      socket.on('close', () => this.finish(1006, ''));
      this.onopen?.({});
      if (head && head.length) this.onData(head);
    });

    req.on('response', (res: IncomingMessage) => {
      // Không phải nâng cấp: đây CHÍNH LÀ lời từ chối của máy chủ. Đọc thân.
      const chunks: Buffer[] = [];
      let n = 0;
      res.on('data', (c: Buffer) => {
        if (n < BODY_CLIP) chunks.push(c);
        n += c.length;
      });
      const done = () => {
        const text = Buffer.concat(chunks).toString('utf8').slice(0, BODY_CLIP);
        this.handshake = snapshot(res, text || null);
        this.fail(`máy chủ trả ${res.statusCode} thay vì 101`);
      };
      res.on('end', done);
      res.on('error', done);
    });

    req.on('error', (e: any) => {
      this.fail(`không nối được: ${e?.code ?? ''} ${e?.message ?? e}`.trim());
    });
    req.end();
  }

  send(text: string) {
    if (this.readyState !== 1 || !this.sock) throw new Error('WebSocket chưa mở');
    this.sock.write(encodeFrame(0x1, Buffer.from(text, 'utf8')));
  }

  close(code = 1000, reason = '') {
    if (this.readyState === 0) {
      this.req?.destroy();
      this.finish(code, reason);
      return;
    }
    if (this.readyState !== 1 || !this.sock) return;
    this.sendClose(code, reason);
    this.readyState = 2;
    const s = this.sock;
    const t = setTimeout(() => s.destroy(), 2_000);
    t.unref?.();
  }

  private sendClose(code: number, reason: string) {
    if (this.sentClose || !this.sock) return;
    this.sentClose = true;
    const r = Buffer.from(reason.slice(0, 120), 'utf8');
    const p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0);
    r.copy(p, 2);
    try {
      this.sock.write(encodeFrame(0x8, p));
    } catch {
      /* socket đã chết */
    }
  }

  private onData(d: Buffer) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    const { frames, rest, tooBig } = decodeFrames(this.buf);
    this.buf = rest;
    for (const f of frames) {
      if (this.closed) return;
      this.onFrame(f);
    }
    if (tooBig) this.protocolError(1009, `khung lớn hơn ${MAX_MESSAGE} byte`);
  }

  private onFrame(f: Frame) {
    if (f.rsv !== 0) return this.protocolError(1002, `khung mang bit RSV=${f.rsv} (nén?) mà không phần mở rộng nào được thoả thuận`);
    switch (f.opcode) {
      case 0x9: // ping
        try {
          this.sock?.write(encodeFrame(0xa, f.payload));
        } catch {
          /* bỏ qua */
        }
        return;
      case 0xa: // pong
        return;
      case 0x8: {
        const code = f.payload.length >= 2 ? f.payload.readUInt16BE(0) : 1005;
        const reason = f.payload.length > 2 ? f.payload.subarray(2).toString('utf8') : '';
        this.sendClose(code === 1005 ? 1000 : code, '');
        this.sock?.end();
        this.finish(code, reason);
        return;
      }
      case 0x1:
      case 0x2:
        if (this.parts.length) return this.protocolError(1002, 'khung mới tới khi khung trước chưa ghép xong');
        if (f.fin) return this.emitMessage(f.payload);
        this.parts = [f.payload];
        this.partsLen = f.payload.length;
        return;
      case 0x0:
        if (!this.parts.length) return this.protocolError(1002, 'khung nối tiếp không có khung mở đầu');
        this.parts.push(f.payload);
        this.partsLen += f.payload.length;
        if (this.partsLen > MAX_MESSAGE) return this.protocolError(1009, `thông điệp lớn hơn ${MAX_MESSAGE} byte`);
        if (f.fin) {
          const all = Buffer.concat(this.parts);
          this.parts = [];
          this.partsLen = 0;
          this.emitMessage(all);
        }
        return;
      default:
        return this.protocolError(1002, `opcode lạ ${f.opcode}`);
    }
  }

  private emitMessage(p: Buffer) {
    this.onmessage?.({ data: p.toString('utf8') });
  }

  private emitError(message: string) {
    this.onerror?.({ message });
  }

  private protocolError(code: number, message: string) {
    this.emitError(message);
    this.sendClose(code, '');
    this.sock?.destroy();
    this.finish(code, message);
  }

  private fail(message: string) {
    if (this.closed) return;
    this.emitError(message);
    this.finish(1006, '');
  }

  private finish(code: number, reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

function snapshot(res: IncomingMessage, body: string | null): Handshake {
  const headers: Record<string, string> = {};
  for (const h of KEEP_HEADERS) {
    const v = res.headers[h];
    if (v !== undefined) headers[h] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return {
    status: res.statusCode ?? 0,
    statusText: res.statusMessage ?? '',
    headers,
    body: body ? body.replace(/\s+/g, ' ').trim() : null,
  };
}
