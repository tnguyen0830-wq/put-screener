import fs from 'node:fs/promises';
import path from 'node:path';
import type { Candidate, Universe } from './types';

/**
 * Giữ lại kết quả quét gần nhất.
 *
 * Quét cả S&P 500 mất 4-8 phút, mà trước đây kết quả chỉ nằm trong bộ nhớ
 * trình duyệt: đóng tab là mất sạch, mở lại phải quét lại từ đầu.
 *
 * Lưu ở phía SERVER chứ không phải localStorage, vì cùng một tài khoản
 * thường mở trên điện thoại rồi mở tiếp trên máy tính - quét ở máy này
 * phải xem được ở máy kia. App vốn một người dùng nên không có chuyện
 * lẫn dữ liệu giữa các tài khoản.
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

type Store = Partial<Record<Universe, SavedScan>>;

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(FILE(), 'utf8'));
  } catch {
    return {};
  }
}

export async function saveScan(scan: SavedScan): Promise<void> {
  const store = await readStore();
  store[scan.universe] = scan;
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  await fs.writeFile(FILE(), JSON.stringify(store));
}

export async function readScan(universe: Universe): Promise<SavedScan | null> {
  return (await readStore())[universe] ?? null;
}
