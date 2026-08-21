import fs from 'node:fs/promises';
import path from 'node:path';

// Financial Modeling Prep - fills the fundamentals gap Schwab's Market
// Data API leaves (revenue/EPS growth, margins, ROE, ROIC, debt ratios,
// P/B, PEG, EV multiples, and now multi-year earnings/revenue/FCF
// volatility + 5-year average P/E). Starter plan: 300 calls/minute, up to
// 5 years of annual fundamentals, no bulk endpoints (checked the pricing
// comparison table - bulk is gated behind every listed tier, not just
// Free), so this is still per-symbol but no longer needs to ration a
// 250/day budget - a real per-minute rate limiter replaces the old daily
// spending cap.
//
//   - 24-hour disk cache per symbol (cheap re-runs the same day don't
//     re-spend calls; fundamentals don't move intraday anyway).
//   - RateLimiter caps at 280 req/min (20-call safety margin under the
//     plan's 300/min ceiling) instead of refusing to fetch once "used up".
//   - 4 calls per symbol when the cache is cold: financial-growth and
//     ratios pulled with limit=6 (one call each, six years of history -
//     same cost as limit=1, six times the data), plus key-metrics-ttm and
//     ratios-ttm for the current-period numbers.
//   - Serves a stale cache entry rather than nothing if a fetch throws,
//     and returns null (never a fabricated number) if there is neither a
//     fresh nor a stale entry yet.

const CACHE_DIR = path.resolve('./.cache/fmp');
const TTL_MS = 24 * 60 * 60 * 1000;
const YEARS_OF_HISTORY = 6;

export interface FmpFundamentals {
  revenueGrowth: number; // %, latest fiscal year
  earningsGrowth: number; // %, latest fiscal year
  freeCashFlowGrowth: number | null; // %, latest fiscal year
  grossMargin: number; // %, TTM
  operatingMargin: number; // %, TTM
  netMargin: number; // %, TTM
  roe: number; // %, TTM
  roic: number; // %, TTM
  netDebtToEbitda: number;
  currentRatio: number;
  interestCoverage: number;
  debtToEquity: number;
  priceToBook: number | null;
  peg: number | null;
  dividendYield: number | null; // %
  evToEbitda: number | null;
  evToRevenue: number | null;
  freeCashFlowMargin: number | null; // %, TTM
  peFiveYearAvg: number | null;
  earningsVolatilityScore: number; // 0-100, higher = more volatile, from real multi-year EPS growth dispersion
  revenueVolatilityScore: number; // 0-100, higher = more volatile, from real multi-year revenue growth dispersion
  fcfConsistencyScore: number; // 0-100, higher = more consistent, from real multi-year FCF growth dispersion
  yearsOfHistory: number;
  fetchedAt: string;
  stale: boolean;
}

function apiKey(): string | null {
  const k = process.env.FMP_API_KEY;
  return k && k.trim().length > 0 ? k.trim() : null;
}

async function readJsonSafe<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

