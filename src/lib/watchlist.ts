import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Watchlist là dữ liệu người dùng, nên trên Render nó phải nằm trên ổ đĩa gắn
 * thêm - thư mục repo bị dựng lại mỗi lần deploy, và cho tới nay mỗi lần deploy
 * là watchlist lặng lẽ quay về danh sách mẫu trong git.
 */
const FILE = () => path.resolve(process.env.WATCHLIST_PATH || './data/watchlist.json');

/** Danh sách mẫu trong repo, chỉ dùng khi trên đĩa chưa có gì. */
const SEED = path.resolve(process.cwd(), 'data/watchlist.json');

/** Schwab writes class shares with a slash: BRK.B is BRK/B. */
export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\./g, '/').replace(/\s+/g, '');
}

export async function readWatchlist(): Promise<string[]> {
  for (const file of [FILE(), SEED]) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* chưa có file thì thử nguồn kế tiếp */
    }
  }
  return [];
}

export async function writeWatchlist(symbols: string[]): Promise<string[]> {
  const clean = Array.from(
    new Set(symbols.map(normalizeSymbol).filter((s) => /^[A-Z/]{1,10}$/.test(s)))
  ).sort();
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  await fs.writeFile(FILE(), JSON.stringify(clean, null, 2));
  return clean;
}
