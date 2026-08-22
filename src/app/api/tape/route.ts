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
 * Futures month codes, in calendar order: Jan is F, Dec is Z.
 *
 * Schwab would not quote the bare roots /GC, /CL or /BTC - the bar showed four
 * rows instead of seven and named all three in `missing`. Its futures symbols
 * carry a delivery month and a two digit year, so a row asks for the root first
 * (in case that ever starts working) and then for each of the coming months
 * until one answers.
 */
const MONTH_CODES = 'FGHJKMNQUVXZ';

/** The next `count` delivery months for a root, nearest first: /GC -> /GCU26. */
const contracts = (root: string, count = 14) => {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push(
      `${root}${MONTH_CODES[d.getUTCMonth()]}${String(d.getUTCFullYear() % 100).padStart(2, '0')}`
    );
  }
  return out;
};

/**
 * What the bar shows, and what to ask Schwab for.
 *
 * One instrument per row, no ETF stand-ins: the bar names the instrument it is
 * actually quoting, so nothing on it can be mistaken for something it is not.
 * That rule is why a futures row lists only slash-prefixed symbols - an
 * unprefixed "GC" could quote some unrelated equity, and a wrong number under
 * the right name is worse than a missing row.
 *
 * A row nothing answers for drops out rather than being filled with a proxy,
 * and every symbol it tried is named in the response's `missing`.
 *
 * Futures take a leading slash and indices a dollar sign - Schwab needs both,
 * and neither belongs on screen.
 */
const TAPE: { key: string; label: string; candidates: string[] }[] = [
  { key: 'spx', label: 'SPX', candidates: ['$SPX'] },
  { key: 'ndx', label: 'NDX', candidates: ['$NDX'] },
  { key: 'rut', label: 'IWM', candidates: ['IWM'] },
  { key: 'vix', label: 'VIX', candidates: ['$VIX'] },
  { key: 'gold', label: 'GC', candidates: ['/GC', ...contracts('/GC')] },
  { key: 'oil', label: 'CL', candidates: ['/CL', ...contracts('/CL')] },
  { key: 'btc', label: 'BTC', candidates: ['/BTC', ...contracts('/BTC')] },
];

/**
 * Which contract answered last time, per row.
 *
 * Without this every poll would ask for fifteen dead contract months per
 * futures row, once a minute, forever. Once a row resolves, later polls ask for
 * that one symbol; when it stops quoting - the contract rolled - the row falls
 * back to the full list on the next poll and settles on the new front month.
 */
const resolved = new Map<string, string>();

/** Futures and index symbols carry a prefix Schwab needs but nobody reads. */
const display = (symbol: string) => symbol.replace(/^[$/]/, '');

const priced = (q: Record<string, any>, symbol: string) => {
  const quote = q[symbol]?.quote;
  return quote?.lastPrice ? quote : null;
};

export async function GET() {
  try {
    // Ask for the known-good symbol where there is one, the whole candidate
    // list where there is not. One /quotes call either way.
    const ask = (full: boolean) =>
      TAPE.flatMap((t) =>
        !full && resolved.has(t.key) ? [resolved.get(t.key)!] : t.candidates
      );

    let full = TAPE.some((t) => !resolved.has(t.key));
    let q = await quotes(ask(full));

    // A resolved contract that stopped quoting has rolled. Forget it and ask
    // once more with everything, so the row recovers in this response rather
    // than blinking out for a minute.
    if (!full) {
      let rolled = false;
      for (const t of TAPE) {
        const s = resolved.get(t.key);
        if (s && !priced(q, s)) {
          resolved.delete(t.key);
          rolled = true;
        }
      }
      if (rolled) {
        full = true;
        q = await quotes(ask(true));
      }
    }

    // A row nothing answers for is dropped rather than rendered blank: the tape
    // is glanceable context, and a gap in it beats a slot showing an error.
    const missing: string[] = [];
    const items = TAPE.map((t) => {
      for (const symbol of t.candidates) {
        const quote = priced(q, symbol);
        if (quote) {
          resolved.set(t.key, symbol);
          return {
            key: t.key,
            // The row's own name, not the contract's: the bar says GC whether
            // Schwab answered on /GC or on /GCZ26.
            symbol: t.label || display(symbol),
            // Which contract that price actually came from, for the tooltip and
            // for anyone reading this endpoint directly.
            contract: display(symbol),
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
    // Schwab refused, and `schwabErrors` carries Schwab's own explanation -
    // an invalid symbol and an unentitled one need opposite fixes.
    return Response.json({ items, missing, schwabErrors: (q as any).errors ?? null });
  } catch (e: any) {
    const msg = String(e.message ?? e);
    return Response.json(
      { error: msg },
      { status: msg.includes('REAUTH_REQUIRED') ? 401 : 500 }
    );
  }
}
