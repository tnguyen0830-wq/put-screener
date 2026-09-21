/**
 * Phép đo TAPE của DXLink: từng lệnh khớp có mang đủ thứ để dựng FOOTPRINT
 * không?
 *
 * ============================================================
 * VÌ SAO ĐÁNG ĐO, VÀ VÌ SAO ĐO TRƯỚC KHI VIẾT TÍNH NĂNG
 * ============================================================
 *
 * Sau khi đường NinjaTrader/Tradovate dừng (#201) và tab Daytrade bản
 * Schwab lên (#202), còn thiếu đúng HAI thứ:
 *
 *   1. LUỒNG THỜI GIAN THỰC - `/pricehistory` của Schwab là REST hỏi-đáp,
 *      phải bấm lại mới có nến mới.
 *   2. FOOTPRINT - khối lượng mua/bán theo TỪNG MỨC GIÁ. Cần dữ liệu TỪNG
 *      LỆNH KHỚP kèm PHÍA CHỦ ĐỘNG; OHLCV không bao giờ cho được (đó cũng
 *      là lý do #202 ghi rõ VWAP của nó là XẤP XỈ).
 *
 * DXLink là đường DUY NHẤT đã ĐO ĐƯỢC là chạy (`dxprobe.ts`, 2026-09-18:
 * AAPL và VIX đều có dữ liệu), trên tài khoản tastytrade chủ app đã có,
 * không tốn thêm tiền, và KHÔNG thêm một mật khẩu môi giới nào vào bảng
 * env của Render - khác hẳn Tradovate, thứ đã khiến đường kia bị dừng.
 *
 * Nhưng phép đo cũ chỉ hỏi `Quote` và `Trade`. `Trade` chỉ có GIÁ CUỐI, nó
 * không phải cái tape. Nên bốn câu hỏi, xếp theo mức quyết định:
 *
 *   (1) `TimeAndSale` có chảy về không? Không có thì dừng, không có
 *       footprint từ nguồn này.
 *   (2) Sự kiện đó có mang PHÍA CHỦ ĐỘNG không - và nếu có thì trường đó
 *       có DÙNG ĐƯỢC không? Một trường lúc nào cũng `"Undefined"` là CÓ
 *       MẶT mà VÔ DỤNG, và hai chuyện đó không được trông giống nhau.
 *   (3) Không có phía thì có `bidPrice`/`askPrice` TẠI LÚC KHỚP để tự suy
 *       ra không (khớp ở giá chào bán = người mua chủ động)? Đây là đường
 *       lùi, và nó phải kèm một CON SỐ: bao nhiêu phần trăm số lệnh suy
 *       được - lệnh khớp nằm GIỮA bid và ask thì KHÔNG suy được và không
 *       bao giờ được gán bừa.
 *   (4) Máy chủ có GỘP NHỊP (conflation) không? Đây là câu hỏi nguy hiểm
 *       nhất: một footprint dựng trên tape đã gộp là SAI mà TRÔNG ĐÚNG -
 *       đúng hình dạng lỗi đã làm cả đường NinjaTrader bị dừng (luồng trễ
 *       10 phút). Câu trả lời KHÔNG suy từ số sự kiện đếm được mà đọc
 *       thẳng `aggregationPeriod` máy chủ TỰ CẤP trong FEED_CONFIG.
 *
 * ============================================================
 * MỌI TÊN TRƯỜNG TRONG FILE NÀY LÀ NHỚ, CHƯA XÁC NHẬN
 * ============================================================
 *
 * `demo.dxfeed.com` và mọi host của tastytrade đều bị chặn từ sandbox. Nên
 * file này KHÔNG kết luận theo tên trường: nó đọc tên trường THẬT của mọi
 * sự kiện nhận được, đếm giá trị của từng trường chuỗi, và chỉ khẳng định
 * ở chỗ dữ liệu tự nói ra. Nhớ sai một tên trường thì phép đo vẫn in ra
 * đúng tên thật, và đó chính là câu trả lời.
 *
 * File này KHÔNG import gì (chỉ import KIỂU, bị xoá lúc biên dịch) để test
 * độc lập được - cùng lý do `internals-pure.ts` tồn tại.
 */

import type { DxPlan } from './dxprobe';

