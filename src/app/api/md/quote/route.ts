import { NextRequest } from 'next/server';
import { quotes } from '@/lib/schwab';
import { jsonWithCors, corsOptionsResponse, errorResponse } from '@/lib/md-cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) return errorResponse('Missing symbol', 400);

  try {
    const q = await quotes([symbol]);
    const row = q[symbol];
    if (!row?.quote) return errorResponse('No quote for symbol', 404);

    return jsonWithCors({
      symbol,
      price: row.quote.lastPrice ?? 0,
      change: row.quote.netChange ?? 0,
      changePercent: row.quote.netPercentChange ?? 0,
      volume: row.quote.totalVolume ?? 0,
      realtime: Boolean(row.realtime),
      quoteTime: row.quote.quoteTime ?? Date.now(),
    });
  } catch (e: any) {
    const msg = String(e.message ?? e);
    return errorResponse(msg, msg.includes('REAUTH_REQUIRED') ? 401 : 500);
  }
}
