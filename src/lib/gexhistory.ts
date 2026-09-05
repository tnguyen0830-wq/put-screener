import fs from 'fs/promises';
import path from 'path';
import type { GexSnapshotLevels, GexUwLevels } from './gex';

/**
 * Lịch sử các mức GEX của CẢ HAI nguồn, lưu xuống đĩa.
 *
 * Hai mục đích, cả hai đều do chủ app yêu cầu sau khi so tay TSLA giữa app
 * và tapchiphowall:
 *
 * 1. So sánh theo thời gian - một lần đối chiếu chỉ nói được hôm nay hai
 *    bên khớp hay không. Muốn biết chênh lệch là ổn định hay thất thường
 *    thì phải có nhiều lần đọc.
 * 2. Dự phòng cuối cùng - khi Schwab VÀ UW cùng chết, hiện lại bản đọc gần
 *    nhất còn hơn một màn hình trống. Nhưng phải kèm giờ đọc: xem
 *    GexCacheResponse ở gex.ts.
 *
 * Nằm trên /var/data (đĩa bền của Render) chứ không phải ./.cache, vì mất
 * nó là mất đúng thứ duy nhất còn lại khi cả hai API cùng hỏng - và mỗi lần
 * deploy là một lần .cache bị xoá sạch.
 */
const STORE = () =>
  path.resolve(process.env.GEX_HISTORY_PATH || './.cache/gex-history.json');

export type GexSnapshot = {
  /** ISO time lúc đọc. */
  at: string;
  spot: number | null;
  /** null = nguồn đó hỏng ở lần đọc này. Ghi lại cả lần hỏng chứ không bỏ
   *  qua: một chuỗi null liên tiếp chính là bằng chứng một nguồn đang chết,
   *  và đó là thông tin, không phải rác. */
  schwab: GexSnapshotLevels | null;
  uw: GexUwLevels | null;
};

type Store = Record<string, GexSnapshot[]>;

/** Hai lần ghi cách nhau tối thiểu 15 phút cho mỗi mã. Panel GEX ở Heatmap
 *  tự làm mới mỗi 10 phút, nên một tab để mở cả ngày mà ghi mọi lần đọc sẽ
 *  là ~144 bản ghi/mã/ngày - phình file mà không thêm thông tin gì, các mức
 *  gần như không đổi trong vài phút. */
const MIN_GAP_MS = 15 * 60 * 1000;

/** Giữ 30 ngày. Đủ dài để thấy xu hướng lệch giữa hai nguồn, đủ ngắn để file
 *  không lớn dần vô hạn trên đĩa 1GB dùng chung với token và watchlist. */
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

async function read(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(STORE(), 'utf8')) as Store;
  } catch {
    // Chưa có file (lần chạy đầu) hoặc file hỏng - cả hai đều nên coi như
    // "chưa có lịch sử" chứ không làm chết /api/gex. Lịch sử là phần thêm,
    // không phải phần bắt buộc để xem GEX.
    return {};
  }
}

export async function lastGexSnapshot(symbol: string): Promise<GexSnapshot | null> {
  const store = await read();
  const rows = store[symbol.toUpperCase()] ?? [];
  return rows.length ? rows[rows.length - 1] : null;
}

export async function gexHistory(symbol: string): Promise<GexSnapshot[]> {
  const store = await read();
  return store[symbol.toUpperCase()] ?? [];
}

/**
 * Ghi một bản đọc. Tự bỏ qua nếu bản gần nhất của cùng mã còn mới hơn
 * MIN_GAP_MS. Không bao giờ ném lỗi ra ngoài: lịch sử hỏng thì GEX vẫn phải
 * xem được.
 */
export async function recordGexSnapshot(
  symbol: string,
  snap: GexSnapshot
): Promise<void> {
  const key = symbol.toUpperCase();
  try {
    const store = await read();
    const rows = store[key] ?? [];
    const newest = rows[rows.length - 1];
    if (newest && Date.parse(snap.at) - Date.parse(newest.at) < MIN_GAP_MS) return;

    const cutoff = Date.parse(snap.at) - KEEP_MS;
    store[key] = [...rows.filter((r) => Date.parse(r.at) >= cutoff), snap];

    const file = STORE();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(store), 'utf8');
  } catch {
    // Nuốt có chủ đích - xem chú thích trên.
  }
}
