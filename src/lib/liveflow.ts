/**
 * Live Flow — luồng lệnh quyền chọn đáng chú ý của Unusual Whales, làm mới
 * vài giây một lần, dựng theo đúng màn "Live Flow" chủ app gửi ảnh.
 *
 * NGUỒN: `/api/option-trades/flow-alerts` — endpoint ĐÃ chạy thật ở
 * production từ lâu (tab Insider Trade → Options Flow đọc nó), nên đây không
 * phải một host mới phải đo. Nhưng nói thẳng hai giới hạn, vì cả hai đều là
 * chỗ màn hình này có thể trông giống màn của UW mà KHÁC nó:
 *
 * 1. **Đây là ALERT, không phải từng lệnh khớp.** UW đã lọc sẵn thành "đáng
 *    chú ý" (mỗi bản ghi mang `alert_rule`), và một alert có thể gộp nhiều
 *    lệnh (`trade_count`). Màn Live Flow của UW in TỪNG lệnh — thứ đó cần
 *    luồng WebSocket, một gói riêng chưa ai đo trên tài khoản này. Màn hình
 *    in câu này ra, không để người đọc tưởng đây là băng lệnh đầy đủ.
 *
 * 2. **Tên trường phía mua/bán là NHỚ ĐƯỢC, chưa đo.** `optionflow.ts` chỉ
 *    lưu một phần bản ghi, và chưa ai in trọn khoá của nó. Nên phía được đọc
 *    DUNG THỨ theo thứ tự (a) một trường phía tường minh nếu có, (b) chia
 *    premium phía ask/bid nếu có, (c) không có gì thì `unknown` — và màn
 *    hình in KHOÁ THẬT của bản ghi đầu (đúng idiom `/api/uwprobe`), để lần
 *    sửa sau viết theo phép đo chứ không theo trí nhớ.
 *
 * Phía ASK KHÔNG có nghĩa là "đang lạc quan": một lệnh call khớp ở ask có
 * thể là người ta đóng vị thế bán. Chú giải trên màn hình nói điều đó, cùng
 * tư thế `of.keyCaveat`.
 *
 * Từ #219 file này đọc thêm TỪNG LỆNH KHỚP từ luồng WebSocket của UW
 * (`parseTrade`, xem `liveflowws.ts`). Với một lệnh đơn lẻ thì phía KHÔNG
 * phải suy từ premium gộp: nó là phép so giá khớp với NBBO lúc khớp — đúng
 * cách UW tự ghi ASK/BID/MID — nên đó là nguồn `nbbo`, còn nhãn UW gửi kèm
 * (`tags`) thắng nếu có.
 *
 * Chỉ import `parseOsi` (từ `cboe.ts`, module thuần không import gì) — vẫn
 * biên dịch và `require()` đứng riêng được trong test.
 */
import { parseOsi } from './cboe';

export type FlowSide = 'ask' | 'bid' | 'mid' | 'mixed' | 'unknown';
/** Phía được suy từ đâu — hiện ra để "phía" suy từ premium không trông y
 *  hệt "phía" UW tự ghi. */
export type SideSource = 'field' | 'premium' | 'tags' | 'nbbo' | 'none';

export type LiveRow = {
  /** `alert` = bản ghi flow-alerts (REST, đã lọc, có thể gộp nhiều lệnh);
   *  `trade` = MỘT lệnh khớp từ WebSocket. Hai thứ khác bản chất nên không
   *  bao giờ trộn trong một bảng. */
  kind: 'alert' | 'trade';
  id: string;
  /** ISO, nguyên văn UW. */
  at: string;
  ticker: string;
  type: 'call' | 'put' | 'other';
  strike: number | null;
  expiry: string | null;
  /** Ngày tới hạn tính theo NGÀY New York của chính lúc alert, không theo
   *  đồng hồ máy — một alert hôm qua không được đổi DTE khi xem hôm nay. */
  dte: number | null;
  spot: number | null;
  bid: number | null;
  ask: number | null;
  /** Giá khớp (trung bình của alert). */
  price: number | null;
  /** 0 = đúng bid, 1 = đúng ask; null khi thiếu một trong ba số hoặc spread
   *  không dương. KHÔNG kẹp về [0,1] trong im lặng: khớp ngoài spread là một
   *  sự thật đáng thấy, nên trả kèm cờ `outside`. */
  fillPos: number | null;
  outside: boolean;
  side: FlowSide;
  sideSource: SideSource;
  size: number | null;
  premium: number | null;
  volume: number | null;
  openInterest: number | null;
  rule: string | null;
  sweep: boolean;
  floor: boolean;
  multileg: boolean;
  tradeCount: number | null;
};

