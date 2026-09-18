/**
 * Phần THUẦN của market internals (`internals.ts`) - tách riêng, KHÔNG import
 * gì khác, để biên dịch và test độc lập được (`internals.ts` kéo theo
 * `./alerts` -> `./portfolio` -> nhiều alias `@/lib/...`, phá vỡ cách biên
 * dịch một file rồi require() thẳng mà repo này dùng để test).
 */

export type SeriesPoint = { t: number; v: number };

export type Series = {
  key: string;
  label: string;
  points: SeriesPoint[];
  current: number | null;
  /** 'schwab' = nến phút thật, làm mới mỗi lần gọi endpoint.
   *  'sampled' = app tự lấy mẫu ~15 phút/lần - đường THÔ hơn bản gốc, và
   *  màn hình phải nói ra điều đó chứ không được trông giống dữ liệu tick. */
  source: 'schwab' | 'sampled';
  asOf: number | null;
};

/**
 * Ghép hai chuỗi theo CHỈ SỐ, không theo mốc thời gian: hai chuỗi đến từ
 * cùng một lưới nến (cùng phiên, cùng tần suất phút), nên cùng độ dài là
 * điều đo được thật (#165: cả bốn mã đều ra đúng 78 nến) - ghép theo `t` sẽ
 * vỡ nếu một bên thiếu đúng một nến ở đầu hay cuối do làm tròn giờ khác
 * nhau.
 */
export function diffSeries(a: SeriesPoint[], b: SeriesPoint[]): SeriesPoint[] {
  const n = Math.min(a.length, b.length);
  const out: SeriesPoint[] = [];
  for (let i = 0; i < n; i++) out.push({ t: a[i].t, v: a[i].v - b[i].v });
  return out;
}

/** Hiệu số của hai giá trị CHƯA BIẾT ĐƯỢC - null nếu MỘT trong hai còn
 *  thiếu, chứ không lặng lẽ coi giá trị thiếu là 0 (0 thật và "chưa biết"
 *  phải khác nhau, đúng luật #131/#142 ở nơi khác trong repo). */
export function diffOrNull(a: number | null, b: number | null): number | null {
  return a !== null && b !== null ? a - b : null;
}

/** Trường có tồn tại hay không - kiểm typeof, không kiểm truthy. NYSE TICK
 *  và ADV-DECL có thể đúng lúc bằng 0 THẬT (#165's own probe already pinned
 *  this), một phép kiểm truthy sẽ đọc 0 thật thành "Schwab không trả". */
export function numField(q: Record<string, any>, symbol: string): number | null {
  const v = q[symbol]?.quote?.lastPrice;
  return typeof v === 'number' ? v : null;
}
