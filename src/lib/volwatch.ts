import { fullChain } from './schwab';
import {
  flattenPuts,
  flattenCalls,
  termStructureAndSkew,
  termSkewWindow,
  recordSkew,
  flushSkewSnapshots,
  skewZScore,
} from './screener';

/**
 * Term structure and put skew for positions already open, rather than for
 * candidates being screened.
 *
 * The screener computes both while it already has a chain in hand. My
 * Portfolio does not: it prices positions from one cheap /quotes call for
 * the whole account, so reading the vol surface means one extra chain
 * request per held symbol. That is why this is cached and refreshed on its
 * own clock instead of following the panel's 60-second price refresh:
 *
 *   - Prices move second to second and cost one shared request. 60s.
 *   - The shape of the vol surface does not, and costs one request per
 *     symbol. 15 minutes, so eight positions cost 32 requests an hour
 *     rather than 480 - well clear of Schwab's shared 100/min ceiling.
 *
 * Reads are served from cache immediately, even when stale, and a refresh
 * is kicked off in the background. The portfolio page stays as fast as it
 * was; the numbers appear on a later poll. This app runs as a long-lived
 * Node process on Render, so a floating promise really does finish.
 */

const TTL_MS = 15 * 60_000;

export type VolWatch = {
  symbol: string;
  /** IV60 / IV30. Below 0.95 (backwardation) means a near-term event is priced in. */
  tsSlope: number | null;
  /** IV(25d put) - IV(25d call). Raw reading, always available. */
  skew: number | null;
  /** Skew against its own trailing history. Null until ~60 daily snapshots exist. */
  skewZ: number | null;
  backwardation: boolean;
  skewElevated: boolean;
  /** When this reading was taken (epoch ms), so the UI can admit to being stale. */
  at: number;
};

type Entry = { at: number; value: VolWatch | null; error: string | null };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();

/** Same thresholds the screener's hard gates use - one rulebook, not two. */
export const BACKWARDATION_BELOW = 0.95;
export const SKEW_Z_ABOVE = 2;

async function compute(symbol: string): Promise<VolWatch> {
  const { from, to } = termSkewWindow();
  const chain = await fullChain(symbol, from, to);
  const spot =
    chain?.underlyingPrice ?? chain?.underlying?.last ?? chain?.underlying?.mark;
  if (!spot) throw new Error(`Không đọc được giá cơ sở cho ${symbol}`);

  const { tsSlope, skew } = termStructureAndSkew(
    flattenPuts(chain),
    flattenCalls(chain),
    spot
  );

  // Positions held are exactly the symbols worth having history for, and
  // they may never appear in a scan - so record here too. recordSkew is
  // once-per-symbol-per-day, so repeated 15-minute refreshes cost nothing.
  if (skew !== null) {
    await recordSkew(symbol, skew);
    await flushSkewSnapshots();
  }
  const skewZ = skew !== null ? await skewZScore(symbol, skew) : null;

  return {
    symbol,
    tsSlope,
    skew,
    skewZ,
    // A missing reading is not an alert: null passes, exactly as the
    // screener's gates treat a data gap.
    backwardation: tsSlope !== null && tsSlope < BACKWARDATION_BELOW,
    skewElevated: skewZ !== null && skewZ > SKEW_Z_ABOVE,
    at: Date.now(),
  };
}

function refresh(symbol: string): Promise<void> {
  const running = inflight.get(symbol);
  if (running) return running;

  const p = compute(symbol)
    .then((value) => {
      cache.set(symbol, { at: Date.now(), value, error: null });
    })
    .catch((e: any) => {
      // Keep the last good reading rather than blanking it: a rate-limited
      // refresh should not erase a number that was true 15 minutes ago.
      const prev = cache.get(symbol);
      cache.set(symbol, {
        at: Date.now(),
        value: prev?.value ?? null,
        error: String(e?.message ?? e),
      });
    })
    .finally(() => {
      inflight.delete(symbol);
    });

  inflight.set(symbol, p);
  return p;
}

export type VolWatchResult = {
  bySymbol: Record<string, VolWatch>;
  /** Symbols whose refresh failed, with the real error - not swallowed. */
  errors: Record<string, string>;
  /** True while at least one symbol has never produced a reading yet. */
  warmingUp: boolean;
};

/**
 * Read what is cached now and start refreshing anything stale. Never waits
 * on the network, so the caller's response time is unchanged.
 */
export function readVolWatch(symbols: string[]): VolWatchResult {
  const bySymbol: Record<string, VolWatch> = {};
  const errors: Record<string, string> = {};
  let warmingUp = false;

  for (const symbol of [...new Set(symbols)]) {
    const hit = cache.get(symbol);
    if (hit?.value) bySymbol[symbol] = hit.value;
    else warmingUp = true;
    if (hit?.error) errors[symbol] = hit.error;

    if (!hit || Date.now() - hit.at > TTL_MS) void refresh(symbol);
  }

  return { bySymbol, errors, warmingUp };
}

/** Test seam: drop cached state so a test starts from cold. */
export function __resetVolWatch() {
  cache.clear();
  inflight.clear();
}
