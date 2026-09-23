import { uwGet, uwConfigured } from './unusualwhales';
import { uwTicker } from './uwgex';
import { parseOsi } from './cboe';
import { mapWithLimit } from './maplimit';

/**
 * Chuỗi quyền chọn THỜI GIAN THỰC từ Unusual Whales, chuyển sang ĐÚNG hình
 * dạng chuỗi Schwab.
 *
 * Vì sao file này tồn tại, và vì sao nó là một CHUỖI chứ không phải một
 * nguồn cấp cho riêng mấy cái panel: `option-contracts` trả greek THÔ
 * (`delta`, `gamma` là SỐ) kèm `open_interest`, `volume` và NBBO — tức đủ
 * để dựng lại hình dạng Schwab y như `cboeToChain()` đã làm. Khi đó
 * `computeGex()`, `mmexposure.ts`, AI Trade Briefing và bảng 0DTE chạy
 * NGUYÊN SI, bằng ĐƠN VỊ và QUY ƯỚC DẤU của chính app.
 *
 * Đó là lý do KHÔNG dùng mấy endpoint đã-nhân-sẵn của UW
 * (`greek-exposure/strike`, `spot-exposures/strike`), dù chúng theo strike
 * và trông tiện hơn hẳn. Hai cái bẫy, cả hai đều tạo ra con số SAI mà
 * TRÔNG ĐÚNG:
 *
 *   1. ĐƠN VỊ khác. `call_gex` kỳ đầu của SPX đọc ~59.025, trong khi thang
 *      của app là `spot² × 0,01 × 100` ≈ 6,0e7 cho mỗi đơn vị gamma. Một
 *      biểu đồ vẽ bằng thang UW sẽ cãi nhau với `/api/gex` ở màn hình kế
 *      bên, và không gì trên màn hình nói bên nào đúng.
 *   2. UW ĐÃ áp quy ước dấu dealer — `put_gex` về đã âm. `mmexposure.ts`
 *      tự đổi dấu put, nên áp chồng lên sẽ LẬT NGƯỢC biểu đồ mà trông vẫn
 *      hoàn toàn bình thường. Đúng con lỗi file đó viết ra để chặn.
 *
 * Lấy greek thô rồi tự tính thì cả hai bẫy biến mất, và chỉ còn MỘT đường
 * tính trong cả app (bài học #96/#99/#147).
 *
 * VỊ TRÍ TRONG THANG: Schwab → **UW** → CBOE. Trên CBOE vì UW là thời gian
 * thực còn CBOE trễ 15 phút; dưới Schwab vì Schwab miễn phí và không có
 * hạn mức. Với SPY/QQQ/IWM thì Schwab chạy tốt nên UW KHÔNG BAO GIỜ được
 * gọi tới — chỗ nó thật sự có tác dụng là SPX, nơi Schwab trả OI = 0 ở mọi
 * hợp đồng (#108).
 *
 * CHƯA ĐO ĐƯỢC TỪ SANDBOX (`api.unusualwhales.com` bị chặn egress): chính
 * lượt gọi. Hình dạng bản ghi thì ĐÃ đo — hai vòng probe production
 * 2026-09-22, SPX và SPY — nên tên trường ở đây là đo được, không phải nhớ
 * được. Thứ chưa đo là PHÂN TRANG, và đó cũng là thứ nguy hiểm nhất, nên
 * `fetchUwChain` tự đo nó lúc chạy — xem `PAGE_PARAM`. Production
 * 2026-09-23 trả lời: chuỗi CÓ bị cắt trang (8/8 kỳ đầy trang), nên giờ
 * nó lật trang thật; thứ còn chưa đo là tên tham số `page`, và điều đó
 * được KIỂM lúc chạy chứ không tin, rồi TỪ CHỐI nếu không lấy đủ.
 */

/** Hỏi bao nhiêu hợp đồng mỗi trang. Probe đo được `limit=50` trả đúng 50;
 *  `limit=500` thì CHƯA đo, và giờ KHÔNG CÒN QUAN TRỌNG: phép dừng của
 *  `fetchExpiryPages()` so với trang LỚN NHẤT đã thấy chứ không với con số
 *  này, nên UW chặn ở đâu cũng lật trang đúng. Con số vẫn để cao để bớt
 *  số lượt gọi khi `limit` thật sự được tôn trọng. */
