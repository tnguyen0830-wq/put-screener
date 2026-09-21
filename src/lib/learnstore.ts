import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Điểm ôn tập của tab Learn, lưu theo NGƯỜI, phía server.
 *
 * Vì sao server chứ không localStorage: cùng ba lý do `lt-store.ts` —
 * chủ app học trên điện thoại rồi mở máy tính vẫn thấy mình đã qua bài nào;
 * mỗi người nhà có tiến độ riêng; và một ô nhớ trình duyệt bị xoá là mất
 * sạch không ai biết.
 *
 * KHÔNG có biến môi trường mới: file nằm cạnh `last-scan.json`, suy ra từ
 * thư mục của `SCAN_PATH` — né bẫy `USERS_PATH` (Render không tự thêm biến
 * vào service đã tạo, dữ liệu rơi vào thư mục build rồi mất sau deploy).
 *
 * Không giữ trạng thái trong RAM: mỗi route là một bundle riêng với bản sao
 * riêng của module này (#193 đo được), nên đọc-sửa-ghi từng lượt như mọi
 * kho khác ở đây. Ghi tạm-rồi-đổi-tên để sập giữa chừng không để lại JSON
 * cụt đọc thành "chưa học bài nào".
 */

const FILE = () => {
  const base = process.env.SCAN_PATH || './.cache/last-scan.json';
  return path.join(path.dirname(base), 'learn-progress.json');
};

export type LessonResult = {
  /** Số câu đúng ở lần làm GẦN NHẤT. */
  score: number;
  total: number;
  /** Điểm cao nhất từng đạt — để làm lại kém hơn không xoá thành tích. */
  best: number;
  /** ISO của lần làm gần nhất. */
  at: string;
  attempts: number;
};

export type Progress = Record<string, LessonResult>;
type Store = Record<string, Progress>;

async function readStore(): Promise<Store> {
  try {
    const j = JSON.parse(await fs.readFile(FILE(), 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch {
    return {};
  }
}

async function writeStore(store: Store): Promise<void> {
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  const tmp = `${FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store));
  await fs.rename(tmp, FILE());
}

export async function readProgress(user: string): Promise<Progress> {
  const store = await readStore();
  const p = store[user];
  return p && typeof p === 'object' ? p : {};
}

/**
 * Ghi kết quả một lần làm bài. `score`/`total` bị ép về số nguyên trong
 * khoảng — client là nơi chấm, nhưng server không tin client về khoảng giá
 * trị: một `score: 99` cho bài 3 câu là dữ liệu rác, không phải thành tích.
 */
export async function recordResult(
  user: string,
  lessonId: string,
  score: number,
  total: number,
  now: Date = new Date()
): Promise<LessonResult> {
  const t = Math.max(1, Math.floor(Number(total) || 0));
  const s = Math.min(t, Math.max(0, Math.floor(Number(score) || 0)));
  const store = await readStore();
  const mine = (store[user] ??= {});
  const prev = mine[lessonId];
  const next: LessonResult = {
    score: s,
    total: t,
    best: Math.max(s, prev?.best ?? 0),
    at: now.toISOString(),
    attempts: (prev?.attempts ?? 0) + 1,
  };
  mine[lessonId] = next;
  await writeStore(store);
  return next;
}
