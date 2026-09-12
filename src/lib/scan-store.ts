import fs from 'node:fs/promises';
import path from 'node:path';
import type { Candidate, Universe } from './types';
import { OWNER } from './users';

/**
 * Giữ lại kết quả quét gần nhất.
 *
 * Quét cả S&P 500 mất 4-8 phút, mà trước đây kết quả chỉ nằm trong bộ nhớ
 * trình duyệt: đóng tab là mất sạch, mở lại phải quét lại từ đầu.
 *
 * Lưu ở phía SERVER chứ không phải localStorage, vì cùng một tài khoản
 * thường mở trên điện thoại rồi mở tiếp trên máy tính - quét ở máy này
 * phải xem được ở máy kia.
 *
 * Lưu RIÊNG THEO NGƯỜI từ khi người nhà có tài khoản: mỗi người một
 * watchlist và một bộ tiêu chí lọc, nên kết quả quét của họ khác nhau. Dùng
 * chung một ô thì người mở app sau sẽ thấy bảng kết quả chạy bằng tiêu chí
 * của người khác mà không có gì trên màn hình nói ra điều đó.
 *
 * Lưu RIÊNG theo phạm vi quét: quét watchlist mất vài chục giây, quét cả
 * rổ mất vài phút. Nếu dùng chung một chỗ thì một lần quét watchlist
 * nhanh sẽ xoá mất kết quả tám phút vừa chạy xong.
 */

const FILE = () =>
  path.resolve(process.env.SCAN_PATH || './.cache/last-scan.json');

export type SavedScan = {
  universe: Universe;
  /** Thời điểm quét xong (epoch ms). Luôn hiện ra - đây là ảnh chụp, không phải giá sống. */
  at: number;
  scanned: number;
  ms: number;
  rows: Candidate[];
};

/** Khoá dạng `tên:phạm vi`. Xem `keyOf` ngay dưới về định dạng cũ. */
type Store = Record<string, SavedScan>;

const keyOf = (user: string, universe: Universe) => `${user}:${universe}`;

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(FILE(), 'utf8'));
  } catch {
    return {};
  }
}

export async function saveScan(scan: SavedScan, user: string): Promise<void> {
  const store = await readStore();
  store[keyOf(user, scan.universe)] = scan;
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  await fs.writeFile(FILE(), JSON.stringify(store));
}

export async function readScan(
  universe: Universe,
  user: string
): Promise<SavedScan | null> {
  const store = await readStore();
  const mine = store[keyOf(user, universe)];
  if (mine) return mine;

  // Định dạng CŨ: khoá chỉ là phạm vi quét ('sp500' | 'watchlist'), từ thời
  // app một người dùng. Những bản ghi đó là của chủ app, nên chỉ chủ app mới
  // đọc lại được - đưa lần quét tám phút của chủ app cho người nhà xem là
  // đưa nhầm kết quả, còn xoá nó đi là bắt chủ app quét lại từ đầu. Bản ghi
  // cũ tự biến mất ở lần quét kế tiếp, không cần bước di trú nào.
  if (user === OWNER) return store[universe] ?? null;
  return null;
}
