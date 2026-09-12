import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, sessionMsFor, signSession } from '@/lib/session';
import { authenticate } from '@/lib/userstore';

/**
 * Nhận tên + mật khẩu, phát phiên. Và thu lại khi đăng xuất.
 *
 * Tách khỏi /api/auth/login - chỗ đó đã là bước bắt đầu OAuth của Schwab, một
 * chuyện hoàn toàn khác.
 *
 * Ô TÊN là thay đổi so với #119, nơi chỉ có ô mật khẩu và danh tính suy ra
 * từ mật khẩu nào khớp. Cách cũ có một cái bẫy im lặng: hai người nhà vô
 * tình đặt trùng mật khẩu thì người sau đăng nhập thành người trước, không
 * có dấu hiệu gì trên màn hình.
 */
export const dynamic = 'force-dynamic';

/**
 * Chống dò mật khẩu.
 *
 * Một URL công khai thì sớm muộn cũng có bot thử. Đếm theo IP, quá số lần
 * thì khoá một lúc. Nhớ trong RAM là đủ: server khởi động lại thì bộ đếm
 * mất, nhưng bot cũng phải bắt đầu lại từ đầu.
 *
 * Đếm theo IP chứ không theo tên đăng nhập: đếm theo tên thì một người biết
 * tên "vo" có thể cố tình gõ sai vài lần để KHOÁ người đó ra khỏi app.
 */
const MAX_TRIES = 8;
const WINDOW_MS = 15 * 60 * 1000;
const tries = new Map<string, { n: number; until: number }>();

const clientIp = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  req.headers.get('x-real-ip') ||
  'unknown';

export async function POST(req: NextRequest) {
  if (!process.env.APP_PASSWORD) {
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
  const givenUser = typeof body?.username === 'string' ? body.username : '';
  const givenPass = typeof body?.password === 'string' ? body.password : '';

  const who = await authenticate(givenUser, givenPass);
  if (!who) {
    const next = rec && rec.until > now ? rec : { n: 0, until: now + WINDOW_MS };
    next.n += 1;
    tries.set(ip, next);
    // Một thông báo duy nhất cho cả tên sai lẫn mật khẩu sai: nói rõ cái nào
    // sai là nói cho người lạ biết tên nào có thật trên máy này.
    return NextResponse.json({ error: 'WRONG_LOGIN' }, { status: 401 });
  }

  tries.delete(ip);
  const expiresAt = now + sessionMsFor(who.role);
  const res = NextResponse.json({
    ok: true,
    expiresAt,
    user: who.name,
    role: who.role,
  });
  res.cookies.set(COOKIE, await signSession(process.env.APP_PASSWORD, who.name, expiresAt), {
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