const PAGE_SIZE_ASKED = 500;

/** Số kỳ đáo hạn lấy về, gần nhất trước. Cùng con số và cùng lý do với
 *  `fullChainSliced()` của Schwab: SPX đáo hạn gần như mỗi ngày giao dịch
 *  nên 60 ngày là 40+ kỳ, mà gamma tập trung ở các kỳ gần — lấy hết là bắt
 *  người dùng ngồi chờ hàng chục giây cho một màn hình vừa mở. Cũng là trần
 *  chi phí: mỗi kỳ là một request trên hạn mức 30.000/ngày. */
const MAX_EXPIRIES = 8;

/** UW cho tối đa 3 request ĐỒNG THỜI trên gói này (đo được, 429 nguyên văn
 *  ở vòng probe thứ hai). Để 2, chừa một suất cho vòng lặp cảnh báo nền —
 *  trần đó là của CẢ TÀI KHOẢN, không phải của riêng chỗ gọi này. */
const CONCURRENCY = 2;

/**
 * PHÂN TRANG — phép đo còn thiếu của #210, và production vừa trả lời: BỊ
 * CẮT. Ảnh chụp tab GEX 2026-09-23 với `$SPX`: *"UW cắt trang: 8/8 kỳ (UW
 * có 33)"* — tức CẢ TÁM kỳ đều đầy trang, nên cả chuỗi bị từ chối và màn
 * hình rơi xuống CBOE trễ 15 phút. Hỏi một trang rồi bỏ cuộc là không đủ.
 *
 * Tên tham số `page` là NHỚ ĐƯỢC chứ chưa đo, nên nó được **đo lúc chạy**
 * thay vì tin: trang kế tiếp phải mang hợp đồng MỚI (so theo
 * `option_symbol`). Nếu nó trả lại đúng bộ cũ thì tham số bị bỏ qua, và đó
 * là một kết luận khác hẳn "hết hàng" — nó bị gọi tên riêng (`page-ignored`)
 * và chuỗi vẫn bị từ chối, vì lặp lại trang đầu mãi mãi cũng không lấy
 * được phần còn thiếu.
 *
 * ĐIỀU KIỆN DỪNG không phải "trang nhỏ hơn số đã hỏi" — đó chính là cái bẫy
 * `limit` bị bỏ qua: nếu UW chặn ở 50 thì trang đầu trả 50 < 500 và phép
 * kiểm ngây thơ sẽ kết luận "xong" rồi dựng tường GEX trên 50 hợp đồng.
 * Dừng khi trang RỖNG, hoặc nhỏ hơn trang LỚN NHẤT đã thấy — đúng với cả
 * hai trường hợp, không cần biết trước UW chặn ở đâu.
 */
const PAGE_PARAM = 'page';
/** Trần trang cho MỘT kỳ. Ở mức chặn 50 thì đây là ~600 hợp đồng, dư cho
 *  một kỳ SPX; vượt qua nghĩa là có gì đó không như hiểu biết hiện tại, và
 *  câu trả lời đúng là TỪ CHỐI kèm lý do chứ không đi tiếp mãi. */
const MAX_PAGES = 12;
/**
 * Trần request cho CẢ một lượt lấy chuỗi, spot tính luôn vào.
 *
 * Đây là thứ giữ cho phân trang không biến thành #78 lần hai: nếu UW chặn
 * `limit` ở 50 thì 8 kỳ × 11 trang = 88 request MỖI LƯỢT, và panel tự làm
 * mới mỗi 60 giây. Trần cứng ở 24 nghĩa là chi phí tệ nhất biết trước
 * được; hết trần thì các kỳ còn lại bị ghi là cụt và cả chuỗi bị từ chối
 * kèm lý do thật — chứ không phải lặng lẽ dựng tường trên nửa chuỗi.
 */
const MAX_REQUESTS = 24;

