import { NextRequest, NextResponse } from 'next/server';
import { readScan } from '@/lib/scan-store';
import type { Universe } from '@/lib/types';

/** Kết quả quét gần nhất của một phạm vi, để mở lại app là có ngay. */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('universe');
  const universe: Universe = u === 'watchlist' ? 'watchlist' : 'sp500';
  try {
    return NextResponse.json({ scan: await readScan(universe) });
  } catch (e: any) {
    // Không đọc được thì nói ra, đừng để giao diện tưởng là "chưa quét lần nào".
    return NextResponse.json(
      { scan: null, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
