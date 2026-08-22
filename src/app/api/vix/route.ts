import { quotes } from '@/lib/schwab';

/**
 * VIX for the header chip.
 *
 * Deliberately not under /api/md/*: those routes are gated by MD_API_TOKEN for
 * the phone app (src/middleware.ts), and the browser holding this page has no
 * token to send. Same underlying quote as /api/md/volatility, reachable from
 * the web screener that shares this server.
 *
 * Schwab rather than the TradingView tape because the tape does not serve VIX
 * at all on the free tier, and because Schwab's number is live where the tape's
 * equity quotes are delayed - and the level, not the direction, is what decides
 * whether selling puts pays today.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const q = await quotes(['$VIX']);
    const vix = q['$VIX']?.quote;
    if (!vix?.lastPrice) {
      return Response.json({ error: 'VIX unavailable' }, { status: 502 });
    }
    return Response.json({
      last: vix.lastPrice,
      change: vix.netChange ?? 0,
      changePercent: vix.netPercentChange ?? 0,
    });
  } catch (e: any) {
    const msg = String(e.message ?? e);
    return Response.json(
      { error: msg },
      { status: msg.includes('REAUTH_REQUIRED') ? 401 : 500 }
    );
  }
}
