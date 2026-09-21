import { historyCandles } from './history';
import { readTrend } from './support';
import { detectionWeight, readPatterns, type Detection } from './patterns';
import type { PatRow } from './pat-store';

/**
 * Đọc mẫu hình cho MỘT mã từ nến ngày Schwab (cache theo ngày, dùng chung
 * với tab Long-term — cùng file `.cache/history-lt`, nên quét Long-term rồi
 * quét Patterns cùng ngày không tốn thêm request nào).
 *
 * Một hàm, hai nơi gọi (route quét cả danh sách và route biểu đồ một mã):
 * hai đường tính là hai con số có thể cãi nhau trên cùng một màn hình.
 */
export const CHART_BARS = 260;

export type SymbolPatterns = {
  row: Omit<PatRow, 'name' | 'sector'>;
  /** Nến để vẽ (CHART_BARS nến cuối), chỉ số `i` của detections đã được dời cho khớp. */
  candles: { t: number; open: number; high: number; low: number; close: number; volume: number | null }[];
  /** Vùng hỗ trợ/kháng cự (mọi vùng, không chỉ vùng gần nhất) để vẽ. */
  support: { price: number; low: number; high: number; touches: number }[];
  resistance: { price: number; low: number; high: number; touches: number }[];
  trend: ReturnType<typeof readTrend>;
  /** SMA50/SMA200 theo từng nến trong `candles` (null khi chưa đủ). */
  sma50: (number | null)[];
  sma200: (number | null)[];
};

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

function smaSeries(closes: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

/** Dời chỉ số nến của một detection sau khi cắt `offset` nến đầu. */
function shift(d: Detection, offset: number): Detection {
  const s = (i: number) => i - offset;
  return {
    ...d,
    from: s(d.from),
    to: s(d.to),
    points: d.points?.map((p) => ({ i: s(p.i), price: p.price })),
    lines: d.lines?.map((l) => ({ key: l.key, a: { i: s(l.a.i), price: l.a.price }, b: { i: s(l.b.i), price: l.b.price } })),
  };
}

export async function symbolPatterns(symbol: string): Promise<SymbolPatterns> {
  const all = await historyCandles(symbol, 3);
  const read = readPatterns(all);
  const n = all.length;
  const offset = Math.max(0, n - CHART_BARS);
  const candles = all.slice(offset);
  const price = n ? all[n - 1].close : 0;
  const trend = readTrend(all, price);
  const closes = all.map((c) => c.close);
  const detections = read.detections
    .map((d) => shift(d, offset))
    .sort((a, b) => detectionWeight(b) - detectionWeight(a));
  return {
    row: {
      symbol,
      price,
      lastBar: n ? iso(all[n - 1].t) : '',
      bars: n,
      detections,
      nearestSupport: read.nearestSupport,
      nearestResistance: read.nearestResistance,
      volumeKnown: read.volumeKnown,
      weight: detections.reduce((a, d) => a + detectionWeight(d), 0),
    },
    candles,
    support: read.support.map((z) => ({ price: z.price, low: z.low, high: z.high, touches: z.touches })),
    resistance: read.resistance.map((z) => ({ price: z.price, low: z.low, high: z.high, touches: z.touches })),
    trend,
    sma50: smaSeries(closes, 50).slice(offset),
    sma200: smaSeries(closes, 200).slice(offset),
  };
}