/** Lùi 30 phút khi đăng ký tape. KHÔNG phải để tiết kiệm: ngoài giờ giao
 *  dịch mà chỉ nghe từ bây giờ thì tape rỗng, và "rỗng" trông Y HỆT "feed
 *  này không có TimeAndSale" - hai kết luận ngược nhau. Lùi đủ xa thì câu
 *  hỏi về HÌNH DẠNG trả lời được cả khi sàn đã đóng. */
export const TAPE_LOOKBACK_MS = 30 * 60_000;
/** Nến: lùi 2 giờ để chắc chắn có vài cây 5 phút. */
export const CANDLE_LOOKBACK_MS = 2 * 60 * 60_000;
export const CANDLE_PERIOD = '5m';

/** Cách viết mã nến của dxFeed - NHỚ, chưa xác nhận. Sai thì DXLink từ
 *  chối và lời từ chối nằm nguyên văn trong `messages`. */
export const candleSymbol = (symbol: string) => `${symbol}{=${CANDLE_PERIOD}}`;

/**
 * Tên trường xin cho TimeAndSale - NHỚ, chưa xác nhận, và đó chính là lý
 * do nó chỉ nằm ở kênh 3. Xin một tên sai có thể làm máy chủ từ chối CẢ
 * kênh; kênh 1 không gửi `acceptEventFields` nên không thể chết vì lý do
 * đó, và bộ trường mặc định nó trả về cũng là một phép đo.
 */
export const WANTED_TIMESALE_FIELDS = [
  'eventType',
  'eventSymbol',
  'time',
  'price',
  'size',
  'bidPrice',
  'askPrice',
  'aggressorSide',
  'exchangeCode',
  'exchangeSaleConditions',
];

/**
 * HAI kênh trên một kết nối, và đó là cả thiết kế của phép đo này.
 *
 * Kênh 1: KHÔNG gửi `acceptEventFields`. Không thể bị từ chối vì một tên
 * trường tôi nhớ sai, nên nó là đường nền bảo đảm có dữ liệu; bộ trường
 * mặc định máy chủ chọn chính là câu trả lời cho câu hỏi "schema thật là
 * gì". Nó cũng gánh Quote/Trade (đối chứng: feed có sống không) và Candle
 * (nến thời gian thực).
 *
 * Kênh 3: xin hẳn danh sách tên nhớ được, CHỈ TimeAndSale. Nếu dxFeed có
 * `aggressorSide` mà bộ mặc định không gửi, kênh này là chỗ duy nhất thấy
 * được. Nó chết thì chỉ mình nó chết.
 *
 * `acceptAggregationPeriod: 0` = xin KHÔNG gộp nhịp. Xin không có nghĩa là
 * được - đọc `aggregationPeriod` trong FEED_CONFIG mới biết máy chủ cấp gì.
 */
export function tapePlan(symbols: string[]): DxPlan {
  return {
    channels: [
      {
        channel: 1,
        acceptEventFields: null,
        acceptAggregationPeriod: 0,
        subscriptions: [
          { type: 'Quote' },
          { type: 'Trade' },
          { type: 'TimeAndSale', timeSeries: true, lookbackMs: TAPE_LOOKBACK_MS },
          {
            type: 'Candle',
            symbols: symbols.map(candleSymbol),
            timeSeries: true,
            lookbackMs: CANDLE_LOOKBACK_MS,
          },
        ],
      },
      {
        channel: 3,
        acceptEventFields: { TimeAndSale: WANTED_TIMESALE_FIELDS },
        acceptAggregationPeriod: 0,
        subscriptions: [{ type: 'TimeAndSale', timeSeries: true, lookbackMs: TAPE_LOOKBACK_MS }],
      },
    ],
  };
}

/* ============================================================
   QUAN SÁT
   ============================================================ */

export type TapeObservation = {
  channel: number;
  symbol: string;
  events: number;
  /** Tên trường THẬT, hợp nhất qua mọi sự kiện. Phép đo, không phải phỏng
   *  đoán. */
  fieldKeys: string[];
  /** Mỗi trường CHUỖI: đếm theo từng giá trị. Trường phía chủ động - nếu
   *  có - lộ ra ở đây, kèm bằng chứng nó dùng được hay không. */
  stringValues: Record<string, Record<string, number>>;
  withPrice: number;
  withSize: number;
  withBidAsk: number;
  inferBuy: number;
  inferSell: number;
  /** Khớp nằm GIỮA bid và ask: không suy được phía. Đếm riêng chứ không
   *  gán bừa - gán bừa là cách dựng một footprint sai mà trông đúng. */
  inferUnclear: number;
  firstEventTime: number | null;
  lastEventTime: number | null;
  /** Một sự kiện nguyên văn (cắt ngắn). Khi tôi nhớ sai tên trường, đây là
   *  thứ đọc được ngay để sửa. */
  sample: string | null;
};

