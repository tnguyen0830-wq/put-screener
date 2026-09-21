import fs from 'node:fs/promises';
import path from 'node:path';
import { dailyHistory } from './schwab';
import { symbolFileKey } from './fskey';

export type Bar = { datetime: number; close: number };

/**
 * Daily bars, cached per symbol per day.
 *
 * Split out of the screener's scan route so /api/positions can share the
 * exact same cache (correlation for cluster exposure wants the same daily
 * bars the scan already pulled for any symbol that overlaps the S&P 500 or
 * the watchlist - no reason to fetch or cache it twice).
 */
const HIST_DIR = path.resolve('./.cache/history');

export async function historyBars(symbol: string): Promise<Bar[]> {
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(HIST_DIR, `${symbolFileKey(symbol)}.json`);
  try {
    const cached = JSON.parse(await fs.readFile(file, 'utf8'));
    if (cached.d === today) return cached.bars as Bar[];
  } catch {
    /* cache miss */
  }
  const data = await dailyHistory(symbol, 1);
  const bars: Bar[] = (data?.candles ?? []).map((c: any) => ({
    datetime: c.datetime,
    close: c.close,
  }));
  await fs.mkdir(HIST_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify({ d: today, bars }));
  return bars;
}

/* ---------------- nến dài hạn cho tab Long-term ----------------
 *
 * CỐ Ý không gộp vào `historyBars` ở trên, vì hai thứ khác nhau ở cả hai đầu:
 *
 * - KHÁC TRƯỜNG. `Bar` chỉ giữ `close`, đủ cho tương quan (exposure) và
 *   SMA200/HV20 (screener). Vùng hỗ trợ thì phải đọc `low`: một mức hỗ trợ
 *   được vẽ ở nơi giá CHẠM rồi bật lên, không phải ở nơi nó đóng cửa. Tính
 *   hỗ trợ từ giá đóng cửa là bỏ qua đúng cái râu nến làm nên mức đó.
 * - KHÁC TẦM. 1 năm là đủ cho screener; một vùng hỗ trợ đáng tin cần nhiều
 *   năm để có đủ lần chạm.
 *
 * Nhét thêm trường và kéo dài tầm của `historyBars` sẽ bắt mọi nơi dùng nó
 * trả giá gấp nhiều lần cho dữ liệu họ không đọc tới, và làm phình cái cache
 * mà cả hai tab đang chia nhau. Nên: kho riêng, tên riêng, vòng đời riêng.
 */
const LT_DIR = path.resolve('./.cache/history-lt');

/**
 * `open` và `volume` được thêm cho tab Patterns (mẫu hình nến cần thân nến,
 * tức cần `open`; phá vỡ có khối lượng cần `volume`). Thêm trường là ĐỦ cho
 * mọi nơi đang dùng (Long-term chỉ đọc t/high/low/close), nhưng cache cũ trên
 * đĩa ghi trước thay đổi này THIẾU hai trường — đọc chúng ra `undefined` sẽ
 * làm mọi mẫu nến câm lặng trong đúng ngày deploy. Nên một bản cache không có
 * `open` bị coi là MISS và nạp lại, thay vì tin nó.
 *
 * `volume` là `null` khi Schwab không trả (không phải 0): 0 đọc thành "không
 * ai giao dịch", null đọc thành "không biết" — tỉ lệ khối lượng của một cú
 * phá vỡ phải ra `null` chứ không ra một con số trông như thật.
 */
export type LtCandle = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export async function historyCandles(
  symbol: string,
  years = 3
): Promise<LtCandle[]> {
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(LT_DIR, `${symbolFileKey(symbol)}-${years}y.json`);
  try {
    const cached = JSON.parse(await fs.readFile(file, 'utf8'));
    const first = cached.candles?.[0];
    /* Bản cache ghi trước khi có `open`: coi là miss (xem chú thích LtCandle). */
    const hasOpen = !first || typeof first.open === 'number';
    if (cached.d === today && hasOpen) return cached.candles as LtCandle[];
  } catch {
    /* cache miss */
  }
  const data = await dailyHistory(symbol, years);
  const candles: LtCandle[] = (data?.candles ?? [])
    .map((c: any) => ({
      t: Number(c.datetime),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number.isFinite(Number(c.volume)) && c.volume !== null && c.volume !== undefined ? Number(c.volume) : null,
    }))
    /* Một nến thiếu giá trị làm hỏng cả phép tìm đáy xoay một cách im lặng
       (Math.min với NaN ra NaN, và NaN so sánh nào cũng false nên nến hỏng
       vừa không thành đáy vừa che luôn đáy thật cạnh nó). Loại ở đây, một
       lần, thay vì rải kiểm tra khắp support.ts. */
    .filter(
      (c: LtCandle) =>
        Number.isFinite(c.t) &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
    );
  try {
    await fs.mkdir(LT_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ d: today, candles }));
  } catch {
    /* Cache hỏng thì lần sau gọi lại, không được làm chết lượt quét. */
  }
  return candles;
}
