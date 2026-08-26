import fs from 'node:fs/promises';
import path from 'node:path';
import { isOn, type Candidate, type Filters, type ScoreBreakdown } from './types';

/* ---------------- price-history math ---------------- */

export type Bar = { datetime: number; close: number };

export function sma(bars: Bar[], n: number): number | null {
  if (bars.length < n) return null;
  const slice = bars.slice(-n);
  return slice.reduce((s, b) => s + b.close, 0) / n;
}

/** Percent price change from n sessions ago to the most recent close. */
export function changePct(bars: Bar[], n: number): number | null {
  if (bars.length < n + 1) return null;
  const now = bars[bars.length - 1].close;
  const then = bars[bars.length - 1 - n].close;
  if (then <= 0) return null;
  return ((now - then) / then) * 100;
}

/** Annualized close-to-close realized volatility over the last n sessions. */
export function realizedVol(bars: Bar[], n: number): number | null {
  if (bars.length < n + 1) return null;
  const slice = bars.slice(-(n + 1));
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    rets.push(Math.log(slice[i].close / slice[i - 1].close));
  }
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance =
    rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/* ---------------- IV rank snapshots ----------------
   Schwab's API exposes current implied vol but no IV history, so a true
   IV Rank is impossible on day one. The screener records one ATM IV
   reading per symbol per day; after a few months of daily runs the rank
   becomes meaningful. Until then ivRank is null and IV/HV carries the load. */

type SnapshotFile = Record<string, { d: string; iv: number }[]>;
const SNAP = path.resolve('./.cache/iv-history.json');

let snapCache: SnapshotFile | null = null;

async function loadSnapshots(): Promise<SnapshotFile> {
  if (snapCache) return snapCache;
  try {
    snapCache = JSON.parse(await fs.readFile(SNAP, 'utf8'));
  } catch {
    snapCache = {};
  }
  return snapCache!;
}

export async function recordIv(symbol: string, iv: number) {
  const snaps = await loadSnapshots();
  const today = new Date().toISOString().slice(0, 10);
  const list = (snaps[symbol] ||= []);
  if (list.some((s) => s.d === today)) return;
  list.push({ d: today, iv });
  // keep ~2 years
  if (list.length > 520) list.splice(0, list.length - 520);
}

export async function flushSnapshots() {
  if (!snapCache) return;
  await fs.mkdir(path.dirname(SNAP), { recursive: true });
  await fs.writeFile(SNAP, JSON.stringify(snapCache));
}

export async function ivRank(symbol: string, iv: number): Promise<number | null> {
  const snaps = await loadSnapshots();
  const list = snaps[symbol];
  // Needs a reasonable history before the number means anything.
  if (!list || list.length < 60) return null;
  const vals = list.map((s) => s.iv);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  if (hi <= lo) return null;
  return ((iv - lo) / (hi - lo)) * 100;
}

/* ---------------- earnings calendar ----------------
   Schwab's market-data API does not publish earnings dates. Drop known
   dates into data/earnings.json as { "AAPL": ["2026-10-29"], ... } and the
   screener will flag or exclude contracts that span them. */

/* Keyed on the file mtime so editing data/earnings.json takes effect on the
   next scan. A plain cache silently kept a stale calendar alive for the life
   of the process, which reads as "my dates are wrong" rather than "restart". */
let earningsCache: { mtimeMs: number; data: Record<string, string[]> } | null =
  null;

export async function loadEarnings(): Promise<Record<string, string[]>> {
  const file = path.resolve('./data/earnings.json');
  try {
    const { mtimeMs } = await fs.stat(file);
    if (earningsCache?.mtimeMs === mtimeMs) return earningsCache.data;
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    earningsCache = { mtimeMs, data };
    return data;
  } catch {
    earningsCache = null;
    return {};
  }
}

/* ---------------- contract selection ---------------- */

type ChainContract = {
  symbol: string;
  strikePrice: number;
  bid: number;
  ask: number;
  mark: number;
  delta: number;
  volatility: number; // percent, e.g. 28.4
  openInterest: number;
  totalVolume: number;
  daysToExpiration: number;
  expirationDate: string;
};