export type TapeState = {
  /** Chi tiết TimeAndSale. Khoá `kênh|mã` - phải có KÊNH, vì hai kênh cùng
   *  đăng ký một mã và gộp lại là nhân đôi số đếm. */
  tape: Map<string, TapeObservation>;
  /** Đếm thô MỌI loại sự kiện, khoá `kênh|loại|mã`. Đây là thứ tách "feed
   *  chết" khỏi "feed sống mà không có TimeAndSale". */
  counts: Map<string, number>;
};

export function emptyTapeState(): TapeState {
  return { tape: new Map(), counts: new Map() };
}

const MAX_TRACKED_FIELDS = 40;
const MAX_TRACKED_VALUES = 16;
const SAMPLE_CLIP = 400;

/** `"NaN"` về dưới dạng CHUỖI trong JSON (đã đo ở VIX, #166), nên ép kiểu
 *  rồi kiểm hữu hạn là đủ cho cả số lẫn chuỗi. */
export function finiteNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Tra một trường theo tên viết thường, thử lần lượt các cách viết. Tên
 *  trường là thứ dễ nhớ sai nhất, nên không tra bằng đúng một cách viết. */
export function numField(ev: Record<string, unknown>, names: string[]): number | null {
  for (const key of Object.keys(ev)) {
    if (!names.includes(key.toLowerCase())) continue;
    const n = finiteNum(ev[key]);
    if (n !== null) return n;
  }
  return null;
}

const PRICE_NAMES = ['price'];
const SIZE_NAMES = ['size'];
const BID_NAMES = ['bidprice', 'bid'];
const ASK_NAMES = ['askprice', 'ask'];
const TIME_NAMES = ['time'];

function blank(channel: number, symbol: string): TapeObservation {
  return {
    channel,
    symbol,
    events: 0,
    fieldKeys: [],
    stringValues: {},
    withPrice: 0,
    withSize: 0,
    withBidAsk: 0,
    inferBuy: 0,
    inferSell: 0,
    inferUnclear: 0,
    firstEventTime: null,
    lastEventTime: null,
    sample: null,
  };
}

/** Gộp một thông điệp FEED_DATA vào bảng quan sát. */
export function observeTape(raw: string, into: TapeState): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg?.type !== 'FEED_DATA' || !Array.isArray(msg.data)) return;
  const channel = typeof msg.channel === 'number' ? msg.channel : -1;

  for (const ev of msg.data) {
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) continue;
    const symbol = typeof ev.eventSymbol === 'string' ? ev.eventSymbol : null;
    const kind = typeof ev.eventType === 'string' ? ev.eventType : null;
    if (!symbol || !kind) continue;

    const ck = `${channel}|${kind}|${symbol}`;
    into.counts.set(ck, (into.counts.get(ck) ?? 0) + 1);
    if (kind !== 'TimeAndSale') continue;

    const key = `${channel}|${symbol}`;
    const o = into.tape.get(key) ?? blank(channel, symbol);
    o.events += 1;
    if (o.sample === null) o.sample = JSON.stringify(ev).slice(0, SAMPLE_CLIP);

    for (const [k, v] of Object.entries(ev)) {
      if (!o.fieldKeys.includes(k) && o.fieldKeys.length < MAX_TRACKED_FIELDS) o.fieldKeys.push(k);
      if (typeof v !== 'string') continue;
      const bucket = (o.stringValues[k] ??= {});
      if (bucket[v] !== undefined) bucket[v] += 1;
      else if (Object.keys(bucket).length < MAX_TRACKED_VALUES) bucket[v] = 1;
    }

    const price = numField(ev, PRICE_NAMES);
    const size = numField(ev, SIZE_NAMES);
    const bid = numField(ev, BID_NAMES);
    const ask = numField(ev, ASK_NAMES);
    const t = numField(ev, TIME_NAMES);
    if (price !== null) o.withPrice += 1;
    if (size !== null) o.withSize += 1;
    if (bid !== null && ask !== null) {
      o.withBidAsk += 1;
      /* Suy phía theo lối kinh điển: khớp ở hoặc trên giá chào BÁN là
         người mua chủ động, ở hoặc dưới giá chào MUA là người bán chủ
         động. Ở giữa thì KHÔNG BIẾT - và đếm riêng chứ không chia đôi hay
         gán về một phía. `ask < bid` là báo giá chéo (dữ liệu rác hoặc lúc
         giao mở cửa), cũng vào ô không biết. */
      if (price !== null && ask >= bid) {
        if (price >= ask) o.inferBuy += 1;
        else if (price <= bid) o.inferSell += 1;
        else o.inferUnclear += 1;
      } else {
        o.inferUnclear += 1;
      }
    }
    if (t !== null) {
      if (o.firstEventTime === null || t < o.firstEventTime) o.firstEventTime = t;
      if (o.lastEventTime === null || t > o.lastEventTime) o.lastEventTime = t;
    }

    into.tape.set(key, o);
  }
}

