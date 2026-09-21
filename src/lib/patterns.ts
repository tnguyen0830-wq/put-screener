import { pivotLows, supportZones, type Pivot, type SupportZone } from './support';

/**
 * Dò mẫu hình nến và mẫu hình giá trên nến NGÀY — tab Patterns.
 *
 * Module này THUẦN (không mạng, không đĩa) để chạy được bằng một script Node
 * độc lập, cùng luật `support.ts`. Và cùng một mối nguy: một mẫu hình bịa ra
 * trông y hệt một mẫu hình thật, và cả hai đều vẽ được lên biểu đồ. Nên mọi
 * ngưỡng ở đây là HẰNG SỐ có tên, mọi mẫu mang cờ `confirmed`, và những gì
 * không đo được (khối lượng thiếu) ra `null` chứ không ra 0.
 *
 * Ba quyết định định hình cả file:
 *
 * 1. "ĐANG HÌNH THÀNH" và "ĐÃ XÁC NHẬN" là hai trạng thái, không gộp. Một cây
 *    búa CHƯA có nến sau xác nhận chỉ là một cây nến có râu dài; hai đáy CHƯA
 *    vượt đường cổ chỉ là hai cái đáy. Cờ `confirmed` nói rõ, và màn hình in
 *    khác nhau. Gộp lại là biến "có thể" thành "đã".
 *
 * 2. CHỈ BÁO MẪU GẦN ĐÂY. Một cái vai-đầu-vai hoàn thành sáu tháng trước là
 *    lịch sử, không phải tín hiệu. Mẫu nến phải kết thúc trong `RECENT_CANDLE`
 *    nến cuối; mẫu giá phải xác nhận trong `RECENT_CHART` nến cuối hoặc còn
 *    đang hình thành với đỉnh/đáy cuối trong `RECENT_FORMING` nến cuối.
 *
 * 3. ĐỈNH/ĐÁY XOAY dùng lại `pivotLows` của tab Long-term (kể cả phép so sánh
 *    bất đối xứng đã sửa lỗi đoạn phẳng ở #137) và `pivotHighs` là ảnh gương
 *    của nó — KHÔNG viết một phép tìm đáy thứ hai. Vùng kháng cự = gom các
 *    đỉnh xoay bằng đúng `supportZones` (nó chỉ gom theo giá, không quan tâm
 *    đó là đáy hay đỉnh), nên hai tab nói cùng một vùng.
 */

export type PCandle = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export const PATTERN_IDS = [
  'doji',
  'hammer',
  'hanging-man',
  'inverted-hammer',
  'shooting-star',
  'bull-engulfing',
  'bear-engulfing',
  'morning-star',
  'evening-star',
  'double-bottom',
  'double-top',
  'head-shoulders',
  'inv-head-shoulders',
  'asc-triangle',
  'desc-triangle',
  'sym-triangle',
  'bull-flag',
  'bear-flag',
  'breakout',
  'breakdown',
] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export type Side = 'bull' | 'bear' | 'neutral';
export type Kind = 'candle' | 'chart' | 'level';

export type Point = { i: number; price: number };

export type Detection = {
  id: PatternId;
  kind: Kind;
  side: Side;
  /** Chỉ số nến đầu/cuối của mẫu (bao gồm nến xác nhận nếu có). */
  from: number;
  to: number;
  /** Đã xác nhận (nến sau đi đúng hướng / đã phá đường cổ) hay còn đang hình thành. */
  confirmed: boolean;
  /** Mức giá đáng vẽ: đường cổ, mục tiêu, vùng bị phá… */
  levels: { key: string; price: number }[];
  /** Điểm đánh dấu trên biểu đồ (vai, đầu, hai đáy…). */
  points?: Point[];
  /** Đường thẳng trên biểu đồ (cạnh tam giác, đường cổ dốc). */
  lines?: { key: string; a: Point; b: Point }[];
  /** Số đo phụ. `volumeRatio` null = không có khối lượng, KHÔNG phải 0. */
  stats?: Record<string, number | null>;
};

