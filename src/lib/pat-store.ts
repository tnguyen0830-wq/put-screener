import fs from 'node:fs/promises';
import path from 'node:path';
import type { Detection } from './patterns';

/**
 * Kết quả quét mẫu hình gần nhất — cùng khuôn và cùng ba lý do `lt-store.ts`
 * (#144): lưu phía SERVER (quét ở máy tính, mở điện thoại vẫn thấy), RIÊNG
 * theo NGƯỜI (watchlist khác nhau), RIÊNG theo PHẠM VI (lượt watchlist vài
 * giây không được xoá lượt cả rổ vài phút). Và cùng bài học: một bảng trống
 * lúc quay lại trông y hệt "lần trước không tìm thấy mẫu nào".
 *
 * KHÔNG biến môi trường mới: file nằm cạnh `last-scan.json`, suy ra từ thư
 * mục của `SCAN_PATH` — né bẫy `USERS_PATH`. Đọc-sửa-ghi từng lượt, tmp rồi
 * đổi tên (#193: module state không dùng chung giữa route).
 */
const FILE = () => {
  const base = process.env.SCAN_PATH || './.cache/last-scan.json';
  return path.join(path.dirname(base), 'last-patterns.json');
};

export type PatUniverse = 'watchlist' | 'sp500';

export type PatRow = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  /** Nến ngày của phiên cuối trong chuỗi (YYYY-MM-DD) — để nói mẫu tính tới hôm nào. */
  lastBar: string;
  bars: number;
  detections: Detection[];
  nearestSupport: { price: number; distancePct: number; touches: number } | null;
  nearestResistance: { price: number; distancePct: number; touches: number } | null;
  volumeKnown: boolean;
  /** Điểm xếp hạng (tổng `detectionWeight`). */
  weight: number;
};

export type SavedPatScan = {
  universe: PatUniverse;
  at: string;
  scanned: number;
  /** Số mã CÓ ít nhất một mẫu. */
  kept: number;
  /** Số mã bỏ qua vì không có giá / lịch sử ngắn / lỗi — kèm lý do đếm được. */
  skipped: Record<string, number>;
  rows: PatRow[];
};

type Store = Record<string, SavedPatScan>;

const keyOf = (user: string, universe: PatUniverse) => `${user}:${universe}`;

async function readStore(): Promise<Store> {
  try {
    const j = JSON.parse(await fs.readFile(FILE(), 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch {
    return {};
  }
}

export async function savePatScan(scan: SavedPatScan, user: string): Promise<void> {
  const store = await readStore();
  store[keyOf(user, scan.universe)] = scan;
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  const tmp = `${FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store));
  await fs.rename(tmp, FILE());
}

export async function readPatScan(universe: PatUniverse, user: string): Promise<SavedPatScan | null> {
  const store = await readStore();
  return store[keyOf(user, universe)] ?? null;
}
