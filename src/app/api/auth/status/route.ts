import { NextResponse } from 'next/server';
import { readTokens } from '@/lib/schwab';

export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = Boolean(
    process.env.SCHWAB_APP_KEY && process.env.SCHWAB_APP_SECRET
  );
  const t = await readTokens();
  if (!t) return NextResponse.json({ configured, connected: false });

  const msLeft = t.refresh_expires_at - Date.now();
  return NextResponse.json({
    configured,
    connected: msLeft > 0,
    refreshExpiresAt: t.refresh_expires_at,
    daysLeft: Math.max(0, msLeft / 86_400_000),
  });
}
