export type Universe = 'sp500' | 'watchlist';

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
  requireAboveSma200: boolean;
  excludeEarnings: boolean;
  sectors: string[]; // empty = all
  limit: number; // max tickers to scan (0 = all)
};

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
  rocPct: number; // credit / capital
  annualRocPct: number;
  breakeven: number;
  cushionPct: number; // (spot - strike) / spot
  beVsLow52Pct: number; // (breakeven - low52) / low52
  earningsBefore: string | null; // known earnings date inside the contract window
  score: number;
  warnings: string[];
};

export type StreamEvent =
  | { type: 'phase'; phase: string; detail?: string }
  | { type: 'progress'; done: number; total: number }
  | { type: 'candidate'; data: Candidate }
  | { type: 'skip'; symbol: string; reason: string }
  | { type: 'error'; message: string }
  | { type: 'done'; scanned: number; found: number; ms: number };