/* ---- ngưỡng, tất cả có tên ---- */
export const K = 5;                 // nến mỗi bên để xác nhận đỉnh/đáy xoay (= support.ts)
export const RECENT_CANDLE = 3;     // mẫu nến phải kết thúc trong 3 nến cuối
export const RECENT_CHART = 15;     // mẫu giá đã xác nhận: nến xác nhận trong 15 nến cuối
export const RECENT_FORMING = 25;   // mẫu giá đang hình thành: đỉnh/đáy cuối trong 25 nến cuối
const DOJI_BODY = 0.1;              // thân ≤ 10% biên độ
const WICK_MULT = 2;                // râu dài ≥ 2× thân
const TREND_LOOKBACK = 6;           // "trước đó đang giảm" = đóng hôm trước < đóng 6 nến trước
const STAR_SMALL = 0.3;             // nến giữa sao mai ≤ 30% thân nến đầu
const DOUBLE_TOL_PCT = 3;           // hai đáy/đỉnh lệch ≤ 3%
const DOUBLE_MIN_GAP = 10;          // cách nhau ≥ 10 nến
const DOUBLE_MAX_GAP = 80;
const HS_HEAD_MIN_PCT = 3;          // đầu cao hơn vai ≥ 3%
const HS_SHOULDER_TOL_PCT = 8;      // hai vai lệch ≤ 8%
const TRI_WINDOW = 70;              // tam giác xét trong 70 nến cuối
const TRI_FLAT = 0.08;              // %/nến: |dốc| ≤ 0.08 là ngang
const TRI_SLOPE = 0.15;             // %/nến: dốc ≥ 0.15 là lên/xuống rõ
const TRI_SHRINK = 0.7;             // biên độ cuối ≤ 70% biên độ đầu
const TRI_BREAK_PCT = 0.5;          // phá cạnh tam giác phải vượt ≥ 0.5%
const FLAG_POLE_PCT = 8;            // cột cờ ≥ 8% trong ≤ 15 nến
const FLAG_POLE_BARS = 15;
const FLAG_MIN = 4;                 // cờ 4–20 nến
const FLAG_MAX = 20;
const FLAG_RANGE = 0.5;             // biên độ cờ ≤ 50% cột
const FLAG_RETRACE = 0.5;           // cờ không lùi quá 50% cột
const VOL_AVG = 20;
const MIN_BARS = 60;

const body = (c: PCandle) => Math.abs(c.close - c.open);
const range = (c: PCandle) => c.high - c.low;
const upperWick = (c: PCandle) => c.high - Math.max(c.open, c.close);
const lowerWick = (c: PCandle) => Math.min(c.open, c.close) - c.low;
const green = (c: PCandle) => c.close > c.open;
const red = (c: PCandle) => c.close < c.open;

/** Trung bình thân nến 20 nến trước i (không tính i). Để nói "nến dài". */
function avgBody(cs: PCandle[], i: number, n = 20): number | null {
  const s = cs.slice(Math.max(0, i - n), i);
  if (s.length < 5) return null;
  return s.reduce((a, c) => a + body(c), 0) / s.length;
}

/** Xu hướng ngắn trước nến i: giảm (-1), tăng (+1), không rõ (0). */
function priorTrend(cs: PCandle[], i: number): -1 | 0 | 1 {
  if (i - TREND_LOOKBACK < 0) return 0;
  const a = cs[i - 1].close;
  const b = cs[i - TREND_LOOKBACK].close;
  if (a < b * 0.99) return -1;
  if (a > b * 1.01) return 1;
  return 0;
}

/**
 * Đỉnh xoay — ảnh gương của `pivotLows`, kể cả phép so sánh BẤT ĐỐI XỨNG
 * (trái đòi thấp hơn hẳn, phải chỉ đòi không cao hơn) để một đoạn phẳng chỉ
 * sinh đúng một đỉnh. Trả về `Pivot` với trường `low` mang GIÁ ĐỈNH, để đưa
 * thẳng vào `supportZones` (gom theo giá) ra vùng kháng cự — không viết phép
 * gom thứ hai.
 */
