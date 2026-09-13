/**
 * Đếm số lần thử sai theo IP, cho những cửa mở ra Internet.
 *
 * Tách khỏi `/api/session` khi màn hình "quên mật khẩu" cần đúng cơ chế
 * đó: chép thêm một bản thứ hai là chấp nhận hai bản sẽ lệch nhau, và cái
 * lệch đi sẽ là cái ít ai nhìn tới - tức là cái mở cửa.
 *
 * Nhớ trong RAM là đủ. Server khởi động lại thì bộ đếm mất, nhưng bot cũng
 * phải bắt đầu lại từ đầu, và đây không phải hệ thống ngân hàng.
 *
 * Đếm theo IP chứ KHÔNG theo tên đăng nhập: đếm theo tên thì một người biết
 * tên "vo" có thể cố tình gõ sai vài lần để khoá người đó ra khỏi app.
 *
 * Mỗi cửa một `Bucket` RIÊNG. Người nhà gõ nhầm mã đặt lại năm lần không
 * được phép làm chủ app hết lượt đăng nhập - hai cửa khác nhau, hai hạn
 * mức khác nhau.
 */

export type Bucket = Map<string, { n: number; until: number }>;

export const newBucket = (): Bucket => new Map();

/** IP thật của khách, qua proxy của Render. */
export function clientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Còn được thử không. `null` là được; có số là phải chờ ngần ấy giây.
 *
 * Chỉ ĐỌC, không đếm - vì lần thử này chưa biết đúng hay sai. Gọi
 * `recordFailure()` khi đã biết là sai, `clear()` khi đã biết là đúng.
 */
export function retryAfter(
  bucket: Bucket,
  ip: string,
  maxTries: number,
  now = Date.now()
): number | null {
  const rec = bucket.get(ip);
  if (rec && rec.until > now && rec.n >= maxTries) {
    return Math.ceil((rec.until - now) / 1000);
  }
  return null;
}

export function recordFailure(
  bucket: Bucket,
  ip: string,
  windowMs: number,
  now = Date.now()
): void {
  const rec = bucket.get(ip);
  // Cửa sổ đã hết hạn thì đếm lại từ đầu, chứ không cộng dồn mãi mãi.
  const next = rec && rec.until > now ? rec : { n: 0, until: now + windowMs };
  next.n += 1;
  bucket.set(ip, next);
}

export function clear(bucket: Bucket, ip: string): void {
  bucket.delete(ip);
}
