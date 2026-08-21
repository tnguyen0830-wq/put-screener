import { NextRequest } from 'next/server';
import { putChain } from '@/lib/schwab';
import { jsonWithCors, corsOptionsResponse, errorResponse } from '@/lib/md-cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const expiration = req.nextUrl.searchParams.get('expiration'); // YYYY-MM-DD
  if (!symbol || !expiration) return errorResponse('Missing symbol or expiration', 400);

  try {
    const chain = await putChain(symbol, expiration, expiration);
    const map = chain?.putExpDateMap ?? {};
    const contracts: any[] = [];

    for (const expKey of Object.keys(map)) {
      if (expKey.split(':')[0] !== expiration) continue;
      for (const strikeKey of Object.keys(map[expKey])) {
        for (const c of map[expKey][strikeKey]) {
          contracts.push({
            optionSymbol: c.symbol,
            strike: c.strikePrice,
            bid: c.bid ?? 0,
            ask: c.ask ?? 0,
            mark: c.mark ?? 0,
            iv: (c.volatility ?? 0) / 100, // Schwab returns percent, e.g. 28.4
            delta: c.delta ?? 0, // negative for puts, matches standard convention
            gamma: c.gamma ?? 0,
            theta: c.theta ?? 0,
            vega: c.vega ?? 0,
            openInterest: c.openInterest ?? 0,
            volume: c.totalVolume ?? 0,
            dte: c.daysToExpiration ?? 0,
            inTheMoney: Boolean(c.inTheMoney),
          });
        }
      }
    }

    return jsonWithCors({ symbol, expiration, contracts });
  } catch (e: any) {
    const msg = String(e.message ?? e);
    return errorResponse(msg, msg.includes('REAUTH_REQUIRED') ? 401 : 500);
  }
}