export function pivotHighs(cs: PCandle[], k = K): Pivot[] {
  const out: Pivot[] = [];
  for (let i = k; i < cs.length - k; i++) {
    const h = cs[i].high;
    let ok = true;
    for (let j = i - k; j < i; j++) if (cs[j].high >= h) { ok = false; break; }
    if (ok) for (let j = i + 1; j <= i + k; j++) if (cs[j].high > h) { ok = false; break; }
    if (ok) out.push({ t: cs[i].t, low: h });
  }
  return out;
}

/** Chỉ số nến của một pivot (theo `t`). */
function idxOf(cs: PCandle[], t: number): number {
  return cs.findIndex((c) => c.t === t);
}

/** Tỉ lệ khối lượng nến i so với trung bình 20 nến trước. null nếu thiếu. */
export function volumeRatio(cs: PCandle[], i: number): number | null {
  const v = cs[i]?.volume;
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const prev = cs.slice(Math.max(0, i - VOL_AVG), i).map((c) => c.volume);
  if (prev.length < 5 || prev.some((x) => x === null || !Number.isFinite(x as number))) return null;
  const avg = (prev as number[]).reduce((a, b) => a + b, 0) / prev.length;
  return avg > 0 ? v / avg : null;
}

/* ================= mẫu nến ================= */

function candlePatternsAt(cs: PCandle[], i: number): Detection[] {
  const out: Detection[] = [];
  const c = cs[i];
  const r = range(c);
  if (r <= 0) return out;
  const b = body(c);
  const uw = upperWick(c);
  const lw = lowerWick(c);
  const trend = priorTrend(cs, i);
  const next = cs[i + 1];
  const last = i === cs.length - 1;

  /* Doji: thân gần như không có. Trung tính — nó là một câu hỏi, không phải
     câu trả lời; nến sau mới quyết định. */
  const isDoji = b <= DOJI_BODY * r;
  if (isDoji) {
    out.push({ id: 'doji', kind: 'candle', side: 'neutral', from: i, to: i, confirmed: false, levels: [] });
  }

  /* Búa / người treo cổ: râu dưới ≥ 2× thân, râu trên nhỏ, thân ở phần trên.
     CÙNG hình, khác bối cảnh: sau giảm là búa (tăng), sau tăng là người treo
     cổ (giảm). Không có xu hướng trước thì không gọi tên. Một doji râu dài
     (dragonfly) KHÔNG đồng thời là búa — một nến, một tên. */
  const hammerShape = !isDoji && lw >= WICK_MULT * b && uw <= b && (Math.min(c.open, c.close) - c.low) / r >= 0.6;
  if (hammerShape && trend === -1) {
    const confirmed = !!next && next.close > c.close;
    out.push({ id: 'hammer', kind: 'candle', side: 'bull', from: i, to: confirmed ? i + 1 : i, confirmed, levels: [{ key: 'low', price: c.low }] });
  }
  if (hammerShape && trend === 1) {
    const confirmed = !!next && next.close < c.close;
    out.push({ id: 'hanging-man', kind: 'candle', side: 'bear', from: i, to: confirmed ? i + 1 : i, confirmed, levels: [{ key: 'high', price: c.high }] });
  }

  /* Búa ngược / sao băng: râu trên ≥ 2× thân, râu dưới nhỏ, thân ở phần dưới. */
  const starShape = !isDoji && uw >= WICK_MULT * b && lw <= b && (c.high - Math.max(c.open, c.close)) / r >= 0.6;
  if (starShape && trend === -1) {
    const confirmed = !!next && next.close > c.close;
    out.push({ id: 'inverted-hammer', kind: 'candle', side: 'bull', from: i, to: confirmed ? i + 1 : i, confirmed, levels: [{ key: 'low', price: c.low }] });
  }
  if (starShape && trend === 1) {
    const confirmed = !!next && next.close < c.close;
    out.push({ id: 'shooting-star', kind: 'candle', side: 'bear', from: i, to: confirmed ? i + 1 : i, confirmed, levels: [{ key: 'high', price: c.high }] });
  }

  /* Nhấn chìm: thân nến i bao trọn thân nến i-1, ngược màu, sau một xu hướng. */
  const p = cs[i - 1];
  if (p) {
    const pb = body(p);
    if (red(p) && green(c) && c.open <= p.close && c.close >= p.open && b > pb && trend === -1) {
      const confirmed = !!next && next.close > c.close;
      out.push({ id: 'bull-engulfing', kind: 'candle', side: 'bull', from: i - 1, to: confirmed ? i + 1 : i, confirmed, levels: [{ key: 'low', price: Math.min(c.low, p.low) }] });
    }
    if (green(p) && red(c) && c.open >= p.close && c.close <= p.open && b > pb && trend === 1) {
      const confirmed = !!next && next.close < c.close;
      out.push({ id: 'bear-engulfing', kind: 'candle', side: 'bear', from: i - 1, to: confirmed ? i + 1 : i, confirmed, levels: [{ key: 'high', price: Math.max(c.high, p.high) }] });
    }
  }

  /* Sao mai / sao hôm: nến 1 dài theo xu hướng, nến 2 thân nhỏ, nến 3 dài
     ngược lại đóng sâu vào thân nến 1 (qua điểm giữa). Ba nến là mẫu hoàn
     chỉnh nên `confirmed` = true ngay khi nến 3 đóng. */
  const a2 = cs[i - 2];
  const a1 = cs[i - 1];
  if (a2 && a1) {
    const ab = avgBody(cs, i - 2);
    const longFirst = ab !== null && body(a2) >= ab;
    const smallMid = body(a1) <= STAR_SMALL * body(a2);
    const mid2 = (a2.open + a2.close) / 2;
    if (longFirst && smallMid && red(a2) && green(c) && c.close > mid2 && priorTrend(cs, i - 2) === -1) {
      out.push({ id: 'morning-star', kind: 'candle', side: 'bull', from: i - 2, to: i, confirmed: true, levels: [{ key: 'low', price: Math.min(a2.low, a1.low, c.low) }] });
    }
    if (longFirst && smallMid && green(a2) && red(c) && c.close < mid2 && priorTrend(cs, i - 2) === 1) {
      out.push({ id: 'evening-star', kind: 'candle', side: 'bear', from: i - 2, to: i, confirmed: true, levels: [{ key: 'high', price: Math.max(a2.high, a1.high, c.high) }] });
    }
  }

  void last;
  return out;
}

