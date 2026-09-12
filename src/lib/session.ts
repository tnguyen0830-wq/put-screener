/**
 * Phiên đăng nhập của chính trang này.
 *
 * Trang chạy trên một URL công khai, và từ lúc có tab danh mục thì trên đó là
 * vị thế thật. Cookie cầm phiên phải được ký, nếu không ai cũng tự đặt cho
 * mình một cái.
 *
 * Cookie mang theo TÊN người đăng nhập (xem lib/users.ts): từ khi người nhà
 * có tài khoản riêng, "đã đăng nhập" không còn đủ - route còn phải biết là
 * AI đăng nhập, vì tab danh mục chỉ chủ app được xem. Tên nằm trong cookie
 * dưới dạng chữ thường nhìn thấy được, nhưng nằm TRONG phần được ký nên
 * không sửa được: đổi tên là chữ ký sai.
 *
 * Ký bằng Web Crypto chứ không phải node:crypto: middleware của Next chạy trong
 * môi trường Edge, ở đó không có node:crypto. Web Crypto có ở cả hai nơi.
 */

export const COOKIE = 'ps_session';

/** 30 ngày: đủ lâu để điện thoại không hỏi lại mỗi lần mở. */
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Phiên của người nhà ngắn hơn - 7 ngày.
 *
 * Không phải vì họ đáng ngờ hơn, mà vì cái chốt "xoá tài khoản là mất quyền
 * ngay" không còn đặt được ở middleware (Edge không đọc được file tài khoản,
 * xem users.ts). `requireUser()` chặn được mọi route biết danh tính, nhưng
 * các route dữ liệu thị trường thuần thì không - nên con số này là trần cho
 * việc một tài khoản đã xoá còn xem được bảng giá. Chủ app không cần trần
 * đó: không ai xoá được tài khoản chủ.
 */
export const MEMBER_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export const sessionMsFor = (role: 'owner' | 'member') =>
  role === 'owner' ? SESSION_MS : MEMBER_SESSION_MS;

const enc = new TextEncoder();

const b64url = (buf: ArrayBuffer) => {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Khoá ký.
 *
 * Mặc định là chính mật khẩu CHỦ APP (`APP_PASSWORD`), để chỉ phải đặt một
 * biến môi trường. Hệ quả có lợi: đổi mật khẩu chủ là mọi phiên cũ chết
 * theo, kể cả phiên của người nhà và phiên trên máy đã mất.
 *
 * Cố ý KHÔNG ký bằng mật khẩu của từng người: làm vậy thì chỉ cần một người
 * nhà đổi mật khẩu là phải tính lại khoá theo từng phiên, mà không đổi được
 * gì về mặt an toàn - chữ ký chỉ cần không giả được, không cần bí mật riêng
 * cho mỗi người.
 */
const secretOf = (password: string) => process.env.SESSION_SECRET || password;

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/**
 * Cookie có dạng `tên.hạn.chữ ký`. Không có gì bí mật bên trong, chỉ cần
 * không giả được.
 *
 * Tách được bằng dấu chấm vì cả ba phần đều không chứa dấu chấm: tên đi qua
 * `NAME_RE` ở users.ts (chỉ a-z0-9_-), hạn là số, và b64url đã thay `+/` bằng
 * `-_` rồi bỏ `=`.
 */
export async function signSession(password: string, user: string, expiresAt: number) {
  const key = await hmacKey(secretOf(password));
  const payload = `${user}|${expiresAt}`;
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${user}.${expiresAt}.${b64url(sig)}`;
}

/** So sánh không rò rỉ thời gian: dừng sớm ở ký tự khác nhau là lộ độ dài khớp. */
function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Trả về TÊN người đăng nhập, hay `null` nếu cookie thiếu/hết hạn/sai chữ ký.
 *
 * Trả tên chứ không phải true/false vì nơi gọi cần biết ai: cùng một cookie
 * hợp lệ, chủ app được vào `/api/positions` còn người nhà thì không.
 *
 * Cookie định dạng CŨ (`hạn.chữ ký`, hai phần) không còn hợp lệ - nó không
 * mang tên nên không thể biết chủ nhân là ai, và đoán là `owner` sẽ trao
 * quyền xem danh mục cho một cookie bất kỳ còn sót lại. Hệ quả: lần deploy
 * đầu tiên sau thay đổi này, mọi người phải đăng nhập lại đúng một lần.
 */
export async function verifySession(
  value: string | undefined,
  password: string
): Promise<string | null> {
  if (!value) return null;

  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [user, expText] = parts;
  if (!user) return null;

  const expiresAt = Number(expText);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  const expected = await signSession(password, user, expiresAt);
  return sameString(expected, value) ? user : null;
}