/**
 * Cache theo mã. ĐÂY LÀ PHẦN GIỮ CHI PHÍ XUỐNG, không phải tối ưu hoá cho
 * vui: panel Phơi nhiễm MM tự làm mới mỗi 60 giây, mà một lượt lấy chuỗi là
 * 1 + MAX_EXPIRIES trang đầu, và nhiều hơn khi phải lật trang (trần cứng
 * `MAX_REQUESTS`). Không cache thì một tab để mở cả ngày là
 * ~12.960 request, tức gần nửa hạn mức ngày cho MỘT màn hình — đúng hình
 * dạng đã đốt sạch hạn mức ở #78.
 *
 * 120 giây là con số CÓ LÝ DO, không phải số tròn: GEX = gamma × open
 * interest, mà open interest chỉ cập nhật MỘT LẦN mỗi ngày. Phần thật sự
 * động là giá và greek. Nên 2 phút vẫn tươi hơn CBOE (15 phút) gần tám
 * lần, trong khi cắt chi phí còn ~6.480/ngày cho một tab mở liên tục.
 *
 * Trạng thái cấp module KHÔNG dùng chung giữa các route (#193 — webpack
 * nhét một bản sao vào từng bundle), nên `/api/gex` và
 * `/api/daytrade/exposure` mỗi cái giữ cache riêng: mở cả hai là tốn gấp
 * đôi. Chấp nhận, vì đây là CACHE chứ không phải trạng thái đúng/sai — một
 * cache đĩa dùng chung là một thay đổi lớn hơn hẳn cho một khoản tiết kiệm
 * chỉ xảy ra khi mở nhiều tab cùng lúc.
 */
const TTL_MS = 120_000;
/** Mã đã đo được là UW không phục vụ nổi (phân trang cụt, hoặc UW từ chối)
 *  bị nghỉ hẳn một lúc thay vì hỏi lại mỗi 2 phút. Cùng lối `gnews.ts` nghỉ
 *  6 tiếng khi đo được là bị chặn: một đường hỏng lặp vô hạn là một đường
 *  vừa tốn tiền vừa không ai đọc. */
const COOLDOWN_MS = 600_000;

type CacheEntry = { at: number; value: UwChain };
const cache = new Map<string, CacheEntry>();
const cooldown = new Map<string, { until: number; why: string }>();

export class UwChainError extends Error {
  constructor(
    message: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = 'UwChainError';
  }
}

/** Số hoặc chuỗi số; chuỗi rỗng và mọi thứ khác → null. Y như `cboe.ts`:
 *  `Number('')` là 0, nên một ô trống mà thành 0 sẽ trông như số thật.
 *  Cần thật, không phải phòng xa: UW trả `delta`/`gamma`/`open_interest`
 *  dạng SỐ nhưng `nbbo_bid`/`nbbo_ask`/`implied_volatility` dạng CHUỖI —
 *  đo được ở cả hai vòng probe. */
export const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const dayMs = 24 * 60 * 60 * 1000;
const utcDay = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Hôm nay theo giờ NEW YORK. Hỏi theo ngày UTC thì sau 20:00 ET ngày đã
 *  sang hôm sau, nên kỳ đáo hạn HÔM NAY bị tính dte = -1 và bị loại — một
 *  chuỗi 0DTE rỗng trông y hệt "hôm nay không có kỳ nào". */
export function nyToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export type UwDiag = {
  /** Kỳ UW nói là có, trong cửa sổ. */
  expirationsAvailable: number;
  /** Kỳ thực sự đã hỏi (trần MAX_EXPIRIES). */
  expirationsAsked: number;
  /** Kỳ trả về ít nhất một hợp đồng dùng được. */
  expirationsKept: number;
  contracts: number;
  kept: number;
  droppedBadSymbol: number;
  droppedNoGreeks: number;
  /** Số hợp đồng lớn nhất một trang trả về. Bằng 50 trong khi đã hỏi 500
   *  nghĩa là UW chặn `limit` ở 50 — đáng biết, nhưng không còn làm hỏng
   *  phép lật trang (xem `fetchExpiryPages`). */
  maxPage: number;
  /** Kỳ nào KHÔNG lật hết được, kèm LÝ DO (`page-ignored` / `page-cap` /
   *  `budget`) — ba lý do, ba cách sửa. Có phần tử nào ở đây là chuỗi
   *  KHÔNG dùng. */
  truncated: string[];
  /** Khoá thật của một bản ghi, để lần chạy đầu tự nói ra chỗ lệch. */
  recordKeys: string[];
  errors: string[];
};