/** Flatten Schwab's putExpDateMap into a plain contract array. */
export function flattenPuts(chain: any): ChainContract[] {
  const out: ChainContract[] = [];
  const map = chain?.putExpDateMap ?? {};
  for (const expKey of Object.keys(map)) {
    // key looks like "2026-09-18:31"
    const expDate = expKey.split(':')[0];
    for (const strikeKey of Object.keys(map[expKey])) {
      for (const c of map[expKey][strikeKey]) {
        out.push({
          symbol: c.symbol,
          strikePrice: c.strikePrice,
          bid: c.bid,
          ask: c.ask,
          mark: c.mark,
          delta: c.delta,
          volatility: c.volatility,
          openInterest: c.openInterest,
          totalVolume: c.totalVolume,
          daysToExpiration: c.daysToExpiration,
          expirationDate: expDate,
        });
      }
    }
  }
  return out;
}

export type UnderlyingContext = {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  spot: number;
  low52: number;
  high52: number;
  sma200: number | null;
  hv20: number | null;
  /** Percent change over the last 20 sessions, for the falling-knife gate. */
  chg20Pct: number | null;
};

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Ceiling used when the DTE criterion is switched off. Schwab returns every
 * expiration inside the requested window, so an unbounded window pulls years
 * of LEAPS chains per ticker - slow, and useless for selling cash-secured
 * puts. Six months is well past anything this screener would surface.
 */
const OPEN_DTE_CEILING = 180;

export const windowFrom = (f: Filters) => addDays(isOn(f, 'dte') ? f.minDte : 0);
export const windowTo = (f: Filters) =>
  addDays(isOn(f, 'dte') ? f.maxDte : OPEN_DTE_CEILING);

/**
 * Score blends the four things that decide whether a cash-secured put was a
 * good idea in hindsight: how much you got paid, how much room the stock has
 * before you are assigned, whether the option was rich relative to realized
 * vol, and whether it was liquid enough to manage. Kept as two functions
 * rather than one - the breakdown is attached to the candidate as-is, not
 * just summed and thrown away, so two contracts tied on score can still be
 * told apart by where their points came from.
 */
function scoreComponents(c: {
  annualRocPct: number;
  cushionPct: number;
  ivHv: number | null;
  openInterest: number;
  spreadPct: number;
}): ScoreBreakdown {
  return {
    yield: Math.min(c.annualRocPct / 40, 1) * 45,
    cushion: Math.min(c.cushionPct / 0.2, 1) * 25,
    richness: c.ivHv ? Math.min(Math.max(c.ivHv - 0.9, 0) / 0.6, 1) * 15 : 7,
    liquidity:
      Math.min(c.openInterest / 2000, 1) * 8 +
      Math.max(0, 1 - c.spreadPct / 8) * 7,
  };
}

function scoreOf(b: ScoreBreakdown): number {
  return Math.round(b.yield + b.cushion + b.richness + b.liquidity);
}

