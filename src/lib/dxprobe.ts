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
  /** Kênh nào thật sự mở được. Một phép đo có thể xin NHIỀU kênh trên cùng
   *  một kết nối (xem `tapePlan()` trong dxtape.ts): kênh này chết không
   *  được kéo kênh kia chết theo, nên phải biết kênh nào sống. */
  channelsOpened: number[];
  /** Lời máy chủ TỰ NÓI về cấu hình feed nó cấp cho từng kênh. Đây là phép
   *  đo có thẩm quyền nhất của cả cuộc bắt tay: `aggregationPeriod` máy chủ
   *  CẤP (không phải cái ta XIN) nói tape có bị gộp nhịp không, và
   *  `eventFields` nói ra tên trường THẬT nó sẽ gửi - thứ không được phép
   *  đoán. */
  feedConfigs: DxFeedConfig[];
  /** Mã có dữ liệu chảy về, theo đúng tên mã đã hỏi. CÓ DỮ LIỆU KHÔNG có
   *  nghĩa là đúng chỉ báo cần tìm - xem `observations`. */
  symbolsWithData: string[];
  /** Từng mã có dữ liệu, kèm căn cứ để phân biệt CHỈ SỐ với CỔ PHIẾU trùng
   *  tên: bid/ask là số thật thì giao dịch được, tức không phải chỉ số. */
  observations: SymbolObservation[];
  /** Mọi thông điệp hai chiều, đã cắt ngắn. Đây mới là phần đáng đọc khi
   *  cuộc bắt tay hỏng: lời từ chối của DXLink nói ra định dạng đúng. */
  messages: DxMessage[];
  error: string | null;
};

const MAX_MSG = 40;
const CLIP = 400;

/**
 * Mã đối chứng - xem chú thích đầu file.
 *
 * HAI mã, không phải một, và đó là bài học từ chính lần đo đầu tiên
 * (2026-09-18): lần đó VIX nằm trong danh sách mã bề rộng, nên điều kiện
 * dừng sớm "có mã đối chứng + ít nhất một mã khác" được thoả ngay khi VIX
 * về - probe đóng kết nối sau 237ms thay vì nghe hết 9 giây, và kết luận
 * "không có mã bề rộng nào" khi ấy chưa đủ căn cứ.
 *
 * VIX đo được là CÓ trên dxFeed, nên giờ nó làm mã đối chứng thứ hai (một
 * chỉ số thật, chứng minh dxFeed có phục vụ loại chỉ số chứ không chỉ cổ
 * phiếu) và KHÔNG còn nằm trong danh sách ứng viên.
 */
export const CONTROL_SYMBOLS = ['AAPL', 'VIX'];
/** Giữ lại tên cũ cho nơi gọi chỉ cần một mã để in ra câu hướng dẫn đọc. */
export const CONTROL_SYMBOL = CONTROL_SYMBOLS[0];

/**
 * Các cách viết có thể có của chỉ báo bề rộng trên dxFeed. Lần đo đầu
 * KHÔNG mã nào trong số này trả dữ liệu - nhưng phép đo đó bị cắt ngắn
 * (xem trên), nên lần sau phải nghe hết giờ mới kết luận được.
 *
 * Hỏi hết một lượt trong cùng một lần đăng ký: thêm một mã trong cùng
 * request không tốn gì, còn thiếu một cách viết thì phải bấm lại lần nữa.
 */
export const BREADTH_CANDIDATES = [
  'TICK', '$TICK', 'TICK.NY', 'TICK-NY', 'TICK.IV', 'TICKQ', '$TICKQ',
  'ADVN', '$ADV', 'ADV', 'DECLN', '$DECL', 'DECL',
  'ADVQ', '$ADVQ', 'DECLQ', '$DECLQ',
  'PCC', '$PCC', 'PCCE', '$PCCE',
  'UVOL', '$UVOL', 'DVOL', '$DVOL',
];

export type Sender = (text: string) => void;

/**
 * Một loại sự kiện cần đăng ký trên một kênh.
 *
 * `symbols` bỏ trống = dùng danh sách mã chung của cả cuộc bắt tay. Đặt
 * riêng khi cách viết mã KHÁC hẳn: nến của dxFeed là `AAPL{=5m}`, không
 * phải `AAPL`, nên nó không thể đi chung danh sách với Quote/Trade.
 */