export type UwChain = { chain: any; asOf: string | null; diag: UwDiag };

/**
 * Chuyển các bản ghi `option-contracts` sang hình dạng chuỗi Schwab. HÀM
 * THUẦN — test được không cần mạng, đúng lối `cboeToChain()`.
 *
 * `option-contracts` KHÔNG có trường strike: strike nằm trong `option_symbol`
 * kiểu OSI (`SPXW260922C07780000`). Dùng lại `parseOsi()` của `cboe.ts` chứ
 * không viết bản thứ hai — cùng một định dạng, và bản chép là bản sẽ trôi
 * lệch (bài học #100).
 */
export function uwToChain(
  rows: any[],
  opts: { spot?: number | null; today?: string; days?: number } = {}
): { chain: any; asOf: string | null; partial: Omit<UwDiag, 'expirationsAvailable' | 'expirationsAsked' | 'expirationsKept' | 'maxPage' | 'truncated' | 'errors'> } {
  const todayIso = opts.today ?? nyToday();
  const today = utcDay(todayIso);
  const days = opts.days ?? 60;

  const first = rows.find((r) => r && typeof r === 'object');
  const chain: any = {
    status: 'SUCCESS',
    underlyingPrice: opts.spot ?? null,
    underlying: opts.spot != null ? { last: opts.spot, mark: opts.spot } : undefined,
    callExpDateMap: {},
    putExpDateMap: {},
  };

  let kept = 0;
  let droppedBadSymbol = 0;
  let droppedNoGreeks = 0;
  let asOf: string | null = null;

  for (const r of rows) {
    const osi = parseOsi(r?.option_symbol);
    if (!osi) {
      droppedBadSymbol++;
      continue;
    }
    const dte = Math.round((utcDay(osi.expiration) - today) / dayMs);
    if (dte < 0 || dte > days) continue;

    /* Gamma là vế BẮT BUỘC: GEX = gamma × OI, nên một hợp đồng không có
       gamma không đóng góp được gì và giữ lại chỉ làm số đếm nói dối.
       Delta thì KHÔNG bắt buộc — thiếu delta chỉ mất panel 3, và `gex.ts`
       vốn không đọc delta; ép nó thành 0 ở đây sẽ làm "vắng" và "bằng 0"
       không phân biệt được, đúng cái `mmexposure.ts` đã phải đếm riêng. */
    const gamma = num(r?.gamma);
    if (gamma === null) {
      droppedNoGreeks++;
      continue;
    }

    const bid = num(r?.nbbo_bid) ?? 0;
    const ask = num(r?.nbbo_ask) ?? 0;
    const last = num(r?.last_price);
    const mark = bid > 0 && ask > 0 ? (bid + ask) / 2 : (last ?? 0);
    const iv = num(r?.implied_volatility);
    const delta = num(r?.delta);

    const contract = {
      symbol: String(r.option_symbol),
      putCall: osi.right === 'C' ? 'CALL' : 'PUT',
      strikePrice: osi.strike,
      expirationDate: osi.expiration,
      daysToExpiration: dte,
      bid,
      ask,
      last: last ?? 0,
      mark,
      // Schwab ghi IV theo phần trăm (28.4), UW theo thập phân (0.284) —
      // đo được: `implied_volatility: "0.1120756901581306"`. Cùng phép đổi
      // như CBOE; quên nó là IV sai 100 lần mà vẫn là một con số hợp lệ.
      volatility: iv !== null ? iv * 100 : 0,
      delta: delta ?? 0,
      gamma,
      theta: num(r?.theta),
      vega: num(r?.vega),
      openInterest: num(r?.open_interest) ?? 0,
      totalVolume: num(r?.volume) ?? 0,
    };

    const side = osi.right === 'C' ? 'callExpDateMap' : 'putExpDateMap';
    const expKey = `${osi.expiration}:${dte}`;
    const strikeKey = String(osi.strike);
    (chain[side][expKey] ??= {})[strikeKey] ??= [];
    chain[side][expKey][strikeKey].push(contract);
    kept++;

    const t = r?.last_tape_time;
    if (typeof t === 'string' && (asOf === null || t > asOf)) asOf = t;
  }

  return {
    chain,
    asOf,
    partial: {
      contracts: rows.length,
      kept,
      droppedBadSymbol,
      droppedNoGreeks,
      recordKeys: first ? Object.keys(first) : [],
    },
  };
}

