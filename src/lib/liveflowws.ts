import {
  mergeRows,
  parseTrade,
  redactKey,
  tradesIn,
  unwrapFrame,
  type LiveRow,
} from './liveflow';
import { RawWebSocket, type Handshake } from './wsraw';

/**
 * Luồng TỪNG LỆNH KHỚP của Unusual Whales qua WebSocket — nửa "như màn UW"
 * của tab Live Flow (#219). Nửa kia (`liveflowload.ts`) là alert REST.
 *
 * CHƯA MỘT CHỮ NÀO Ở ĐÂY ĐƯỢC ĐO. `api.unusualwhales.com` bị chặn từ sandbox,
 * nên URL (`wss://api.unusualwhales.com/socket?token=…`), thông điệp tham gia
 * kênh (`{"channel":"option_trades","msg_type":"join"}`), hình dạng khung
 * (`[kênh, nội dung]`) và tên trường của một lệnh đều là NHỚ ĐƯỢC. Luồng
 * WebSocket còn có thể là một GÓI RIÊNG mà tài khoản chưa mua. Vì vậy module
 * này được viết để TỰ NÓI RA thứ nó nhận được, đúng idiom probe:
 *
 *   - `firstFrames`: năm khung ĐIỀU KHIỂN đầu tiên (không phải lệnh), nguyên
 *     văn đã che khoá — lời từ chối của UW, nếu có, nằm ở đây;
 *   - `sampleKeys`: khoá thật của lệnh đầu tiên;
 *   - `closeCode` / `closeReason` / `lastError`: vì sao kết nối chết;
 *   - bộ đếm khung / lệnh / lệnh dưới ngưỡng / lệnh không bóc được.
 *
 * Nên "chưa nối được", "nối được mà UW từ chối kênh", "nối được, có khung mà
 * không bóc được lệnh" và "chạy tốt" là bốn màn hình KHÁC NHAU, không phải
 * một bảng trống giống nhau.
 *
 * Kết nối nằm trong RAM của MỘT route bundle (`/api/liveflow`) — đúng chỗ, vì
 * chỉ một route import module này (#193). Nó mở KHI CÓ NGƯỜI XEM và đóng sau
 * `IDLE_MS` không ai hỏi: luồng toàn thị trường là hàng chục nghìn lệnh mỗi
 * phút, giữ nó suốt đêm cho không ai xem là đốt CPU của Render vô ích.
 *
 * MÁY KHÁCH là `RawWebSocket` (`wsraw.ts`), không phải `globalThis.WebSocket`
 * của Node — ĐO ĐƯỢC ở production 2026-09-23: ba lần nối đều hỏng, 0 khung,
 * và máy khách có sẵn chỉ nói "non-101" chứ không nói UW trả gì. Máy khách tự
 * viết giữ lại mã + header + thân của câu trả lời bắt tay (`diag.handshake`),
 * tức chính lời UW nói với ĐÚNG yêu cầu nâng cấp — thứ phép GET thường của
 * #221 không trả lời được (nó ra `400` thân trống vì thiếu `Upgrade`).
 *
 * Chỉ giữ lệnh có premium ≥ `MIN_PREMIUM` (ảnh màn UW chủ app gửi không có
 * dòng nào dưới $25K): không có sàn này thì bộ đệm 1.500 dòng chỉ phủ vài
 * giây của luồng toàn thị trường. Số lệnh bị bỏ vì dưới sàn được ĐẾM, không
 * im lặng.
 */

const URL_BASE = 'wss://api.unusualwhales.com/socket';
const CHANNEL = 'option_trades';
export const MIN_PREMIUM = 25_000;
export const CAP = 1_500;
export const IDLE_MS = 90_000;
/** Lùi khi kết nối chết: 5s, 15s, 60s, rồi 5 phút. Lời từ chối lặp lại y hệt
 *  mà bấm lại liên tục chỉ gõ cửa vô ích. */
const BACKOFF = [5_000, 15_000, 60_000, 300_000];
const MAX_CONTROL_FRAMES = 5;
/** Bắt tay WebSocket quá chừng này chưa xong thì coi là hỏng. Không có hạn
 *  chờ thì một máy chủ không trả lời làm màn hình nói "Đang nối…" MÃI MÃI —
 *  đúng lỗi chủ app gặp ở production 2026-09-23 (#221). */
export const CONNECT_TIMEOUT_MS = 15_000;
const FRAME_CLIP = 300;

export type WsState = 'idle' | 'connecting' | 'open' | 'closed' | 'unsupported' | 'no-key';

