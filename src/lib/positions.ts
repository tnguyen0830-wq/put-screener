import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeSymbol } from './watchlist';

/**
 * Danh mục nhập tay.
 *
 * Schwab có API đọc tài khoản thật, nhưng app này chưa được duyệt quyền đó
 * (/api/trader-check trả về "Client not authorized"). Chờ duyệt thì không làm
 * được gì, mà phần khó nhất của việc theo dõi vị thế lại không nằm ở chỗ lấy
 * danh sách: nó nằm ở chỗ định giá lại hàng ngày, và quyền market data thì đã
 * có sẵn.
 *
 * Nên mỗi vị thế nhập tay đúng một lần lúc mở, còn mọi con số thay đổi theo
 * thị trường - giá mua lại, lời lỗ, còn bao nhiêu ngày, cách strike bao xa -
 * đều tính từ báo giá Schwab. Khi nào quyền tài khoản được duyệt thì phần nhập
 * tay được thay bằng đồng bộ tự động, còn toàn bộ phần tính toán giữ nguyên.
 */

export type PositionKind = 'put' | 'stock';

export type Position = {
  id: string;
  kind: PositionKind;
  symbol: string;
  /**
   * Ngày mở vị thế - không bắt buộc.
   *
   * Người ta hay không nhớ đã bán hợp đồng đó ngày nào, và điền đại một ngày
   * thì mọi phép quy năm dựa trên nó thành số ảo. Để trống là thành thật hơn:
   * những con số cần ngày mở sẽ tự biến mất, còn phần quan trọng nhất - phần
   * credit chưa ăn quy theo số ngày còn lại - không cần tới nó.
   */
  openedAt?: string;
  /* --- put đã bán --- */
  strike?: number;
  expiration?: string;
  contracts?: number;
  /** Credit nhận được, tính trên mỗi cổ phiếu (1.85 nghĩa là $185 một hợp đồng). */
  credit?: number;
  /* --- cổ phiếu đang giữ --- */
  shares?: number;
  /** Giá vốn trên mỗi cổ phiếu. */
  cost?: number;
  note?: string;
};

/* Vị thế phải sống qua mỗi lần deploy, nên mặc định ghi vào ổ đĩa gắn thêm của
   Render giống file token. Ở laptop thì rơi về thư mục data/ của repo. */
const FILE = () =>
  path.resolve(process.env.POSITIONS_PATH || './data/positions.json');

const isDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

const num = (v: unknown, { min = 0, max = 1e9 } = {}): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > min && n <= max ? n : null;
};

/**
 * Làm sạch một vị thế do người dùng nhập.
 *
 * Trả về null nếu thiếu thứ không thể suy ra được. Đây là dữ liệu từ trình
 * duyệt và sẽ được ghi xuống đĩa, nên không có trường nào được đi qua mà không
 * qua cửa này - kể cả `note`, vốn chỉ là chữ nhưng vẫn phải có giới hạn.
 */
export function sanitize(raw: any): Position | null {
  const symbol = normalizeSymbol(String(raw?.symbol ?? ''));
  if (!/^[A-Z/]{1,10}$/.test(symbol)) return null;

  const kind: PositionKind = raw?.kind === 'stock' ? 'stock' : 'put';
  const openedAt = isDate(raw?.openedAt) ? raw.openedAt : undefined;
  const note = typeof raw?.note === 'string' ? raw.note.slice(0, 120) : undefined;
  // Id do client đặt cũng phải qua cửa: nó đi thẳng vào key của React và vào
  // file trên đĩa.
  const id = /^[a-zA-Z0-9_-]{1,40}$/.test(String(raw?.id ?? ''))
    ? String(raw.id)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  if (kind === 'stock') {
    const shares = num(raw?.shares, { max: 1e7 });
    const cost = num(raw?.cost, { max: 1e6 });
    if (!shares || !cost) return null;
    return { id, kind, symbol, openedAt, shares, cost, note };
  }

  const strike = num(raw?.strike, { max: 1e5 });
  const contracts = num(raw?.contracts, { max: 10_000 });
  const credit = num(raw?.credit, { max: 1e4 });
  if (!strike || !contracts || !credit || !isDate(raw?.expiration)) return null;
  return {
    id,
    kind,
    symbol,
    openedAt,
    strike,
    contracts: Math.round(contracts),
    credit,
    expiration: raw.expiration,
    note,
  };
}

export async function readPositions(): Promise<Position[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE(), 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitize).filter(Boolean) as Position[];
  } catch {
    return [];
  }
}

export async function writePositions(list: unknown[]): Promise<Position[]> {
  const clean = (Array.isArray(list) ? list : [])
    .map(sanitize)
    .filter(Boolean)
    .slice(0, 200) as Position[];
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  await fs.writeFile(FILE(), JSON.stringify(clean, null, 2));
  return clean;
}

/**
 * Ký hiệu hợp đồng quyền chọn theo chuẩn OSI, đúng dạng Schwab nhận.
 *
 * Gốc mã kéo dài đủ 6 ký tự bằng dấu cách, rồi tới ngày đáo hạn yymmdd, chữ P
 * hoặc C, rồi strike nhân 1000 kéo dài đủ 8 chữ số:
 *
 *     AAPL 230 put đáo hạn 18/09/2026  ->  "AAPL  260918P00230000"
 *
 * Nhờ ký hiệu này mà cả danh mục định giá lại chỉ trong một request /quotes,
 * thay vì kéo về nguyên chuỗi quyền chọn của từng mã.
 */
export function osiSymbol(
  symbol: string,
  expiration: string,
  strike: number,
  right: 'P' | 'C' = 'P'
): string {
  const root = symbol.replace(/\//g, '').toUpperCase().padEnd(6, ' ');
  const [y, m, d] = expiration.split('-');
  const k = String(Math.round(strike * 1000)).padStart(8, '0');
  return `${root}${y.slice(2)}${m}${d}${right}${k}`;
}

/** Số ngày giữa hai ngày dạng YYYY-MM-DD, làm tròn theo ngày lịch. */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