// --- Rate limiting: Starter plan allows 300 requests/minute ---------------
class RateLimiter {
  private times: number[] = [];
  constructor(private max: number, private windowMs: number) {}
  async take() {
    for (;;) {
      const now = Date.now();
      this.times = this.times.filter((t) => now - t < this.windowMs);
      if (this.times.length < this.max) {
        this.times.push(now);
        return;
      }
      const wait = this.windowMs - (now - this.times[0]) + 25;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
const limiter = new RateLimiter(280, 60_000);

async function fetchFmp(url: string): Promise<any> {
  await limiter.take();
  const res = await fetch(url);
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    return fetchFmp(url);
  }
  if (!res.ok) throw new Error(`FMP ${res.status}: ${await res.text()}`);
  return res.json();
}

function pct(decimal: number | null | undefined): number {
  return typeof decimal === 'number' && isFinite(decimal) ? decimal * 100 : 0;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// Real multi-year growth-rate dispersion as a volatility/consistency
// signal - not invented, just descriptive statistics on FMP's own
// reported annual growth figures.
function volatilityScoreFromGrowthRates(rates: number[], band: number): number {
  if (rates.length < 2) return 50; // not enough history to say either way
  return Math.round(clamp((stdev(rates) / band) * 100, 0, 100));
}

export async function getFmpFundamentals(symbol: string): Promise<FmpFundamentals | null> {
  const key = apiKey();
  const cacheFile = path.join(CACHE_DIR, `${symbol.replace('/', '_')}.json`);
  const cached = await readJsonSafe<FmpFundamentals>(cacheFile);
  const fresh = cached && Date.now() - new Date(cached.fetchedAt).getTime() < TTL_MS;
  if (fresh) return { ...cached!, stale: false };
  if (!key) return cached ? { ...cached, stale: true } : null;

  try {
    const [growthYears, km, ratiosYears, ratiosTtm] = await Promise.all([
      fetchFmp(
        `https://financialmodelingprep.com/stable/financial-growth?symbol=${symbol}&limit=${YEARS_OF_HISTORY}&apikey=${key}`
      ),
      fetchFmp(`https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${symbol}&apikey=${key}`).then(
        (a) => (Array.isArray(a) ? a[0] : null)
      ),
      fetchFmp(
        `https://financialmodelingprep.com/stable/ratios?symbol=${symbol}&limit=${YEARS_OF_HISTORY}&apikey=${key}`
      ),
      fetchFmp(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${symbol}&apikey=${key}`).then((a) =>
        Array.isArray(a) ? a[0] : null
      ),
    ]);

    const g: any[] = Array.isArray(growthYears) ? growthYears : [];
    const rYears: any[] = Array.isArray(ratiosYears) ? ratiosYears : [];
    const latestGrowth = g[0] ?? null;
    if (!latestGrowth && !km && !rYears.length && !ratiosTtm) {
      return cached ? { ...cached, stale: true } : null;
    }

    const revenuePerShare = ratiosTtm?.revenuePerShareTTM ?? null;
    const fcfPerShare = ratiosTtm?.freeCashFlowPerShareTTM ?? null;
    const freeCashFlowMargin = revenuePerShare && fcfPerShare ? (fcfPerShare / revenuePerShare) * 100 : null;

    const epsGrowthRates = g.map((y) => y.epsgrowth).filter((v) => typeof v === 'number' && isFinite(v));
    const revenueGrowthRates = g.map((y) => y.revenueGrowth).filter((v) => typeof v === 'number' && isFinite(v));
    const fcfGrowthRates = g.map((y) => y.freeCashFlowGrowth).filter((v) => typeof v === 'number' && isFinite(v));

    const peValues = rYears
      .map((y) => y.priceToEarningsRatio)
      .filter((v) => typeof v === 'number' && isFinite(v) && v > 0);

    const data: FmpFundamentals = {
      revenueGrowth: pct(latestGrowth?.revenueGrowth),
      earningsGrowth: pct(latestGrowth?.epsgrowth),
      freeCashFlowGrowth: typeof latestGrowth?.freeCashFlowGrowth === 'number' ? pct(latestGrowth.freeCashFlowGrowth) : null,
      grossMargin: pct(ratiosTtm?.grossProfitMarginTTM),
      operatingMargin: pct(ratiosTtm?.operatingProfitMarginTTM),
      netMargin: pct(ratiosTtm?.netProfitMarginTTM),
      roe: pct(km?.returnOnEquityTTM),
      roic: pct(km?.returnOnInvestedCapitalTTM),
      netDebtToEbitda: km?.netDebtToEBITDATTM ?? 0,
      currentRatio: ratiosTtm?.currentRatioTTM ?? km?.currentRatioTTM ?? 0,
      interestCoverage: ratiosTtm?.interestCoverageRatioTTM ?? 0,
      debtToEquity: ratiosTtm?.debtToEquityRatioTTM ?? 0,
      priceToBook: ratiosTtm?.priceToBookRatioTTM ?? null,
      peg: ratiosTtm?.priceToEarningsGrowthRatioTTM ?? null,
      dividendYield: typeof ratiosTtm?.dividendYieldTTM === 'number' ? pct(ratiosTtm.dividendYieldTTM) : null,
      evToEbitda: km?.evToEBITDATTM ?? null,
      evToRevenue: km?.evToSalesTTM ?? null,
      freeCashFlowMargin,
      peFiveYearAvg: peValues.length ? round2(mean(peValues)) : null,
      // Bands: EPS growth realistically swings +/-40pp year to year even
      // for stable companies, revenue growth much less so, FCF growth
      // more than either - these set what counts as "0" vs "100" on the
      // volatility scale.
      earningsVolatilityScore: volatilityScoreFromGrowthRates(epsGrowthRates, 0.5),
      revenueVolatilityScore: volatilityScoreFromGrowthRates(revenueGrowthRates, 0.25),
      fcfConsistencyScore: 100 - volatilityScoreFromGrowthRates(fcfGrowthRates, 0.6),
      yearsOfHistory: g.length,
      fetchedAt: new Date().toISOString(),
      stale: false,
    };

    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(data));
    return data;
  } catch {
    // Never throw a hole in the scan over one symbol's enrichment - fall
    // back to whatever's cached (possibly nothing).
    return cached ? { ...cached, stale: true } : null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
