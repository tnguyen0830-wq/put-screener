/**
 * Phiên đăng nhập của chính trang này.
 *
 * Trang chạy trên một URL công khai, và từ lúc có tab danh mục thì trên đó là
 * vị thế thật. Một mật khẩu duy nhất là đủ cho một người dùng - nhưng cái cookie
 * cầm phiên phải được ký, nếu không ai cũng tự đặt cho mình một cái.
 *
 * Ký bằng Web Crypto chứ không phải node:crypto: middleware của Next chạy trong
 * môi trường Edge, ở đó không có node:crypto. Web Crypto có ở cả hai nơi.
 */

export const COOKIE = 'ps_session';

/** 30 ngày: đủ lâu để điện thoại không hỏi lại mỗi lần mở. */
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

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
 * Mặc định là chính mật khẩu, để chỉ phải đặt một biến môi trường. Hệ quả có
 * lợi: đổi mật khẩu là mọi phiên cũ chết theo, kể cả phiên trên máy đã mất.
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

/** Cookie có dạng `hạn.chữ ký`. Không có gì bí mật bên trong, chỉ cần không giả được. */
export async function signSession(password: string, expiresAt: number) {
  const key = await hmacKey(secretOf(password));
  const payload = String(expiresAt);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

/** So sánh không rò rỉ thời gian: dừng sớm ở ký tự khác nhau là lộ độ dài khớp. */
function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySession(
  value: string | undefined,
  password: string
): Promise<boolean> {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return false;

  const expiresAt = Number(value.slice(0, dot));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = await signSession(password, expiresAt);
  return sameString(expected, value);
}

/** Dùng cho cả lúc so mật khẩu, để đoán đúng/sai không đo được bằng đồng hồ. */
export const sameSecret = sameString;