/* ================= mẫu giá ================= */

function firstCloseCrossing(cs: PCandle[], fromIdx: number, level: (i: number) => number, dir: 'above' | 'below'): number {
  for (let i = fromIdx; i < cs.length; i++) {
    const L = level(i);
    if (dir === 'above' ? cs[i].close > L : cs[i].close < L) return i;
  }
  return -1;
}

function doubles(cs: PCandle[], lows: Pivot[], highs: Pivot[]): Detection[] {
  const out: Detection[] = [];
  const n = cs.length;
  /* CHỈ xét HAI đỉnh/đáy xoay GẦN NHẤT. "Hai đáy" là hai đáy mới nhất; có
     một đáy thứ ba sau đó thì mẫu đã thành thứ khác (vùng đi ngang, tam
     giác), và cặp cũ hơn là lịch sử. Quét mọi cặp sẽ in ba cái "hai đỉnh"
     chồng nhau cho một cạnh trên phẳng của tam giác. */
  const run = (piv: Pivot[], kind: 'double-bottom' | 'double-top') => {
    for (let a = piv.length - 2; a >= 0 && a === piv.length - 2; a--) {
      const p1 = piv[a];
      const p2 = piv[a + 1];
      const i1 = idxOf(cs, p1.t);
      const i2 = idxOf(cs, p2.t);
      const gap = i2 - i1;
      if (gap < DOUBLE_MIN_GAP || gap > DOUBLE_MAX_GAP) continue;
      if (Math.abs(p1.low - p2.low) / p1.low * 100 > DOUBLE_TOL_PCT) continue;
      const between = cs.slice(i1 + 1, i2);
      if (!between.length) continue;
      /* Đường cổ: đỉnh giữa hai đáy (hoặc đáy giữa hai đỉnh). Phải cách hai
         đáy đủ xa để đây là hai đáy thật chứ không phải một đoạn đi ngang. */
      const neck = kind === 'double-bottom' ? Math.max(...between.map((c) => c.high)) : Math.min(...between.map((c) => c.low));
      const base = (p1.low + p2.low) / 2;
      const depth = Math.abs(neck - base) / base * 100;
      if (depth < DOUBLE_TOL_PCT) continue;
      const conf = firstCloseCrossing(cs, i2 + 1, () => neck, kind === 'double-bottom' ? 'above' : 'below');
      const confirmed = conf >= 0;
      /* Gần đây: đã xác nhận trong RECENT_CHART nến cuối, hoặc đang hình
         thành với đáy thứ hai trong RECENT_FORMING nến cuối. Xác nhận từ lâu
         thì đã là lịch sử. */
      const recent = confirmed ? conf >= n - RECENT_CHART : i2 >= n - RECENT_FORMING;
      if (!recent) continue;
      const target = kind === 'double-bottom' ? neck + (neck - base) : neck - (base - neck);
      out.push({
        id: kind, kind: 'chart', side: kind === 'double-bottom' ? 'bull' : 'bear',
        from: i1, to: confirmed ? conf : n - 1, confirmed,
        levels: [{ key: 'neckline', price: neck }, { key: 'target', price: target }, { key: 'base', price: base }],
        points: [{ i: i1, price: p1.low }, { i: i2, price: p2.low }],
        /* Khối lượng chỉ có nghĩa ở NẾN PHÁ VỠ: mẫu đang hình thành không mang
           khoá này (undefined ≠ null: null là "đo mà không có số"). */
        stats: confirmed ? { volumeRatio: volumeRatio(cs, conf) } : undefined,
      });
    }
  };
  run(lows, 'double-bottom');
  run(highs, 'double-top');
  return out;
}

