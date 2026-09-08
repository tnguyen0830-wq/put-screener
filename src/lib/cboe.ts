/**
 * Chuỗi quyền chọn trễ 15 phút của CBOE - feed công khai, không cần key.
 *
 * Vì sao có file này: Schwab `/chains` trả chuỗi SPX với gamma và open
 * interest bằng 0 ở MỌI hợp đồng (lỗi API phía Schwab cho
 * `assetMainType=INDEX`, đã báo họ - xem CLAUDE.md, #108), còn Unusual
 * Whales chỉ bán 4 mức tổng hợp, không có gamma theo strike. Nên SPX chỉ
 * còn 4 con số, không có biểu đồ cột, không có phân tích AI.
 *
 * Trang mà chủ app hay đối chiếu (tapchiphowall.com/options-gamma) không
 * lấy từ broker nào cả: họ đọc feed trễ 15 phút của CBOE - sàn niêm yết
 * SPX. CBOE công bố file JSON cho từng mã, đủ mọi hợp đồng kèm
 * open_interest, gamma, delta, iv, bid/ask, volume và giá spot:
 *
 *   https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json
 *
 * Chỉ số có tiền tố "_" (`_SPX`, `_VIX`, `_NDX`), cổ phiếu/ETF thì không
 * (`AAPL.json`). Gần như mọi công cụ GEX mã nguồn mở cho SPX đều đọc đúng
 * file này. Miễn phí, không key, không quota - nên là bậc thang ĐỨNG TRƯỚC
 * UW: nó cho được biểu đồ cột và phân tích AI, UW thì không bao giờ.
 *
 * Đổi lại, dữ liệu trễ 15 phút và greeks là của CBOE tính. Với GEX thì trễ
 * gần như không ảnh hưởng: open interest chỉ cập nhật một lần mỗi ngày.
 * Màn hình vẫn phải nói rõ nguồn và giờ đọc - xem `asOf`.
 *
 * HÌNH DẠNG JSON DƯỚI ĐÂY CHƯA ĐO ĐƯỢC TỪ SANDBOX (cdn.cboe.com bị chặn
 * egress, cùng cảnh với Schwab và UW). Viết theo hình dạng phổ biến của
 * feed này, và theo đúng idiom tự chẩn đoán của repo: mọi trường đọc khoan
 * dung (số hoặc chuỗi số), và khi KHÔNG dựng được gì thì lỗi mang theo các
 * khoá thật CBOE trả về - top-level, trong `data`, và của một hợp đồng -
 * để lần chạy đầu trên production tự nói ra chỗ lệch thay vì hiện bốn dấu
 * gạch không lý do. Bài học `congress-trader`/`gex-levels` áp dụng nguyên xi.
 *
 * Output là ĐÚNG hình dạng chuỗi Schwab (`callExpDateMap`/`putExpDateMap`,
 * khoá kỳ "YYYY-MM-DD:dte", mỗi hợp đồng có strikePrice/gamma/openInterest/
 * delta/volatility/bid/ask/mark/daysToExpiration...) để `computeGex()`,
 * `flattenPuts()`/`flattenCalls()` và cả phần AI Trade Briefing đọc y như
 * chuỗi Schwab, không cần bộ tính thứ hai.
 */

const BASE = 'https://cdn.cboe.com/api/global/delayed_quotes/options';

/** Mã chỉ số CBOE viết với tiền tố "_". Cùng danh sách với route /api/gex. */
export const INDEX_ROOTS = new Set(['SPX', 'VIX', 'NDX', 'RUT', 'DJX', 'XSP', 'SPXW', 'OEX']);

export function isIndexSymbol(symbol: string): boolean {
  return INDEX_ROOTS.has(bareRoot(symbol));
}

/** "$SPX" / "$SPX.X" / "SPX" → "SPX"; "AAPL" → "AAPL". */
export function bareRoot(symbol: string): string {
  return symbol.replace(/^\$/, '').replace(/\.X$/i, '').toUpperCase();
}

/** Các tên file đáng thử, theo thứ tự. Chỉ số: "_SPX" trước, rồi "SPX" phòng
 *  khi CBOE đổi quy ước - cùng cách "thử lần lượt vài cách viết hợp lý" đã
 *  dùng cho Schwab, vì đoán đúng một lần rồi lại chờ người dùng báo lỗi là
 *  cách đắt nhất. Cổ phiếu chỉ có một cách viết. */
