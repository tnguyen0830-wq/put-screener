'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type Lang = 'vi' | 'en';

const KEY = 'put-screener-lang';

/**
 * Strings are keyed by a short dotted path and held here rather than beside the
 * component that shows them, so the two languages sit on adjacent lines and a
 * missing translation is visible while writing it rather than at runtime.
 *
 * Values are either a string or a function of one argument, for the handful of
 * lines that interpolate a number.
 */
type Entry = string | ((v: any) => string);

const DICT: Record<string, Record<Lang, Entry>> = {
  // ---- chrome ----
  'tab.screener': { vi: 'Sell Put Screener', en: 'Sell Put Screener' },
  // Tab titles stay English in both languages: they name the screen, and a
  // trader reads these terms in English everywhere else too.
  'tab.analyze': { vi: 'Analyze', en: 'Analyze' },
  'tab.heatmap': { vi: 'Heatmap', en: 'Heatmap' },
  'brand.sub': { vi: 'Cash is king', en: 'Cash is king' },
  'brand.home': {
    vi: 'Tyler Investment Tool — về trang chính',
    en: 'Tyler Investment Tool — back to home',
  },

  // ---- settings ----
  'settings.label': {
    vi: 'Cài đặt: giao diện, ngôn ngữ và kết nối Schwab',
    en: 'Settings: appearance, language and Schwab connection',
  },
  'settings.title': { vi: 'Cài đặt', en: 'Settings' },
  'settings.appearance': { vi: 'Giao diện', en: 'Appearance' },
  'settings.language': { vi: 'Ngôn ngữ', en: 'Language' },
  'settings.connection': { vi: 'Kết nối Schwab', en: 'Schwab connection' },
  'settings.checking': { vi: 'Đang kiểm tra…', en: 'Checking…' },
  'settings.unconfigured': {
    vi: 'Chưa cấu hình .env — thiếu khoá Schwab trên server.',
    en: 'No .env configured — the server is missing its Schwab keys.',
  },
  'settings.disconnected': {
    vi: 'Chưa kết nối. Quét sẽ không chạy được.',
    en: 'Not connected. Scans cannot run.',
  },
  'settings.connect': { vi: 'Kết nối Schwab', en: 'Connect Schwab' },
  'settings.reconnect': { vi: 'Kết nối lại', en: 'Reconnect' },
  'settings.daysLeft': {
    vi: (d: string) =>
      `Còn ${d} ngày. Schwab giới hạn cứng 7 ngày, hết hạn là phải đăng nhập lại.`,
    en: (d: string) =>
      `${d} days left. Schwab caps refresh tokens at 7 days; after that you sign in again.`,
  },

  // ---- theme ----
  'theme.light': { vi: 'Sáng', en: 'Light' },
  'theme.dark': { vi: 'Tối', en: 'Dark' },
  'theme.system': { vi: 'Hệ thống', en: 'System' },
  'theme.cycle': {
    vi: 'Chuyển sáng / tối / theo hệ thống',
    en: 'Cycle light / dark / system',
  },
  'theme.aria': {
    vi: (t: string) => `Giao diện: ${t}. Bấm để đổi.`,
    en: (t: string) => `Appearance: ${t}. Click to change.`,
  },

  // Ticker tape labels are gone: the bar prints the symbol Schwab answered on,
  // which is language-neutral and tells the truth when a fallback was used.

  // ---- filter panel ----
  'filters.head': { vi: 'Tiêu chí lọc', en: 'Filters' },
  'filters.scope': { vi: 'Phạm vi quét', en: 'Scan universe' },
  'filters.sp500': { vi: 'Cả S&P 500', en: 'All of S&P 500' },
  'filters.watchlist': { vi: 'Watchlist', en: 'Watchlist' },
  'filters.lead': {
    vi: 'Bỏ tick một tiêu chí để không áp dụng tiêu chí đó. Số đã nhập vẫn được giữ, tick lại là dùng nguyên như cũ.',
    en: 'Untick a criterion to stop applying it. The number you typed is kept, so ticking it back restores it.',
  },
  // Criterion labels stay English in both languages - delta, DTE and IV/HV are
  // read in English on every broker screen, and translating them makes the
  // panel harder to match against Schwab, not easier. The explanation under
  // each one carries the language instead.
  'filters.capital': {
    vi: 'Max capital per position (USD)',
    en: 'Max capital per position (USD)',
  },
  'filters.capitalNote': {
    vi: 'Bán 1 put là cam kết mua 100 cổ phiếu tại giá strike, nên vốn khoá = strike × 100. Đặt thấp hơn thì loại bớt mã đắt và quét nhanh hơn.',
    en: 'Selling one put commits you to buying 100 shares at the strike, so the capital tied up is strike × 100. A lower budget drops expensive tickers and scans faster.',
  },
  'filters.capitalOff': {
    vi: 'Không loại mã đắt trước khi tải chuỗi quyền chọn, nên quét sẽ lâu hơn đáng kể.',
    en: 'Expensive tickers are no longer dropped before their option chain is fetched, so scans get considerably slower.',
  },
  'filters.delta': { vi: 'Delta (absolute)', en: 'Delta (absolute)' },
  'filters.deltaNote': {
    vi: 'Delta xấp xỉ xác suất hợp đồng bị assign. 0.15–0.30 là vùng bán put phổ biến: đủ phí để đáng làm, mà xác suất phải mua cổ phiếu còn thấp.',
    en: 'Delta approximates the chance of being assigned. 0.15–0.30 is the usual put-selling zone: enough premium to be worth it, with the odds of having to buy still low.',
  },
  'filters.deltaMin': { vi: 'Delta tối thiểu', en: 'Minimum delta' },
  'filters.deltaMax': { vi: 'Delta tối đa', en: 'Maximum delta' },
  'filters.dte': { vi: 'Days to expiration', en: 'Days to expiration' },
  'filters.dteNote': {
    vi: 'Số ngày còn lại tới ngày đáo hạn. 25–50 ngày là vùng theta bào mạnh nhất mà chưa phải canh hằng ngày.',
    en: 'Days left until expiry. 25–50 is where theta decays fastest without needing daily attention.',
  },
  'filters.dteMin': { vi: 'DTE tối thiểu', en: 'Minimum DTE' },
  'filters.dteMax': { vi: 'DTE tối đa', en: 'Maximum DTE' },
  'filters.dteOff': {
    vi: 'Vẫn giới hạn 180 ngày tới — quét mọi đáo hạn xa hơn thì chuỗi quyền chọn phình quá to mà không dùng để bán put.',
    en: 'Still capped at the next 180 days — scanning further out inflates the option chain for expirations nobody sells puts against.',
  },
  'filters.roc': {
    vi: 'Minimum annualized return (%)',
    en: 'Minimum annualized return (%)',
  },
  'filters.rocNote': {
    vi: 'Credit chia cho vốn khoá, quy về một năm. Cho phép so sánh hợp đồng 30 ngày với hợp đồng 45 ngày trên cùng một thước.',
    en: 'Credit over capital tied up, scaled to a year. Lets a 30-day contract be compared with a 45-day one on the same measure.',
  },
  'filters.liquidity': { vi: 'Liquidity', en: 'Liquidity' },
  'filters.oiMin': { vi: 'Open interest tối thiểu', en: 'Minimum open interest' },
  'filters.spreadMax': {
    vi: 'Spread tối đa phần trăm',
    en: 'Maximum spread percent',
  },
  'filters.liquidityHint': {
    vi: 'Trái: OI tối thiểu. Phải: spread tối đa (% của mid).',
    en: 'Left: minimum open interest. Right: maximum spread (% of mid).',
  },
  'filters.drawdown': {
    vi: 'Minimum drop from 52-week high (%)',
    en: 'Minimum drop from 52-week high (%)',
  },
  'filters.drawdownHint': {
    vi: 'Chỉ lấy mã đã rớt ít nhất bấy nhiêu % so với đỉnh 52 tuần. Gõ 10 hoặc 20 tuỳ mức chiết khấu bạn muốn.',
    en: 'Only tickers that have fallen at least this far from their 52-week high. Type 10 or 20 depending on the discount you want.',
  },
  'filters.ivhv': { vi: 'Minimum IV / HV20', en: 'Minimum IV / HV20' },
  'filters.ivhvHint': {
    vi: 'IV cao so với biến động thực tế 20 phiên. 1.0 = quyền chọn đang được trả đúng bằng mức dao động thật.',
    en: 'Implied vol against realized vol over 20 sessions. 1.0 means the option pays exactly what the stock actually moves.',
  },
  'filters.iv': { vi: 'Minimum IV (%)', en: 'Minimum IV (%)' },
  'filters.ivHint': {
    vi: 'IV tuyệt đối của chính hợp đồng. Khác ô trên: ô trên so IV với biến động thật, ô này chỉ hỏi IV có cao hay không.',
    en: "The contract's own implied vol. Unlike the field above, which compares IV to realized vol, this one just asks whether IV is high.",
  },
  'filters.sector': { vi: 'Ngành', en: 'Sector' },
  'filters.allSectors': { vi: 'Tất cả', en: 'All' },
  'filters.sma200': {
    vi: 'Chỉ lấy mã trên SMA200',
    en: 'Only tickers above their SMA200',
  },
  'filters.earnings': {
    vi: 'Loại hợp đồng vắt qua earnings',
    en: 'Exclude contracts spanning earnings',
  },
  'filters.running': { vi: 'Đang quét…', en: 'Scanning…' },
  'filters.runWatchlist': { vi: 'Quét watchlist', en: 'Scan watchlist' },
  'filters.runSp500': { vi: 'Quét S&P 500', en: 'Scan S&P 500' },
  'filters.loosened': {
    vi: (n: number) =>
      `Đang tắt ${n} tiêu chí — kết quả sẽ nhiều và lỏng hơn bình thường.`,
    en: (n: number) =>
      `${n} criteria switched off — expect more results, and looser ones.`,
  },
  'filters.hintWatchlist': {
    vi: 'Quét watchlist mất vài chục giây, chạy lại thoải mái trong phiên.',
    en: 'A watchlist scan takes tens of seconds; rerun it as often as you like.',
  },
  'filters.hintSp500': {
    vi: 'Quét toàn rổ mất khoảng 4–8 phút vì Schwab giới hạn 120 request/phút. Đặt vốn thấp hơn để loại bớt mã đắt và chạy nhanh hơn.',
    en: 'A full-index scan takes 4–8 minutes because Schwab caps requests at 120/minute. Lower the capital budget to drop expensive tickers and finish sooner.',
  },

  // ---- results ----
  'res.symbol': { vi: 'Mã', en: 'Ticker' },
  'res.score': { vi: 'Điểm', en: 'Score' },
  'res.roc': { vi: 'LS/năm', en: 'Ann. yield' },
  'res.credit': { vi: 'Credit', en: 'Credit' },
  'res.capital': { vi: 'Vốn', en: 'Capital' },
  'res.strike': { vi: 'Strike', en: 'Strike' },
  'res.dte': { vi: 'DTE', en: 'DTE' },
  'res.cushion': { vi: 'Đệm', en: 'Cushion' },
  'res.breakeven': { vi: 'Break-even', en: 'Break-even' },
  'res.ivhv': { vi: 'IV/HV', en: 'IV/HV' },
  'res.iv': { vi: 'IV', en: 'IV' },
  'res.drawdown': { vi: 'Rớt đỉnh', en: 'Off high' },
  'res.range52': { vi: 'Biên độ 52T', en: '52-week range' },
  'res.sortHint': { vi: 'Bấm để sắp xếp', en: 'Click to sort' },
  'res.emptyTitle': { vi: 'Chưa có kết quả', en: 'No results yet' },
  'res.emptyBody': {
    vi: 'Chỉnh tiêu chí bên trái rồi bấm Quét. Kết quả hiện dần theo từng mã.',
    en: 'Adjust the filters on the left, then hit Scan. Results appear ticker by ticker.',
  },
  'res.count': {
    vi: (n: number) => `${n} cơ hội`,
    en: (n: number) => `${n} opportunities`,
  },

  // ---- legend ----
  'legend.aria': { vi: 'Quy ước màu số liệu', en: 'Colour convention' },
  'legend.good': { vi: 'Lên / trên mốc', en: 'Up / above the mark' },
  'legend.bad': { vi: 'Xuống / dưới mốc', en: 'Down / below the mark' },
  'legend.warn': { vi: 'Cần chú ý', en: 'Worth a look' },
  'legend.note': {
    vi: 'Số không màu là dữ kiện thuần — màu chỉ hướng, không phải khuyến nghị.',
    en: 'Uncoloured numbers are plain facts — colour shows direction, not advice.',
  },

  // ---- watchlist ----
  'wl.addAria': { vi: 'Thêm mã vào watchlist', en: 'Add a ticker to the watchlist' },
  'wl.addBtnAria': { vi: 'Thêm mã', en: 'Add ticker' },
  'wl.add': { vi: 'Thêm', en: 'Add' },
  'wl.empty': {
    vi: 'Danh sách những mã bạn thực sự muốn sở hữu. Quét watchlist chạy trong vài chục giây nên dùng được nhiều lần trong phiên.',
    en: 'The tickers you would genuinely be happy to own. A watchlist scan takes tens of seconds, so it is cheap to rerun.',
  },
  'wl.remove': {
    vi: (s: string) => `Bỏ ${s}`,
    en: (s: string) => `Remove ${s}`,
  },

  // ---- cushion bar ----
  'cb.aria': {
    vi: (v: any) =>
      `Break-even ${v.be}, strike ${v.strike}, giá hiện tại ${v.spot}, biên độ 52 tuần ${v.low}–${v.high}`,
    en: (v: any) =>
      `Break-even ${v.be}, strike ${v.strike}, current price ${v.spot}, 52-week range ${v.low}–${v.high}`,
  },
  'cb.beBelow': { vi: 'BE < ĐÁY', en: 'BE < LOW' },
  'cb.be': { vi: 'BE', en: 'BE' },

  // ---- gamma chart ----
  'gex.loadFailed': { vi: 'Không tải được GEX', en: 'Could not load GEX' },
  'gex.computing': {
    vi: 'Đang tính gamma theo strike…',
    en: 'Computing gamma by strike…',
  },
  'gex.thin': {
    vi: 'Không đủ open interest quanh giá.',
    en: 'Not enough open interest around the price.',
  },
  'gex.putWall': { vi: 'Put wall', en: 'Put wall' },
  'gex.callWall': { vi: 'Call wall', en: 'Call wall' },
  'gex.yourStrike': { vi: 'Strike của bạn', en: 'Your strike' },
  'gex.zeroGamma': { vi: 'Zero gamma', en: 'Zero gamma' },
  'gex.netGex': { vi: 'Net GEX', en: 'Net GEX' },
  'gex.noStrike': {
    vi: (w: string) =>
      `Put wall ${w} là mốc gamma put lớn nhất — vùng dealer phải mua vào để hedge, nên thường hành xử như hỗ trợ.`,
    en: (w: string) =>
      `Put wall ${w} is the largest put-gamma strike — where dealers must buy to hedge, so it often behaves like support.`,
  },
  'gex.below': {
    vi: (k: string) =>
      `Strike ${k} nằm tại hoặc dưới put wall — dòng hedge của dealer đứng về phía bạn ở vùng này.`,
    en: (k: string) =>
      `Strike ${k} sits at or below the put wall — dealer hedging flow is on your side down here.`,
  },
  'gex.above': {
    vi: (v: any) =>
      `Strike ${v.strike} nằm trên put wall ${v.wall} — không có lớp hedge nào đỡ ở mức này. Cân nhắc hạ xuống gần put wall hơn.`,
    en: (v: any) =>
      `Strike ${v.strike} sits above the put wall ${v.wall} — no hedging layer holds it up here. Consider moving down closer to the wall.`,
  },
  'gex.netPos': {
    vi: 'Net GEX dương: dealer làm dịu biến động, biên độ thường hẹp.',
    en: 'Net GEX positive: dealers damp volatility, ranges tend to stay tight.',
  },
  'gex.netNeg': {
    vi: 'Net GEX âm: dealer khuếch đại biến động, giảm size và nới stop.',
    en: 'Net GEX negative: dealers amplify volatility — size down and widen stops.',
  },

  // ---- detail drawer ----
  'dd.aria': { vi: (s: string) => `Chi tiết ${s}`, en: (s: string) => `${s} detail` },
  'dd.inWatchlist': { vi: '★ Trong watchlist', en: '★ In watchlist' },
  'dd.saveWatchlist': { vi: '☆ Lưu watchlist', en: '☆ Save to watchlist' },
  'dd.close': { vi: 'Đóng', en: 'Close' },
  'dd.strike': { vi: 'Strike', en: 'Strike' },
  'dd.expiry': { vi: 'Đáo hạn', en: 'Expiry' },
  'dd.credit': { vi: 'Credit nhận', en: 'Credit received' },
  'dd.capital': { vi: 'Vốn khoá', en: 'Capital tied up' },
  'dd.breakeven': { vi: 'Break-even', en: 'Break-even' },
  'dd.annual': { vi: 'Lợi suất/năm', en: 'Annualized' },
  'dd.assigned': {
    vi: (v: any) =>
      `Nếu bị assign: bạn mua 100 ${v.symbol} với giá vốn thực ${v.be}, tức thấp hơn giá hiện tại ${v.pct}%.`,
    en: (v: any) =>
      `If assigned, you buy 100 ${v.symbol} at an effective cost of ${v.be} — ${v.pct}% below the current price.`,
  },
  'dd.chart': { vi: 'Biểu đồ', en: 'Chart' },
  'dd.chartNote': {
    vi: (v: any) =>
      `Kẻ tay mức ${v.strike} (strike) và ${v.be} (break-even) lên chart để xem giá đã từng thủng vùng đó chưa.`,
    en: (v: any) =>
      `Draw ${v.strike} (strike) and ${v.be} (break-even) on the chart by hand to see whether price has cut through that zone before.`,
  },
  'dd.technicals': { vi: 'Đánh giá kỹ thuật', en: 'Technical rating' },
  'dd.gexNote': {
    vi: 'Tính tại chỗ từ chuỗi quyền chọn Schwab: gamma × open interest cộng dồn theo từng strike, cửa sổ 60 ngày. Put wall là strike có gamma put lớn nhất — nơi dealer phải mua vào để hedge, nên thường hành xử như hỗ trợ. Đây là mô hình dựa trên giả định dealer long call / short put, không phải vị thế thật của họ.',
    en: 'Computed here from the Schwab option chain: gamma × open interest summed per strike over a 60-day window. The put wall is the strike with the largest put gamma — where dealers must buy to hedge, so it often behaves like support. This is a model built on the assumption that dealers are long calls and short puts, not their actual positioning.',
  },
  'dd.external': { vi: 'Đối chiếu ngoài', en: 'Cross-check elsewhere' },
  'dd.gexTcpw': { vi: 'GEX trên Tạp Chí Phố Wall ↗', en: 'GEX on Tạp Chí Phố Wall ↗' },
  'dd.gexTcpwEn': { vi: 'TCPW (English) ↗', en: 'TCPW (English) ↗' },
  'dd.fullChart': { vi: 'Mở chart đầy đủ ↗', en: 'Open the full chart ↗' },
  'dd.externalNote': {
    vi: 'Mỗi nhà cung cấp GEX dùng giả định khác nhau (số kỳ đáo hạn, cách xử lý 0DTE), nên con số sẽ lệch nhau. Dùng để đối chiếu vùng giá, đừng kỳ vọng khớp từng số.',
    en: 'Every GEX provider uses different assumptions (how many expirations, how 0DTE is handled), so the numbers will not agree. Use them to cross-check the zone, not to match figures.',
  },

  // ---- heatmap ----
  'hm.range1d': { vi: '1 ngày', en: '1 day' },
  'hm.range1w': { vi: '1 tuần', en: '1 week' },
  'hm.range1m': { vi: '1 tháng', en: '1 month' },
  'hm.loading': { vi: 'Đang tải bản đồ…', en: 'Loading the map…' },
  'hm.loadFailed': { vi: 'Không tải được bản đồ', en: 'Could not load the map' },
  'hm.title': { vi: 'Bản đồ nhiệt', en: 'Heatmap' },
  'hm.head': {
    vi: (v: any) => `Bản đồ S&P 500 · ${v.count} mã · ${v.source}`,
    en: (v: any) => `S&P 500 map · ${v.count} tickers · ${v.source}`,
  },
  'hm.areaIsCap': { vi: 'Diện tích ô = vốn hoá', en: 'Tile area = market cap' },
  'hm.aria': { vi: 'Bản đồ nhiệt S&P 500', en: 'S&P 500 heatmap' },
  'hm.hover': {
    vi: (v: any) =>
      `${v.symbol} · ${v.name} · ${v.sector} · $${v.price} · ${v.change} · vốn hoá ${v.cap}B — bấm để phân tích`,
    en: (v: any) =>
      `${v.symbol} · ${v.name} · ${v.sector} · $${v.price} · ${v.change} · market cap ${v.cap}B — click to analyze`,
  },
  'hm.hoverIdle': {
    vi: 'Rê chuột lên một ô để xem chi tiết; bấm để mở tab Phân tích mã.',
    en: 'Hover a tile for detail; click to open it in the analyze tab.',
  },
  'hm.note': {
    vi: 'Diện tích ô lấy từ vốn hoá tính bằng dữ liệu Schwab (giá × số cổ phiếu lưu hành), nên kích thước luôn là real-time. Màu ô khung 1 ngày cũng từ Schwab; các khung dài hơn lấy từ endpoint bản đồ của Finviz vì tính từ Schwab sẽ tốn 503 request lịch sử giá. Thang màu dựng theo đúng các mốc của Finviz để nhìn quen mắt, nhưng toàn bộ số liệu là tự tính — đây không phải ảnh chụp bản đồ của họ.',
    en: 'Tile area comes from market cap computed on Schwab data (price × shares outstanding), so the sizing is always live. The 1-day colouring is Schwab too; longer ranges come from Finviz\u2019s map endpoint, because computing them from Schwab would cost 503 price-history requests. The colour scale follows Finviz\u2019s own thresholds so it reads familiarly, but every figure here is computed locally — this is not a screenshot of their map.',
  },

  // ---- analyze tab ----
  'an.rsiOver': { vi: 'quá mua', en: 'overbought' },
  'an.rsiUnder': { vi: 'quá bán', en: 'oversold' },
  'an.rsiNeutral': { vi: 'trung tính', en: 'neutral' },
  'an.bbAbove': { vi: 'trên dải trên', en: 'above the upper band' },
  'an.bbBelow': { vi: 'dưới dải dưới', en: 'below the lower band' },
  'an.bbInside': { vi: 'trong dải', en: 'inside the bands' },
  'an.loading': { vi: 'Đang lấy dữ liệu…', en: 'Fetching data…' },
  'an.loadFailed': { vi: 'Không lấy được dữ liệu', en: 'Could not fetch the data' },
  'an.title': { vi: 'Phân tích mã', en: 'Analyze' },
  'an.placeholder': { vi: 'Nhập mã, ví dụ NVDA', en: 'Enter a ticker, e.g. NVDA' },
  'an.inputAria': { vi: 'Mã cần phân tích', en: 'Ticker to analyze' },
  'an.submit': { vi: 'Phân tích', en: 'Analyze' },
  'an.emptyTitle': { vi: 'Chưa chọn mã', en: 'No ticker chosen' },
  'an.emptyBody': {
    vi: 'Nhập mã ở trên, hoặc bấm một mã trong watchlist.',
    en: 'Type a ticker above, or pick one from the watchlist.',
  },
  'an.inWatchlist': { vi: '★ Trong watchlist', en: '★ In watchlist' },
  'an.saveWatchlist': { vi: '☆ Lưu watchlist', en: '☆ Save to watchlist' },
  'an.low52': { vi: (v: string) => `Đáy 52T ${v}`, en: (v: string) => `52w low ${v}` },
  'an.high52': { vi: (v: string) => `Đỉnh 52T ${v}`, en: (v: string) => `52w high ${v}` },
  'an.ofRange': { vi: (v: string) => `${v} biên độ`, en: (v: string) => `${v} of range` },
  'an.technical': { vi: 'Kỹ thuật', en: 'Technicals' },
  'an.aboveSignal': { vi: 'trên tín hiệu', en: 'above signal' },
  'an.belowSignal': { vi: 'dưới tín hiệu', en: 'below signal' },
  'an.smaStreak': {
    vi: (v: any) => `${v.pct} · ${v.n} phiên ${v.side === 'above' ? 'trên' : 'dưới'}`,
    en: (v: any) => `${v.pct} · ${v.n} sessions ${v.side}`,
  },
  'an.volRatio': { vi: (v: string) => `tỷ lệ ${v}`, en: (v: string) => `ratio ${v}` },
  'an.options': { vi: 'Quyền chọn', en: 'Options' },
  'an.refIv': { vi: 'IV tham chiếu', en: 'Reference IV' },
  'an.optRich': { vi: 'quyền chọn đắt', en: 'option is rich' },
  'an.optFair': { vi: 'gần biến động thực', en: 'close to realized vol' },
  'an.refStrike': { vi: 'Strike tham chiếu', en: 'Reference strike' },
  'an.ivNote': {
    vi: 'IV lấy từ hợp đồng put có delta gần −0.30 nhất trong cửa sổ 20–60 ngày, cùng vùng delta mà screener nhắm tới, nên so sánh được với cột IV/HV ở bảng kết quả.',
    en: 'IV comes from the put closest to −0.30 delta inside a 20–60 day window — the same delta zone the screener targets, so it lines up with the IV/HV column in the results table.',
  },
  'an.fundamental': { vi: 'Cơ bản', en: 'Fundamentals' },
  'an.marketCap': { vi: 'Vốn hoá', en: 'Market cap' },
  'an.dividend': { vi: 'Cổ tức', en: 'Dividend' },
  'an.perYear': { vi: (v: string) => `${v}/năm`, en: (v: string) => `${v}/year` },
  'an.exDate': { vi: 'Ngày GD không hưởng quyền', en: 'Ex-dividend date' },
  'an.avgVol10': { vi: 'KLGD TB 10 phiên', en: 'Avg volume, 10 sessions' },
  'an.avgVol1y': { vi: (v: string) => `1 năm ${v}`, en: (v: string) => `1 year ${v}` },
  'an.lastEarnings': { vi: 'Earnings gần nhất', en: 'Last earnings' },
  'an.nextEarnings': { vi: 'Earnings kế tiếp', en: 'Next earnings' },
  'an.earningsNote': {
    vi: 'Ngày earnings kế tiếp lấy từ data/earnings.json, được làm mới tự động hằng tuần qua GitHub Actions. File phân biệt rõ ngày công ty đã công bố với ngày ước tính.',
    en: 'The next-earnings date comes from data/earnings.json, refreshed automatically each week by a GitHub Action. The file distinguishes dates a company has announced from estimated ones.',
  },
  'an.finviz': { vi: 'Giới phân tích & vị thế (Finviz)', en: 'Analysts & positioning (Finviz)' },
  'an.targetPrice': { vi: 'Giá mục tiêu', en: 'Target price' },
  'an.vsCurrent': {
    vi: (v: string) => `${v} so với giá hiện tại`,
    en: (v: string) => `${v} vs the current price`,
  },
  'an.avgRating': { vi: 'Khuyến nghị TB', en: 'Average rating' },
  'an.ratingScale': { vi: '1 = mua mạnh, 5 = bán', en: '1 = strong buy, 5 = sell' },
  'an.fwdPe': { vi: 'P/E dự phóng', en: 'Forward P/E' },
  'an.currently': { vi: (v: string) => `hiện tại ${v}`, en: (v: string) => `currently ${v}` },
  'an.epsNextY': { vi: 'EPS năm tới', en: 'EPS next year' },
  'an.shortFloat': { vi: 'Short float', en: 'Short float' },
  'an.ratio': { vi: (v: string) => `tỷ lệ ${v}`, en: (v: string) => `ratio ${v}` },
  'an.relVolume': { vi: 'Rel Volume', en: 'Rel Volume' },
  'an.vsUsualVol': { vi: 'so với KLGD thường ngày', en: 'against its usual volume' },
  'an.debtEq': { vi: 'Nợ / Vốn CSH', en: 'Debt / Equity' },
  'an.perfYear': { vi: 'Hiệu suất năm', en: 'Performance, 1 year' },
  'an.date': { vi: 'Ngày', en: 'Date' },
  'an.action': { vi: 'Hành động', en: 'Action' },
  'an.analyst': { vi: 'Nhà phân tích', en: 'Analyst' },
  'an.rating': { vi: 'Khuyến nghị', en: 'Rating' },
  'an.finvizNote': {
    vi: 'Đọc từ trang quote của Finviz, chỉ khi bạn bấm phân tích một mã. Đây là bóc HTML chứ không phải API có hợp đồng ổn định — Finviz đổi giao diện thì phần này trống, các phần khác vẫn chạy.',
    en: 'Scraped from the Finviz quote page, only when you analyze a ticker. This reads HTML rather than a stable API, so if Finviz changes its layout this section goes blank while everything else keeps working.',
  },
  'an.news': { vi: 'Tin tức', en: 'News' },
  'an.mentionsN': {
    vi: (n: number) => `nhắc ${n} mã`,
    en: (n: number) => `mentions ${n} tickers`,
  },
  'an.thisTickerOnly': { vi: 'riêng mã này', en: 'this ticker only' },
  'an.noNews': {
    vi: 'Không có tin nào gắn với mã này.',
    en: 'No stories are tagged to this ticker.',
  },
  'an.newsNote': {
    vi: 'Nguồn: tìm kiếm tin của Yahoo Finance. Bài gắn ít mã được xếp lên trước vì nhiều khả năng viết riêng về mã này; bài gắn nhiều mã thường là bản tin thị trường chung. Không có nguồn mạng xã hội — X, StockTwits, Reddit đều đóng API công khai hoặc bắt trả phí.',
    en: 'Source: Yahoo Finance news search. Stories tagged to fewer tickers sort first, since they are more likely written about this company; stories tagged to many are usually general market wraps. No social sources — X, StockTwits and Reddit have all closed their public APIs or put them behind a paywall.',
  },
  'an.tvGaugeNote': {
    vi: 'Đồng hồ của TradingView tổng hợp nhiều chỉ báo theo công thức riêng của họ. Dùng để đối chiếu chéo với các số tự tính ở trên, không phải tín hiệu vào lệnh.',
    en: "TradingView's gauge blends many indicators by their own formula. Use it to cross-check the numbers computed above, not as an entry signal.",
  },
  'an.gamma': { vi: 'Gamma theo strike', en: 'Gamma by strike' },
  'an.gammaNote': {
    vi: 'Put wall thường hành xử như hỗ trợ vì dealer phải mua vào để hedge quanh đó. Đây là mô hình suy từ open interest, không phải sổ vị thế thật của dealer.',
    en: 'The put wall often behaves like support because dealers must buy to hedge around it. This is inferred from open interest, not a dealer\u2019s actual book.',
  },
  'an.metaNote': {
    vi: (v: any) =>
      `Dữ liệu lấy ${v.bars} phiên (${v.first} → ${v.last}). Mỗi lần phân tích tốn 3 request Schwab.`,
    en: (v: any) =>
      `Built from ${v.bars} sessions (${v.first} → ${v.last}). Each analysis costs 3 Schwab requests.`,
  },

  // ---- fear & greed ----
  'fg.title': { vi: 'Fear & Greed Index', en: 'Fear & Greed Index' },
  'fg.loading': { vi: 'Đang tải chỉ số…', en: 'Loading the index…' },
  'fg.failed': {
    vi: 'Không lấy được Fear & Greed Index từ CNN. Đây là endpoint không chính thức nên thỉnh thoảng hỏng; phần còn lại của tab vẫn chạy.',
    en: 'Could not fetch the Fear & Greed Index from CNN. This is an unofficial endpoint and breaks now and then; the rest of the tab still works.',
  },
  // CNN's own band names, kept in English like every other market term in the
  // app; the note below the dial carries the meaning.
  'fg.extremeFear': { vi: 'Extreme Fear', en: 'Extreme Fear' },
  'fg.fear': { vi: 'Fear', en: 'Fear' },
  'fg.neutral': { vi: 'Neutral', en: 'Neutral' },
  'fg.greed': { vi: 'Greed', en: 'Greed' },
  'fg.extremeGreed': { vi: 'Extreme Greed', en: 'Extreme Greed' },
  'fg.lineAria': {
    vi: 'Fear & Greed Index một năm qua',
    en: 'Fear & Greed Index over the past year',
  },
  'fg.prevClose': { vi: 'Phiên trước', en: 'Previous close' },
  'fg.week': { vi: '1 tuần trước', en: '1 week ago' },
  'fg.month': { vi: '1 tháng trước', en: '1 month ago' },
  'fg.year': { vi: '1 năm trước', en: '1 year ago' },
  'fg.aria': {
    vi: (v: number) => `Fear & Greed Index một năm qua, hiện tại ${v} trên thang 0–100`,
    en: (v: number) => `Fear & Greed Index over the past year, currently ${v} out of 100`,
  },
  'fg.tip': {
    vi: (v: any) => `${v.date} · ${v.score}`,
    en: (v: any) => `${v.date} · ${v.score}`,
  },
  'fg.tipIdle': {
    vi: 'Rê chuột hoặc chạm lên đường để xem giá trị từng ngày.',
    en: 'Hover or drag along the line to read a day.',
  },
  'fg.note': {
    vi: 'Thang 0–100: dưới 45 là thị trường đang sợ, trên 55 là đang tham. Với người bán put thì hướng đọc ngược với trực giác — lúc sợ hãi là lúc IV cao và quyền chọn được trả hậu, còn lúc tham lam thì phí mỏng. Màu ở đây nói về tâm lý thị trường, không phải lên/xuống như màu trong bảng kết quả. Nguồn: CNN, endpoint không chính thức, cache 30 phút.',
    en: 'A 0–100 scale: below 45 the market is fearful, above 55 it is greedy. For a put seller the reading inverts against intuition — fear is when implied vol is high and options pay well, greed is when premium goes thin. Colour here means sentiment, not the up/down it means in the results table. Source: CNN, an unofficial endpoint, cached for 30 minutes.',
  },

  // ---- AI read ----
  'ai.title': { vi: 'Claude đọc chỉ số', en: 'Claude reads the indicators' },
  'ai.run': { vi: 'Nhờ Claude phân tích', en: 'Ask Claude' },
  'ai.rerun': { vi: 'Phân tích lại', en: 'Run again' },
  'ai.running': { vi: 'Đang đọc…', en: 'Reading…' },
  'ai.idle': {
    vi: 'Claude đọc các chỉ số ngay bên dưới và nói chúng hợp nhau hay mâu thuẫn ở đâu. Mỗi lần bấm tốn khoảng 3 cent tiền API, nên nó chỉ chạy khi bạn bấm.',
    en: 'Claude reads the indicators below and says where they agree and where they contradict each other. Each run costs a few cents of API credit, so it only runs when you ask.',
  },
  'ai.caveat': {
    vi: 'Claude chỉ đọc đúng những con số hiện trên trang này, không có tin tức hay dữ liệu ngoài. Đây là cách diễn giải chỉ số, không phải khuyến nghị mua bán — quyết định vẫn là của bạn.',
    en: 'Claude reads only the numbers on this page — no news, no outside data. This is a reading of the indicators, not a recommendation to buy or sell; the decision stays yours.',
  },
  'ai.notConfigured': {
    vi: 'Server chưa có ANTHROPIC_API_KEY. Thêm biến đó trên Render rồi thử lại.',
    en: 'The server has no ANTHROPIC_API_KEY. Add it on Render and try again.',
  },
  'ai.badKey': {
    vi: 'Khoá API bị từ chối. Kiểm tra lại ANTHROPIC_API_KEY trên Render.',
    en: 'The API key was rejected. Check ANTHROPIC_API_KEY on Render.',
  },
  'ai.rateLimited': {
    vi: 'Anthropic đang giới hạn tần suất. Đợi một lát rồi bấm lại.',
    en: 'Anthropic is rate limiting. Wait a moment and try again.',
  },
  'ai.refused': {
    vi: 'Claude từ chối trả lời yêu cầu này.',
    en: 'Claude declined to answer this request.',
  },
  'ai.failed': {
    vi: 'Gọi Claude thất bại. Xem log trên Render để biết lý do.',
    en: 'The call to Claude failed. Check the Render logs for the reason.',
  },

  // ---- misc ----
  'common.saving': { vi: ' đang lưu…', en: ' saving…' },
  'phase.quotes': { vi: 'Đang lấy báo giá…', en: 'Fetching quotes…' },
  'disclaimer': {
    vi: 'Công cụ sàng lọc, không phải khuyến nghị đầu tư. Bán put là cam kết mua 100 cổ phiếu tại giá strike — chỉ lọc những mã bạn thực sự muốn sở hữu. Dữ liệu quyền chọn có độ trễ theo quyền truy cập tài khoản Schwab của bạn.',
    en: 'A screening tool, not investment advice. Selling a put commits you to buying 100 shares at the strike — only screen tickers you would genuinely want to own. Option data carries whatever delay your Schwab account entitlement has.',
  },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: string, v?: any) => string };

const LangCtx = createContext<Ctx>({ lang: 'vi', setLang: () => {}, t: (k) => k });

export function LangProvider({ children }: { children: React.ReactNode }) {
  // 'vi' on the first pass so server and client render the same markup; the
  // saved choice is read on mount. An English user sees one Vietnamese frame,
  // which is the price of not shipping the language in a cookie.
  const [lang, setLangState] = useState<Lang>('vi');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'vi' || saved === 'en') setLangState(saved);
    } catch {
      /* private mode blocks localStorage: run anyway, just do not remember */
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* as above */
    }
    document.documentElement.setAttribute('lang', l);
  }, []);

  const t = useCallback(
    (k: string, v?: any) => {
      const entry = DICT[k]?.[lang];
      // Falling back to the key makes a missing string obvious on screen
      // rather than rendering an empty gap nobody notices.
      if (entry === undefined) return k;
      return typeof entry === 'function' ? entry(v) : entry;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}