function headShoulders(cs: PCandle[], lows: Pivot[], highs: Pivot[]): Detection[] {
  const out: Detection[] = [];
  const n = cs.length;
  const run = (piv: Pivot[], opp: Pivot[], kind: 'head-shoulders' | 'inv-head-shoulders') => {
    const top = kind === 'head-shoulders';
    for (let a = 0; a + 2 < piv.length; a++) {
      const s1 = piv[a], h = piv[a + 1], s2 = piv[a + 2];
      const iS1 = idxOf(cs, s1.t), iH = idxOf(cs, h.t), iS2 = idxOf(cs, s2.t);
      /* Đầu phải vượt cả hai vai ≥ HS_HEAD_MIN_PCT; hai vai xấp xỉ nhau. */
      const headOk = top
        ? h.low > s1.low * (1 + HS_HEAD_MIN_PCT / 100) && h.low > s2.low * (1 + HS_HEAD_MIN_PCT / 100)
        : h.low < s1.low * (1 - HS_HEAD_MIN_PCT / 100) && h.low < s2.low * (1 - HS_HEAD_MIN_PCT / 100);
      if (!headOk) continue;
      if (Math.abs(s1.low - s2.low) / s1.low * 100 > HS_SHOULDER_TOL_PCT) continue;
      if (iS2 - iS1 > 2 * DOUBLE_MAX_GAP) continue;
      /* Hai điểm đường cổ: đáy (hoặc đỉnh) xoay nằm giữa vai-đầu và đầu-vai. */
      const t1 = opp.map((p) => ({ p, i: idxOf(cs, p.t) })).filter((x) => x.i > iS1 && x.i < iH);
      const t2 = opp.map((p) => ({ p, i: idxOf(cs, p.t) })).filter((x) => x.i > iH && x.i < iS2);
      if (!t1.length || !t2.length) continue;
      const pick = (xs: { p: Pivot; i: number }[]) =>
        xs.reduce((m, x) => (top ? x.p.low < m.p.low : x.p.low > m.p.low) ? x : m);
      const n1 = pick(t1), n2 = pick(t2);
      const slope = (n2.p.low - n1.p.low) / (n2.i - n1.i);
      const neckAt = (i: number) => n1.p.low + slope * (i - n1.i);
      const conf = firstCloseCrossing(cs, iS2 + 1, neckAt, top ? 'below' : 'above');
      const confirmed = conf >= 0;
      const recent = confirmed ? conf >= n - RECENT_CHART : iS2 >= n - RECENT_FORMING;
      if (!recent) continue;
      const neckNow = neckAt(n - 1);
      const height = Math.abs(h.low - neckAt(iH));
      const target = top ? neckNow - height : neckNow + height;
      out.push({
        id: kind, kind: 'chart', side: top ? 'bear' : 'bull',
        from: iS1, to: confirmed ? conf : n - 1, confirmed,
        levels: [{ key: 'neckline', price: neckNow }, { key: 'target', price: target }],
        points: [{ i: iS1, price: s1.low }, { i: iH, price: h.low }, { i: iS2, price: s2.low }],
        lines: [{ key: 'neckline', a: { i: n1.i, price: n1.p.low }, b: { i: n - 1, price: neckNow } }],
        stats: confirmed ? { volumeRatio: volumeRatio(cs, conf) } : undefined,
      });
    }
  };
  run(highs, lows, 'head-shoulders');
  run(lows, highs, 'inv-head-shoulders');
  return out;
}

