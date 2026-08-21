/**
 * Neither TradingView nor Tạp Chí Phố Wall publishes a retail data API, so the
 * integration is done the only way it honestly can be: TradingView's free
 * embeddable widgets for charting, and deep links into TCPW's per-symbol
 * gamma pages. Nothing here scrapes or re-hosts their data.
 */

/**
 * TradingView needs an exchange prefix. Schwab returns a venue name that is
 * close but not identical, so this normalises the common cases and falls back
 * to a bare symbol, which TradingView resolves via its own search.
 */
export function tvSymbol(symbol: string, exchange: string): string {
  const clean = symbol.replace('/', '.'); // BRK/B -> BRK.B
  const e = (exchange || '').toUpperCase();
  if (e.includes('NASDAQ') || e === 'Q' || e === 'NSD') return `NASDAQ:${clean}`;
  if (e.includes('NYSE ARCA') || e.includes('ARCA')) return `AMEX:${clean}`;
  if (e.includes('NYSE') || e === 'N') return `NYSE:${clean}`;
  if (e.includes('BATS') || e.includes('CBOE')) return `AMEX:${clean}`;
  return clean;
}

export const tradingViewChartUrl = (symbol: string, exchange: string) =>
  `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(
    tvSymbol(symbol, exchange)
  )}`;

/**
 * Tạp Chí Phố Wall gamma page. Coverage is strongest on liquid optionable
 * names; thinner tickers may not have a page yet.
 */
export const tcpwGexUrl = (symbol: string) =>
  `https://tapchiphowall.com/options-gamma/${encodeURIComponent(
    symbol.replace('/', '.')
  )}`;

export const tcpwGexUrlEn = (symbol: string) =>
  `https://en.tapchiphowall.com/options-gamma/${encodeURIComponent(
    symbol.replace('/', '.')
  )}`;
