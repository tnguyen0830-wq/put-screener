import fs from 'node:fs/promises';
import path from 'node:path';
import { dailyHistory } from './schwab';

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
  const file = path.join(HIST_DIR, `${symbol.replace('/', '_')}.json`);
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
