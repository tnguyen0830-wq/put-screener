import { NextResponse } from 'next/server';
import { readTokens } from '@/lib/schwab';

export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = Boolean(
    process.env.SCHWAB_APP_KEY && process.env.SCHWAB_APP_SECRET
  );
  // Trang này mở được khi chưa đăng nhập (Render dùng nó làm health check), nên
  // nó chỉ nói phiên Schwab còn hay hết và trang đã khoá hay chưa - không một
  // con số tài khoản nào. `locked` để giao diện cảnh báo khi bản deploy quên
  // đặt mật khẩu, thay vì để trang mở toang mà không ai biết.
  const locked = Boolean(process.env.APP_PASSWORD);
  const t = await readTokens();
  if (!t) return NextResponse.json({ configured, connected: false, locked });

  const msLeft = t.refresh_expires_at - Date.now();
  return NextResponse.json({
    configured,
    locked,
    connected: msLeft > 0,
    refreshExpiresAt: t.refresh_expires_at,
    daysLeft: Math.max(0, msLeft / 86_400_000),
  });
}
