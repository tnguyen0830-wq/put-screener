/**
 * Diễn biến giá của một mã so với thị trường (SPY) và ngành (ETF SPDR của
 * ngành) — phần "code tính" cho câu hỏi của chủ app ở tab Analyze: *thị
 * trường đang nói gì, vì sao mã này rớt / lên / đi ngang*.
 *
 * Câu "vì sao" là câu dễ bịa nhất: một mô hình ngôn ngữ luôn nghĩ ra được một
 * lý do nghe lọt tai cho bất kỳ cú rớt nào. Nên hai nửa khó của nó được tính
 * ở ĐÂY chứ không để Claude tự suy:
 *
 * 1. Mã đang tăng, giảm hay đi ngang — so với CHÍNH biến động của nó (HV20),
 *    không phải một ngưỡng phần trăm cố định: 2% trong 5 phiên là "đi ngang"
 *    với một mã biến động 60%/năm và là một cú rớt thật với một mã tiện ích.
 * 2. Nó đi CÙNG thị trường, cùng ngành, hay đi RIÊNG. Một mã rớt 4% trong
 *    tuần SPY rớt 4% không cần tin tức riêng nào để giải thích; một mã rớt 4%
 *    trong tuần SPY tăng thì cần. Không có phép so này thì mọi tiêu đề tiêu
 *    cực đều trông như "nguyên nhân".
 *
 * Claude chỉ ghép nhãn này với tin tức có ngày tháng. File THUẦN, không import
 * gì — biên dịch và `require()` độc lập được để test (luật `internals-pure.ts`).
 */

/** |biến động| dưới 0,5σ của chính khung thời gian đó → "đi ngang". */
export const FLAT_SIGMA = 0.5;
/** |mã − chuẩn| dưới 0,5σ → coi là đi CÙNG chuẩn đó. */
export const REL_SIGMA = 0.5;
/** Ba khung: phiên gần nhất, một tuần, một tháng giao dịch. */
export const WINDOWS = [1, 5, 20] as const;
/** Số phiên giao dịch mỗi năm, để quy HV20 (năm) về σ của n phiên. */
const SESSIONS_PER_YEAR = 252;

export type CloseBar = { datetime: number; close: number };
export type SeriesIn = { symbol: string; spot: number | null; bars: CloseBar[] };

export type MoveLabel = 'up' | 'down' | 'flat';
export type Rel = 'outperform' | 'underperform' | 'inline';
/** Ai "kéo" cú di chuyển: thị trường chung, ngành, hay chính công ty. */
export type Driver = 'market' | 'sector' | 'stock';

export type MoveWindowRead = {
  sessions: number;
  /** % thay đổi của mã / SPY / ETF ngành trong khung này. */
  stock: number | null;
  market: number | null;
  sector: number | null;
  /** 1σ kỳ vọng của mã trong khung này, theo HV20, đơn vị %. */
  sigma: number | null;
  label: MoveLabel | null;
  vsMarket: number | null;
  relMarket: Rel | null;
  vsSector: number | null;
  relSector: Rel | null;
  /** Chỉ có khi mã THẬT SỰ di chuyển (không phải "đi ngang"). */
  driver: Driver | null;
};

export type MoveRead = {
  /** Ngày New York của phiên đang so (từ giờ báo giá SPY). */
  sessionDate: string;
  market: string;
  sectorEtf: string | null;
  sectorName: string | null;
  /** HV20 của mã (năm, dạng thập phân) — thước đo "đi ngang". */
  hv20: number | null;
  windows: MoveWindowRead[];
  /** Nguồn hỏng, nói ra chứ không để trống (SPY / ETF ngành). */
  errors: { source: string; error: string }[];
};

/** Ngày New York (YYYY-MM-DD) của một mốc thời gian mili-giây. */
export function nyDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * % thay đổi từ giá đóng cửa của phiên cách đây `n` phiên tới giá hiện tại.
 *
 * Chỉ nến của các phiên ĐÃ ĐÓNG TRƯỚC `sessionDate` được dùng: nến ngày của
 * chính hôm nay (Schwab có thể trả nến dở dang) mang giá gần bằng giá hiện
 * tại, và đếm nó là một phiên thì mọi khung lệch đi một phiên. n = 1 vì vậy
 * là giá hiện tại so với giá đóng cửa phiên trước — đúng nghĩa "hôm nay".
 */
export function changeOver(s: SeriesIn | null, n: number, sessionDate: string): number | null {
  if (!s || !fin(s.spot) || s.spot <= 0) return null;
  const done = s.bars
    .filter((b) => b && fin(b.close) && b.close > 0 && fin(b.datetime) && nyDate(b.datetime) < sessionDate)
    .sort((a, b) => a.datetime - b.datetime);
  const idx = done.length - n;
  if (idx < 0) return null;
  return (s.spot / done[idx].close - 1) * 100;
}