type Diag = {
  state: WsState;
  since: number | null;
  connectedAt: number | null;
  lastMessageAt: number | null;
  frames: number;
  controlFrames: number;
  trades: number;
  kept: number;
  belowFloor: number;
  unparsed: number;
  nonJson: number;
  sampleKeys: string[];
  firstFrames: string[];
  closeCode: number | null;
  closeReason: string | null;
  lastError: string | null;
  attempts: number;
  nextRetryAt: number | null;
  /** Câu trả lời của UW cho yêu cầu nâng cấp WebSocket ở lần nối gần nhất —
   *  mã (101 = nhận), vài header, và thân nguyên văn khi bị từ chối (đã che
   *  khoá). 401 khoá sai, 403 gói chưa mở, 404 sai địa chỉ… */
  handshake: (Handshake & { at: number }) | null;
};

const fresh = (): Diag => ({
  state: 'idle',
  since: null,
  connectedAt: null,
  lastMessageAt: null,
  frames: 0,
  controlFrames: 0,
  trades: 0,
  kept: 0,
  belowFloor: 0,
  unparsed: 0,
  nonJson: 0,
  sampleKeys: [],
  firstFrames: [],
  closeCode: null,
  closeReason: null,
  lastError: null,
  attempts: 0,
  nextRetryAt: null,
  handshake: null,
});

let diag: Diag = fresh();
let rows: LiveRow[] = [];
let pending: LiveRow[] = [];
let socket: any = null;
let lastDemand = 0;
let sawTrade = false;
let timer: any = null;
let retryTimer: any = null;
let connectTimer: any = null;

/** Máy khách dùng để nối. Test thay bằng một lớp giả. */
let openSocket: (url: string) => any = (url) => new RawWebSocket(url);
export function _setOpener(fn: ((url: string) => any) | null) {
  openSocket = fn ?? ((url) => new RawWebSocket(url));
}

const key = () => process.env.UW_API_KEY;
const clip = (s: string) => redactKey(s.length > FRAME_CLIP ? `${s.slice(0, FRAME_CLIP)}…` : s, key());

function recordHandshake(ws: any) {
  const h: Handshake | null | undefined = ws?.handshake;
  if (!h) return;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(h.headers ?? {})) headers[k] = clip(String(v));
  diag.handshake = {
    at: Date.now(),
    status: h.status,
    statusText: clip(h.statusText ?? ''),
    headers,
    body: h.body ? clip(h.body) : null,
  };
}

function flush() {
  if (pending.length) {
    rows = mergeRows(rows, pending, CAP);
    pending = [];
  }
}

function onMessage(text: string, now: number) {
  diag.frames++;
  diag.lastMessageAt = now;
  const f = unwrapFrame(text);
  if (!f) {
    diag.nonJson++;
    if (diag.firstFrames.length < MAX_CONTROL_FRAMES) diag.firstFrames.push(clip(text));
    return;
  }
  const isTradeChannel = f.channel === null || f.channel.startsWith(CHANNEL);
  const items = isTradeChannel ? tradesIn(f.payload) : [];
  // Khung không mang lệnh nào đọc được = khung điều khiển (xác nhận tham gia,
  // lời từ chối, nhịp tim). Giữ vài cái đầu nguyên văn: đó là phép đo.
  const parsed = items.map(parseTrade);
  if (!parsed.some(Boolean)) {
    // Không đếm vào `unparsed`: khung xác nhận tham gia kênh cũng rơi vào đây,
    // và gọi nó là "lệnh bóc hỏng" là một cảnh báo sai. Nếu hình dạng lệnh
    // thật không bóc được thì `trades` đứng ở 0, khung nguyên văn nằm trong
    // `firstFrames`, và màn hình nói ra sau 20 giây im lặng.
    diag.controlFrames++;
    if (diag.firstFrames.length < MAX_CONTROL_FRAMES) diag.firstFrames.push(clip(text));
    if (items[0] && diag.sampleKeys.length === 0 && !sawTrade) diag.sampleKeys = Object.keys(items[0]).slice(0, 60);
    return;
  }
  // Khoá mẫu lấy từ LỆNH THẬT đầu tiên, đè lên khoá của khung điều khiển.
  if (!sawTrade) {
    const i = parsed.findIndex(Boolean);
    diag.sampleKeys = Object.keys(items[i]).slice(0, 60);
    sawTrade = true;
  }
  for (const r of parsed) {
    if (!r) {
      diag.unparsed++;
      continue;
    }
    diag.trades++;
    if ((r.premium ?? 0) < MIN_PREMIUM) {
      diag.belowFloor++;
      continue;
    }
    diag.kept++;
    pending.push(r);
  }
  // Gộp theo lô: luồng toàn thị trường mà sắp xếp lại bộ đệm mỗi khung là
  // tốn CPU vô ích; đủ 200 dòng chờ hoặc lúc có người hỏi thì gộp.
  if (pending.length >= 200) flush();
}

function scheduleRetry(now: number) {
  const wait = BACKOFF[Math.min(diag.attempts - 1, BACKOFF.length - 1)] ?? BACKOFF[0];
  diag.nextRetryAt = now + wait;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (Date.now() - lastDemand < IDLE_MS) connect(Date.now());
  }, wait);
  retryTimer?.unref?.();
}

