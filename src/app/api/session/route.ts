import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, SESSION_MS, sameSecret, signSession } from '@/lib/session';

/**
 * Nhận mật khẩu, phát phiên. Và thu lại khi đăng xuất.
 *
 * Tách khỏi /api/auth/login - chỗ đó đã là bước bắt đầu OAuth của Schwab, một
 * chuyện hoàn toàn khác.
 */
export const dynamic = 'force-dynamic';

/**
 * Chống dò mật khẩu.
 *
 * Một mật khẩu duy nhất trên một URL công khai thì sớm muộn cũng có bot thử.
 * Đếm theo IP, quá số lần thì khoá một lúc. Nhớ trong RAM là đủ: server khởi
 * động lại thì bộ đếm mất, nhưng bot cũng phải bắt đầu lại từ đầu.
 */
const MAX_TRIES = 8;
const WINDOW_MS = 15 * 60 * 1000;
const tries = new Map<string, { n: number; until: number }>();

const clientIp = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  req.headers.get('x-real-ip') ||
  'unknown';

export async function POST(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    // Chưa đặt mật khẩu thì không có gì để đăng nhập, và cũng không có gì được
    // gác. Nói thẳng thay vì phát ra một phiên vô nghĩa.
    return NextResponse.json({ error: 'NO_PASSWORD_SET' }, { status: 400 });
  }

  const ip = clientIp(req);
  const now = Date.now();
  const rec = tries.get(ip);
  if (rec && rec.until > now && rec.n >= MAX_TRIES) {
    return NextResponse.json(
      { error: 'TOO_MANY_TRIES', retryInSec: Math.ceil((rec.until - now) / 1000) },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const given = typeof body?.password === 'string' ? body.password : '';

  if (!sameSecret(given, password)) {
    const next = rec && rec.until > now ? rec : { n: 0, until: now + WINDOW_MS };
    next.n += 1;
    tries.set(ip, next);
    return NextResponse.json({ error: 'WRONG_PASSWORD' }, { status: 401 });
  }

  tries.delete(ip);
  const expiresAt = now + SESSION_MS;
  const res = NextResponse.json({ ok: true, expiresAt });
  res.cookies.set(COOKIE, await signSession(password, expiresAt), {
    httpOnly: true,
    sameSite: 'lax',
    // Trên máy nhà chạy http thì cookie secure sẽ không bao giờ được gửi đi.
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    expires: new Date(expiresAt),
  });
  return res;
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 0,
  });
  return res;
}
