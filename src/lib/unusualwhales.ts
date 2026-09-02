/**
 * Máy khách dùng chung cho Unusual Whales.
 *
 * Cùng vai trò như lib/schwab.ts (Schwab) và lib/sec.ts (SEC): một bộ giới
 * hạn tốc độ, một chỗ đặt xác thực, một kiểu lỗi. Ba tính năng dùng chung
 * module này - Congress trading, options flow, dark pool - đọc trong
 * congress.ts / flow.ts / darkpool.ts (khi làm tới).
 *
 * Xác thực đơn giản hơn hẳn SEC: một header `Authorization: Bearer <key>`,
 * không phải tự khai danh tính qua User-Agent. Xác nhận từ tài liệu API
 * thật (api.unusualwhales.com/docs) và một lượt gọi thử thật, không đoán.
 *
 * Đây là tính năng TRẢ PHÍ, tự tắt khi thiếu key - đúng khuôn mẫu Telegram/
 * web push/MD_API_TOKEN trong app này: không có biến môi trường thì coi
 * như tính năng không tồn tại, không báo lỗi. Chủ app đang dùng bản dùng
 * thử (API Trial - Weekly, hạn 7 ngày) nên đây không phải lựa chọn kỹ
 * thuật, mà bắt buộc: key có thể mất bất cứ lúc nào.
 */

const BASE = 'https://api.unusualwhales.com';

export function uwConfigured(): boolean {
  return !!process.env.UW_API_KEY;
}

export class UwError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Vài trăm ký tự đầu của thân lỗi thật, để phân biệt hết hạn key với
     *  gói không mở endpoint này với lỗi mạng - ba chuyện sửa khác nhau. */
    readonly body?: string
  ) {
    super(message);
    this.name = 'UwError';
  }
}

/**
 * Trang tài liệu không ghi giới hạn theo giây/phút, chỉ có hạn mức
 * 30.000 request/ngày trên bản dùng thử. Không có con số để tuân theo
 * nên chọn mức thận trọng như đã làm với SEC, không dồn dập gọi liên tục
 * dù hạn mức ngày còn nhiều - tránh bị đánh dấu là lạm dụng.
 */
class RateLimiter {
  private times: number[] = [];
  constructor(private max: number, private windowMs: number) {}
  async take() {
    for (;;) {
      const now = Date.now();
      this.times = this.times.filter((t) => now - t < this.windowMs);
      if (this.times.length < this.max) {
        this.times.push(now);
        return;
      }
      await new Promise((r) => setTimeout(r, this.windowMs - (now - this.times[0]) + 25));
    }
  }
}
const limiter = new RateLimiter(5, 1000);

/** GET một endpoint, trả về JSON đã phân tích. `params` là query string. */
export async function uwGet<T = any>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const key = process.env.UW_API_KEY;
  if (!key) {
    throw new UwError('UW_API_KEY chưa được cấu hình');
  }

  await limiter.take();

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const query = qs.toString();
  const url = `${BASE}${path}${query ? `?${query}` : ''}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  const text = await res.text();

  if (!res.ok) {
    // 401/403 ở đây thường là key hết hạn (bản trial 7 ngày) hoặc gói
    // không mở endpoint này - hai chuyện khác nhau, giữ nguyên lời thật
    // của UW để phân biệt thay vì đoán.
    throw new UwError(`Unusual Whales ${res.status} cho ${path}`, res.status, text.slice(0, 300));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new UwError(`Unusual Whales trả về thứ không phải JSON cho ${path}`, res.status, text.slice(0, 300));
  }
}
