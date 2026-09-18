import fs from 'node:fs/promises';
import path from 'node:path';
import type { LtCandidate } from './longterm';

/**
 * Giữ lại kết quả quét Long-term gần nhất.
 *
 * #137 cố ý KHÔNG lưu, với lập luận: lượt quét này bị chặn trên bởi tầng 0
 * và mọi thứ đắt đều cache theo ngày, nên chạy lại gần như tức thì. Lập
 * luận ấy đo sai cái giá. Chủ app báo: "screener longterm rồi out vô lại
 * bị mất những con stock, phải screen lại". Cache theo ngày chỉ làm rẻ
 * phần MẠNG; người dùng vẫn phải bấm quét, vẫn ngồi nhìn thanh tiến trình
 * chạy hết 503 mã qua ba tầng, và tệ nhất là bảng trống lúc quay lại trông
 * y hệt "lần quét trước không ra mã nào" - tức lại đúng cái lỗi mà cả repo
 * này chống: "chưa nạp" hiện giống "không có gì".
 *
 * Cùng khuôn `scan-store.ts` và cùng ba lý do:
 *  - Lưu phía SERVER, không phải localStorage: quét trên máy tính rồi mở
 *    lại trên điện thoại vẫn thấy.
 *  - Lưu RIÊNG THEO NGƯỜI: watchlist của mỗi người khác nhau, nên kết quả
 *    khác nhau; dùng chung một ô là đưa nhầm bảng cho người sau.
 *  - Lưu RIÊNG theo phạm vi: quét watchlist mất vài chục giây, quét cả rổ
 *    mất vài phút. Chung một ô thì một lượt watchlist nhanh sẽ xoá mất
 *    kết quả cả rổ vừa chạy xong.
 *
 * FILE RIÊNG, nhưng KHÔNG có biến môi trường mới - đường dẫn suy ra từ thư
 * mục của `SCAN_PATH` (đã khai trong render.yaml, đã trỏ vào /var/data).
 * Đó là cách né đúng cái bẫy `USERS_PATH`: Render KHÔNG tự thêm biến mới
 * vào service đã tạo, nên một biến mới là một bước tay dễ quên, và quên thì
 * dữ liệu rơi vào thư mục build rồi biến mất sau mỗi lần deploy trong khi
 * app vẫn chạy như không có chuyện gì. Tách file (chứ không nhét chung
 * last-scan.json) vì hai bảng có hình dạng hàng khác hẳn nhau, và hai tiến
 * trình ghi cùng một file là một phép đọc-sửa-ghi có thể đè lên nhau.
 */

const FILE = () => {
  const base = process.env.SCAN_PATH || './.cache/last-scan.json';
  return path.join(path.dirname(base), 'last-longterm.json');
};

export type LtUniverse = 'watchlist' | 'sp500';

export type SavedLtScan = {
  universe: LtUniverse;
  /** Thời điểm quét xong (ISO). Luôn hiện ra - đây là ảnh chụp, không phải giá sống. */
  at: string;
  scanned: number;
  kept: number;
  rows: LtCandidate[];
};

type Store = Record<string, SavedLtScan>;

const keyOf = (user: string, universe: LtUniverse) => `${user}:${universe}`;

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(FILE(), 'utf8'));
  } catch {
    return {};
  }
}

export async function saveLtScan(scan: SavedLtScan, user: string): Promise<void> {
  const store = await readStore();
  store[keyOf(user, scan.universe)] = scan;
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  /* Ghi tạm rồi đổi tên: sập giữa chừng thì file cũ còn nguyên, chứ không
     để lại một file JSON cụt mà `readStore()` sẽ đọc thành "chưa quét lần
     nào" - lại đúng cái lỗi lặng lẽ đang đi vá. Cùng lối `userstore.ts`. */
  const tmp = `${FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store));
  await fs.rename(tmp, FILE());
}

export async function readLtScan(
  universe: LtUniverse,
  user: string
): Promise<SavedLtScan | null> {
  const store = await readStore();
  return store[keyOf(user, universe)] ?? null;
}

/* Không có nhánh "định dạng khoá cũ" như scan-store.ts: kho này sinh ra sau
   khi app đã có tài khoản theo người, nên chưa từng tồn tại bản ghi khoá
   phẳng nào để đọc lại. `user` truyền vào luôn là hằng OWNER cho chủ app
   (requireUser trả về đúng tên đó), nên khoá ở đây khớp với khoá watchlist
   và scan đã lưu mà không cần xử lý gì thêm. */