/** Hồi quy tuyến tính đơn giản: slope (giá/nến) và giá tại i. */
function fit(pts: Point[]): { slope: number; at: (i: number) => number } {
  const m = pts.length;
  const mx = pts.reduce((a, p) => a + p.i, 0) / m;
  const my = pts.reduce((a, p) => a + p.price, 0) / m;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.i - mx) * (p.price - my); den += (p.i - mx) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  return { slope, at: (i) => my + slope * (i - mx) };
}

function triangles(cs: PCandle[], lows: Pivot[], highs: Pivot[]): Detection[] {
  const n = cs.length;
  const start = Math.max(0, n - TRI_WINDOW);
  const H = highs.map((p) => ({ i: idxOf(cs, p.t), price: p.low })).filter((p) => p.i >= start);
  const L = lows.map((p) => ({ i: idxOf(cs, p.t), price: p.low })).filter((p) => p.i >= start);
  if (H.length < 3 || L.length < 3) return [];
  const lastPivot = Math.max(H[H.length - 1].i, L[L.length - 1].i);
  const firstPivot = Math.min(H[0].i, L[0].i);
  if (lastPivot < n - RECENT_FORMING || n - 1 - firstPivot < 20) return [];
  const fh = fit(H), fl = fit(L);
  const price = cs[n - 1].close;
  const sh = (fh.slope / price) * 100, sl = (fl.slope / price) * 100;
  const w0 = fh.at(firstPivot) - fl.at(firstPivot);
  const w1 = fh.at(n - 1) - fl.at(n - 1);
  /* Hai cạnh đã CẮT nhau (qua đỉnh tam giác) thì không còn tam giác để phá. */
  if (w0 <= 0 || w1 <= 0 || w1 > TRI_SHRINK * w0) return [];
  let id: PatternId | null = null;
  if (Math.abs(sh) <= TRI_FLAT && sl >= TRI_SLOPE) id = 'asc-triangle';
  else if (Math.abs(sl) <= TRI_FLAT && sh <= -TRI_SLOPE) id = 'desc-triangle';
  else if (sh <= -TRI_FLAT && sl >= TRI_FLAT) id = 'sym-triangle';
  if (!id) return [];
  const upper = fh.at(n - 1), lower = fl.at(n - 1);
  /* Phá cạnh cần một biên TRI_BREAK_PCT: giá đóng sát cạnh vài phần mười %
     là nhiễu quanh đường xu hướng, không phải phá vỡ — không có biên thì
     gần đỉnh tam giác nến nào cũng "phá". */
  const brokeUp = price > upper * (1 + TRI_BREAK_PCT / 100);
  const brokeDown = price < lower * (1 - TRI_BREAK_PCT / 100);
  const confirmed = brokeUp || brokeDown;
  const side: Side = brokeUp ? 'bull' : brokeDown ? 'bear' : id === 'asc-triangle' ? 'bull' : id === 'desc-triangle' ? 'bear' : 'neutral';
  const height = w0;
  return [{
    id, kind: 'chart', side, from: firstPivot, to: n - 1, confirmed,
    levels: [{ key: 'upper', price: upper }, { key: 'lower', price: lower }, ...(confirmed ? [{ key: 'target', price: brokeUp ? upper + height : lower - height }] : [])],
    lines: [
      { key: 'upper', a: { i: firstPivot, price: fh.at(firstPivot) }, b: { i: n - 1, price: upper } },
      { key: 'lower', a: { i: firstPivot, price: fl.at(firstPivot) }, b: { i: n - 1, price: lower } },
    ],
    points: [...H, ...L],
    stats: confirmed ? { volumeRatio: volumeRatio(cs, n - 1) } : undefined,
  }];
}

