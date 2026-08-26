import fs from 'node:fs/promises';
import path from 'node:path';
import { historyBars } from './history';

/**
 * Position sizing / cluster exposure, PART 5.8 of the Smart Money spec -
 * called there "the most important part of the whole system": no amount of
 * a good screener protects an account that gets wiped out by one
 * assignment. Four fixed limits, all measured against total account value:
 *
 *   - max 5% assignment exposure in any one symbol
 *   - max 20% assignment exposure in any one sector
 *   - max 50% of the account cash-secured in total
 *   - max 30% "cluster exposure" - correlation-adjusted concentration
 *
 * The first three read straight off My Portfolio's already-synced data, no
 * extra Schwab calls. Cluster exposure is the one genuinely new piece: it
 * needs 60 days of daily price history per held symbol to compute pairwise
 * correlation, reusing the exact cache screener.ts's scan already writes to
 * (@/lib/history) so most positions cost zero extra requests.
 */

export const LIMITS = {
  perSymbolPct: 5,
  perSectorPct: 20,
  totalCollateralPct: 50,
  clusterPct: 30,
};

export type SymbolExposure = {
  symbol: string;
  collateral: number;
  pct: number | null; // null when accountValue is unknown
  overLimit: boolean;
};

export type SectorExposure = {
  sector: string;
  collateral: number;
  pct: number | null;
  overLimit: boolean;
};

export type ClusterPair = {
  a: string;
  b: string;
  corr: number;
  /** sqrt(collateral_a * collateral_b) * corr, this pair's share of the cluster total. */
  contribution: number;
};

export type PositionSizing = {
  accountValue: number | null;
  totalCollateral: number;
  totalCollateralPct: number | null;
  totalCollateralOverLimit: boolean;
  bySymbol: SymbolExposure[];
  bySector: SectorExposure[];
  /**
   * ClusterExposure per the spec's own formula, "Σ(assignment value ×
   * pairwise correlation 60d)", is ambiguous about what's being summed -
   * read literally it double-counts and has no natural upper bound. The
   * interpretation here: for every pair of distinct held symbols,
   * sqrt(collateral_a * collateral_b) * corr_ab (geometric mean of the two
   * position sizes, weighted by how correlated they are), summed over all
   * pairs and divided by account value. Two fully-correlated $10k
   * positions contribute $10k - read as "these two behave like one extra
   * position their combined size," which is what the limit is trying to
   * catch. Negative correlation is kept signed (a hedge should not count
   * against you), not floored at zero.
   */
  clusterExposurePct: number | null;
  clusterOverLimit: boolean;
  clusterPairs: ClusterPair[]; // sorted by |contribution| descending
  /** Symbols without enough daily history (60 sessions) to enter the correlation calc. */
  clusterDataGap: string[];
  limits: typeof LIMITS;
};

let sectorMapCache: Record<string, string> | null = null;

async function sectorOf(symbol: string): Promise<string> {
  if (!sectorMapCache) {
    try {
      const raw = await fs.readFile(
        path.resolve(process.cwd(), 'data/sp500.json'),
        'utf8'
      );
      const list: { symbol: string; sector: string }[] = JSON.parse(raw);
      sectorMapCache = Object.fromEntries(list.map((c) => [c.symbol, c.sector]));
    } catch {
      sectorMapCache = {};
    }
  }
  // Held symbols outside the S&P 500 (or any watchlist-only ticker) have no
  // sector on file - their own bucket, not silently merged into another
  // sector or dropped from the per-sector check.
  return sectorMapCache[symbol] ?? 'Không rõ ngành';
}

/** Trailing log returns over the last n sessions, most recent last. */
export function logReturns(bars: { close: number }[], n: number): number[] | null {
  if (bars.length < n + 1) return null;
  const slice = bars.slice(-(n + 1));
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    rets.push(Math.log(slice[i].close / slice[i - 1].close));
  }
  return rets;
}

export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0,
    varA = 0,
    varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA <= 0 || varB <= 0) return null;
  return cov / Math.sqrt(varA * varB);
}

export async function computePositionSizing(
  putRows: { symbol: string; collateral: number }[],
  accountValue: number | null
): Promise<PositionSizing> {
  const pct = (v: number) =>
    accountValue && accountValue > 0 ? (v / accountValue) * 100 : null;

  const bySymbolMap = new Map<string, number>();
  for (const r of putRows)
    bySymbolMap.set(r.symbol, (bySymbolMap.get(r.symbol) ?? 0) + r.collateral);

  const bySymbol: SymbolExposure[] = await Promise.all(
    [...bySymbolMap.entries()].map(async ([symbol, collateral]) => {
      const p = pct(collateral);
      return { symbol, collateral, pct: p, overLimit: p !== null && p > LIMITS.perSymbolPct };
    })
  );
  bySymbol.sort((a, b) => b.collateral - a.collateral);

  const bySectorMap = new Map<string, number>();
  for (const [symbol, collateral] of bySymbolMap) {
    const sector = await sectorOf(symbol);
    bySectorMap.set(sector, (bySectorMap.get(sector) ?? 0) + collateral);
  }
  const bySector: SectorExposure[] = [...bySectorMap.entries()]
    .map(([sector, collateral]) => {
      const p = pct(collateral);
      return { sector, collateral, pct: p, overLimit: p !== null && p > LIMITS.perSectorPct };
    })
    .sort((a, b) => b.collateral - a.collateral);

  const totalCollateral = [...bySymbolMap.values()].reduce((s, v) => s + v, 0);
  const totalCollateralPct = pct(totalCollateral);

  // Cluster exposure: pairwise correlation over 60 sessions of daily
  // returns, one history fetch per unique symbol (cached, so free on any
  // symbol the scan already pulled today).
  const symbols = [...bySymbolMap.keys()];
  const returns = new Map<string, number[]>();
  const clusterDataGap: string[] = [];
  for (const symbol of symbols) {
    try {
      const bars = await historyBars(symbol);
      const rets = logReturns(bars, 60);
      if (rets) returns.set(symbol, rets);
      else clusterDataGap.push(symbol);
    } catch {
      clusterDataGap.push(symbol);
    }
  }

  const clusterPairs: ClusterPair[] = [];
  let clusterTotal = 0;
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const a = symbols[i];
      const b = symbols[j];
      const ra = returns.get(a);
      const rb = returns.get(b);
      if (!ra || !rb) continue;
      const corr = pearson(ra, rb);
      if (corr === null) continue;
      const collA = bySymbolMap.get(a)!;
      const collB = bySymbolMap.get(b)!;
      const contribution = Math.sqrt(collA * collB) * corr;
      clusterPairs.push({ a, b, corr, contribution });
      clusterTotal += contribution;
    }
  }
  clusterPairs.sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));

  const clusterExposurePct = symbols.length < 2 ? null : pct(clusterTotal);

  return {
    accountValue,
    totalCollateral,
    totalCollateralPct,
    totalCollateralOverLimit:
      totalCollateralPct !== null && totalCollateralPct > LIMITS.totalCollateralPct,
    bySymbol,
    bySector,
    clusterExposurePct,
    clusterOverLimit: clusterExposurePct !== null && clusterExposurePct > LIMITS.clusterPct,
    clusterPairs,
    clusterDataGap,
    limits: LIMITS,
  };
}
