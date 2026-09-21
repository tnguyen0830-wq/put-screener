import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/userstore';
import { normalizeSymbol } from '@/lib/watchlist';
import { symbolPatterns } from '@/lib/patternscan';

/**
 * Nến + mẫu hình + vùng của MỘT mã, để vẽ biểu đồ. Cùng `symbolPatterns()`
 * với route quét nên bảng và biểu đồ không bao giờ nói hai điều khác nhau
 * về cùng một mã.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });
  const raw = req.nextUrl.searchParams.get('symbol') ?? '';
  const symbol = normalizeSymbol(raw);
  if (!/^[A-Z$][A-Z0-9/.$]{0,9}$/.test(symbol)) {
    return NextResponse.json({ error: 'BAD_SYMBOL' }, { status: 400 });
  }
  try {
    const r = await symbolPatterns(symbol);
    if (!r.row.bars) return NextResponse.json({ error: 'NO_HISTORY', symbol }, { status: 404 });
    return NextResponse.json({ symbol, ...r });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('REAUTH_REQUIRED')) return NextResponse.json({ error: 'REAUTH_REQUIRED' }, { status: 401 });
    return NextResponse.json({ error: 'FAILED', detail: msg.slice(0, 300) }, { status: 502 });
  }
}