export function cboeSymbolCandidates(symbol: string): string[] {
  const root = bareRoot(symbol);
  return isIndexSymbol(symbol) ? [`_${root}`, root] : [root];
}

export class CboeError extends Error {
  constructor(
    message: string,
    /** Chi tiết để hiện trên màn hình: mã HTTP, hoặc các khoá thật đã thấy. */
    readonly detail?: string
  ) {
    super(message);
    this.name = 'CboeError';
  }
}

/** Số hoặc chuỗi số; chuỗi rỗng và mọi thứ khác → null (Number('') là 0,
 *  một ô trống mà thành 0 sẽ trông như một con số thật). */
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Ký hiệu hợp đồng kiểu OSI: gốc + YYMMDD + C/P + strike×1000 (8 chữ số).
 *  Ví dụ "SPXW260918C07400000" = SPXW, 2026-09-18, call, strike 7400. */
const OSI = /^([A-Z]+?)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

export function parseOsi(
  s: unknown
): { root: string; expiration: string; right: 'C' | 'P'; strike: number } | null {
  if (typeof s !== 'string') return null;
  const m = OSI.exec(s.trim().toUpperCase());
  if (!m) return null;
  const [, root, yy, mm, dd, right, k] = m;
  return {
    root,
    expiration: `20${yy}-${mm}-${dd}`,
    right: right as 'C' | 'P',
    strike: Number(k) / 1000,
  };
}

const dayMs = 24 * 60 * 60 * 1000;
const utcDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export type CboeConversion = {
  chain: any;
  /** Giờ CBOE đóng dấu lên feed, nguyên văn, để màn hình in ra. */
  asOf: string | null;
  diag: {
    topLevelKeys: string[];
    dataKeys: string[];
    optionKeys: string[];
    options: number;
    kept: number;
    droppedBadSymbol: number;
    droppedExpired: number;
    droppedBeyondWindow: number;
    expirations: number;
  };
};

/**
 * Chuyển payload CBOE sang hình dạng chuỗi Schwab. Thuần tuý, không gọi
 * mạng - để test được từ sandbox với một payload tự dựng.
 *
 * `days`: chỉ giữ các kỳ đáo hạn trong ngần ấy ngày, khớp với cửa sổ 60
 * ngày app đang xin Schwab - để wall của SPX (qua CBOE) và wall của QQQ
 * (qua Schwab) tính trên cùng một quy tắc.
 */
export function cboeToChain(
  payload: any,
  opts: { days?: number; today?: string } = {}
): CboeConversion {
  const days = opts.days ?? 60;
  const todayIso = opts.today ?? new Date().toISOString().slice(0, 10);
  const today = utcDay(todayIso);

  const topLevelKeys = Object.keys(payload ?? {});
  const data = payload?.data ?? payload ?? {};
  const dataKeys = Object.keys(data ?? {});
  const options: any[] = Array.isArray(data?.options) ? data.options : [];
  const optionKeys = options[0] && typeof options[0] === 'object' ? Object.keys(options[0]) : [];

  const diag: CboeConversion['diag'] = {
    topLevelKeys,
    dataKeys,
    optionKeys,
    options: options.length,
    kept: 0,
    droppedBadSymbol: 0,
    droppedExpired: 0,
    droppedBeyondWindow: 0,
    expirations: 0,
  };

  const spot = num(data?.current_price) ?? num(data?.last) ?? num(data?.close);
  const asOf =
    typeof payload?.timestamp === 'string'
      ? payload.timestamp
      : typeof data?.timestamp === 'string'
        ? data.timestamp
        : typeof data?.last_trade_time === 'string'
          ? data.last_trade_time
          : null;

  const chain: any = {
    status: 'SUCCESS',
    underlyingPrice: spot,
    underlying: spot !== null ? { last: spot, mark: spot } : undefined,
    callExpDateMap: {},
    putExpDateMap: {},
  };

  const expSeen = new Set<string>();
  for (const o of options) {
    const osi = parseOsi(o?.option ?? o?.symbol);
    if (!osi) {
      diag.droppedBadSymbol++;
      continue;
    }
    const dte = Math.round((utcDay(osi.expiration) - today) / dayMs);
    if (dte < 0) {
      diag.droppedExpired++;
      continue;
    }
    if (dte > days) {
      diag.droppedBeyondWindow++;
      continue;
    }
    const bid = num(o?.bid) ?? 0;
    const ask = num(o?.ask) ?? 0;
    const last = num(o?.last_trade_price);
    const mark = bid > 0 && ask > 0 ? (bid + ask) / 2 : (last ?? num(o?.theo) ?? 0);
    const iv = num(o?.iv);
    const contract = {
      symbol: String(o?.option ?? o?.symbol),
      putCall: osi.right === 'C' ? 'CALL' : 'PUT',
      strikePrice: osi.strike,
      expirationDate: osi.expiration,
      daysToExpiration: dte,
      bid,
      ask,
      last: last ?? 0,
      mark,
      // Schwab ghi IV theo phần trăm (28.4), CBOE theo thập phân (0.284).
      volatility: iv !== null ? iv * 100 : 0,
      delta: num(o?.delta) ?? 0,
      gamma: num(o?.gamma) ?? 0,
      theta: num(o?.theta) ?? null,
      vega: num(o?.vega) ?? null,
      openInterest: num(o?.open_interest) ?? 0,
      totalVolume: num(o?.volume) ?? 0,
    };
    const side = osi.right === 'C' ? 'callExpDateMap' : 'putExpDateMap';
    const expKey = `${osi.expiration}:${dte}`;
    const strikeKey = String(osi.strike);
    (chain[side][expKey] ??= {})[strikeKey] ??= [];
    chain[side][expKey][strikeKey].push(contract);
    expSeen.add(osi.expiration);
    diag.kept++;
  }
  diag.expirations = expSeen.size;

  return { chain, asOf, diag };
}