/* ============================================================
   PHÂN LOẠI PHÍA CHỦ ĐỘNG - BẰNG GIÁ TRỊ, KHÔNG BẰNG TÊN
   ============================================================ */

const BUYISH = new Set(['buy', 'b', 'buyer']);
const SELLISH = new Set(['sell', 's', 'seller']);
const UNKNOWNISH = new Set(['undefined', 'u', 'none', 'n/a', 'null', '']);

export type SideFieldReading = {
  field: string;
  values: Record<string, number>;
  buy: number;
  sell: number;
  unknown: number;
  /** 'usable' = thấy CẢ hai phía; 'always-unknown' = có mặt mà vô dụng;
   *  'one-sided' = mới thấy một phía, CHƯA ĐỦ CĂN CỨ chứ không phải hỏng. */
  state: 'usable' | 'always-unknown' | 'one-sided';
};

/**
 * Trường nào trông như phía chủ động - xét theo GIÁ TRỊ, không theo tên.
 *
 * Đòi MỌI giá trị nằm trong từ vựng phía. Nhờ vậy một trường như
 * `exchangeSaleConditions` (giá trị kiểu "@TI") không lọt vào - và đó là
 * điểm quan trọng, vì một nhãn phía SAI trông y hệt một nhãn phía ĐÚNG,
 * chỉ khác là nó vẽ ngược cái footprint.
 *
 * CỐ Ý KHÔNG nhận "Bid"/"Ask" làm phía: ở một số feed chúng chỉ bên nào
 * của sổ lệnh bị ăn, mà chiều quy đổi sang mua/bán thì phép đo này không
 * chứng minh được - đoán sai là đảo ngược footprint. Chúng vẫn hiện đầy đủ
 * trong `stringValues` để chủ app tự nhìn.
 */
export function sideFields(o: TapeObservation): SideFieldReading[] {
  const out: SideFieldReading[] = [];
  for (const [field, values] of Object.entries(o.stringValues)) {
    const entries = Object.entries(values);
    if (!entries.length) continue;
    let buy = 0;
    let sell = 0;
    let unknown = 0;
    /** "Không rõ" VIẾT RA HẲN (`"Undefined"`) - khác chuỗi rỗng. Một
     *  trường toàn chuỗi rỗng không nói gì về phía; một trường toàn
     *  `"Undefined"` thì CÓ nói: nó là trường phía, và nó vô dụng. */
    let namedUnknown = 0;
    let alien = false;
    for (const [v, n] of entries) {
      const k = v.trim().toLowerCase();
      if (BUYISH.has(k)) buy += n;
      else if (SELLISH.has(k)) sell += n;
      else if (UNKNOWNISH.has(k)) {
        unknown += n;
        if (k !== '') namedUnknown += n;
      } else {
        alien = true;
        break;
      }
    }
    if (alien) continue;
    if (buy === 0 && sell === 0 && namedUnknown === 0) continue;
    out.push({
      field,
      values,
      buy,
      sell,
      unknown,
      state: buy > 0 && sell > 0 ? 'usable' : buy === 0 && sell === 0 ? 'always-unknown' : 'one-sided',
    });
  }
  // Trường dùng được đứng trước, để nơi gọi lấy phần tử đầu là đúng cái
  // đáng dùng nhất.
  const rank = (r: SideFieldReading) => (r.state === 'usable' ? 0 : r.state === 'one-sided' ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || b.buy + b.sell - (a.buy + a.sell));
}

export type FootprintRoute = 'feed' | 'infer' | 'no-side' | 'no-tape';

