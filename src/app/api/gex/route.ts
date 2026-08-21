import { NextRequest, NextResponse } from 'next/server';
import { fullChain } from '@/lib/schwab';
import { computeGex } from '@/lib/gex';

export const dynamic = 'force-dynamic';

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Thiếu tham số symbol' }, { status: 400 });
  }

  try {
    // Gamma concentrates in near expirations, so a 60-day window captures the
    // walls that actually matter without pulling LEAPS noise into the profile.
    const chain = await fullChain(symbol, addDays(0), addDays(60));
    const profile = computeGex(chain, symbol);
    if (!profile) {
      return NextResponse.json(
        { error: 'Chuỗi quyền chọn không đủ dữ liệu gamma' },
        { status: 404 }
      );
    }
    return NextResponse.json(profile);
  } catch (e: any) {
    const reauth = String(e.message).includes('REAUTH_REQUIRED');
    return NextResponse.json(
      { error: reauth ? 'Phiên Schwab hết hạn' : 'Không lấy được chuỗi quyền chọn' },
      { status: reauth ? 401 : 500 }
    );
  }
}
