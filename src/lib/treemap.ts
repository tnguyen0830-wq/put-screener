/**
 * Treemap kiểu "squarified" (Bruls, Huizing, van Wijk 2000).
 *
 * Cách chia đơn giản (cắt lát luân phiên ngang/dọc) cho ra những dải dài ngoằng
 * không đọc được khi giá trị chênh nhau nhiều — mà vốn hoá thì chênh cả trăm
 * lần. Thuật toán này gom các ô thành từng hàng sao cho tỷ lệ cạnh gần vuông
 * nhất, nên ô nhỏ vẫn bấm được và ô lớn không nuốt hết bố cục.
 */

export type Rect = { x: number; y: number; w: number; h: number };

/** Tỷ lệ cạnh xấu nhất của một hàng, dùng để quyết định có nên đóng hàng chưa. */
function worstRatio(row: number[], side: number): number {
  if (!row.length || side === 0) return Infinity;
  const sum = row.reduce((a, b) => a + b, 0);
  if (sum === 0) return Infinity;
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/** Xếp một hàng đã chốt vào cạnh ngắn của phần diện tích còn lại. */
function layoutRow<T>(
  row: { item: T; area: number }[],
  rect: Rect,
  out: (T & Rect)[]
): Rect {
  const sum = row.reduce((a, b) => a + b.area, 0);
  if (sum <= 0) return rect;
  const horizontal = rect.w >= rect.h;
  // Bề dày của hàng = diện tích hàng chia cho cạnh dài.
  const thick = sum / (horizontal ? rect.h : rect.w);

  let offset = 0;
  for (const { item, area } of row) {
    const len = area / thick;
    out.push(
      horizontal
        ? { ...(item as any), x: rect.x, y: rect.y + offset, w: thick, h: len }
        : { ...(item as any), x: rect.x + offset, y: rect.y, w: len, h: thick }
    );
    offset += len;
  }

  return horizontal
    ? { x: rect.x + thick, y: rect.y, w: Math.max(0, rect.w - thick), h: rect.h }
    : { x: rect.x, y: rect.y + thick, w: rect.w, h: Math.max(0, rect.h - thick) };
}

export function squarify<T extends { value: number }>(
  items: T[],
  rect: Rect
): (T & Rect)[] {
  const positive = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (!positive.length || rect.w <= 0 || rect.h <= 0) return [];

  const total = positive.reduce((a, b) => a + b.value, 0);
  const scale = (rect.w * rect.h) / total;

  const out: (T & Rect)[] = [];
  let free = { ...rect };
  let row: { item: T; area: number }[] = [];

  for (const item of positive) {
    const area = item.value * scale;
    const side = Math.min(free.w, free.h);
    const areas = row.map((r) => r.area);
    // Thêm ô này vào hàng hiện tại nếu tỷ lệ cạnh không xấu đi; nếu xấu đi thì
    // chốt hàng lại và mở hàng mới trên phần diện tích còn lại.
    if (row.length && worstRatio([...areas, area], side) > worstRatio(areas, side)) {
      free = layoutRow(row, free, out);
      row = [];
    }
    row.push({ item, area });
  }
  if (row.length) layoutRow(row, free, out);

  return out;
}