/** Kỳ đáo hạn trong cửa sổ, gần nhất trước. Dùng `greek-exposure/expiry`
 *  (một request) chứ không bóc từ `option-chains` (30.470 chuỗi mã cho SPX,
 *  tốn băng thông cho một việc đã có endpoint rẻ hơn).
 *
 *  `dte` của UW có sẵn trong bản ghi nhưng KHÔNG được dùng: dte phải tính
 *  theo cùng một mốc "hôm nay" với `uwToChain()`, nếu không một kỳ có thể
 *  lọt qua vòng này rồi bị loại ở vòng sau, và số đếm trên màn hình nói dối. */
export async function uwExpirations(
  ticker: string,
  opts: { days?: number; today?: string } = {}
): Promise<string[]> {
  const days = opts.days ?? 60;
  const today = utcDay(opts.today ?? nyToday());
  const res: any = await uwGet(`/api/stock/${encodeURIComponent(ticker)}/greek-exposure/expiry`);
  const rows: any[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  const out: string[] = [];
  for (const r of rows) {
    const e = r?.expiry;
    if (typeof e !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e)) continue;
    const dte = Math.round((utcDay(e) - today) / dayMs);
    if (dte < 0 || dte > days) continue;
    out.push(e);
  }
  return [...new Set(out)].sort();
}

/** Giá spot. `option-contracts` không mang giá cơ sở, mà `computeGex()` bắt
 *  buộc phải có — không có spot thì không có zero gamma và không có đường
 *  giá trên biểu đồ. `spot-exposures` (chuỗi thời gian) mang `price`, và
 *  bản ghi MỚI NHẤT là spot hiện tại. Một request. */
