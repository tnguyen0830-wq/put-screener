/**
 * `Promise.allSettled` có TRẦN SỐ LỜI GỌI ĐANG BAY.
 *
 * Tách ra lib vì nó chống một lỗi ĐÃ XẢY RA THẬT, không phải một lỗi tưởng
 * tượng: `/api/uwprobe` bắn cả 12 endpoint cùng lúc và Unusual Whales trả
 * 429 "You have exceeded 3 concurrent requests" cho một trong số đó — nên
 * một endpoint CÓ THẬT và CHẠY ĐƯỢC hiện ra y hệt một endpoint hỏng, tức
 * probe tự làm hỏng phép đo của chính nó.
 *
 * Hai bất biến là phần đáng test, và cả hai đều hỏng ÂM THẦM nếu sai: số
 * lời gọi đang bay không bao giờ vượt trần (vượt thì lại ăn 429), và kết
 * quả giữ ĐÚNG THỨ TỰ đầu vào (lệch thì bảng endpoint gắn kết quả vào sai
 * tên, và mọi con số trông vẫn hợp lệ). File này KHÔNG import gì.
 */

/** Như `Promise.allSettled` nhưng không bao giờ để quá `limit` lời gọi bay
 *  cùng lúc. Giữ ĐÚNG THỨ TỰ đầu vào ở kết quả, vì bảng endpoint đọc theo
 *  thứ tự đó; và một cái hỏng không làm hỏng cái khác, y như allSettled. */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