export async function evaluate(
  u: UnderlyingContext,
  contracts: ChainContract[],
  f: Filters,
  earnings: Record<string, string[]>
): Promise<Candidate | null> {
  // Depends on the underlying alone, so it settles before the contract loop
  // rather than being re-tested against every strike.
  const drawdownPct =
    u.high52 > 0 ? ((u.high52 - u.spot) / u.high52) * 100 : 0;
  if (isOn(f, 'drawdown') && drawdownPct < f.minDrawdownPct) return null;

  let best: Candidate | null = null;

  for (const c of contracts) {
    // A contract with no delta is unusable regardless of the filter: the
    // table shows delta and the score leans on it. That check is data
    // quality, not a user criterion, so it always runs.
    const delta = Math.abs(c.delta ?? 0);
    if (!delta) continue;
    if (isOn(f, 'delta') && (delta < f.minDelta || delta > f.maxDelta)) continue;
    if (
      isOn(f, 'dte') &&
      (c.daysToExpiration < f.minDte || c.daysToExpiration > f.maxDte)
    )
      continue;
    if (c.strikePrice >= u.spot) continue; // OTM puts only
    if (isOn(f, 'liquidity') && (c.openInterest ?? 0) < f.minOpenInterest)
      continue;

    const bid = c.bid ?? 0;
    const ask = c.ask ?? 0;
    if (bid <= 0 || ask <= 0) continue;
    const mid = (bid + ask) / 2;
    const spreadPct = ((ask - bid) / mid) * 100;
    if (isOn(f, 'liquidity') && spreadPct > f.maxSpreadPct) continue;

    const capital = c.strikePrice * 100;
    if (isOn(f, 'capital') && capital > f.maxCapital) continue;

    const credit = mid * 100;
    const rocPct = (credit / capital) * 100;
    const annualRocPct = rocPct * (365 / Math.max(c.daysToExpiration, 1));
    if (isOn(f, 'roc') && annualRocPct < f.minAnnualRoc) continue;

    const iv = (c.volatility ?? 0) / 100;
    // minIv is a percentage the way the panel asks for it; iv is a decimal.
    if (isOn(f, 'iv') && iv * 100 < f.minIv) continue;
    const ivHv = u.hv20 && u.hv20 > 0 ? iv / u.hv20 : null;
    if (isOn(f, 'ivhv') && f.minIvHv > 0 && ivHv !== null && ivHv < f.minIvHv)
      continue;

    const warnings: string[] = [];
    const aboveSma200 = u.sma200 ? u.spot > u.sma200 : null;
    if (aboveSma200 === false) {
      if (f.requireAboveSma200) continue;
      warnings.push('Giá dưới SMA200');
    }

    const breakeven = c.strikePrice - mid;
    if (breakeven < u.low52) warnings.push('Break-even dưới đáy 52 tuần');

    const earn = (earnings[u.symbol] || []).find(
      (d) => d >= new Date().toISOString().slice(0, 10) && d <= c.expirationDate
    );
    if (earn) {
      if (f.excludeEarnings) continue;
      warnings.push(`Earnings ${earn} trong kỳ hợp đồng`);
    }
    if (spreadPct > 3) warnings.push('Spread rộng');

    /**
     * Five fixed checks from the Smart Money spec - unlike the filters above,
     * these numbers are not tied to what the user typed into the panel (the
     * liquidity/spread sliders can be loosened; these can't). ivHv/chg20Pct
     * null means "can't be computed", not "failed", so those pass rather
     * than silently reject on a data gap.
     */
    const gates = [
      {
        key: 'vrp',
        label: 'VRP (IV/HV20) ≥ 1.0',
        passed: ivHv === null || ivHv >= 1.0,
      },
      {
        key: 'earnings',
        label: 'Không có earnings trong kỳ hợp đồng',
        passed: !earn,
      },
      {
        key: 'liquidity',
        label: 'OI ≥ 500 và khối lượng ≥ 100',
        passed: (c.openInterest ?? 0) >= 500 && (c.totalVolume ?? 0) >= 100,
      },
      { key: 'spread', label: 'Spread ≤ 5%', passed: spreadPct <= 5 },
      {
        key: 'fallingKnife',
        label: 'Chưa rơi quá 20% trong 20 phiên',
        passed: u.chg20Pct === null || u.chg20Pct > -20,
      },
    ];
    if (f.hardGates && gates.some((g) => !g.passed)) continue;

    const rank = await ivRank(u.symbol, iv);
    const cushionPct = (u.spot - c.strikePrice) / u.spot;
    const breakdown = scoreComponents({
      annualRocPct,
      cushionPct,
      ivHv,
      openInterest: c.openInterest ?? 0,
      spreadPct,
    });

    const partial: Omit<Candidate, 'score'> = {
      symbol: u.symbol,
      name: u.name,
      sector: u.sector,
      exchange: u.exchange,
      spot: u.spot,
      low52: u.low52,
      high52: u.high52,
      sma200: u.sma200,
      aboveSma200,
      hv20: u.hv20,
      ivRank: rank,
      ivHv,
      drawdownPct,
      optionSymbol: c.symbol,
      strike: c.strikePrice,
      expiration: c.expirationDate,
      dte: c.daysToExpiration,
      bid,
      ask,
      mid,
      delta,
      iv,
      openInterest: c.openInterest ?? 0,
      volume: c.totalVolume ?? 0,
      spreadPct,
      capital,
      credit,
      rocPct,
      annualRocPct,
      breakeven,
      cushionPct,
      beVsLow52Pct: u.low52 > 0 ? ((breakeven - u.low52) / u.low52) * 100 : 0,
      maxLoss: capital - credit,
      returnIfAssignedPct:
        ((credit - Math.max(0, c.strikePrice - u.spot) * 100) / capital) * 100,
      earningsBefore: earn ?? null,
      gates,
      scoreBreakdown: breakdown,
      warnings,
    };

    const candidate: Candidate = { ...partial, score: scoreOf(breakdown) };
    if (!best || candidate.score > best.score) best = candidate;
  }

  return best;
}
