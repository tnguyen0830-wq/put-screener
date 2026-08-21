import fs from 'node:fs/promises';
import path from 'node:path';
import { loadEarnings } from '@/lib/screener';

// Shared by /api/md/earnings (single symbol) and /api/md/constituents (bulk,
// merged in for free since it's just local file reads - no Schwab cost).
export type EarningsLookup = { nextEarningsDate: string | null; confirmed: boolean };

async function loadExternal(): Promise<Record<string, { date: string; confirmed: boolean }>> {
  try {
    const raw = await fs.readFile(path.resolve('./data/earnings-external.json'), 'utf8');
    return JSON.parse(raw).dates ?? {};
  } catch {
    return {};
  }
}

export async function buildEarningsIndex(): Promise<Record<string, EarningsLookup>> {
  const [earnings, external] = await Promise.all([loadEarnings(), loadExternal()]);
  const today = new Date().toISOString().slice(0, 10);
  const out: Record<string, EarningsLookup> = {};

  // data/earnings.json carries a "_comment" string key alongside the real
  // per-symbol arrays - skip anything that isn't actually an array.
  const symbols = new Set([
    ...Object.keys(earnings).filter((k) => Array.isArray(earnings[k])),
    ...Object.keys(external),
  ]);
  for (const symbol of symbols) {
    const ext = external[symbol];
    if (ext?.date && ext.date >= today) {
      out[symbol] = { nextEarningsDate: ext.date, confirmed: ext.confirmed };
      continue;
    }
    const dates = (earnings[symbol] ?? []).filter((d) => d >= today).sort();
    out[symbol] = { nextEarningsDate: dates[0] ?? null, confirmed: dates.length > 0 };
  }
  return out;
}

export function lookupEarnings(index: Record<string, EarningsLookup>, symbol: string): EarningsLookup {
  return index[symbol] ?? { nextEarningsDate: null, confirmed: false };
}
