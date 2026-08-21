import { NextRequest, NextResponse } from 'next/server';
import { readWatchlist, writeWatchlist } from '@/lib/watchlist';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ symbols: await readWatchlist() });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (!Array.isArray(body?.symbols)) {
    return NextResponse.json({ error: 'Cần mảng symbols' }, { status: 400 });
  }
  if (body.symbols.length > 200) {
    return NextResponse.json(
      { error: 'Watchlist tối đa 200 mã' },
      { status: 400 }
    );
  }
  return NextResponse.json({ symbols: await writeWatchlist(body.symbols) });
}
