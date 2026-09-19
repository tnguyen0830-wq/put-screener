/**
 * TradingView publishes no retail data API, so the integration is done the only
 * way it honestly can be: their free embeddable widgets for charting, plus a
 * deep link to the full chart. Nothing here scrapes or re-hosts their data.
 *
 * Trước đây file này còn dựng link sang trang gamma của một trang ngoài; chủ
 * app yêu cầu bỏ mọi thứ mang tên trang đó khỏi màn hình, nên cả hàm dựng URL
 * lẫn hai nhãn link đã xoá hẳn - để lại hàm không ai gọi thì chuỗi tên miền
 * vẫn nằm trong bundle gửi về trình duyệt.
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