function flags(cs: PCandle[]): Detection[] {
  const n = cs.length;
  const out: Detection[] = [];
  for (const dir of ['bull', 'bear'] as const) {
    /* Tìm cột cờ: cú chạy ≥ FLAG_POLE_PCT trong ≤ FLAG_POLE_BARS nến, kết thúc
       trong 30 nến cuối. Lấy cột lớn nhất. */
    let best: { start: number; end: number; move: number } | null = null;
    for (let end = Math.max(1, n - 30); end < n - FLAG_MIN; end++) {
      for (let len = 2; len <= FLAG_POLE_BARS && end - len >= 0; len++) {
        const s = cs[end - len].close, e = cs[end].close;
        const move = dir === 'bull' ? (e - s) / s * 100 : (s - e) / s * 100;
        if (move >= FLAG_POLE_PCT && (!best || move > best.move)) best = { start: end - len, end, move };
      }
    }
    if (!best) continue;
    const poleStart = cs[best.start].close, poleEnd = cs[best.end].close;
    const height = Math.abs(poleEnd - poleStart);
    const flag = cs.slice(best.end + 1, n);
    if (flag.length < FLAG_MIN || flag.length > FLAG_MAX + 1) continue;
    /* Cờ: biên độ hẹp so với cột và không lùi quá nửa cột. Nến cuối được
       phép là nến phá vỡ nên xét biên độ trên phần TRƯỚC nến cuối. */
    const bodyPart = flag.slice(0, -1);
    const fh = Math.max(...bodyPart.map((c) => c.high)), fl = Math.min(...bodyPart.map((c) => c.low));
    if (fh - fl > FLAG_RANGE * height) continue;
    const retrace = dir === 'bull' ? (poleEnd - fl) / height : (fh - poleEnd) / height;
    if (retrace > FLAG_RETRACE) continue;
    const last = cs[n - 1];
    const confirmed = dir === 'bull' ? last.close > fh : last.close < fl;
    out.push({
      id: dir === 'bull' ? 'bull-flag' : 'bear-flag', kind: 'chart', side: dir, from: best.start, to: n - 1, confirmed,
      levels: [
        { key: dir === 'bull' ? 'upper' : 'lower', price: dir === 'bull' ? fh : fl },
        { key: 'target', price: dir === 'bull' ? fh + height : fl - height },
      ],
      points: [{ i: best.start, price: poleStart }, { i: best.end, price: poleEnd }],
      stats: confirmed ? { polePct: best.move, volumeRatio: volumeRatio(cs, n - 1) } : { polePct: best.move },
    });
  }
  return out;
}

