import fs from 'node:fs/promises';
import path from 'node:path';
import { OWNER } from './users';

/**
 * Watchlist là dữ liệu người dùng, nên trên Render nó phải nằm trên ổ đĩa gắn
 * thêm - thư mục repo bị dựng lại mỗi lần deploy, và cho tới nay mỗi lần deploy
 * là watchlist lặng lẽ quay về danh sách mẫu trong git.
 *
 * Từ khi người nhà có tài khoản riêng: watchlist là RIÊNG của mỗi người. Đây
 * là thứ duy nhất trong app tách theo người dùng, và có lý do - watchlist
 * không phải một danh sách tiện tay, nó là danh sách "những công ty tôi thật
 * sự muốn sở hữu" (xem README). Dùng chung thì lời khuyên đó mất nghĩa: người
 * này bán put theo tiêu chuẩn của người kia.
 */
const FILE = () => path.resolve(process.env.WATCHLIST_PATH || './data/watchlist.json');

/** Danh sách mẫu trong repo, chỉ dùng khi trên đĩa chưa có gì. */
const SEED = path.resolve(process.cwd(), 'data/watchlist.json');

/** Schwab writes class shares with a slash: BRK.B is BRK/B. */
export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\./g, '/').replace(/\s+/g, '');
}

type Store = Record<string, string[]>;

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Đọc kho watchlist, chấp nhận CẢ định dạng cũ.
 *
 * Trước đây file là một mảng mã phẳng. Trên đĩa Render hiện đang là watchlist
 * THẬT của chủ app dưới đúng định dạng đó, nên đọc một mảng phải hiểu là
 * "danh sách của chủ app" chứ không phải "file hỏng, bỏ đi" - nếu không, lần
 * deploy đầu tiên sau thay đổi này sẽ xoá sạch watchlist của chủ app. Di trú
 * diễn ra âm thầm ở lần GHI tiếp theo; không có bước chuyển đổi thủ công nào.
 */
async function readStore(): Promise<Store> {
  const onDisk = await readJson(FILE());
  if (Array.isArray(onDisk)) return { [OWNER]: onDisk as string[] };
  if (onDisk && typeof onDisk === 'object') return onDisk as Store;
  return {};
}

export async function readWatchlist(user: string = OWNER): Promise<string[]> {
  const store = await readStore();
  const mine = store[user];
  if (Array.isArray(mine)) return mine;

  // Chưa có gì của riêng người này: mồi bằng danh sách mẫu trong repo, giống
  // hệt hành vi cũ khi đĩa còn trống. Người mới mở app ra thấy vài mã để bấm
  // thử, hơn là một bảng trắng không biết bắt đầu từ đâu.
  const seed = await readJson(SEED);
  return Array.isArray(seed) ? (seed as string[]) : [];
}

export async function writeWatchlist(
  symbols: string[],
  user: string = OWNER
): Promise<string[]> {
  const clean = Array.from(
    new Set(symbols.map(normalizeSymbol).filter((s) => /^[A-Z/]{1,10}$/.test(s)))
  ).sort();

  // Đọc - sửa - ghi, không ghi đè cả file: hai người cùng sửa watchlist thì
  // người ghi sau không được xoá mất danh sách của người ghi trước.
  const store = await readStore();
  store[user] = clean;

  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  await fs.writeFile(FILE(), JSON.stringify(store, null, 2));
  return clean;
}

/**
 * Hợp của watchlist MỌI người, không trùng lặp.
 *
 * Dành cho các vòng đồng bộ nền (Form 4, và bất cứ thứ gì gom dữ liệu theo
 * "những mã đang được theo dõi"). Dữ liệu nó gom về nằm trong cache dùng
 * chung chứ không thuộc riêng ai, nên nếu chỉ đọc watchlist của chủ app thì
 * mã của người nhà sẽ vĩnh viễn trống phần insider - một mục trống vì không
 * ai đi lấy, trông y hệt một mục trống vì không có ai mua.
 */
export async function allWatchlistSymbols(): Promise<string[]> {
  const store = await readStore();
  const all = new Set<string>();
  for (const list of Object.values(store)) {
    if (Array.isArray(list)) for (const s of list) all.add(s);
  }
  if (all.size) return [...all];

  // Đĩa chưa có gì của ai: quay về danh sách mẫu, giống readWatchlist().
  const seed = await readJson(SEED);
  return Array.isArray(seed) ? (seed as string[]) : [];
}