export type FootprintCheck = {
  channel: number;
  symbol: string;
  events: number;
  hasPrice: boolean;
  hasSize: boolean;
  sideFields: SideFieldReading[];
  withBidAsk: number;
  inferBuy: number;
  inferSell: number;
  inferUnclear: number;
  /** Tỉ lệ lệnh suy được phía, 0..1. `null` khi không có bid/ask để suy. */
  inferCoverage: number | null;
  route: FootprintRoute;
  reason: string;
};

export function footprintCheck(o: TapeObservation): FootprintCheck {
  const fields = sideFields(o);
  const usable = fields.find((f) => f.state === 'usable') ?? null;
  const decided = o.inferBuy + o.inferSell;
  const coverage = o.withBidAsk > 0 ? decided / o.withBidAsk : null;
  const hasPrice = o.withPrice > 0;
  const hasSize = o.withSize > 0;

  let route: FootprintRoute;
  let reason: string;

  if (o.events === 0) {
    route = 'no-tape';
    reason = 'Không có sự kiện TimeAndSale nào trên kênh này.';
  } else if (usable) {
    route = 'feed';
    reason =
      `Chính feed mang phía chủ động: trường \`${usable.field}\` có cả hai phía ` +
      `(${usable.buy} mua / ${usable.sell} bán / ${usable.unknown} không rõ). Footprint dựng thẳng từ đây.`;
  } else if (decided > 0) {
    route = 'infer';
    reason =
      `Không có trường phía dùng được, nhưng sự kiện mang bid/ask tại lúc khớp nên SUY ĐƯỢC: ` +
      `${o.inferBuy} mua chủ động / ${o.inferSell} bán chủ động / ${o.inferUnclear} nằm giữa (không suy được). ` +
      `Suy được ${Math.round((coverage ?? 0) * 100)}% số lệnh có bid/ask.`;
  } else {
    route = 'no-side';
    reason =
      'Có tape nhưng KHÔNG có đường nào ra phía chủ động: không trường phía dùng được, và ' +
      (o.withBidAsk === 0
        ? 'sự kiện không mang bid/ask tại lúc khớp để suy.'
        : 'không lệnh nào suy được từ bid/ask (tất cả nằm giữa hoặc thiếu giá).');
  }

  if (route !== 'no-tape' && (!hasPrice || !hasSize)) {
    reason +=
      ` NHƯNG thiếu ${!hasPrice ? 'GIÁ' : ''}${!hasPrice && !hasSize ? ' và ' : ''}${!hasSize ? 'KHỐI LƯỢNG' : ''}` +
      ' trên sự kiện - footprint là khối lượng theo mức giá, thiếu một trong hai là không dựng được.';
  }

  const unusable = fields.filter((f) => f.state !== 'usable');
  if (!usable && unusable.length) {
    const f = unusable[0];
    reason +=
      f.state === 'always-unknown'
        ? ` Trường \`${f.field}\` CÓ MẶT nhưng mọi giá trị đều là "không rõ" - có mà vô dụng, khác hẳn không có.`
        : ` Trường \`${f.field}\` mới chỉ thấy MỘT phía trong ${o.events} sự kiện - chưa đủ căn cứ, không phải là hỏng.`;
  }

  return {
    channel: o.channel,
    symbol: o.symbol,
    events: o.events,
    hasPrice,
    hasSize,
    sideFields: fields,
    withBidAsk: o.withBidAsk,
    inferBuy: o.inferBuy,
    inferSell: o.inferSell,
    inferUnclear: o.inferUnclear,
    inferCoverage: coverage,
    route,
    reason,
  };
}

/** Đường tốt nhất tìm được trên TẤT CẢ kênh và mã. Kênh 3 (xin hẳn tên
 *  trường) có thể thấy phía mà kênh 1 không thấy - và ngược lại nếu tôi
 *  nhớ sai tên; nên lấy cái tốt nhất chứ không cố định một kênh. */
export function bestRoute(checks: FootprintCheck[]): FootprintRoute {
  const order: FootprintRoute[] = ['feed', 'infer', 'no-side', 'no-tape'];
  for (const r of order) if (checks.some((c) => c.route === r)) return r;
  return 'no-tape';
}

/** Đếm thô theo loại sự kiện, gộp mọi mã - để trả lời "feed có sống
 *  không" tách khỏi "feed sống mà không có tape". */
export function countsByType(state: TapeState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of state.counts) {
    const kind = k.split('|')[1] ?? '?';
    out[kind] = (out[kind] ?? 0) + n;
  }
  return out;
}