function rel(diff: number | null, sigma: number | null): Rel | null {
  if (diff === null || sigma === null) return null;
  if (Math.abs(diff) < REL_SIGMA * sigma) return 'inline';
  return diff > 0 ? 'outperform' : 'underperform';
}

export function readMoves(input: {
  stock: SeriesIn;
  market: SeriesIn | null;
  sector: SeriesIn | null;
  marketSymbol?: string;
  sectorEtf: string | null;
  sectorName: string | null;
  hv20: number | null;
  sessionDate: string;
  errors?: { source: string; error: string }[];
}): MoveRead {
  const hv = fin(input.hv20) && input.hv20 > 0 ? input.hv20 : null;
  const windows = WINDOWS.map((n): MoveWindowRead => {
    const stock = changeOver(input.stock, n, input.sessionDate);
    const market = changeOver(input.market, n, input.sessionDate);
    const sector = changeOver(input.sector, n, input.sessionDate);
    const sigma = hv === null ? null : hv * 100 * Math.sqrt(n / SESSIONS_PER_YEAR);
    const label: MoveLabel | null =
      stock === null || sigma === null
        ? null
        : Math.abs(stock) < FLAT_SIGMA * sigma
          ? 'flat'
          : stock > 0
            ? 'up'
            : 'down';
    const vsMarket = stock !== null && market !== null ? stock - market : null;
    const vsSector = stock !== null && sector !== null ? stock - sector : null;
    const relMarket = rel(vsMarket, sigma);
    const relSector = rel(vsSector, sigma);
    /* Đi ngang thì không có gì để quy cho ai. Không có SPY thì không nói
       được "theo thị trường" hay "riêng mã" — null, không đoán. */
    const driver: Driver | null =
      label === null || label === 'flat' || relMarket === null
        ? null
        : relMarket === 'inline'
          ? 'market'
          : relSector === 'inline'
            ? 'sector'
            : 'stock';
    return { sessions: n, stock, market, sector, sigma, label, vsMarket, relMarket, vsSector, relSector, driver };
  });
  return {
    sessionDate: input.sessionDate,
    market: input.marketSymbol ?? 'SPY',
    sectorEtf: input.sectorEtf,
    sectorName: input.sectorName,
    hv20: hv,
    windows,
    errors: input.errors ?? [],
  };
}

/* ---------------- prompt ---------------- */

const p = (v: number | null, d = 1) => (v === null ? 'n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);

const LABEL: Record<MoveLabel, string> = { up: 'UP', down: 'DOWN', flat: 'FLAT (sideways)' };
const DRIVER: Record<Driver, string> = {
  market: 'moving WITH the market - little company-specific explanation is needed',
  sector: 'moving with its SECTOR while diverging from the market - look for a sector story',
  stock: 'moving ON ITS OWN, apart from market and sector - a company-specific cause is likely',
};

/** Phần "diễn biến giá so với thị trường" trong bảng Claude đọc. */
export function moveFacts(m: MoveRead | null | undefined): string[] {
  if (!m || !Array.isArray(m.windows)) {
    return [
      'PRICE MOVE VS MARKET: NOT AVAILABLE. Do not say whether the stock is moving with the market or on its own.',
    ];
  }
  const out = [
    `PRICE MOVE VS MARKET (computed in code; session ${m.sessionDate}; market = ${m.market}` +
      `${m.sectorEtf ? `, sector = ${m.sectorEtf}${m.sectorName ? ` (${m.sectorName})` : ''}` : ', sector ETF unknown for this symbol'}).`,
    `Labels are relative to the stock's own volatility: FLAT when the move is under ${FLAT_SIGMA} sigma of HV20 ` +
      `for that window; "with" a benchmark when the gap is under ${REL_SIGMA} sigma. Use these labels; do not relabel.`,
  ];
  for (const w of m.windows) {
    const name = w.sessions === 1 ? 'last session' : `${w.sessions} sessions`;
    out.push(
      `- ${name}: stock ${p(w.stock)}, ${m.market} ${p(w.market)}` +
        `${m.sectorEtf ? `, ${m.sectorEtf} ${p(w.sector)}` : ''}` +
        ` | 1 sigma ${w.sigma === null ? 'n/a' : `${w.sigma.toFixed(1)}%`}` +
        ` | label ${w.label ? LABEL[w.label] : 'n/a'}` +
        ` | vs market ${p(w.vsMarket)} (${w.relMarket ?? 'n/a'})` +
        `${m.sectorEtf ? ` | vs sector ${p(w.vsSector)} (${w.relSector ?? 'n/a'})` : ''}` +
        `${w.driver ? ` | ${DRIVER[w.driver]}` : ''}`
    );
  }
  if (m.hv20 === null) {
    out.push('- HV20 is missing, so no window can be labelled; describe the raw percentages only.');
  }
  for (const e of m.errors ?? []) {
    out.push(`- SOURCE FAILED: ${e.source} (${String(e.error).slice(0, 160)}) - comparisons against it are n/a.`);
  }
  return out;
}