/** Đọc số chịu được chuỗi. Chuỗi rỗng là null, không phải 0. */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function first(raw: any, keys: string[]): unknown {
  for (const k of keys) {
    if (raw && raw[k] !== undefined && raw[k] !== null && raw[k] !== '') return raw[k];
  }
  return undefined;
}

/** Ngày New York của một thời điểm (YYYY-MM-DD). */
export function nyDay(ms: number): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
  return p;
}

export function dteOf(expiry: string | null, atIso: string): number | null {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}/.test(expiry)) return null;
  const t = Date.parse(atIso);
  if (!Number.isFinite(t)) return null;
  const from = Date.parse(`${nyDay(t)}T00:00:00Z`);
  const to = Date.parse(`${expiry.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const d = Math.round((to - from) / 86_400_000);
  // Âm nghĩa là đáo hạn trước lúc alert — dữ liệu hỏng, không in con số vô lý.
  return d >= 0 ? d : null;
}

/** Giá khớp nằm đâu trong spread. */
export function fillPosition(
  price: number | null,
  bid: number | null,
  ask: number | null
): { pos: number | null; outside: boolean } {
  if (price === null || bid === null || ask === null) return { pos: null, outside: false };
  const w = ask - bid;
  if (!(w > 0)) return { pos: null, outside: false };
  const raw = (price - bid) / w;
  const outside = raw < -1e-9 || raw > 1 + 1e-9;
  return { pos: Math.min(1, Math.max(0, raw)), outside };
}

/** Phần premium phải nghiêng về một phía mới gọi tên phía đó. Dưới ngưỡng
 *  thì là `mixed` — một alert gộp nhiều lệnh, nửa ask nửa bid, KHÔNG phải
 *  "khớp giữa spread" (đó là nghĩa chữ MID trên màn UW). */
export const SIDE_SHARE = 0.6;

function normSide(v: unknown): FlowSide | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'ask' || s === 'a' || s === 'buy') return 'ask';
  if (s === 'bid' || s === 'b' || s === 'sell') return 'bid';
  if (s === 'mid' || s === 'm') return 'mid';
  if (s === 'no_side' || s === 'no side' || s === 'none' || s === 'unknown') return 'unknown';
  return null;
}

export function sideOf(raw: any): { side: FlowSide; source: SideSource } {
  const explicit = normSide(first(raw, ['side', 'trade_side', 'aggressor_side']));
  if (explicit) return { side: explicit, source: 'field' };

  const askP = num(first(raw, ['total_ask_side_prem', 'ask_side_premium', 'ask_prem']));
  const bidP = num(first(raw, ['total_bid_side_prem', 'bid_side_premium', 'bid_prem']));
  if (askP === null && bidP === null) return { side: 'unknown', source: 'none' };
  const a = Math.max(0, askP ?? 0);
  const b = Math.max(0, bidP ?? 0);
  const total = a + b;
  if (!(total > 0)) return { side: 'unknown', source: 'premium' };
  if (a / total >= SIDE_SHARE) return { side: 'ask', source: 'premium' };
  if (b / total >= SIDE_SHARE) return { side: 'bid', source: 'premium' };
  return { side: 'mixed', source: 'premium' };
}

function typeOf(v: unknown): LiveRow['type'] {
  const s = String(v ?? '').toLowerCase();
  if (s === 'call' || s === 'c') return 'call';
  if (s === 'put' || s === 'p') return 'put';
  // Giá trị lạ là một phía THẬT, không đổ vào call (bẫy `flowSide()` #125).
  return 'other';
}

/** Một bản ghi UW → một dòng. `null` khi không có id hoặc không có thời
 *  điểm — không có hai thứ đó thì không gộp trùng và không xếp được. */
export function parseLiveRow(raw: any): LiveRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = first(raw, ['id', 'tracking_id']);
  const at = first(raw, ['created_at', 'executed_at', 'start_time']);
  if (id === undefined || at === undefined) return null;
  const atIso = String(at);
  if (!Number.isFinite(Date.parse(atIso))) return null;

  const expiryRaw = first(raw, ['expiry', 'expiration', 'expires']);
  const expiry = typeof expiryRaw === 'string' ? expiryRaw.slice(0, 10) : null;
  const bid = num(first(raw, ['bid', 'nbbo_bid']));
  const ask = num(first(raw, ['ask', 'nbbo_ask']));
  const price = num(first(raw, ['price', 'avg_price', 'fill_price']));
  const { pos, outside } = fillPosition(price, bid, ask);
  const { side, source } = sideOf(raw);

  return {
    kind: 'alert',
    id: String(id),
    at: atIso,
    ticker: String(first(raw, ['ticker', 'underlying_symbol', 'ticker_symbol']) ?? '').toUpperCase(),
    type: typeOf(first(raw, ['type', 'option_type'])),
    strike: num(raw.strike),
    expiry,
    dte: dteOf(expiry, atIso),
    spot: num(first(raw, ['underlying_price', 'stock_price'])),
    bid,
    ask,
    price,
    fillPos: pos,
    outside,
    side,
    sideSource: source,
    size: num(first(raw, ['total_size', 'size'])),
    premium: num(first(raw, ['total_premium', 'premium'])),
    volume: num(raw.volume),
    openInterest: num(raw.open_interest),
    rule: typeof raw.alert_rule === 'string' ? raw.alert_rule : null,
    sweep: !!raw.has_sweep,
    floor: !!raw.has_floor,
    multileg: !!raw.has_multileg,
    tradeCount: num(raw.trade_count),
  };
}

export function rowsOf(payload: any): any[] {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

/** Gộp bản mới vào bộ đệm: trùng id thì bản mới thắng (UW có thể cập nhật
 *  một alert đang mở), xếp mới nhất trước, cắt ở `cap`. Không sửa mảng gốc. */
export function mergeRows(prev: LiveRow[], incoming: LiveRow[], cap: number): LiveRow[] {
  const byId = new Map<string, LiveRow>();
  for (const r of prev) byId.set(r.id, r);
  for (const r of incoming) byId.set(r.id, r);
  return [...byId.values()]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.id < b.id ? -1 : 1))
    .slice(0, cap);
}

export type LiveFilter = {
  ticker?: string;
  sides?: FlowSide[];
  types?: LiveRow['type'][];
  minPremium?: number;
};

/** Lọc phía màn hình. Bộ lọc rỗng = không lọc (nút chưa ai bấm là trạng
 *  thái RỘNG nhất, như `parseCaps`). */
export function filterRows(rows: LiveRow[], f: LiveFilter): LiveRow[] {
  const tickers = (f.ticker ?? '')
    .toUpperCase()
    .split(/[\s,]+/)
    .filter(Boolean);
  return rows.filter((r) => {
    if (tickers.length && !tickers.includes(r.ticker)) return false;
    if (f.sides && f.sides.length && !f.sides.includes(r.side)) return false;
    if (f.types && f.types.length && !f.types.includes(r.type)) return false;
    // Thiếu premium thì KHÔNG bị bộ lọc tiền loại lặng lẽ khi chưa đặt ngưỡng;
    // đã đặt ngưỡng thì không biết là không đạt — không thể nói nó đủ lớn.
    if (f.minPremium && f.minPremium > 0 && !((r.premium ?? -1) >= f.minPremium)) return false;
    return true;
  });
}

/** Đếm theo phía, để màn hình nói được "0 dòng có phía" khác "mọi dòng lọc
 *  mất". */
export function sideCounts(rows: LiveRow[]): Record<FlowSide, number> {
  const c: Record<FlowSide, number> = { ask: 0, bid: 0, mid: 0, mixed: 0, unknown: 0 };
  for (const r of rows) c[r.side]++;
  return c;
}

// ── Từng lệnh khớp (WebSocket) ─────────────────────────────────────────────

/** Thời điểm: UW có thể gửi mili-giây epoch (số hoặc chuỗi số) hoặc ISO.
 *  Số nhỏ hơn 1e12 là GIÂY epoch — nhân 1000, không thì mọi lệnh rơi về 1970
 *  và DTE thành con số vô lý. */
export function toIso(v: unknown): string | null {
  if (typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()))) {
    let n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n < 1e12) n *= 1000;
    return new Date(n).toISOString();
  }
  if (typeof v === 'string' && Number.isFinite(Date.parse(v))) return new Date(Date.parse(v)).toISOString();
  return null;
}

/** Phía từ nhãn UW gửi kèm (`tags`), nếu có. */
function sideFromTags(tags: unknown): FlowSide | null {
  const list = Array.isArray(tags)
    ? tags.map((x) => String(x).toLowerCase())
    : typeof tags === 'string'
      ? tags.toLowerCase().split(/[\s,]+/)
      : [];
  if (list.includes('ask_side') || list.includes('ask')) return 'ask';
  if (list.includes('bid_side') || list.includes('bid')) return 'bid';
  if (list.includes('mid_side') || list.includes('mid')) return 'mid';
  if (list.includes('no_side')) return 'unknown';
  return null;
}

/** Phía của MỘT lệnh: giá khớp so với NBBO lúc khớp. Chạm/vượt ask = ask,
 *  chạm/dưới bid = bid, nằm giữa = mid. Thiếu số thì KHÔNG đoán. */
export function sideFromNbbo(price: number | null, bid: number | null, ask: number | null): FlowSide | null {
  if (price === null || bid === null || ask === null || !(ask >= bid)) return null;
  if (price >= ask) return 'ask';
  if (price <= bid) return 'bid';
  return 'mid';
}

/** Một thông điệp lệnh khớp → một dòng. `null` khi thiếu thời điểm hoặc
 *  thiếu cả id lẫn mã hợp đồng — không có thì không gộp trùng được. */
export function parseTrade(raw: any): LiveRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const atIso = toIso(first(raw, ['executed_at', 'created_at', 'timestamp', 'time', 't']));
  if (!atIso) return null;
  const optSym = first(raw, ['option_symbol', 'option_chain', 'symbol']);
  const osi = parseOsi(optSym);
  const idRaw = first(raw, ['id', 'trade_id', 'tracking_id']);
  if (idRaw === undefined && !osi) return null;

  const price = num(first(raw, ['price', 'fill_price']));
  const size = num(first(raw, ['size', 'volume_size', 'qty']));
  const bid = num(first(raw, ['nbbo_bid', 'bid', 'ewma_nbbo_bid']));
  const ask = num(first(raw, ['nbbo_ask', 'ask', 'ewma_nbbo_ask']));
  const { pos, outside } = fillPosition(price, bid, ask);

  let side: FlowSide = 'unknown';
  let source: SideSource = 'none';
  const tagged = sideFromTags(raw.tags);
  const explicit = normSide(first(raw, ['side', 'trade_side', 'aggressor_side']));
  const fromNbbo = sideFromNbbo(price, bid, ask);
  if (tagged) {
    side = tagged;
    source = 'tags';
  } else if (explicit) {
    side = explicit;
    source = 'field';
  } else if (fromNbbo) {
    side = fromNbbo;
    source = 'nbbo';
  }

  const expiryRaw = first(raw, ['expiry', 'expiration']);
  const expiry =
    typeof expiryRaw === 'string' ? expiryRaw.slice(0, 10) : osi ? osi.expiration : null;
  const typeRaw = first(raw, ['option_type', 'type']);
  const type =
    typeRaw !== undefined ? typeOf(typeRaw) : osi ? (osi.right === 'C' ? 'call' : 'put') : 'other';
  // Premium của MỘT lệnh là giá × size × 100 theo định nghĩa hợp đồng chuẩn;
  // chỉ tự tính khi UW không gửi, và không bao giờ khi thiếu một vế.
  const premium =
    num(first(raw, ['premium', 'total_premium'])) ??
    (price !== null && size !== null ? price * size * 100 : null);
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];

  return {
    kind: 'trade',
    id: String(idRaw ?? `${optSym}:${atIso}:${price}:${size}`),
    at: atIso,
    ticker: String(
      first(raw, ['underlying_symbol', 'ticker', 'underlying']) ?? osi?.root ?? ''
    ).toUpperCase(),
    type,
    strike: num(raw.strike) ?? osi?.strike ?? null,
    expiry,
    dte: dteOf(expiry, atIso),
    spot: num(first(raw, ['underlying_price', 'stock_price'])),
    bid,
    ask,
    price,
    fillPos: pos,
    outside,
    side,
    sideSource: source,
    size,
    premium,
    volume: num(raw.volume),
    openInterest: num(raw.open_interest),
    rule: null,
    sweep: tags.some((x: string) => /sweep/i.test(x)) || !!raw.is_sweep,
    floor: tags.some((x: string) => /floor/i.test(x)) || !!raw.is_floor,
    multileg: tags.some((x: string) => /multi/i.test(x)) || !!raw.is_multi_leg,
    tradeCount: 1,
  };
}

/** Bóc một khung WebSocket. UW được NHỚ là gửi `[kênh, nội dung]`; đọc dung
 *  thứ cả dạng object `{channel, data}` lẫn nội dung trần. Khung không phải
 *  JSON trả `null` — người gọi đếm nó chứ không ném. */
export function unwrapFrame(text: string): { channel: string | null; payload: any } | null {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (Array.isArray(j) && j.length === 2 && typeof j[0] === 'string') return { channel: j[0], payload: j[1] };
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    const ch = typeof j.channel === 'string' ? j.channel : null;
    if ('data' in j) return { channel: ch, payload: j.data };
    return { channel: ch, payload: j };
  }
  return { channel: null, payload: j };
}

/** Một nội dung có thể là một lệnh hoặc một mảng lệnh. */
export function tradesIn(payload: any): any[] {
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === 'object');
  if (payload && typeof payload === 'object') return [payload];
  return [];
}

/** Che khoá API trong mọi chuỗi đi ra ngoài (URL WebSocket mang `token=`). */
export function redactKey(s: string, key: string | undefined): string {
  let out = s.replace(/(token=)[^&\s"']+/gi, '$1***');
  if (key && key.length >= 4) out = out.split(key).join('***');
  return out;
}