/** Một dòng chẩn đoán đọc được trên màn hình. Thứ tự theo giá trị thông tin
 *  (bài học #102): số đếm trước, khoá thật sau, vì phần đuôi là phần bị cắt. */
export function cboeDiagLine(d: CboeConversion['diag']): string {
  return (
    `${d.options} hợp đồng, giữ ${d.kept} qua ${d.expirations} kỳ · ` +
    `loại: ký hiệu lạ ${d.droppedBadSymbol}, đã hết hạn ${d.droppedExpired}, ` +
    `ngoài cửa sổ ${d.droppedBeyondWindow} · ` +
    `khoá: [${d.topLevelKeys.join(',')}] data:[${d.dataKeys.slice(0, 12).join(',')}] ` +
    `option:[${d.optionKeys.slice(0, 14).join(',')}]`
  );
}

const FETCH_TIMEOUT_MS = 20_000;

/**
 * Lấy chuỗi từ CBOE và chuyển sang hình dạng Schwab. Ném `CboeError` kèm
 * `detail` khi HTTP lỗi, không phải JSON, hay JSON có mà không dựng được
 * hợp đồng nào - lỗi cuối luôn mang các khoá thật.
 */
export async function fetchCboeChain(
  symbol: string,
  opts: { days?: number } = {}
): Promise<CboeConversion & { cboeSymbol: string }> {
  const candidates = cboeSymbolCandidates(symbol);
  const errors: string[] = [];
  for (const cs of candidates) {
    const url = `${BASE}/${encodeURIComponent(cs)}.json`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    let text: string;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
        cache: 'no-store',
      });
      text = await res.text();
    } catch (e: any) {
      errors.push(`${cs}: ${String(e?.name === 'AbortError' ? 'timeout' : e?.message ?? e)}`);
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      errors.push(`${cs}→${res.status}`);
      // 404 = tên file sai, thử cách viết tiếp theo. Mã khác (5xx, 403) thì
      // đổi tên cũng không cứu được - nhưng vẫn rẻ, nên cứ thử cho hết.
      continue;
    }
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      errors.push(`${cs}: không phải JSON (${text.slice(0, 80)})`);
      continue;
    }
    const conv = cboeToChain(payload, opts);
    if (conv.diag.kept > 0 && conv.chain.underlyingPrice) {
      return { ...conv, cboeSymbol: cs };
    }
    // Có JSON mà không ra hợp đồng nào: đây là chỗ hình dạng lệch với
    // giả định - in khoá thật ra, đúng việc của file này.
    errors.push(
      `${cs}: ${conv.chain.underlyingPrice ? '' : 'thiếu giá spot · '}${cboeDiagLine(conv.diag)}`
    );
  }
  throw new CboeError('CBOE không cho chuỗi dùng được', errors.join(' · '));
}