export async function uwSpot(ticker: string): Promise<number | null> {
  const res: any = await uwGet(`/api/stock/${encodeURIComponent(ticker)}/spot-exposures`);
  const rows: any[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  let best: { t: string; price: number } | null = null;
  for (const r of rows) {
    const p = num(r?.price);
    const t = typeof r?.time === 'string' ? r.time : typeof r?.start_time === 'string' ? r.start_time : '';
    if (p === null) continue;
    if (!best || t > best.t) best = { t, price: p };
  }
  return best?.price ?? null;
}

export function uwDiagLine(d: UwDiag): string {
  return (
    `${d.expirationsKept}/${d.expirationsAsked} kỳ (UW có ${d.expirationsAvailable}) · ` +
    `${d.contracts} hợp đồng, giữ ${d.kept} · ` +
    `loại: ký hiệu lạ ${d.droppedBadSymbol}, thiếu gamma ${d.droppedNoGreeks} · ` +
    `trang lớn nhất ${d.maxPage}/${PAGE_SIZE_ASKED}` +
    (d.truncated.length ? ` · NGHI CỤT: ${d.truncated.slice(0, 4).join(',')}` : '') +
    (d.errors.length ? ` · lỗi: ${d.errors.slice(0, 2).join(' | ')}` : '') +
    ` · khoá: [${d.recordKeys.slice(0, 14).join(',')}]`
  );
}

export function uwChainConfigured(): boolean {
  return uwConfigured();
}

/**
 * Lấy chuỗi thời gian thực từ UW và chuyển sang hình dạng Schwab.
 *
 * TỰ ĐO PHÂN TRANG rồi TỪ CHỐI, chứ không trả một chuỗi thiếu. Nếu một kỳ
 * trả về đúng bằng số hợp đồng đã hỏi — hoặc đúng 50 trong khi đã hỏi 500,
 * tức `limit` bị bỏ qua — thì không có cách nào biết phần thiếu là gì, và
 * 50 hợp đồng ĐẦU TIÊN theo thứ tự của UW gần như chắc chắn không phải 50
 * strike quanh giá. Một chuỗi như vậy cho ra tường GEX sai mà trông y hệt
 * tường đúng, nên nó bị ném kèm lý do thật và thang rơi xuống CBOE. Chính
 * dòng chẩn đoán đó là phép đo còn thiếu về `limit`.
 */
/** Vì sao một kỳ không lấy đủ. Ba lý do, ba cách sửa khác nhau — gộp
 *  chúng thành một chữ "cụt" là đúng thứ repo này cấm. */
export type PageStop = 'done' | 'page-ignored' | 'page-cap' | 'budget';

export type ExpiryPages = {
  exp: string;
  rows: any[];
  /** Số lượt gọi đã dùng cho kỳ này. */
  requests: number;
  /** Trang lớn nhất thấy được — bằng 50 trong khi hỏi 500 nghĩa là `limit`
   *  bị bỏ qua, và phép dừng bên dưới vẫn đúng vì nó so với con số NÀY. */
  pageSize: number;
  stop: PageStop;
};

/**
 * Lấy trọn MỘT kỳ đáo hạn, lật trang cho tới khi hết.
 *
 * Tách ra và nhận `get` làm tham số để test được không cần mạng — cùng lý
 * do `uwToChain()` là hàm thuần. `budget` là ô DÙNG CHUNG giữa các worker
 * nên trần là trần thật, không phải trần mỗi kỳ.
 */
export async function fetchExpiryPages(
  exp: string,
  get: (page: number) => Promise<any[]>,
  budget: { left: number }
): Promise<ExpiryPages> {
  const rows: any[] = [];
  const seen = new Set<string>();
  let requests = 0;
  let pageSize = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (budget.left <= 0) return { exp, rows, requests, pageSize, stop: 'budget' };
    budget.left--;
    requests++;
    const got = await get(page);
    pageSize = Math.max(pageSize, got.length);

    let fresh = 0;
    for (const r of got) {
      const id = typeof r?.option_symbol === 'string' ? r.option_symbol : null;
      /* Bản ghi không có ký hiệu thì KHÔNG bị coi là trùng: `uwToChain()`
         sẽ tự loại nó và đếm riêng. Coi nó là trùng ở đây sẽ khiến một
         trang toàn bản ghi lạ đọc thành "trang bị bỏ qua", tức chẩn đoán
         chỉ sai chỗ. */
      if (id !== null) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      rows.push(r);
      fresh++;
    }

    /* Trang rỗng = hết hàng, kể cả ở trang đầu. */
    if (got.length === 0) return { exp, rows, requests, pageSize, stop: 'done' };
    /* Trang thứ hai trở đi mà KHÔNG có hợp đồng nào mới: `page` bị bỏ qua.
       Khác hẳn "hết hàng" — ở đây phần còn thiếu là không lấy được. */
    if (page > 0 && fresh === 0) {
      return { exp, rows, requests, pageSize, stop: 'page-ignored' };
    }
    /* Nhỏ hơn trang lớn nhất đã thấy = trang cuối. CỐ Ý không so với
       `PAGE_SIZE_ASKED`: nếu UW chặn ở 50 thì mọi trang đầy đều là 50 và
       phép so kia sẽ dừng ngay ở trang đầu. */
    if (got.length < pageSize) return { exp, rows, requests, pageSize, stop: 'done' };
  }
  return { exp, rows, requests, pageSize, stop: 'page-cap' };
}