export type DxSubscription = {
  type: string;
  symbols?: string[];
  /** Sự kiện CHUỖI THỜI GIAN (TimeAndSale, Candle) - theo tài liệu tôi NHỚ
   *  thì phải kèm `fromTime`, đăng ký thường có thể không trả gì. CHƯA xác
   *  nhận; đoán sai vẫn thu được câu trả lời vì lời từ chối của DXLink nói
   *  ra dạng đúng, và nó nằm nguyên văn trong `messages`. */
  timeSeries?: boolean;
  /** Lùi về quá khứ bao nhiêu mili giây khi `timeSeries`. Không phải để
   *  tiết kiệm: ngoài giờ giao dịch mà `fromTime = bây giờ` thì tape rỗng,
   *  và "không có sự kiện nào" trông Y HỆT "feed này không có TimeAndSale"
   *  - hai chuyện dẫn tới hai kết luận ngược nhau. Lùi lại đủ xa thì phép
   *  đo về hình dạng chạy được cả khi sàn đã đóng. */
  lookbackMs?: number;
};

/**
 * Một kênh FEED: một bộ trường, một nhịp gộp, một danh sách đăng ký.
 *
 * NHIỀU kênh trên cùng một kết nối là có chủ đích, không phải cho vui: một
 * tên trường tôi nhớ sai trong `acceptEventFields` có thể làm máy chủ từ
 * chối CẢ kênh, và khi đó một phép đo một-kênh về tay trắng. Nên phép đo
 * tape đi hai kênh - một kênh KHÔNG gửi `acceptEventFields` (không thể bị
 * từ chối vì tên trường, và bộ trường mặc định máy chủ chọn CHÍNH LÀ một
 * phép đo), một kênh xin hẳn danh sách tên nhớ được. Kênh nào chết thì chỉ
 * mình nó chết.
 */
export type DxChannelPlan = {
  channel: number;
  /** `null` = KHÔNG gửi khoá `acceptEventFields` chút nào. */
  acceptEventFields: Record<string, string[]> | null;
  acceptAggregationPeriod: number;
  subscriptions: DxSubscription[];
};

export type DxPlan = { channels: DxChannelPlan[] };

/**
 * Phép đo bề rộng thị trường (#166) - GIỮ NGUYÊN từng byte những gì bản
 * trước gửi đi, kể cả THỨ TỰ các mục trong `add` (vòng ngoài là mã, vòng
 * trong là loại sự kiện). Một phép đo đang chạy thật không được đổi vì
 * người sau dọn code.
 */
export const BREADTH_PLAN: DxPlan = {
  channels: [
    {
      channel: 1,
      acceptEventFields: {
        Quote: ['eventType', 'eventSymbol', 'bidPrice', 'askPrice'],
        Trade: ['eventType', 'eventSymbol', 'price'],
      },
      acceptAggregationPeriod: 1,
      subscriptions: [{ type: 'Quote' }, { type: 'Trade' }],
    },
  ],
};

export type DxState = {
  authorized: boolean;
  channelOpened: boolean;
  subscribed: boolean;
  /** Kênh đã mở. Mảng chứ không phải boolean vì một kế hoạch có thể xin
   *  nhiều kênh và ta cần biết CÁI NÀO sống. */
  opened: number[];
};

export function emptyState(): DxState {
  return { authorized: false, channelOpened: false, subscribed: false, opened: [] };
}

/**
 * Danh sách mục `add` của một FEED_SUBSCRIPTION.
 *
 * Vòng ngoài là MÃ, vòng trong là loại sự kiện - đúng thứ tự bản trước gửi
 * (`symbols.flatMap(s => [Quote(s), Trade(s)])`), để phép đo bề rộng không
 * đổi. Trùng (cùng mã + cùng loại) bị bỏ: đăng ký hai lần trên cùng một
 * kênh là tự nhân đôi số sự kiện đếm được.
 */
