import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve(process.cwd(), 'data/watchlist.json');

/** Schwab writes class shares with a slash: BRK.B is BRK/B. */
export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\./g, '/').replace(/\s+/g, '');
}

export async function readWatchlist(): Promise<string[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeWatchlist(symbols: string[]): Promise<string[]> {
  const clean = Array.from(
    new Set(symbols.map(normalizeSymbol).filter((s) => /^[A-Z/]{1,10}$/.test(s)))
  ).sort();
  await fs.writeFile(FILE, JSON.stringify(clean, null, 2));
  return clean;
}
