/**
 * CNN's Fear & Greed Index.
 *
 * Proxied through the server rather than fetched from the page: CNN's dataviz
 * host sends no CORS headers, so a browser request is blocked, and the browser
 * would also have to carry a spoofed user agent.
 *
 * Not under /api/md/*, which MD_API_TOKEN gates for the phone app.
 */
export const dynamic = 'force-dynamic';

const SOURCE = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

/** CNN rejects requests that do not look like a browser. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * The index moves a few times a day at most, so a short cache keeps a page
 * refresh from hammering a host that is being used unofficially in the first
 * place.
 */
const TTL_MS = 30 * 60 * 1000;
let cache: { at: number; body: unknown } | null = null;

const numOrNull = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return Response.json(cache.body);
  }

  let raw: any;
  try {
    const res = await fetch(SOURCE, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      return Response.json(
        { error: 'FG_UPSTREAM', status: res.status },
        { status: 502 }
      );
    }
    raw = await res.json();
  } catch (e: any) {
    return Response.json(
      { error: 'FG_UNREACHABLE', detail: String(e?.message ?? e) },
      { status: 502 }
    );
  }

  const now = raw?.fear_and_greed;
  const hist = raw?.fear_and_greed_historical?.data;

  // This endpoint is undocumented and could not be inspected from the build
  // environment, so a shape mismatch reports what actually came back instead of
  // failing blank. One look at this response names the real field paths.
  if (!now || typeof now.score !== 'number') {
    return Response.json(
      {
        error: 'FG_SHAPE',
        topLevelKeys: raw && typeof raw === 'object' ? Object.keys(raw) : null,
        fearAndGreedKeys:
          now && typeof now === 'object' ? Object.keys(now) : null,
      },
      { status: 502 }
    );
  }

  const body = {
    score: now.score,
    rating: typeof now.rating === 'string' ? now.rating : null,
    previousClose: numOrNull(now.previous_close),
    weekAgo: numOrNull(now.previous_1_week),
    monthAgo: numOrNull(now.previous_1_month),
    yearAgo: numOrNull(now.previous_1_year),
    // [timestamp ms, score] pairs, oldest first. Sent as tuples rather than
    // objects because a year of daily points is most of the payload.
    history: Array.isArray(hist)
      ? hist
          .filter((d: any) => typeof d?.x === 'number' && typeof d?.y === 'number')
          .map((d: any) => [d.x, d.y] as [number, number])
      : [],
  };

  cache = { at: Date.now(), body };
  return Response.json(body);
}
