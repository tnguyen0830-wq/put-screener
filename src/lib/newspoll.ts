/**
 * Khi nào tab Tin tức được tự tải lại.
 *
 * Trước đây trang hỏi `/api/news` mỗi 5 phút bất kể trình duyệt có đang
 * nhìn hay không. Server cache 5 phút nên RSS không tốn thêm, nhưng nguồn X
 * (khi có `X_NEWS_ACCOUNTS`) tính tiền theo BÀI ĐỌC (#236: ~$0,005 mỗi bài)
 * và cache X chỉ 15 phút — một cửa sổ bỏ quên qua đêm là ~96 lượt đọc X mỗi
 * cột mỗi ngày mà không ai xem. Nên: chỉ tự tải khi tab đang HIỆN, và khi
 * quay lại tab sau hơn một nhịp thì tải đúng MỘT lần.
 *
 * Thuần, không import gì, để test chạy độc lập.
 */

/** Nhịp tự tải lại — bằng đúng cache trang của server (`CACHE_MS`). */
export const NEWS_POLL_MS = 5 * 60_000;

/**
 * Có nên tự tải lại bây giờ không.
 * - Tab đang ẩn → KHÔNG, dù đã quá nhịp bao lâu.
 * - Chưa từng tải xong (`lastAt` null) → có, khi tab hiện.
 * - Đã tải trong vòng một nhịp → không.
 */
export function autoRefreshDue(visible: boolean, lastAt: number | null, now: number, every = NEWS_POLL_MS): boolean {
  if (!visible) return false;
  if (lastAt == null || !Number.isFinite(lastAt)) return true;
  return now - lastAt >= every;
}
