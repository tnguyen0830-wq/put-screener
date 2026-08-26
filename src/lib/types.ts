export type Universe = 'sp500' | 'watchlist';

/**
 * A criterion the user can switch off from the filter panel. Off means the
 * criterion is not applied at all - the numbers beside it stay untouched so
 * ticking it back on restores what was typed.
 */
export type FilterKey =
  | 'capital'
  | 'delta'
  | 'dte'
  | 'roc'
  | 'liquidity'
  | 'ivhv'
  | 'drawdown'
  | 'iv';

export type Filters = {
  /** Which set of tickers to scan. */
  universe: Universe;
  /** Cash you are willing to set aside per position (strike x 100). */
  maxCapital: number;
  minDelta: number; // absolute value, e.g. 0.15
  maxDelta: number; // e.g. 0.30
  minDte: number;
  maxDte: number;
  minAnnualRoc: number; // percent, e.g. 15
  minOpenInterest: number;
  maxSpreadPct: number; // (ask-bid)/mid as percent, e.g. 5
  minIvHv: number; // IV / HV20 ratio floor, e.g. 1.0
  /** How far below the 52-week high the stock must have fallen, percent. */
  minDrawdownPct: number;
  /** Absolute implied-vol floor on the contract, percent, e.g. 35. */
  minIv: number;
  requireAboveSma200: boolean;
  excludeEarnings: boolean;
  /**
   * Bundle of five fixed pass/fail checks (VRP, earnings, liquidity, spread,
   * falling-knife) that, when on, drop a contract outright regardless of
   * score - unlike every other criterion here, these numbers are not
   * user-editable, and there is no "loosen but keep looking" version of a
   * failed gate. Off falls back to the ordinary optional filters/warnings.
   */
  hardGates: boolean;
  sectors: string[]; // empty = all
  limit: number; // max tickers to scan (0 = all)
  /**
   * Criteria switched off. Absent or empty means every criterion applies, so
   * a request that predates this field behaves exactly as it did before.
   */
  off: FilterKey[];
};

/**
 * Criteria that start switched off. They narrow an already-working scan onto a
 * particular setup, so leaving them off is the baseline rather than a loosened
 * filter - the panel uses this to tell the two apart.
 */
export const DEFAULT_OFF: FilterKey[] = ['drawdown', 'iv'];

/** True when criterion `k` should be applied to this scan. */
export const isOn = (f: Filters, k: FilterKey) => !(f.off ?? []).includes(k);

export type Candidate = {
  symbol: string;
  name: string;
  sector: string;
  /** Listing venue, used to build the TradingView symbol (e.g. NASDAQ:AAPL). */
  exchange: string;

  // underlying
  spot: number;
  low52: number;
  high52: number;
  sma200: number | null;
  aboveSma200: boolean | null;
  hv20: number | null; // annualized realized vol, decimal
  ivRank: number | null; // 0-100, only once snapshots exist
  ivHv: number | null; // IV / HV20
  /** Percent below the 52-week high, e.g. 12.5 means 12.5% off the top. */
  drawdownPct: number;

  // contract
  optionSymbol: string;
  strike: number;
  expiration: string; // YYYY-MM-DD
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  delta: number; // absolute value
  iv: number; // decimal
  openInterest: number;
  volume: number;
  spreadPct: number;

  // derived
  capital: number; // strike * 100
  credit: number; // mid * 100
  rocPct: number; // credit / capital - also "return if expired" (max profit stays if the put expires worthless)
  annualRocPct: number; // rocPct naively annualized by 365/dte - a rate, not a promise of that return over a year
  breakeven: number;
  cushionPct: number; // (spot - strike) / spot
  beVsLow52Pct: number; // (breakeven - low52) / low52
  /** Cash put at risk if assigned and the stock went to zero: capital - credit. */
  maxLoss: number;
  /**
   * P/L if assigned today at the current spot price, as a percent of capital.
   * Not a forecast of assignment P/L at actual future expiration - spot will
   * have moved by then. Uses today's spot as the only price this screener
   * can know, so it reads "if nothing moves from here," not "at expiry."
   */
  returnIfAssignedPct: number;
  earningsBefore: string | null; // known earnings date inside the contract window
  /**
   * The five fixed hard-gate checks, always computed and attached regardless
   * of whether `Filters.hardGates` is on - so a candidate shown while the
   * bundle is switched off can still show a real ✗, not just a blank. When
   * the bundle is on, every candidate that reaches the results has already
   * passed all five, so this is confirmation rather than a live filter here.
   */
  gates: { key: string; label: string; passed: boolean }[];
  /**
   * The four weighted pieces that sum to `score`, kept alongside it instead
   * of discarded after the sum - two candidates can land on the same total
   * for very different reasons (rich premium vs. wide cushion), and the
   * single number can't tell those apart.
   */
  scoreBreakdown: ScoreBreakdown;
  score: number;
  warnings: string[];
};

/** Points earned on each axis, out of the max noted per field. */
export type ScoreBreakdown = {
  yield: number; // 0-45, annualized ROC
  cushion: number; // 0-25, room before the strike
  richness: number; // 0-15, IV priced above realized vol
  liquidity: number; // 0-15, open interest + spread
};

export type StreamEvent =
  | { type: 'phase'; phase: string; detail?: string }
  | { type: 'progress'; done: number; total: number }
  | { type: 'candidate'; data: Candidate }
  | { type: 'skip'; symbol: string; reason: string }
  | { type: 'error'; message: string }
  | { type: 'done'; scanned: number; found: number; ms: number };
