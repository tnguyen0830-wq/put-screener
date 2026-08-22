import { quotes } from '@/lib/schwab';

/**
 * Quotes for the scrolling market bar.
 *
 * Replaces the TradingView tape, which could not carry VIX at all on the free
 * tier - and VIX is the number this screener trades on. Schwab quotes it, live,
 * where the tape's equity prices were 15 minutes delayed.
 *
 * Not under /api/md/*, which is gated by MD_API_TOKEN for the phone app: the
 * browser holding this page has no token to send.
 */
export const dynamic = 'force-dynamic';

/**
 * Index symbols where Schwab has them, ETFs where it does not. An ETF's level
 * is its own, not the underlying's, so the label names the ETF rather than
 * quietly passing GLD off as the price of gold.
 */
const TAPE = [
  { symbol: '$VIX', title: 'VIX' },
  { symbol: '$SPX', title: 'S&P 500' },
  { symbol: 'QQQ', title: 'Nasdaq 100' },
  { symbol: 'IWM', title: 'Russell 2000' },
  { symbol: 'GLD', title: 'Vàng · GLD' },
  { symbol: 'USO', title: 'Dầu · USO' },
  { symbol: 'IBIT', title: 'Bitcoin · IBIT' },
];

export async function GET() {
  try {
    const q = await quotes(TAPE.map((t) => t.symbol));

    // A symbol Schwab will not quote is dropped rather than rendered blank.
    // The tape is glanceable context; a gap in it beats an error badge, which
    // is exactly what the widget this replaces used to show.
    const items = TAPE.map((t) => {
      const quote = q[t.symbol]?.quote;
      if (!quote?.lastPrice) return null;
      return {
        title: t.title,
        last: quote.lastPrice,
        change: quote.netChange ?? 0,
        changePercent: quote.netPercentChange ?? 0,
      };
    }).filter(Boolean);

    if (!items.length) {
      return Response.json({ error: 'No quotes available' }, { status: 502 });
    }
    return Response.json({ items });
  } catch (e: any) {
    const msg = String(e.message ?? e);
    return Response.json(
      { error: msg },
      { status: msg.includes('REAUTH_REQUIRED') ? 401 : 500 }
    );
  }
}
