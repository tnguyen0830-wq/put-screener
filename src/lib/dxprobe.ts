/**
 * Bắt tay thử với DXLink - đường quote thời gian thực của tastytrade.
 *
 * Tách khỏi route vì file route của Next chỉ được export handler, mà phần
 * này cần test độc lập (một máy chủ WebSocket giả cũng đủ dựng lại cả cuộc
 * bắt tay mà không cần mạng).
 *
 * ============================================================
 * VÌ SAO KHÔNG ĐOÁN, VÀ LÀM SAO ĐỂ ĐOÁN SAI VẪN CÓ ÍCH
 * ============================================================
 *
 * Chuỗi thông điệp dưới đây (SETUP → AUTH → CHANNEL_REQUEST → FEED_SETUP →
 * FEED_SUBSCRIPTION) là theo tài liệu tôi NHỚ, chưa từng chạy thật từ đây.
 * Nhớ sai là chuyện đã xảy ra ba lần trong repo này.
 *
 * Nên probe này GHI LẠI MỌI THÔNG ĐIỆP máy chủ gửi về, nguyên văn (có cắt
 * ngắn). Gửi sai định dạng thì DXLink trả lời bằng thông điệp lỗi của
 * chính nó - và thông điệp đó nói ra định dạng đúng. Tức đoán sai vẫn thu
 * được câu trả lời, chỉ mất một lần bấm.
 *
 * ============================================================
 * MÃ ĐỐI CHỨNG LÀ PHẦN QUAN TRỌNG NHẤT CỦA PHÉP ĐO NÀY
 * ============================================================
 *
 * Nếu chỉ hỏi mấy mã bề rộng ($TICK, ADVN…) mà không có dữ liệu về thì có
 * HAI nguyên nhân ngược nhau: (a) streaming chạy nhưng tài khoản không có
 * mấy mã đó, (b) streaming không chạy chút nào. Hai thứ đó dẫn tới hai
 * quyết định khác hẳn nhau, nên luôn hỏi kèm MỘT mã chắc chắn có (AAPL).
 * Có AAPL mà không có $TICK = (a). Không có gì cả = (b).
 */

export type DxMessage = { at: number; dir: 'sent' | 'recv'; text: string };

export type DxProbeResult = {
  attempted: boolean;
  /** Lý do không thử được (thiếu token, môi trường không có WebSocket...). */
  skipped: string | null;
  /** Có nhận được AUTH_STATE: AUTHORIZED không - cổng chính của cả phép đo. */
  authorized: boolean;
  channelOpened: boolean;
  /** Mã có dữ liệu chảy về, theo đúng tên mã đã hỏi. */
  symbolsWithData: string[];
  /** Mọi thông điệp hai chiều, đã cắt ngắn. Đây mới là phần đáng đọc khi
   *  cuộc bắt tay hỏng: lời từ chối của DXLink nói ra định dạng đúng. */
  messages: DxMessage[];
  error: string | null;
};

const MAX_MSG = 40;
const CLIP = 400;

/** Mã đối chứng luôn đi kèm - xem chú thích đầu file. */
export const CONTROL_SYMBOL = 'AAPL';

/**
 * Các cách viết có thể có của chỉ báo bề rộng trên dxFeed. CHƯA đo được -
 * hỏi hết một lượt trong cùng một lần đăng ký, vì hỏi thêm một mã trong
 * cùng một request không tốn gì thêm, còn thiếu một cách viết thì phải bấm
 * lại lần nữa.
 */
export const BREADTH_CANDIDATES = [
  'TICK', '$TICK', 'TICK.NY', 'TICK-NY',
  'ADVN', '$ADV', 'DECLN', '$DECL',
  'ADVQ', '$ADVQ', 'DECLQ', '$DECLQ',
  'PCC', '$PCC', 'PCCE', '$PCCE',
  'VIX', '$VIX',
];

export type Sender = (text: string) => void;

/**
 * Phần THUẦN của cuộc bắt tay: nhận một thông điệp, quyết định gửi gì tiếp.
 *
 * Tách ra khỏi WebSocket để test được bằng cách gọi tay từng bước, không
 * cần mạng lẫn máy chủ giả.
 */
export function step(
  raw: string,
  state: { authorized: boolean; channelOpened: boolean; subscribed: boolean },
  send: Sender,
  symbols: string[]
): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // không phải JSON: cứ ghi lại ở nơi gọi, không làm gì thêm
  }

  if (msg?.type === 'AUTH_STATE' && msg?.state === 'AUTHORIZED') {
    state.authorized = true;
    send(
      JSON.stringify({
        type: 'CHANNEL_REQUEST',
        channel: 1,
        service: 'FEED',
        parameters: { contract: 'AUTO' },
      })
    );
    return;
  }

  if (msg?.type === 'CHANNEL_OPENED' && msg?.channel === 1) {
    state.channelOpened = true;
    send(
      JSON.stringify({
        type: 'FEED_SETUP',
        channel: 1,
        acceptAggregationPeriod: 1,
        acceptDataFormat: 'FULL',
        acceptEventFields: { Quote: ['eventType', 'eventSymbol', 'bidPrice', 'askPrice'], Trade: ['eventType', 'eventSymbol', 'price'] },
      })
    );
    send(
      JSON.stringify({
        type: 'FEED_SUBSCRIPTION',
        channel: 1,
        add: symbols.flatMap((s) => [
          { symbol: s, type: 'Quote' },
          { symbol: s, type: 'Trade' },
        ]),
      })
    );
    state.subscribed = true;
  }
}