/** Phá vỡ kháng cự / thủng hỗ trợ ở nến CUỐI, so với vùng ≥ 2 lần chạm. */
function breaks(cs: PCandle[], support: SupportZone[], resistance: SupportZone[]): Detection[] {
  const n = cs.length;
  if (n < 2) return [];
  const last = cs[n - 1], prev = cs[n - 2];
  const out: Detection[] = [];
  const vr = volumeRatio(cs, n - 1);
  for (const z of resistance) {
    if (last.close > z.high && prev.close <= z.high) {
      out.push({ id: 'breakout', kind: 'level', side: 'bull', from: n - 2, to: n - 1, confirmed: true,
        levels: [{ key: 'zone', price: z.price }, { key: 'zoneHigh', price: z.high }], stats: { volumeRatio: vr, touches: z.touches } });
      break;
    }
  }
  for (const z of support) {
    if (last.close < z.low && prev.close >= z.low) {
      out.push({ id: 'breakdown', kind: 'level', side: 'bear', from: n - 2, to: n - 1, confirmed: true,
        levels: [{ key: 'zone', price: z.price }, { key: 'zoneLow', price: z.low }], stats: { volumeRatio: vr, touches: z.touches } });
      break;
    }
  }
  return out;
}

export type PatternRead = {
  bars: number;
  detections: Detection[];
  support: SupportZone[];
  resistance: SupportZone[];
  /** Vùng gần nhất dưới/trên giá cuối và khoảng cách %. null = không có. */
  nearestSupport: { price: number; distancePct: number; touches: number } | null;
  nearestResistance: { price: number; distancePct: number; touches: number } | null;
  /** Thiếu khối lượng ở nến cuối → mọi `volumeRatio` là null, nói ra một lần. */
  volumeKnown: boolean;
};

/**
 * Toàn bộ phép đọc cho một mã. Ít hơn MIN_BARS nến thì trả rỗng — không dò
 * mẫu trên một chuỗi quá ngắn để có đỉnh/đáy xoay.
 */
export function readPatterns(cs: PCandle[]): PatternRead {
  const n = cs.length;
  const empty: PatternRead = { bars: n, detections: [], support: [], resistance: [], nearestSupport: null, nearestResistance: null, volumeKnown: false };
  if (n < MIN_BARS) return empty;
  const lows = pivotLows(cs, K);
  const highs = pivotHighs(cs, K);
  const support = supportZones(lows);
  const resistance = supportZones(highs);
  const price = cs[n - 1].close;

  const detections: Detection[] = [];
  for (let i = Math.max(2, n - RECENT_CANDLE); i < n; i++) detections.push(...candlePatternsAt(cs, i));
  const tri = triangles(cs, lows, highs);
  /* Cạnh phẳng của một tam giác CHÍNH LÀ vài lần chạm cùng một mức, nên máy
     dò hai đỉnh/hai đáy sẽ gọi tên nó — cùng một hình, hai nhãn chồng nhau.
     Tam giác nói được nhiều hơn (cả hai cạnh), nên cặp đôi nằm trong khoảng
     của tam giác bị bỏ. */
  const inTri = (d: Detection) => tri.some((t) => d.from >= t.from && d.to <= t.to);
  detections.push(...doubles(cs, lows, highs).filter((d) => !inTri(d)));
  detections.push(...headShoulders(cs, lows, highs));
  detections.push(...tri);
  detections.push(...flags(cs));
  detections.push(...breaks(cs, support, resistance));

  const below = support.filter((z) => z.price <= price);
  const above = resistance.filter((z) => z.price >= price).sort((a, b) => a.price - b.price);
  const ns = below.length ? below[0] : null;
  const nr = above.length ? above[0] : null;
  return {
    bars: n,
    detections,
    support,
    resistance,
    nearestSupport: ns ? { price: ns.price, distancePct: (price - ns.price) / ns.price * 100, touches: ns.touches } : null,
    nearestResistance: nr ? { price: nr.price, distancePct: (nr.price - price) / price * 100, touches: nr.touches } : null,
    volumeKnown: volumeRatio(cs, n - 1) !== null,
  };
}

/** Xếp hạng để bảng quét đưa mã đáng nhìn lên trước: đã xác nhận > đang hình thành, mẫu giá > mẫu nến. */
export function detectionWeight(d: Detection): number {
  return (d.confirmed ? 2 : 1) * (d.kind === 'chart' ? 3 : d.kind === 'level' ? 2 : 1);
}
