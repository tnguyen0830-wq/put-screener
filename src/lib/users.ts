import { sameSecret } from './session';

/**
 * Tài khoản đăng nhập của chính trang này.
 *
 * App vốn một người dùng: một `APP_PASSWORD`, ai gõ đúng thì thấy mọi thứ -
 * kể cả tab My Portfolio, tức là vị thế thật trong tài khoản Schwab của chủ
 * app. Chủ app muốn người nhà dùng được phần công cụ thị trường (Screener,
 * Analyze, Heatmap, Insider Trade) mà KHÔNG nhìn thấy danh mục của mình.
 *
 * Thiết kế: **đăng nhập vẫn chỉ gõ mật khẩu, không có ô tên.** Mật khẩu nào
 * khớp thì đó chính là danh tính. Giữ nguyên form đăng nhập một ô như cũ
 * (trình quản lý mật khẩu trên máy chủ app không phải sửa gì), và người nhà
 * cũng chỉ cần nhớ đúng một chuỗi.
 *
 *   APP_PASSWORD=...                  → tài khoản chủ (role 'owner')
 *   APP_USERS=vo:matkhau1,con:matkhau2 → người nhà   (role 'member')
 *
 * Không đặt `APP_USERS` thì app chạy y hệt trước đây - cùng khuôn mẫu tự tắt
 * như Telegram/web push/MD_API_TOKEN ở khắp repo này.
 *
 * CẢNH BÁO cho người đọc sau: đây là phân tách theo VAI TRÒ trên cùng MỘT
 * phiên Schwab, không phải đa người dùng thật. Người nhà không có token
 * Schwab riêng, và mọi thứ họ xem đều đi qua hạn mức 100 request/phút chung
 * với chủ app. Muốn thật sự tách biệt thì phải deploy một bản riêng.
 */

export type Role = 'owner' | 'member';

/** Tên tài khoản của chủ app. Dành riêng - `APP_USERS` không được dùng lại. */
export const OWNER = 'owner';

/**
 * Header mà middleware gắn vào request sau khi xác thực xong, để route đọc
 * được người đang gọi mà không phải tự xác thực lại.
 *
 * An toàn vì middleware LUÔN ghi đè header này trên mọi request đi qua, kể
 * cả khi nó tự đặt giá trị mặc định - nên một header cùng tên gửi từ ngoài
 * vào không bao giờ sống sót. Tuyệt đối không được thêm nhánh nào bỏ qua
 * việc ghi đè đó.
 */
export const USER_HEADER = 'x-ps-user';

/** Tên tài khoản: đủ chặt để nhét được vào cookie và header mà không cần
 *  thoát ký tự, và cố tình KHÔNG cho dấu chấm - cookie ngăn cách bằng dấu
 *  chấm nên một cái tên có chấm sẽ làm hỏng việc tách chuỗi. */
const NAME_RE = /^[a-z0-9_-]{1,20}$/;

export function isValidName(name: string): boolean {
  return NAME_RE.test(name);
}

type Account = { name: string; password: string };

/**
 * Đọc `APP_USERS` dạng "ten1:matkhau1,ten2:matkhau2".
 *
 * Mật khẩu KHÔNG được chứa dấu phẩy (ký tự ngăn cách); dấu hai chấm thì
 * được, vì chỉ tách ở dấu hai chấm ĐẦU TIÊN. Mục nào sai định dạng thì bỏ
 * qua mục đó chứ không làm hỏng cả danh sách - một dòng env gõ nhầm không
 * nên khoá cửa toàn bộ người nhà.
 */
export function parseUsers(raw: string | undefined): Account[] {
  if (!raw) return [];
  const out: Account[] = [];
  const seen = new Set<string>();
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const i = trimmed.indexOf(':');
    if (i < 1) continue;
    const name = trimmed.slice(0, i).trim().toLowerCase();
    const password = trimmed.slice(i + 1);
    if (!password || !isValidName(name)) continue;
    // `owner` là tên dành riêng cho APP_PASSWORD; trùng tên thì bỏ mục sau.
    if (name === OWNER || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, password });
  }
  return out;
}

/**
 * Mật khẩu vừa gõ là của ai? `null` nếu không khớp ai cả.
 *
 * Duyệt HẾT danh sách chứ không dừng ở lần khớp đầu: thoát sớm sẽ làm thời
 * gian phản hồi khác nhau tuỳ vị trí tài khoản trong danh sách, đúng thứ mà
 * `sameSecret` được viết ra để tránh ngay từ đầu.
 */
export function resolveUser(given: string): string | null {
  let match: string | null = null;

  const ownerPassword = process.env.APP_PASSWORD;
  if (ownerPassword && sameSecret(given, ownerPassword)) match = OWNER;

  for (const account of parseUsers(process.env.APP_USERS)) {
    if (sameSecret(given, account.password) && match === null) match = account.name;
  }
  return match;
}

/**
 * Tên này còn hiệu lực không?
 *
 * Cookie sống 30 ngày, nên xoá một người khỏi `APP_USERS` phải làm phiên cũ
 * của họ chết theo NGAY - nếu chỉ kiểm tra chữ ký thì cookie đã phát vẫn
 * dùng được tiếp cả tháng sau khi bị gỡ quyền.
 */
export function knownUser(name: string): boolean {
  if (name === OWNER) return true;
  return parseUsers(process.env.APP_USERS).some((u) => u.name === name);
}

export function roleOf(name: string): Role {
  return name === OWNER ? 'owner' : 'member';
}

/**
 * Những đường chỉ chủ app được đi.
 *
 * Ba nhóm, mỗi nhóm một lý do khác nhau:
 *   - danh mục / P/L đã chốt / kiểm tra quyền Trader API: đây là tiền và vị
 *     thế thật của chủ app, đúng thứ cần giấu.
 *   - cảnh báo: đăng ký web push ở đây sẽ nhận thông báo về danh mục của
 *     CHỦ APP (put vào ITM, sizing vượt trần...) - rò rỉ đúng dữ liệu vừa
 *     giấu ở trên, chỉ qua một đường khác.
 *   - OAuth Schwab: người nhà mà bấm kết nối thì hoặc ghi đè token của chủ
 *     app, hoặc nối tài khoản Schwab của chính họ vào server này. Cả hai
 *     đều sai. `/api/auth/status` KHÔNG nằm đây - nó chỉ nói phiên còn hay
 *     hết, không lộ số nào, và Render dùng nó làm health check.
 */
const OWNER_ONLY = [
  '/api/positions',
  '/api/realized',
  '/api/trader-check',
  '/api/alerts',
  '/api/auth/login',
  '/api/auth/callback',
];

export function isOwnerOnly(pathname: string): boolean {
  return OWNER_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Ai đang gọi route này.
 *
 * Mặc định về `owner` khi thiếu header, vì chỉ có đúng một trường hợp thiếu:
 * `APP_PASSWORD` chưa đặt, tức máy ở nhà và cổng đang mở toang - lúc đó
 * không có ai khác để nhầm. Mọi request đi qua middleware với mật khẩu đã
 * đặt đều được gắn header thật.
 */
export function currentUser(req: { headers: { get(name: string): string | null } }): string {
  const raw = req.headers.get(USER_HEADER);
  return raw && isValidName(raw) ? raw : OWNER;
}