/** Mã nào thật sự có dữ liệu chảy về, đọc từ một thông điệp FEED_DATA. */
export function symbolsInFeed(raw: string, asked: string[]): string[] {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return [];
  }
  if (msg?.type !== 'FEED_DATA') return [];
  // `data` có thể là mảng phẳng (FULL) hoặc mảng lồng (COMPACT) - quét
  // chuỗi thay vì tin vào một hình dạng chưa đo được.
  const flat = JSON.stringify(msg.data ?? []);
  return asked.filter((s) => flat.includes(`"${s}"`));
}

/**
 * Chạy cuộc bắt tay thật. Trả về những gì quan sát được, KHÔNG BAO GIỜ
 * chứa token (thông điệp AUTH được ghi lại dưới dạng đã che).
 */
export async function dxHandshake(
  url: string,
  token: string,
  symbols: string[],
  timeoutMs = 9000
): Promise<DxProbeResult> {
  const out: DxProbeResult = {
    attempted: true,
    skipped: null,
    authorized: false,
    channelOpened: false,
    symbolsWithData: [],
    messages: [],
    error: null,
  };

  const WS: any = (globalThis as any).WebSocket;
  if (typeof WS !== 'function') {
    return { ...out, attempted: false, skipped: 'môi trường Node này không có WebSocket toàn cục' };
  }

  const log = (dir: 'sent' | 'recv', text: string) => {
    if (out.messages.length < MAX_MSG) {
      out.messages.push({ at: Date.now(), dir, text: text.slice(0, CLIP) });
    }
  };

  return new Promise<DxProbeResult>((resolve) => {
    let ws: any;
    let done = false;
    const state = { authorized: false, channelOpened: false, subscribed: false };
    const found = new Set<string>();

    const finish = (err?: string) => {
      if (done) return;
      done = true;
      if (err && !out.error) out.error = err;
      out.authorized = state.authorized;
      out.channelOpened = state.channelOpened;
      out.symbolsWithData = [...found];
      try {
        ws?.close();
      } catch {
        /* đóng hỏng thì thôi, kết quả đã thu xong */
      }
      resolve(out);
    };

    const timer = setTimeout(() => finish(null as any), timeoutMs);
    if (typeof (timer as any).unref === 'function') (timer as any).unref();

    const send: Sender = (text) => {
      // Che token trước khi ghi: thông điệp AUTH mang nguyên nó.
      log('sent', text.includes(token) ? text.replace(token, '<token đã che>') : text);
      try {
        ws.send(text);
      } catch (e: any) {
        finish(String(e?.message ?? e));
      }
    };

    try {
      ws = new WS(url);
    } catch (e: any) {
      clearTimeout(timer);
      return finish(`không mở được WebSocket: ${String(e?.message ?? e)}`);
    }

    ws.onopen = () => {
      send(
        JSON.stringify({
          type: 'SETUP',
          channel: 0,
          version: '0.1-put-screener/1.0.0',
          keepaliveTimeout: 60,
          acceptKeepaliveTimeout: 60,
        })
      );
      send(JSON.stringify({ type: 'AUTH', channel: 0, token }));
    };

    ws.onmessage = (ev: any) => {
      const text = typeof ev?.data === 'string' ? ev.data : String(ev?.data ?? '');
      log('recv', text);
      try {
        step(text, state, send, symbols);
        for (const s of symbolsInFeed(text, symbols)) found.add(s);
        // Đã có dữ liệu của mã đối chứng VÀ ít nhất một mã bề rộng thì
        // không cần chờ hết giờ nữa.
        if (found.size > 1 && found.has(CONTROL_SYMBOL)) {
          clearTimeout(timer);
          finish();
        }
      } catch (e: any) {
        log('recv', `[probe lỗi khi xử lý: ${String(e?.message ?? e)}]`);
      }
    };

    ws.onerror = (ev: any) => {
      log('recv', `[onerror] ${String(ev?.message ?? ev?.type ?? 'lỗi WebSocket')}`);
    };

    ws.onclose = (ev: any) => {
      log('recv', `[onclose] code=${ev?.code ?? '?'} reason=${String(ev?.reason ?? '').slice(0, 120)}`);
      clearTimeout(timer);
      finish();
    };
  });
}