function connect(now: number) {
  const k = key();
  if (!k) {
    diag.state = 'no-key';
    return;
  }
  diag.state = 'connecting';
  diag.since = now;
  diag.attempts++;
  diag.closeCode = null;
  diag.closeReason = null;
  let ws: any;
  try {
    ws = openSocket(`${URL_BASE}?token=${encodeURIComponent(k)}`);
  } catch (e: any) {
    diag.state = 'closed';
    diag.lastError = clip(`không mở được WebSocket: ${String(e?.message ?? e)}`);
    scheduleRetry(now);
    return;
  }
  socket = ws;
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (socket !== ws || diag.state !== 'connecting') return;
    socket = null;
    diag.state = 'closed';
    diag.lastError = `không nối được sau ${CONNECT_TIMEOUT_MS / 1000} giây — máy chủ không trả lời bắt tay WebSocket`;
    try {
      ws.close();
    } catch {
      /* bỏ qua */
    }
    recordHandshake(ws);
    if (Date.now() - lastDemand < IDLE_MS) scheduleRetry(Date.now());
  }, CONNECT_TIMEOUT_MS);
  connectTimer?.unref?.();
  ws.onopen = () => {
    if (socket !== ws) return;
    clearTimeout(connectTimer);
    diag.state = 'open';
    diag.connectedAt = Date.now();
    diag.lastError = null;
    recordHandshake(ws);
    try {
      ws.send(JSON.stringify({ channel: CHANNEL, msg_type: 'join' }));
    } catch (e: any) {
      diag.lastError = clip(`gửi lệnh tham gia kênh hỏng: ${String(e?.message ?? e)}`);
    }
  };
  ws.onmessage = (ev: any) => {
    if (socket !== ws) return;
    const data = ev?.data;
    const text = typeof data === 'string' ? data : data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') : String(data);
    onMessage(text, Date.now());
  };
  ws.onerror = (ev: any) => {
    if (socket !== ws) return;
    // Lỗi xảy ra TRƯỚC khi mở nghĩa là chưa bao giờ nối được — nói ra ngay,
    // không để nó trông như "nối được mà im lặng" (bài học ntprobe #200).
    diag.lastError = clip(
      `${diag.state === 'connecting' ? 'không nối được' : 'lỗi WebSocket'}: ${String(ev?.message ?? ev?.error?.message ?? ev?.type ?? 'không rõ')}`
    );
  };
  ws.onclose = (ev: any) => {
    if (socket !== ws) return;
    clearTimeout(connectTimer);
    const neverOpened = diag.state === 'connecting';
    socket = null;
    flush();
    if (neverOpened) recordHandshake(ws);
    diag.state = 'closed';
    diag.closeCode = typeof ev?.code === 'number' ? ev.code : null;
    diag.closeReason = ev?.reason ? clip(String(ev.reason)) : null;
    // Đóng vì hết người xem là chủ ý, không phải lỗi — không thử lại.
    if (Date.now() - lastDemand < IDLE_MS) scheduleRetry(Date.now());
  };
}

function ensureTimer() {
  if (timer) return;
  timer = setInterval(() => {
    flush();
    if (socket && Date.now() - lastDemand >= IDLE_MS) {
      const s = socket;
      socket = null;
      diag.state = 'idle';
      try {
        s.close(1000, 'no viewers');
      } catch {
        /* đã đóng */
      }
    }
  }, 15_000);
  timer?.unref?.();
}

export type WsSnapshot = {
  rows: LiveRow[];
  minPremium: number;
  diag: Diag;
};

/** Gọi mỗi lần có người xem: mở kết nối nếu chưa có (và chưa đang chờ thử
 *  lại), rồi trả ảnh chụp bộ đệm. */
export function wsSnapshot(now = Date.now()): WsSnapshot {
  lastDemand = now;
  ensureTimer();
  if (!key()) {
    diag.state = 'no-key';
  } else if (!socket && !retryTimer) {
    connect(now);
  }
  flush();
  return { rows, minPremium: MIN_PREMIUM, diag: { ...diag, firstFrames: [...diag.firstFrames] } };
}

/** Chỉ cho test: đưa một khung vào như thể UW vừa gửi. */
export function _feed(text: string, now = Date.now()) {
  onMessage(text, now);
  flush();
}

export function _resetWs() {
  try {
    socket?.close?.();
  } catch {
    /* bỏ qua */
  }
  socket = null;
  clearTimeout(retryTimer);
  retryTimer = null;
  clearTimeout(connectTimer);
  connectTimer = null;
  clearInterval(timer);
  timer = null;
  diag = fresh();
  rows = [];
  pending = [];
  lastDemand = 0;
  sawTrade = false;
}
