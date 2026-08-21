/**
 * Chỉ báo kỹ thuật tính tại chỗ từ chuỗi nến ngày của Schwab.
 *
 * Không dùng thư viện ngoài: mấy công thức này ngắn, và tự tính thì biết chính
 * xác biến thể nào đang chạy. RSI và ATR dùng làm mượt Wilder (hệ số 1/n) chứ
 * không phải trung bình trượt đơn giản — đây là biến thể mà TradingView và
 * thinkorswim mặc định dùng, nên số sẽ khớp với những gì bạn thấy ở đó.
 */

export type Candle = {
  datetime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** Trung bình cộng n giá trị cuối. */
export function mean(values: number[], n = values.length): number | null {
  if (values.length < n || n <= 0) return null;
  const slice = values.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

/** Độ lệch chuẩn tổng thể của n giá trị cuối. */
export function stdev(values: number[], n = values.length): number | null {
  const m = mean(values, n);
  if (m === null) return null;
  const slice = values.slice(-n);
  return Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / n);
}

/** Toàn bộ chuỗi EMA; phần tử đầu tiên gieo bằng SMA của n giá trị đầu. */
export function emaSeries(values: number[], n: number): number[] {
  if (values.length < n) return [];
  const k = 2 / (n + 1);
  const out: number[] = [values.slice(0, n).reduce((a, b) => a + b, 0) / n];
  for (let i = n; i < values.length; i++)
    out.push(values[i] * k + out[out.length - 1] * (1 - k));
  return out;
}

export function ema(values: number[], n: number): number | null {
  const s = emaSeries(values, n);
  return s.length ? s[s.length - 1] : null;
}

/** RSI Wilder. Trả về 0–100, hoặc null nếu chưa đủ nến. */
export function rsi(closes: number[], n = 14): number | null {
  if (closes.length < n + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / n;
  let avgLoss = loss / n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (n - 1) + Math.max(d, 0)) / n;
    avgLoss = (avgLoss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** MACD(12,26,9): đường macd, đường tín hiệu, và histogram = macd − signal. */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number; signal: number; hist: number } | null {
  const fastS = emaSeries(closes, fast);
  const slowS = emaSeries(closes, slow);
  if (!fastS.length || !slowS.length) return null;
  // Hai chuỗi EMA bắt đầu ở hai mốc khác nhau; cắt đuôi cho khớp độ dài.
  const len = Math.min(fastS.length, slowS.length);
  const line = Array.from(
    { length: len },
    (_, i) => fastS[fastS.length - len + i] - slowS[slowS.length - len + i]
  );
  const sigS = emaSeries(line, signal);
  if (!sigS.length) return null;
  const m = line[line.length - 1];
  const s = sigS[sigS.length - 1];
  return { macd: m, signal: s, hist: m - s };
}

/** ATR Wilder, tính bằng đơn vị giá. */
export function atr(candles: Candle[], n = 14): number | null {
  if (candles.length < n + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1].close;
    tr.push(
      Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev))
    );
  }
  let a = tr.slice(0, n).reduce((x, y) => x + y, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

/** Dải Bollinger quanh SMA(n) ± k lần độ lệch chuẩn. */
export function bollinger(
  closes: number[],
  n = 20,
  k = 2
): { mid: number; upper: number; lower: number; pctB: number } | null {
  const mid = mean(closes, n);
  const sd = stdev(closes, n);
  if (mid === null || sd === null) return null;
  const upper = mid + k * sd;
  const lower = mid - k * sd;
  const last = closes[closes.length - 1];
  // %B: 0 = chạm dải dưới, 1 = chạm dải trên. Ngoài [0,1] là đã ra ngoài dải.
  const pctB = upper === lower ? 0.5 : (last - lower) / (upper - lower);
  return { mid, upper, lower, pctB };
}

/**
 * Biến động thực tế đã quy năm, tính trên n phiên gần nhất.
 * Trùng công thức với realizedVol() trong screener.ts để hai nơi không lệch số.
 */
export function realizedVol(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - n; i < closes.length; i++)
    rets.push(Math.log(closes[i] / closes[i - 1]));
  const sd = stdev(rets, rets.length);
  return sd === null ? null : sd * Math.sqrt(252);
}

/** Số phiên liên tiếp gần nhất mà giá đóng cửa nằm trên (hoặc dưới) một mốc. */
export function streakAbove(closes: number[], level: number): number {
  const above = closes[closes.length - 1] > level;
  let n = 0;
  for (let i = closes.length - 1; i >= 0; i--) {
    if (closes[i] > level !== above) break;
    n++;
  }
  return above ? n : -n;
}
