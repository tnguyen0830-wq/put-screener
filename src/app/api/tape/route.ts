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
 * One symbol per row, no ETF stand-ins: the bar names the instrument it is
 * actually quoting, so nothing on it can be mistaken for something it is not.
 * A row Schwab will not quote drops out rather than being filled with a proxy,
 * and the symbols it tried are named in the response's `missing`.
 *
 * Futures take a leading slash and indices a dollar sign - Schwab needs both,
 * and neither belongs on screen.
 */
const TAPE: { key: string; candidates: string[] }[] = [
  { key: 'spx', candidates: ['$SPX'] },
  { key: 'ndx', candidates: ['$NDX'] },
  { key: 'rut', candidates: ['IWM'] },
  { key: 'vix', candidates: ['$VIX'] },
  { key: 'gold', candidates: ['/GC'] },
  { key: 'oil', candidates: ['/CL'] },
  { key: 'btc', candidates: ['/BTC'] },
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
