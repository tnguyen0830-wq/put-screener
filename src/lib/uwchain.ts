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
 * `fetchUwChain` tự đo nó lúc chạy và TỪ CHỐI thay vì trả một chuỗi thiếu
 * — xem `PAGE_SIZE_ASKED`.
 */

/** Hỏi bao nhiêu hợp đồng mỗi trang. Probe đo được `limit=50` trả đúng 50;
 *  `limit=500` thì CHƯA đo. Nếu tham số bị bỏ qua, một kỳ SPX vài trăm hợp
 *  đồng sẽ chỉ về 50 cái ĐẦU TIÊN theo thứ tự nào đó của UW — không phải
 *  50 strike gần giá. Một chuỗi như thế cho ra tường GEX SAI mà trông y hệt
 *  tường đúng, nên nó bị TỪ CHỐI chứ không được dùng: xem `truncated`. */
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
 * Cache theo mã. ĐÂY LÀ PHẦN GIỮ CHI PHÍ XUỐNG, không phải tối ưu hoá cho
 * vui: panel Phơi nhiễm MM tự làm mới mỗi 60 giây, mà một lượt lấy chuỗi là
 * 1 + MAX_EXPIRIES = 9 request. Không cache thì một tab để mở cả ngày là
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
   *  nghĩa là `limit` bị bỏ qua — chính là phép đo còn thiếu. */
  maxPage: number;
  /** Kỳ nào nghi bị cắt trang (trang đầy đúng bằng số đã hỏi, hoặc bằng 50
   *  trong khi hỏi nhiều hơn). Có phần tử nào ở đây là chuỗi KHÔNG dùng. */
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

  const settled = await mapWithLimit(jobs, CONCURRENCY, async (job) => {
    if (job.kind === 'spot') return { kind: 'spot' as const, spot: await uwSpot(ticker) };
    const res: any = await uwGet(
      `/api/stock/${encodeURIComponent(ticker)}/option-contracts`,
      { limit: PAGE_SIZE_ASKED, expiry: job.exp }
    );
    const rows: any[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    return { kind: 'exp' as const, exp: job.exp, rows };
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
    const n = p.value.rows.length;
    maxPage = Math.max(maxPage, n);
    /* Hai dấu hiệu cụt, và chúng KHÁC nhau. Trang đầy đúng bằng số đã hỏi
       nghĩa là có thể còn nữa. Trang đúng 50 trong khi hỏi 500 nghĩa là
       `limit` bị bỏ qua hẳn — nguy hiểm hơn, vì nó im lặng. */
    if (n >= PAGE_SIZE_ASKED || (n === 50 && PAGE_SIZE_ASKED > 50)) {
      truncated.push(p.value.exp);
    }
    if (n > 0) expKept.add(p.value.exp);
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