export function subscriptionEntries(
  ch: DxChannelPlan,
  symbols: string[],
  nowMs = Date.now()
): Array<Record<string, unknown>> {
  const lists = ch.subscriptions.map((sub) => sub.symbols ?? symbols);
  const longest = lists.reduce((m, l) => Math.max(m, l.length), 0);
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (let i = 0; i < longest; i++) {
    for (let j = 0; j < ch.subscriptions.length; j++) {
      const sub = ch.subscriptions[j];
      const symbol = lists[j][i];
      if (typeof symbol !== 'string') continue;
      const key = `${sub.type}\u0000${symbol}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry: Record<string, unknown> = { symbol, type: sub.type };
      if (sub.timeSeries) entry.fromTime = nowMs - (sub.lookbackMs ?? 0);
      out.push(entry);
    }
  }
  return out;
}

/** Cấu hình feed do CHÍNH máy chủ trả về (FEED_CONFIG). */
export type DxFeedConfig = {
  channel: number | null;
  /** Nhịp gộp máy chủ CẤP. Khác cái ta xin thì cái này mới là sự thật - và
   *  với một cái tape thì > 0 nghĩa là dữ liệu đã bị gộp, tức footprint
   *  dựng trên đó SAI mà TRÔNG ĐÚNG. */
  aggregationPeriod: number | null;
  dataFormat: string | null;
  /** Tên trường THẬT máy chủ sẽ gửi, theo từng loại sự kiện. */
  eventFields: Record<string, string[]> | null;
};

export function readFeedConfig(raw: string): DxFeedConfig | null {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (msg?.type !== 'FEED_CONFIG') return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    channel: n(msg.channel),
    aggregationPeriod: n(msg.aggregationPeriod),
    dataFormat: typeof msg.dataFormat === 'string' ? msg.dataFormat : null,
    eventFields: msg.eventFields && typeof msg.eventFields === 'object' ? msg.eventFields : null,
  };
}

/**
 * Phần THUẦN của cuộc bắt tay: nhận một thông điệp, quyết định gửi gì tiếp.
 *
 * Tách ra khỏi WebSocket để test được bằng cách gọi tay từng bước, không
 * cần mạng lẫn máy chủ giả.
 */
export function step(
  raw: string,
  state: DxState,
  send: Sender,
  symbols: string[],
  plan: DxPlan = BREADTH_PLAN,
  nowMs = Date.now()
): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // không phải JSON: cứ ghi lại ở nơi gọi, không làm gì thêm
  }

  if (msg?.type === 'AUTH_STATE' && msg?.state === 'AUTHORIZED') {
    state.authorized = true;
    for (const ch of plan.channels) {
      send(
        JSON.stringify({
          type: 'CHANNEL_REQUEST',
          channel: ch.channel,
          service: 'FEED',
          parameters: { contract: 'AUTO' },
        })
      );
    }
    return;
  }

  if (msg?.type === 'CHANNEL_OPENED' && typeof msg?.channel === 'number') {
    const ch = plan.channels.find((c) => c.channel === msg.channel);
    if (!ch) return; // kênh lạ: không phải của ta, không đăng ký gì
    if (state.opened.includes(ch.channel)) return; // đã mở rồi, đừng đăng ký lần hai
    state.opened.push(ch.channel);
    state.channelOpened = true;

    const setup: Record<string, unknown> = {
      type: 'FEED_SETUP',
      channel: ch.channel,
      acceptAggregationPeriod: ch.acceptAggregationPeriod,
      acceptDataFormat: 'FULL',
    };
    if (ch.acceptEventFields) setup.acceptEventFields = ch.acceptEventFields;
    send(JSON.stringify(setup));

    const add = subscriptionEntries(ch, symbols, nowMs);
    if (add.length) send(JSON.stringify({ type: 'FEED_SUBSCRIPTION', channel: ch.channel, add }));
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
 * Có dữ liệu chảy về KHÔNG ĐỦ để kết luận "đây là chỉ báo bề rộng" - và
 * phép đo ngày 2026-09-18 chứng minh điều đó bằng chính dữ liệu của nó.
 *
 * Hỏi 25 cách viết thì `ADV` và `DVOL` có dữ liệu, và probe khi ấy dán nhãn
 * "mã bề rộng DÙNG ĐƯỢC". Sai. Nhìn vào giá trị:
 *
 *   VIX  (chỉ số thật)  bidPrice "NaN", askPrice "NaN", Trade price 14.81
 *   ADV                 bidPrice 32.47, askPrice 41.79
 *   DVOL                bidPrice 17.75, askPrice 53.23
 *
 * Một chỉ số KHÔNG giao dịch được nên KHÔNG có giá chào mua/bán - dxFeed
 * trả `NaN`, đúng như VIX. Có bid/ask bằng số thật nghĩa là công cụ đó
 * giao dịch được, tức một CỔ PHIẾU trùng tên (ADV là Advantage Solutions),
 * không phải "số mã tăng giá của NYSE" - đại lượng đó là một SỐ ĐẾM cỡ
 * hàng nghìn, không thể có giá 32,47 đô.
 *
 * Đúng cái bẫy probe Schwab (#165) đã bắt được với `DECN`/`DVOL` và ghi
 * lại; lần này probe tự vấp vào vì chỉ khớp TÊN. Nên phép phân loại phải
 * dựa trên DỮ LIỆU: bid/ask là số → giao dịch được → không phải chỉ số.
 */
export type SymbolObservation = {
  symbol: string;
  /** Thấy Quote với bid/ask là SỐ THẬT (không phải NaN) - công cụ giao
   *  dịch được, gần như chắc chắn là cổ phiếu trùng tên. */
  tradeableQuote: boolean;
  /** Giá từ Trade event. Chỉ số (như VIX) chỉ có trường này. */
  tradePrice: number | null;
};

/** `"NaN"` về dưới dạng CHUỖI trong JSON - `Number("NaN")` ra NaN, nên
 *  kiểm bằng Number.isFinite sau khi ép kiểu là đủ cho cả hai dạng. */
function finiteNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Gộp quan sát từ một thông điệp FEED_DATA vào bảng đang có. */
export function observeFeed(raw: string, into: Map<string, SymbolObservation>): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg?.type !== 'FEED_DATA' || !Array.isArray(msg.data)) return;

  for (const ev of msg.data) {
    if (!ev || typeof ev !== 'object') continue;
    const symbol = typeof ev.eventSymbol === 'string' ? ev.eventSymbol : null;
    if (!symbol) continue;

    const prev = into.get(symbol) ?? { symbol, tradeableQuote: false, tradePrice: null };
    if (ev.eventType === 'Quote') {
      // CẢ HAI vế phải là số thật mới coi là giao dịch được: một bên NaN
      // là chưa đủ căn cứ.
      if (finiteNum(ev.bidPrice) !== null && finiteNum(ev.askPrice) !== null) {
        prev.tradeableQuote = true;
      }
    } else if (ev.eventType === 'Trade') {
      const p = finiteNum(ev.price);
      if (p !== null) prev.tradePrice = p;
    }
    into.set(symbol, prev);
  }
}

/**
 * Chạy cuộc bắt tay thật. Trả về những gì quan sát được, KHÔNG BAO GIỜ
 * chứa token (thông điệp AUTH được ghi lại dưới dạng đã che).
 */
export type DxHandshakeOpts = {
  /** Kênh/trường/đăng ký. Mặc định là phép đo bề rộng, không đổi. */
  plan?: DxPlan;
  /** Chạy trên MỖI thông điệp nhận được, để nơi gọi tự gom quan sát riêng
   *  (phép đo tape gom theo kênh + mã, khác hẳn phép đo bề rộng). */
  onMessage?: (raw: string) => void;
  /** Trả `true` để đóng sớm. Mặc định là luật của phép đo bề rộng; phép đo
   *  tape truyền `() => false` vì nó cần nghe hết cửa sổ. */
  stopWhen?: (seen: Map<string, SymbolObservation>) => boolean;
};

export async function dxHandshake(
  url: string,
  token: string,
  symbols: string[],
  timeoutMs = 9000,
  opts: DxHandshakeOpts = {}
): Promise<DxProbeResult> {
  const plan = opts.plan ?? BREADTH_PLAN;
  const out: DxProbeResult = {
    attempted: true,
    skipped: null,
    authorized: false,
    channelOpened: false,
    channelsOpened: [],
    feedConfigs: [],
    symbolsWithData: [],
    observations: [],
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
    const state = emptyState();
    const found = new Set<string>();
    const seen = new Map<string, SymbolObservation>();

    const finish = (err?: string) => {
      if (done) return;
      done = true;
      if (err && !out.error) out.error = err;
      out.authorized = state.authorized;
      out.channelOpened = state.channelOpened;
      out.channelsOpened = [...state.opened];
      out.symbolsWithData = [...found];
      // Chỉ giữ quan sát của những mã ĐÃ HỎI: dxFeed có thể gửi kèm mã khác.
      out.observations = [...seen.values()].filter((o) => symbols.includes(o.symbol));
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
        step(text, state, send, symbols, plan);
        const cfg = readFeedConfig(text);
        if (cfg) out.feedConfigs.push(cfg);
        for (const s of symbolsInFeed(text, symbols)) found.add(s);
        observeFeed(text, seen);
        opts.onMessage?.(text);
        /* Chỉ dừng sớm khi tìm được thứ ĐANG TÌM: một mã không phải đối
           chứng, VÀ trông như một chỉ số (có giá Trade nhưng không có
           bid/ask thật - xem observeFeed).

           Hai lần sửa, hai lần vì cùng một kiểu sai: lần đầu dừng ngay khi
           mã đối chứng về (237ms). Lần hai suýt dừng vì `ADV`/`DVOL` có dữ
           liệu - mà chúng là cổ phiếu trùng tên, không phải chỉ báo bề
           rộng. Dừng vì một câu trả lời sai còn tệ hơn chờ hết giờ. */
        const stop = opts.stopWhen
          ? opts.stopWhen(seen)
          : [...seen.values()].some(
              (o) => !CONTROL_SYMBOLS.includes(o.symbol) && o.tradePrice !== null && !o.tradeableQuote
            );
        if (stop) {
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
