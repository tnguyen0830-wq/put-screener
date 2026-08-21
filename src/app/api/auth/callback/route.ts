import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/schwab';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json(
      { error: 'Schwab did not return an authorization code.' },
      { status: 400 }
    );
  }
  try {
    await exchangeCode(code);
    return NextResponse.redirect(new URL('/?connected=1', req.nextUrl.origin));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