export async function fetchUwChain(
  symbol: string,
  opts: { days?: number; today?: string } = {}
): Promise<UwChain> {
  if (!uwConfigured()) throw new UwChainError('UW_API_KEY chưa được cấu hình');
  const ticker = uwTicker(symbol);
  const days = opts.days ?? 60;
  const today = opts.today ?? nyToday();
  const key = `${ticker}:${days}:${today}`;

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const cool = cooldown.get(key);
  if (cool && now < cool.until) throw new UwChainError('UW đang nghỉ', cool.why);

  const expirations = await uwExpirations(ticker, { days, today });
  if (!expirations.length) {
    throw new UwChainError('UW không trả kỳ đáo hạn nào trong cửa sổ', `${days} ngày`);
  }
  const asked = expirations.slice(0, MAX_EXPIRIES);

  /* Spot đi CHUNG một hàng đợi với các kỳ, không phải `Promise.all` bên
     cạnh nó. Bản đầu chạy song song và phép đo bắt được ngay: đỉnh đồng
     thời là 3 — đúng bằng trần của UW — nên chẳng chừa suất nào cho vòng
     lặp cảnh báo nền, tức là mất đúng lý do CONCURRENCY để 2 thay vì 3.
     Một hàng đợi thì trần là trần thật. */
  type Job = { kind: 'spot' } | { kind: 'exp'; exp: string };
  const jobs: Job[] = [{ kind: 'spot' }, ...asked.map((exp) => ({ kind: 'exp' as const, exp }))];

  /* Ô ngân sách DÙNG CHUNG cho cả lượt (spot tính luôn), nên hai worker
     không thể cộng dồn thành gấp đôi trần. */
  const budget = { left: MAX_REQUESTS };

  const settled = await mapWithLimit(jobs, CONCURRENCY, async (job) => {
    if (job.kind === 'spot') {
      budget.left--;
      return { kind: 'spot' as const, spot: await uwSpot(ticker) };
    }
    const page = await fetchExpiryPages(
      job.exp,
      async (p) => {
        const res: any = await uwGet(
          `/api/stock/${encodeURIComponent(ticker)}/option-contracts`,
          { limit: PAGE_SIZE_ASKED, expiry: job.exp, [PAGE_PARAM]: p }
        );
        return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      },
      budget
    );
    return { kind: 'exp' as const, ...page };
  });

  /* Spot hỏng KHÔNG làm hỏng chuỗi: `computeGex()` sẽ tự từ chối vì thiếu
     spot, và khi đó thang rơi xuống CBOE với lý do thật — khác hẳn việc
     ném ở đây và mất luôn cả tám kỳ vừa lấy về. */
  const spotRes = settled[0];
  const spot =
    spotRes.status === 'fulfilled' && spotRes.value.kind === 'spot' ? spotRes.value.spot : null;
  const pages = settled.slice(1);

  const rows: any[] = [];
  const errors: string[] = [];
  const truncated: string[] = [];
  let maxPage = 0;
  const expKept = new Set<string>();

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (p.status === 'rejected') {
      errors.push(`${asked[i]}: ${String(p.reason?.message ?? p.reason).slice(0, 120)}`);
      continue;
    }
    if (p.value.kind !== 'exp') continue;
    maxPage = Math.max(maxPage, p.value.pageSize);
    /* `stop` đã là KẾT LUẬN, không phải một con số phải đoán lại ở đây:
       `done` nghĩa là đã lật tới trang cuối, mọi giá trị khác nghĩa là kỳ
       này còn thiếu hợp đồng và không có cách nào biết thiếu cái gì. */
    if (p.value.stop !== 'done') truncated.push(`${p.value.exp}:${p.value.stop}`);
    if (p.value.rows.length > 0) expKept.add(p.value.exp);
    rows.push(...p.value.rows);
  }

  const { chain, asOf, partial } = uwToChain(rows, { spot, today, days });
  const diag: UwDiag = {
    expirationsAvailable: expirations.length,
    expirationsAsked: asked.length,
    expirationsKept: expKept.size,
    maxPage,
    truncated,
    errors,
    ...partial,
  };

  if (truncated.length) {
    const why =
      `UW cắt trang: ${uwDiagLine(diag)} — một chuỗi thiếu hợp đồng cho ra ` +
      `tường GEX sai mà trông như đúng, nên KHÔNG dùng.`;
    cooldown.set(key, { until: now + COOLDOWN_MS, why });
    throw new UwChainError('Chuỗi UW không đầy đủ', why);
  }
  if (!diag.kept) {
    const why = uwDiagLine(diag);
    cooldown.set(key, { until: now + COOLDOWN_MS, why });
    throw new UwChainError('UW không dựng được hợp đồng nào', why);
  }

  const value: UwChain = { chain, asOf, diag };
  cache.set(key, { at: now, value });
  return value;
}

/** Chỉ dùng trong test: xoá cache và thời gian nghỉ. */
export function _resetUwChainCache(): void {
  cache.clear();
  cooldown.clear();
}
