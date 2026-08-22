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
 * What the bar shows, and what to ask Schwab for.
 *
 * Each row lists candidates in order of preference and the first one Schwab
 * actually quotes wins. Futures and index symbols could not be tried against a
 * live Schwab session from the build environment, so rather than betting the
 * row on an unverified symbol, each falls back to the ETF that stood there
 * before. The label reports whichever symbol answered - if gold ends up on GLD
 * the bar says GLD, never GC.
 */
const TAPE: { key: string; candidates: string[] }[] = [
  { key: 'spx', candidates: ['$SPX'] },
  { key: 'ndx', candidates: ['$NDX', 'QQQ'] },
  { key: 'rut', candidates: ['IWM'] },
  { key: 'vix', candidates: ['$VIX'] },
  { key: 'gold', candidates: ['/GC', 'GLD'] },
  { key: 'oil', candidates: ['/CL', 'USO'] },
  { key: 'btc', candidates: ['/BTC', 'IBIT'] },
];

/** Futures and index symbols carry a prefix Schwab needs but nobody reads. */
const display = (symbol: string) => symbol.replace(/^[$/]/, '');

export async function GET() {
  try {
    const q = await quotes(TAPE.flatMap((t) => t.candidates));

    // A row Schwab will not quote at all is dropped rather than rendered
    // blank: the tape is glanceable context, and a gap in it beats a slot
    // showing an error.
    const missing: string[] = [];
    const items = TAPE.map((t) => {
      for (const symbol of t.candidates) {
        const quote = q[symbol]?.quote;
        if (quote?.lastPrice) {
          return {
            key: t.key,
            symbol: display(symbol),
            last: quote.lastPrice,
            change: quote.netChange ?? 0,
            changePercent: quote.netPercentChange ?? 0,
          };
        }
      }
      missing.push(t.candidates.join(' / '));
      return null;
    }).filter(Boolean);

    if (!items.length) {
      return Response.json({ error: 'No quotes available', missing }, { status: 502 });
    }
    // `missing` rides along so one look at this endpoint names any symbol
    // Schwab refused, instead of leaving a silent gap to be guessed at.
    return Response.json({ items, missing });
  } catch (e: any) {
    const msg = String(e.message ?? e);
    return Response.json(
      { error: msg },
      { status: msg.includes('REAUTH_REQUIRED') ? 401 : 500 }
    );
  }
}
