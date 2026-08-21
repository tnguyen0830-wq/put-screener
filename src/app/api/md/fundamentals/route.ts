import { NextRequest } from 'next/server';
import { quotes } from '@/lib/schwab';
import { getFmpFundamentals } from '@/lib/md-fmp';
import { jsonWithCors, corsOptionsResponse, errorResponse } from '@/lib/md-cors';

export const dynamic = 'force-dynamic';

// Schwab's Market Data API only publishes a thin fundamental block (no
// revenue/margin/ROE/ROIC/debt ratios - that data simply is not in the
// payload). Financial Modeling Prep fills the rest in (see
// src/lib/md-fmp.ts for its cache/budget rules). `fmp: null` means neither
// a fresh nor a stale FMP entry exists yet for this symbol - the mobile
// app must not invent numbers for those fields when that happens.
export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) return errorResponse('Missing symbol', 400);

  try {
    const [q, fmp] = await Promise.all([quotes([symbol]), getFmpFundamentals(symbol)]);
    const row = q[symbol];
    if (!row) return errorResponse('No data for symbol', 404);

    const f = row.fundamental ?? {};
    const price = row.quote?.lastPrice ?? 0;
    const shares = f.sharesOutstanding ?? null;

    return jsonWithCors({
      symbol,
      pe: typeof f.peRatio === 'number' && f.peRatio > 0 ? f.peRatio : null,
      eps: typeof f.eps === 'number' ? f.eps : null,
      dividendYield: typeof f.divYield === 'number' ? f.divYield : null,
      sharesOutstanding: shares,
      marketCap: shares ? price * shares : null,
      lastEarningsDate: f.lastEarningsDate ?? null,
      week52High: row.quote?.['52WeekHigh'] ?? null,
      week52Low: row.quote?.['52WeekLow'] ?? null,
      fmp,
    });
  } catch (e: any) {
    const msg = String(e.message ?? e);
    return errorResponse(msg, msg.includes('REAUTH_REQUIRED') ? 401 : 500);
  }
}
