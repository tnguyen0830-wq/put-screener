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
  'tab.portfolio': { vi: 'My Portfolio', en: 'My Portfolio' },
  // Cố ý giữ NGUYÊN VĂN "Insider Trade" ở cả hai ngôn ngữ - người dùng
  // yêu cầu rõ tên tab này không đổi theo tiếng Việt/Anh.
  'tab.insider': { vi: 'Insider Trade', en: 'Insider Trade' },
  'brand.sub': { vi: 'Cash is king', en: 'Cash is king' },

  /* ---- Chú thích cho từng mã trên thanh giá cuộn đầu trang ---- */
  'tape.spx': { vi: 'Chỉ số S&P 500', en: 'S&P 500 Index' },
  'tape.ndx': { vi: 'Chỉ số Nasdaq 100', en: 'Nasdaq 100 Index' },
  'tape.rut': { vi: 'Quỹ ETF Russell 2000 (cổ phiếu vốn hoá nhỏ)', en: 'Russell 2000 ETF (small-cap stocks)' },
  'tape.vix': { vi: 'Chỉ số biến động CBOE - đo mức lo sợ của thị trường', en: 'CBOE Volatility Index - the market fear gauge' },
  'tape.gold': { vi: 'Hợp đồng tương lai vàng', en: 'Gold futures' },
  'tape.oil': { vi: 'Hợp đồng tương lai dầu thô WTI', en: 'WTI crude oil futures' },
  'tape.btc': { vi: 'Hợp đồng tương lai Bitcoin', en: 'Bitcoin futures' },
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
  'settings.session': { vi: 'Phiên đăng nhập', en: 'Your session' },
  'settings.signOut': { vi: 'Đăng xuất', en: 'Sign out' },
  'settings.unlocked': {
    vi: 'Trang này CHƯA KHOÁ — ai có đường link đều xem được danh mục của bạn. Đặt biến APP_PASSWORD trên server rồi deploy lại.',
    en: 'This site is NOT LOCKED — anyone with the link can see your portfolio. Set APP_PASSWORD on the server and redeploy.',
  },
  'settings.reconnect': { vi: 'Kết nối lại', en: 'Reconnect' },
  'settings.daysLeft': {
    vi: (d: string) =>
      `Còn ${d} ngày. Schwab giới hạn cứng 7 ngày, hết hạn là phải đăng nhập lại.`,
    en: (d: string) =>
      `${d} days left. Schwab caps refresh tokens at 7 days; after that you sign in again.`,
  },

  // ---- login ----
  'login.password': { vi: 'Mật khẩu', en: 'Password' },
  'login.enter': { vi: 'Vào', en: 'Enter' },
  'login.checking': { vi: 'Đang kiểm tra…', en: 'Checking…' },
  'login.wrong': { vi: 'Sai mật khẩu.', en: 'Wrong password.' },
  'login.tooMany': {
    vi: (s: number) => `Thử sai quá nhiều lần. Chờ ${Math.ceil(s / 60)} phút rồi thử lại.`,
    en: (s: number) => `Too many attempts. Wait ${Math.ceil(s / 60)} minutes and try again.`,
  },
  'login.noPassword': {
    vi: 'Server chưa đặt mật khẩu, nên không có gì để đăng nhập. Đặt APP_PASSWORD rồi deploy lại.',
    en: 'The server has no password set, so there is nothing to sign in to. Set APP_PASSWORD and redeploy.',
  },
  'login.failed': { vi: 'Không kết nối được server.', en: 'Could not reach the server.' },
  'login.what': {
    vi: 'Công cụ cá nhân, một người dùng. Đọc dữ liệu thị trường qua API chính thức dành cho nhà phát triển của Charles Schwab, bằng chính tài khoản của chủ trang. Ô mật khẩu phía trên là để bảo vệ dữ liệu của chủ trang, không thu thập thông tin của ai khác.',
    en: 'A private, single-user tool. It reads market data through Charles Schwab\u2019s official developer API using the owner\u2019s own credentials. The password above protects the owner\u2019s own data and is not collected from anyone else.',
  },
  'login.notAffiliated': {
    vi: 'Không liên kết, không được bảo trợ và không do Charles Schwab & Co., Inc. vận hành. Trang này không bao giờ hỏi mật khẩu Schwab của bạn — việc đăng nhập Schwab diễn ra trên schwab.com.',
    en: 'Not affiliated with, endorsed by, or operated by Charles Schwab & Co., Inc. This page never asks for your Schwab credentials — Schwab sign-in happens on schwab.com.',
  },
  'login.note': {
    vi: 'Trang riêng. Phiên đăng nhập giữ 30 ngày trên máy này; đổi mật khẩu trên server là mọi phiên cũ hết hiệu lực ngay.',
    en: 'Private. A session lasts 30 days on this device; changing the password on the server ends every existing session at once.',
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
  'filters.hardGates': { vi: 'Bật hard gates', en: 'Enable hard gates' },
  'filters.hardGatesNote': {
    vi: 'Loại thẳng hợp đồng trượt 1 trong 5 tiêu chí cố định: VRP (IV/HV) ≥ 1.0, không có earnings trong kỳ hợp đồng, OI ≥ 500 và khối lượng ≥ 100, spread ≤ 5%, chưa rơi quá 20% trong 20 phiên. Đây là số cố định, không đổi theo các ô phía trên - điểm số cao cũng không cứu được hợp đồng trượt.',
    en: 'Drops any contract failing one of five fixed checks: VRP (IV/HV) ≥ 1.0, no earnings inside the contract window, OI ≥ 500 and volume ≥ 100, spread ≤ 5%, not down more than 20% over 20 sessions. Fixed numbers, independent of the fields above - a high score never overrides a failed gate.',
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
  'res.saved': {
    vi: (at: number) => {
      const d = new Date(at);
      const same = d.toDateString() === new Date().toDateString();
      const gio = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const ngay = same ? 'hôm nay' : d.toLocaleDateString('vi-VN');
      return `Kết quả của lần quét lúc ${gio} ${ngay} - đây là ảnh chụp, giá và IV đã cũ. Bấm quét lại để lấy số mới.`;
    },
    en: (at: number) => {
      const d = new Date(at);
      const same = d.toDateString() === new Date().toDateString();
      const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const day = same ? 'today' : d.toLocaleDateString('en-US');
      return `From the scan at ${time} ${day} - a snapshot, so prices and IV are stale. Run the scan again for fresh numbers.`;
    },
  },
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
  'gex.updatedAt': {
    vi: (time: string) => `Cập nhật lúc ${time}`,
    en: (time: string) => `Updated at ${time}`,
  },

  /* ---- AI Trade Briefing (trong khung GEX) ---- */
  'tb.title': { vi: 'Phân tích giao dịch AI', en: 'AI Trade Briefing' },
  'tb.run': { vi: 'Phân tích AI', en: 'Run AI analysis' },
  'tb.rerun': { vi: 'Phân tích lại', en: 'Run again' },
  'tb.running': { vi: 'Đang tính toán…', en: 'Computing…' },
  'tb.note': {
    vi: 'Toàn bộ strike, giá, lãi/lỗ tối đa và điểm hoà vốn dưới đây tính từ giá thật trên chuỗi quyền chọn Schwab (không phải Claude tạo ra) - Claude chỉ viết phần diễn giải bên dưới. Chưa có mô hình biến động Heston (spot vol/long-run vol/half-life) và chưa có Calendar Spread - cả hai cần thêm hạ tầng riêng. Lỗ tối đa của lệnh bán put trần trụi tính đúng theo lý thuyết (hữu hạn, giá không xuống dưới 0), không dùng quy ước "Unlimited" lỏng lẻo.',
    en: "Every strike, price, max gain/loss and breakeven below comes from real Schwab option chain prices (not written by Claude) - Claude only writes the narrative underneath. No Heston volatility model (spot vol/long-run vol/half-life) and no Calendar Spread yet - both need dedicated infrastructure. A naked short put's max loss is computed correctly per payoff theory (finite, since price can't go below 0), not the loose \"Unlimited\" convention.",
  },
  'tb.regime': { vi: 'Chế độ GEX', en: 'GEX regime' },
  'tb.regimePositive': { vi: 'DƯƠNG — dealer hãm biến động', en: 'POSITIVE — dealers dampen moves' },
  'tb.regimeNegative': { vi: 'ÂM — dealer khuếch đại biến động', en: 'NEGATIVE — dealers amplify moves' },
  'tb.horizonShort': { vi: 'Ngắn hạn', en: 'Short term' },
  'tb.horizonMedium': { vi: 'Trung hạn', en: 'Medium term' },
  'tb.nextExp': {
    vi: (v: any) => `Đáo hạn: ${v.exp}, còn ${v.dte} ngày`,
    en: (v: any) => `Expiration: ${v.exp}, ${v.dte} DTE`,
  },
  'tb.expMove': { vi: 'Biên độ kỳ vọng', en: 'Expected move' },
  'tb.termSkew': { vi: 'Term structure / Skew', en: 'Term structure / skew' },
  'tb.cost': { vi: 'Chi phí', en: 'Cost' },
  'tb.credit': { vi: 'Thu về', en: 'Credit' },
  'tb.maxGain': { vi: 'Lãi tối đa', en: 'Max gain' },
  'tb.maxLoss': { vi: 'Lỗ tối đa', en: 'Max loss' },
  'tb.unlimited': { vi: 'Không giới hạn', en: 'Unlimited' },
  'tb.breakeven': { vi: 'Hoà vốn', en: 'Breakeven' },
  'tb.rr': { vi: 'R/R', en: 'R/R' },
  'tb.noIdeas': {
    vi: 'Không có strike niêm yết đủ gần các mốc mục tiêu trong kỳ hạn này.',
    en: 'No listed strikes close enough to the target levels for this horizon.',
  },

  /* ---- SPX Market Maker Exposure (tab Heatmap) ---- */
  'gexmm.title': {
    vi: (sym: string) => `Gamma nhà tạo lập thị trường — ${sym}`,
    en: (sym: string) => `Market Maker Exposure — ${sym}`,
  },
  'gexmm.note': {
    vi: 'Tự tính từ chuỗi quyền chọn Schwab của chính bạn (giống biểu đồ GEX ở tab Phân tích), không phải dữ liệu CBOE trễ 15 phút. Tự làm mới mỗi 10 phút.',
    en: "Self-computed from your own Schwab option chain (same method as the Analyze tab's GEX chart), not CBOE's 15-minute-delayed feed. Auto-refreshes every 10 minutes.",
  },
  'gexmm.customPlaceholder': { vi: 'Mã khác…', en: 'Other ticker…' },
  'gexmm.go': { vi: 'Xem', en: 'Go' },
  'gexmm.zoomLabel': {
    vi: (n: number) => `Biên độ strike hiển thị: ±${n}%`,
    en: (n: number) => `Strike range shown: ±${n}%`,
  },

  // ---- detail drawer ----
  'dd.aria': { vi: (s: string) => `Chi tiết ${s}`, en: (s: string) => `${s} detail` },
  'dd.inWatchlist': { vi: '✓ Watchlist', en: '✓ Watchlist' },
  'dd.saveWatchlist': { vi: '+ Watchlist', en: '+ Watchlist' },
  'dd.close': { vi: 'Đóng', en: 'Close' },
  'dd.strike': { vi: 'Strike', en: 'Strike' },
  'dd.expiry': { vi: 'Đáo hạn', en: 'Expiry' },
  'dd.credit': { vi: 'Credit nhận', en: 'Credit received' },
  'dd.capital': { vi: 'Vốn khoá', en: 'Capital tied up' },
  'dd.breakeven': { vi: 'Break-even', en: 'Break-even' },
  'dd.annual': { vi: 'Lợi suất/năm (quy đổi)', en: 'Annualized (naive)' },
  'dd.roiExpired': { vi: 'Lợi suất nếu đáo hạn', en: 'Return if expired' },
  'dd.roiAssigned': { vi: 'Lợi suất nếu bị assign', en: 'Return if assigned' },
  'dd.maxLoss': { vi: 'Lỗ tối đa', en: 'Max loss' },
  'dd.gates': { vi: 'Hard gates', en: 'Hard gates' },
  'dd.scoreHead': { vi: 'Điểm số chi tiết', en: 'Score breakdown' },
  'dd.scoreYield': { vi: 'Lợi suất quy năm', en: 'Annualized yield' },
  'dd.scoreCushion': { vi: 'Đệm giá', en: 'Cushion' },
  'dd.scoreRichness': { vi: 'IV/HV', en: 'IV/HV' },
  'dd.scoreLiquidity': { vi: 'Thanh khoản', en: 'Liquidity' },
  'dd.scoreTotal': { vi: 'Tổng điểm', en: 'Total' },
  'dd.yieldNote': {
    vi: 'Lợi suất/năm chỉ là quy đổi theo tỷ lệ ngày, không phải cam kết lặp lại suốt năm. "Nếu bị assign" tính theo giá hiện tại, không phải giá lúc đáo hạn thật - giá còn thay đổi tới lúc đó. Lỗ tối đa giả định cổ phiếu về 0.',
    en: 'Annualized is a naive day-count scaling, not a promise this rate repeats all year. "If assigned" uses today’s spot, not the real price at expiration - spot will move before then. Max loss assumes the stock goes to zero.',
  },
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

  // ---- my portfolio ----
  'pf.title': { vi: 'My Portfolio', en: 'My Portfolio' },
  'pf.loading': { vi: 'Đang tải danh mục…', en: 'Loading the portfolio…' },
  'pf.loadFailed': { vi: 'Không tải được danh mục.', en: 'Could not load the portfolio.' },
  'pf.errExpired': {
    vi: 'Phiên Schwab đã hết hạn. Kết nối lại để đọc vị thế.',
    en: 'The Schwab session has expired. Reconnect to read your positions.',
  },
  'pf.errNoAccess': {
    vi: 'App chưa có quyền đọc tài khoản Schwab (Accounts and Trading). Kiểm tra trên developer.schwab.com rồi kết nối lại.',
    en: 'This app does not have Schwab account access (Accounts and Trading) yet. Check developer.schwab.com, then reconnect.',
  },
  'pf.stockFallback': {
    vi: 'Chưa đọc được giá trị thị trường (marketValue) Schwab tự tính cho cổ phiếu - đang dùng giá thị trường sống thay thế, lời/lỗ không bị ảnh hưởng. Tên trường thật Schwab trả về:',
    en: "Could not read Schwab's own market value for shares - using a live price instead; P/L is unaffected. The real field names Schwab returned:",
  },
  'pf.rawToggle': {
    vi: 'Xem mọi số Schwab trả về cho cổ phiếu (đối chiếu trực tiếp)',
    en: "Show every number Schwab returned for shares (for direct comparison)",
  },
  'pf.quoteError': {
    vi: 'Chưa lấy được báo giá — vị thế vẫn còn nguyên, chỉ thiếu phần định giá lại. Kiểm tra kết nối Schwab trong Cài đặt.',
    en: 'No quotes came back — your positions are intact, only the live pricing is missing. Check the Schwab connection in Settings.',
  },
  'pf.emptyTitle': { vi: 'Chưa có vị thế nào', en: 'No positions yet' },
  'pf.emptyBody': {
    vi: 'Không thấy put đã bán hay cổ phiếu đang giữ nào trong tài khoản Schwab của bạn.',
    en: 'No sold puts or held shares found in your Schwab account.',
  },

  'pf.cashHead': { vi: 'Tiền mặt', en: 'Cash' },
  'pf.cash': { vi: 'Tiền mặt', en: 'Cash balance' },
  'pf.buyingPower': { vi: 'Sức mua', en: 'Buying power' },
  'pf.accountValue': { vi: 'Tổng giá trị TK', en: 'Account value' },

  'pf.openPl': { vi: 'Lời/lỗ đang mở', en: 'Open P/L' },
  'pf.dayPl': { vi: 'Lời/lỗ hôm nay', en: "Today's P/L" },
  'pf.realized': {
    vi: (y: number) => `Đã chốt ${y}`,
    en: (y: number) => `Realized ${y}`,
  },
  'pf.yearPl': {
    vi: (y: number) => `Cả năm ${y}`,
    en: (y: number) => `Full year ${y}`,
  },
  'pf.realizedToggle': {
    vi: (y: number) => `Lời/lỗ đã chốt ${y} theo từng mã`,
    en: (y: number) => `Realized ${y} P/L by symbol`,
  },
  'pf.realizedFailed': {
    vi: 'Chưa đọc được báo cáo lời/lỗ đã chốt. Nguyên văn lỗi:',
    en: 'Could not read the realized gain/loss report. The raw error:',
  },
  'pf.realizedTotal': { vi: 'Tổng đã chốt', en: 'Realized total' },
  'pf.earningsGap': {
    vi: 'Chưa có dữ liệu earnings cho những mã này, nên "Cần để ý" không cảnh báo được dù sắp earnings thật - thêm vào watchlist rồi chạy scripts/earnings-sync.js để lấy ngày:',
    en: 'No earnings data for these symbols yet, so "Needs attention" cannot warn even if earnings are close - add them to the watchlist and run scripts/earnings-sync.js to fetch the dates:',
  },
  'pf.realizedAsOf': {
    vi: (d: string) =>
      `Theo báo cáo Realized Gain/Loss của Schwab, tính tới ${d}. Muốn cập nhật thì xuất lại báo cáo và thay file trong data/realized.`,
    en: (d: string) =>
      `From Schwab's own Realized Gain/Loss report, as of ${d}. To update, export it again and replace the files in data/realized.`,
  },
  'pf.collateral': { vi: 'Tiền thế chấp', en: 'Cash secured' },
  'pf.creditTotal': { vi: 'Credit đã nhận', en: 'Credit received' },
  'pf.stockValue': { vi: 'Giá trị cổ phiếu', en: 'Share value' },
  'pf.nearestDte': { vi: 'Đáo hạn gần nhất', en: 'Nearest expiry' },
  'pf.attention': { vi: 'Cần để ý', en: 'Needs attention' },
  'pf.attentionValue': {
    vi: (v: any) => `${v.itm} trong tiền · ${v.earnings} sắp earnings · ${v.vol} vol cảnh báo`,
    en: (v: any) =>
      `${v.itm} in the money · ${v.earnings} with earnings due · ${v.vol} vol warnings`,
  },
  'pf.attnBackwardation': {
    vi: (v: any) =>
      `${v.symbol} — term structure ${v.slope} (dưới 0.95): thị trường đang định giá một sự kiện sắp xảy ra`,
    en: (v: any) =>
      `${v.symbol} — term structure ${v.slope} (below 0.95): the market is pricing a near-term event`,
  },
  'pf.attnSkew': {
    vi: (v: any) =>
      `${v.symbol} — put skew z-score ${v.z} (trên 2): thị trường đang trả giá cao bất thường cho bảo hiểm chiều giảm`,
    en: (v: any) =>
      `${v.symbol} — put skew z-score ${v.z} (above 2): the market is paying unusually much for downside protection`,
  },
  'pf.volWarming': {
    vi: 'Đang tính term structure và put skew cho các mã đang giữ — số sẽ hiện ở lần làm mới sau (mỗi 15 phút một lần, vì mỗi mã tốn một request chuỗi quyền chọn).',
    en: 'Computing term structure and put skew for held symbols — the numbers appear on the next refresh (every 15 minutes, since each symbol costs one option-chain request).',
  },
  'pf.volFailed': {
    vi: 'Chưa đọc được bề mặt vol cho những mã này. Nguyên văn lỗi:',
    en: 'Could not read the vol surface for these symbols. The raw error:',
  },
  'pf.attnItm': {
    vi: (v: any) => `${v.symbol} — đã vào trong tiền (strike $${v.strike})`,
    en: (v: any) => `${v.symbol} — in the money (strike $${v.strike})`,
  },
  'pf.attnEarnings': {
    vi: (v: any) => `${v.symbol} — earnings ${v.date}`,
    en: (v: any) => `${v.symbol} — earnings ${v.date}`,
  },
  'pf.days': {
    vi: (n: number) => `${n} ngày`,
    en: (n: number) => `${n} days`,
  },

  'pf.attnNote': {
    vi: 'Ba con số: đang trong tiền (giá đã xuống dưới strike, có thể bị assign) · sắp earnings trước ngày đáo hạn · vol cảnh báo. "Vol cảnh báo" đếm số put mà thị trường quyền chọn đang định giá rủi ro bất thường ở chính mã đó - hoặc term structure đảo (đang định giá một sự kiện sắp xảy ra), hoặc put skew cao bất thường (có người trả giá cao khác thường để mua bảo hiểm chiều giảm). Số 0 nghĩa là không mã nào đang bị như vậy. Bấm vào để xem đúng mã nào.',
    en: 'Three counts: in the money (price below your strike, assignment possible) · earnings due before expiry · vol warnings. "Vol warnings" counts puts where the options market is pricing unusual risk in that specific name - either term structure inverted (an event is being priced in) or put skew unusually high (someone is paying up for downside protection). Zero means none are. Tap to see which symbols.',
  },
  'pf.sizingIntro': {
    vi: 'Bán 1 put là cam kết mua 100 cổ phiếu tại strike. Bốn giới hạn dưới đây trả lời cùng một câu hỏi: nếu bị assign, số tiền phải bỏ ra chiếm bao nhiêu phần trăm tài khoản. Theo mã (5%) - một mã sập không được phép làm hỏng tài khoản. Theo ngành (20%) - cả ngành cùng rớt là chuyện có thật. Tổng cash-secured (50%) - giữ lại một nửa để còn xoay xở. Cluster (30%) - đây là cái tinh tế nhất: bán put trên 10 mã công nghệ tương quan 0.9 với nhau thực chất là MỘT lệnh lớn, không phải mười lệnh nhỏ, và ba giới hạn trên không nhìn ra điều đó. Xanh là trong giới hạn, đỏ là đã vượt.',
    en: 'Selling one put commits you to buying 100 shares at the strike. All four limits below answer the same question: if assigned, what share of the account does that cost? Per symbol (5%) - one blow-up must not wreck the account. Per sector (20%) - whole sectors do fall together. Total cash-secured (50%) - keep half in reserve. Cluster (30%) - the subtle one: ten puts on tech names correlated 0.9 are really ONE large position, not ten small ones, and the first three limits cannot see that. Green is within limits, red is over.',
  },
  'pf.sizingHead': { vi: 'Quản lý quy mô vị thế', en: 'Position sizing' },
  'pf.sizingFailed': {
    vi: 'Chưa tính được cluster exposure. Nguyên văn lỗi:',
    en: 'Could not compute cluster exposure. The raw error:',
  },
  'pf.sizingTotal': {
    vi: (limit: number) => `Tổng cash-secured / TK (giới hạn ${limit}%)`,
    en: (limit: number) => `Total cash-secured / account (limit ${limit}%)`,
  },
  'pf.sizingCluster': {
    vi: (limit: number) => `Cluster exposure (giới hạn ${limit}%)`,
    en: (limit: number) => `Cluster exposure (limit ${limit}%)`,
  },
  'pf.sizingBySymbol': {
    vi: (limit: number) => `Theo mã (giới hạn ${limit}%/mã)`,
    en: (limit: number) => `By symbol (limit ${limit}%/symbol)`,
  },
  'pf.sizingBySector': {
    vi: (limit: number) => `Theo ngành (giới hạn ${limit}%/ngành)`,
    en: (limit: number) => `By sector (limit ${limit}%/sector)`,
  },
  'pf.sizingClusterPairs': { vi: 'Các cặp tương quan cao', en: 'Highest-correlated pairs' },
  'pf.sizingClusterNote': {
    vi: 'Đóng góp = căn bậc hai (thế chấp mã A × thế chấp mã B) × hệ số tương quan 60 phiên. Hai vị thế tương quan gần 1 coi như cộng gộp thành một vị thế lớn hơn về rủi ro tập trung.',
    en: 'Contribution = sqrt(symbol A collateral × symbol B collateral) × 60-session correlation. Two positions correlated near 1 behave like one larger position for concentration risk.',
  },
  'pf.sizingClusterContribution': { vi: 'đóng góp', en: 'contribution' },
  'pf.sizingClusterGap': {
    vi: 'Chưa đủ lịch sử giá 60 phiên cho những mã này nên chưa tính được tương quan:',
    en: 'Not enough 60-session price history for these symbols to compute correlation yet:',
  },

  // ---- cảnh báo đẩy ----
  'al.head': { vi: 'Thông báo về điện thoại', en: 'Phone alerts' },
  'al.on': { vi: 'Đang bật', en: 'On' },
  'al.off': { vi: 'Chưa cấu hình', en: 'Not configured' },
  'al.notSubscribed': { vi: 'Chưa đăng ký trên máy này', en: 'Not subscribed on this device' },
  'al.webPush': { vi: 'Thông báo trình duyệt', en: 'Browser push' },
  'al.lastRun': { vi: 'Kiểm tra lúc', en: 'Last checked' },
  'al.enablePush': { vi: 'Bật thông báo trên máy này', en: 'Enable on this device' },
  'al.test': { vi: 'Gửi thử ngay', en: 'Send a test now' },
  'al.closed': {
    vi: 'Ngoài giờ giao dịch nên không kiểm tra - chuỗi quyền chọn không đổi, kiểm tra chỉ tốn hạn mức request.',
    en: 'Outside market hours, so no check runs - the option chain does not move and checking only burns rate limit.',
  },
  'al.nothingOn': {
    vi: 'Chưa kênh nào được cấu hình, nên sẽ không có thông báo nào được gửi. Đặt TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID hoặc VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY trên Render.',
    en: 'No channel configured, so nothing will be sent. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID or VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY on Render.',
  },
  'al.runErrors': { vi: 'Lần kiểm tra gần nhất báo lỗi:', en: 'The last check reported:' },
  'al.testOk': {
    vi: (v: any) => `Đã chạy: tìm thấy ${v.found} cảnh báo, gửi đi ${v.sent}. (Đã gửi hôm nay rồi thì không gửi lại.)`,
    en: (v: any) => `Ran: ${v.found} alerts found, ${v.sent} sent. (Anything already sent today is not re-sent.)`,
  },
  'al.unsupported': { vi: 'Trình duyệt này không hỗ trợ thông báo đẩy.', en: 'This browser does not support push notifications.' },
  'al.noVapid': { vi: 'Server chưa đặt khoá VAPID.', en: 'The server has no VAPID key set.' },
  'al.denied': { vi: 'Bạn đã từ chối quyền thông báo. Bật lại trong cài đặt trình duyệt.', en: 'Notification permission was denied. Re-enable it in browser settings.' },
  'al.subFailed': { vi: 'Không lưu được đăng ký.', en: 'Could not save the subscription.' },
  'al.subOk': { vi: 'Xong - máy này sẽ nhận thông báo.', en: 'Done - this device will receive alerts.' },
  'al.statusFailed': { vi: 'Không đọc được trạng thái bộ cảnh báo:', en: 'Could not read alert status:' },
  'al.loading': { vi: 'Đang đọc trạng thái…', en: 'Reading status…' },
  'al.needChatId': { vi: 'Có token, thiếu chat id', en: 'Token set, chat id missing' },
  'al.findChat': { vi: 'Tìm chat id giúp tôi', en: 'Find my chat id' },
  'al.probeFailed': { vi: 'Telegram từ chối:', en: 'Telegram refused:' },
  'al.probeBot': {
    vi: (b: string) => `Token này thuộc bot ${b}. Nếu không phải bot bạn định dùng thì token đang sai.`,
    en: (b: string) => `This token belongs to bot ${b}. If that is not the bot you meant, the token is wrong.`,
  },
  'al.probeNoChat': {
    vi: (b: string) => `Chưa ai nhắn cho bot ${b}. Mở Telegram, tìm đúng ${b}, bấm START rồi gửi một chữ bất kỳ, sau đó bấm lại nút này.`,
    en: (b: string) => `Nobody has messaged ${b} yet. Open Telegram, find ${b}, press START, send any message, then press this button again.`,
  },
  'al.note': {
    vi: 'Kiểm tra 15 phút một lần trong giờ giao dịch. Mỗi loại cảnh báo mỗi mã chỉ gửi tối đa một lần mỗi ngày, nên hộp thư không bị dội. Cố tình KHÔNG báo lời/lỗ hằng ngày - thứ kêu suốt là thứ bị bỏ qua. Trên iPhone, thông báo trình duyệt chỉ chạy sau khi bạn "Thêm vào màn hình chính"; Telegram thì không cần.',
    en: 'Checks every 15 minutes during market hours. Each alert per symbol is sent at most once a day, so the inbox never floods. Daily P/L is deliberately NOT alerted - something that pings constantly is something you learn to ignore. On iPhone, browser push only works after "Add to Home Screen"; Telegram needs no such step.',
  },

  'pf.calls': { vi: 'Call đã bán', en: 'Calls sold' },
  'pf.callsNote': {
    vi: 'Ngược hẳn với put đã bán: put sợ giá RƠI xuống dưới strike (phải mua cổ phiếu), call sợ giá VỌT lên trên strike (bị gọi mất cổ phiếu ở giá strike). Nên cột "Cách strike" ở đây đo khoảng còn được tăng, không phải khoảng còn được giảm. Covered = cổ phiếu bạn đang giữ đủ bảo chứng, xấu nhất là bán mất ở giá strike. Naked = không đủ cổ phiếu, lỗ về lý thuyết không có giới hạn. Credit của call ĐƯỢC cộng vào "Credit đã nhận", nhưng cố ý KHÔNG cộng vào "Tiền thế chấp" - covered call khoá cổ phiếu chứ không khoá tiền, mà giá trị cổ phiếu đã nằm sẵn ở ô riêng rồi.',
    en: 'The mirror image of a sold put: a put fears price FALLING below the strike (you must buy), a call fears price RISING above it (your shares get called away at the strike). So "To strike" here measures the room left to rise, not to fall. Covered = your shares fully back the contracts, worst case is selling them at the strike. Naked = they do not, and the theoretical loss is unbounded. Call credit IS counted in "Credit received" but deliberately NOT in "Cash secured" - a covered call ties up shares, not cash, and those shares are already counted in their own tile.',
  },
  'pf.longPuts': { vi: 'Put đã mua', en: 'Puts bought' },
  'pf.longPutsNote': {
    vi: 'Đây là bảo hiểm, không phải nguồn thu: bạn đã TRẢ tiền chứ không nhận. Nên lời/lỗ tính ngược với put đã bán - giá trị bây giờ trừ đi số đã bỏ ra. Vào trong tiền ở đây là chuyện TỐT (bảo hiểm đang có giá trị thật), nên không tô đỏ. Cột "Cách strike" cho biết giá còn phải rơi bao nhiêu nữa thì bảo hiểm mới bắt đầu ăn tiền.',
    en: 'This is insurance, not income: you PAID for it rather than received. So P/L is the reverse of a sold put - what it is worth now minus what you paid. Being in the money here is GOOD (the insurance has real value), so it is not marked red. "To strike" shows how much further price must fall before the protection starts paying.',
  },
  'pf.covered': { vi: ' · covered', en: ' · covered' },
  'pf.naked': { vi: ' · KHÔNG có cổ phiếu bảo chứng', en: ' · NOT covered by shares' },
  'pf.colToStrike': { vi: 'Cách strike', en: 'To strike' },
  'pf.colPaid': { vi: 'Đã trả', en: 'Paid' },
  'pf.puts': { vi: 'Put đã bán', en: 'Puts sold' },
  'pf.shares': { vi: 'Cổ phiếu đang giữ', en: 'Shares held' },

  'pf.colSymbol': { vi: 'Mã', en: 'Symbol' },
  'pf.colStrike': { vi: 'Strike', en: 'Strike' },
  'pf.colExp': { vi: 'Đáo hạn', en: 'Expiry' },
  'pf.colCredit': { vi: 'Credit', en: 'Credit' },
  'pf.colNow': { vi: 'Bây giờ', en: 'Now' },
  'pf.colPl': { vi: 'Lời/lỗ', en: 'P/L' },
  'pf.colCaptured': { vi: 'Đã ăn', en: 'Captured' },
  'pf.colCushion': { vi: 'Cách strike', en: 'Cushion' },
  'pf.colRoc': { vi: 'ROC/năm còn lại', en: 'ROC p.a. left' },
  'pf.colShares': { vi: 'Số cp', en: 'Shares' },
  'pf.colCost': { vi: 'Giá vốn', en: 'Cost' },
  'pf.colValue': { vi: 'Giá trị', en: 'Value' },
  'pf.colDayPl': { vi: 'Hôm nay', en: 'Today' },
  'pf.earnings': {
    vi: (d: string) => `earnings ${d}`,
    en: (d: string) => `earnings ${d}`,
  },

  'pf.skippedToggle': {
    vi: (n: number) => `${n} vị thế khác không hiện ở đây`,
    en: (n: number) => `${n} other position${n === 1 ? '' : 's'} not shown`,
  },
  'pf.skipLongCall': { vi: 'call đã mua, chưa theo dõi', en: 'bought call, not tracked' },
  'pf.skipLongPut': { vi: 'put đã mua, chưa theo dõi', en: 'bought put, not tracked' },
  'pf.skipShortStock': { vi: 'cổ phiếu bán khống, chưa theo dõi', en: 'short stock, not tracked' },
  'pf.skipMissingPrice': {
    vi: 'thiếu giá vốn từ Schwab',
    en: 'missing cost basis from Schwab',
  },
  'pf.skipUnrecognized': {
    vi: 'không đọc được ký hiệu hợp đồng',
    en: 'unrecognized contract symbol',
  },
  'pf.skipAssetType': {
    vi: 'loại tài sản chưa theo dõi',
    en: 'asset type not tracked',
  },
  'pf.skipOther': { vi: 'chưa theo dõi', en: 'not tracked' },

  'pf.note': {
    vi: 'Đọc thẳng từ tài khoản Schwab của bạn (quyền Accounts and Trading), không nhập tay. Tiền mặt và sức mua cũng lấy trực tiếp từ Schwab — ô nào không hiện nghĩa là Schwab không trả về đúng trường đó cho loại tài khoản này, không phải tài khoản trống. Giá mua lại, lời lỗ, phần credit đã ăn, khoảng cách tới strike — tính lại mỗi phút từ báo giá Schwab. ROC/năm còn lại là giá trị thời gian còn lại quy theo số ngày còn lại: giữ tới đáo hạn thì tiền thế chấp còn sinh lời bấy nhiêu một năm, và đó là con số để so với cơ hội mới bên tab screener trước khi quyết định đóng sớm. Hợp đồng đã vào trong tiền thì phần nội tại không được tính vào — đó là khoản lỗ đang mang, không phải lợi nhuận còn kiếm được. Tiền thế chấp tính theo kiểu cash-secured, tức strike × 100 × số hợp đồng. Theo dõi put đã bán, call đã bán, put đã mua và cổ phiếu đang giữ dài hạn - mỗi loại một bảng riêng vì công thức lời/lỗ và chiều rủi ro của chúng khác nhau. Call đã mua và cổ phiếu bán khống vẫn chưa theo dõi, nhưng được gọi tên riêng bên dưới thay vì lặng lẽ biến mất.',
    en: 'Read directly from your Schwab account (Accounts and Trading access), not typed in by hand. Cash and buying power come straight from Schwab too — a missing tile means Schwab did not return that field for this account type, not that the account is empty. The buy-back price, the profit, how much of the credit is captured, the distance to the strike — all recomputed every minute from Schwab quotes. ROC p.a. left is the time value still in the contract, annualised over the days remaining: hold to expiry and that is what the collateral still earns, which is the number to weigh against a fresh opportunity in the screener before closing early. On a contract that has gone in the money the intrinsic part is excluded — that is a loss being carried, not a return still to come. Collateral is the cash-secured figure, strike × 100 × contracts. Sold puts, sold calls, bought puts and long-held shares are each tracked in their own table, because their P/L formulas and risk directions differ. Bought calls and short stock are still untracked, but are named below rather than silently disappearing.',
  },

  // ---- sector rotation (RRG) ----
  'rrg.title': { vi: 'Luân chuyển dòng tiền (RRG)', en: 'Sector rotation (RRG)' },
  'rrg.loading': { vi: 'Đang tính vòng xoay ngành…', en: 'Computing the rotation…' },
  'rrg.loadFailed': {
    vi: 'Chưa dựng được biểu đồ luân chuyển. Các phần khác vẫn chạy.',
    en: 'Could not build the rotation chart. Everything else still works.',
  },
  'rrg.aria': {
    vi: 'Biểu đồ luân chuyển dòng tiền giữa 11 ngành của S&P 500',
    en: 'Rotation chart for the 11 S&P 500 sectors',
  },
  'rrg.xAxis': { vi: 'RS-Ratio → mạnh hơn', en: 'RS-Ratio → stronger' },
  'rrg.yAxis': { vi: '↑ RS-Momentum', en: '↑ RS-Momentum' },

  'rrg.q.leading': { vi: 'Dẫn đầu', en: 'Leading' },
  'rrg.q.weakening': { vi: 'Đuối dần', en: 'Weakening' },
  'rrg.q.lagging': { vi: 'Tụt lại', en: 'Lagging' },
  'rrg.q.improving': { vi: 'Đang hồi', en: 'Improving' },
  'rrg.qNote.leading': {
    vi: 'mạnh hơn mặt bằng và còn mạnh thêm',
    en: 'stronger than the pack and still gaining',
  },
  'rrg.qNote.weakening': {
    vi: 'còn mạnh nhưng đà đang mất',
    en: 'still strong but losing steam',
  },
  'rrg.qNote.lagging': {
    vi: 'yếu hơn mặt bằng và còn yếu thêm',
    en: 'weaker than the pack and still slipping',
  },
  'rrg.qNote.improving': {
    vi: 'còn yếu nhưng đang lấy lại đà',
    en: 'still weak but picking up',
  },

  'rrg.s.tech': { vi: 'Công nghệ', en: 'Technology' },
  'rrg.s.fin': { vi: 'Tài chính', en: 'Financials' },
  'rrg.s.health': { vi: 'Y tế', en: 'Health care' },
  'rrg.s.discretionary': { vi: 'Tiêu dùng ko thiết yếu', en: 'Discretionary' },
  'rrg.s.staples': { vi: 'Tiêu dùng thiết yếu', en: 'Staples' },
  'rrg.s.energy': { vi: 'Năng lượng', en: 'Energy' },
  'rrg.s.industrial': { vi: 'Công nghiệp', en: 'Industrials' },
  'rrg.s.material': { vi: 'Vật liệu', en: 'Materials' },
  'rrg.s.realestate': { vi: 'Bất động sản', en: 'Real estate' },
  'rrg.s.utility': { vi: 'Tiện ích', en: 'Utilities' },
  'rrg.s.comm': { vi: 'Truyền thông', en: 'Communications' },

  'rrg.hover': {
    vi: (v: any) =>
      `${v.name} (${v.symbol}) · RS-Ratio ${v.ratio} · RS-Momentum ${v.momentum} · ${v.quadrant}`,
    en: (v: any) =>
      `${v.name} (${v.symbol}) · RS-Ratio ${v.ratio} · RS-Momentum ${v.momentum} · ${v.quadrant}`,
  },
  'rrg.hoverIdle': {
    vi: (v: any) =>
      `Mỗi cái đuôi là ${v.weeks} tuần gần nhất (${v.from} → ${v.to}). Rê chuột hoặc chạm vào một ngành để xem số.`,
    en: (v: any) =>
      `Each tail is the last ${v.weeks} weeks (${v.from} → ${v.to}). Hover or tap a sector for its numbers.`,
  },
  'rrg.tableToggle': { vi: 'Xem bảng số', en: 'Show the numbers' },
  'rrg.colSector': { vi: 'Ngành', en: 'Sector' },
  'rrg.colQuadrant': { vi: 'Góc phần tư', en: 'Quadrant' },
  'rrg.note': {
    vi: 'Toạ độ tính từ giá tuần của 11 quỹ ngành SPDR so với SPY, lấy từ Schwab: chênh lệch hai đường EMA của sức mạnh tương đối, rồi so với mặt bằng của cả 11 ngành trong cùng tuần — nên 100 nghĩa là ngang bằng mặt bằng chung, không phải ngang bằng SPY. Công thức RS-Ratio/RS-Momentum gốc của JdK không được công bố, đây là bản dựng lại: vòng xoay và thứ tự ngành đọc như bản gốc, con số tuyệt đối thì không nhất thiết trùng. Vị trí góc phần tư mô tả trạng thái, không phải khuyến nghị mua bán.',
    en: 'Coordinates are computed from weekly Schwab prices for the 11 SPDR sector funds against SPY: the gap between two EMAs of relative strength, then scored against where all 11 sectors sit that same week — so 100 means level with the pack, not level with SPY. JdK\u2019s original RS-Ratio/RS-Momentum formula is unpublished; this is a reconstruction, so the rotation and the ordering read like the original while the absolute numbers need not match. A quadrant describes a state, not a recommendation.',
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
  'an.inWatchlist': { vi: '✓ Watchlist', en: '✓ Watchlist' },
  'an.saveWatchlist': { vi: '+ Watchlist', en: '+ Watchlist' },
  'an.low52': { vi: (v: string) => `Đáy 52T ${v}`, en: (v: string) => `52w low ${v}` },
  'an.high52': { vi: (v: string) => `Đỉnh 52T ${v}`, en: (v: string) => `52w high ${v}` },
  'an.ofRange': { vi: (v: string) => `${v} biên độ`, en: (v: string) => `${v} of range` },
  // ---- company profile ----
  'an.company': { vi: 'Thông tin công ty', en: 'Company profile' },
  'an.ceo': { vi: 'CEO', en: 'CEO' },
  'an.employees': { vi: 'Nhân viên', en: 'Employees' },
  'an.ipo': { vi: 'Ngày IPO', en: 'IPO date' },
  'an.listedOn': { vi: 'Sàn niêm yết', en: 'Listed on' },
  'an.more': { vi: 'Xem thêm', en: 'Show more' },
  'an.less': { vi: 'Thu gọn', en: 'Show less' },
  'an.companyNote': {
    vi: 'Mô tả doanh nghiệp lấy từ FMP; lĩnh vực, ngành và quốc gia lấy từ trang quote Finviz. Đây là phần phụ — nguồn nào hỏng thì trường đó trống, phần phân tích vẫn chạy đủ.',
    en: 'The business description comes from FMP; sector, industry and country come from the Finviz quote page. This section is supplementary — if a source fails those fields go blank and the rest of the analysis still runs.',
  },
  'an.companyNoKey': {
    vi: 'Chưa có mô tả doanh nghiệp: server chưa đặt FMP_API_KEY.',
    en: 'No business description: the server has no FMP_API_KEY set.',
  },
  'an.companyNoBio': {
    vi: 'Chưa lấy được mô tả doanh nghiệp cho mã này.',
    en: 'No business description came back for this ticker.',
  },

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

  // A plus reads as "add" at a glance where a star did not; the tick that
  // replaces it says the symbol is already saved, and the tooltip says that
  // clicking again takes it back out.
  'wl.addTitle': {
    vi: 'Thêm mã này vào watchlist',
    en: 'Add this ticker to the watchlist',
  },
  'wl.removeTitle': {
    vi: 'Đã có trong watchlist — bấm để bỏ ra',
    en: 'Already in the watchlist — click to remove',
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

  /* ---- Người nội bộ (Form 4) ---- */
  'ins.title': { vi: 'Người nội bộ đang mua', en: 'Insider buying' },
  'ins.subForm4': { vi: 'Người nội bộ', en: 'Insiders' },
  'ins.subCongress': { vi: 'Quốc hội', en: 'Congress' },
  'ins.subFlow': { vi: 'Quyền chọn', en: 'Options Flow' },
  'ins.subDarkpool': { vi: 'Dark Pool', en: 'Dark Pool' },
  'ins.intro': {
    vi: 'Sếp và thành viên hội đồng quản trị bắt buộc phải khai báo với SEC trong 2 ngày làm việc mỗi khi mua bán cổ phiếu công ty mình (mẫu Form 4). Bảng này chỉ đếm MỘT loại giao dịch: tự bỏ tiền túi mua ngoài thị trường (SEC ký hiệu là mã P). Cổ phiếu được thưởng, quyền chọn đem đi thực hiện, hay cổ phiếu nộp lại để đóng thuế đều KHÔNG tính — đó là lương, không phải niềm tin. Giao dịch nằm trong kế hoạch 10b5-1 đăng ký sẵn từ nhiều tháng trước cũng bị loại, vì nó chạy tự động và không nói lên sếp nghĩ gì hôm nay.',
    en: 'Officers and directors must report to SEC within two business days whenever they trade their own company stock (Form 4). This table counts one kind of transaction only: buying on the open market with their own money (SEC code P). Granted stock, exercised options and shares handed back to cover tax are all excluded — that is compensation, not conviction. Purchases made under a 10b5-1 plan adopted months earlier are excluded too, because they run automatically and say nothing about what the filer thinks today.',
  },
  'ins.clusterNote': {
    vi: (n: number) =>
      `Đếm theo SỐ NGƯỜI khác nhau, không phải số lượt mua: một người mua năm lần vẫn là một người tin tưởng, còn năm người cùng mua thì mạnh hơn hẳn. Từ ${n} người trở lên được đánh dấu "cả nhóm cùng mua".`,
    en: (n: number) =>
      `Counted by distinct PEOPLE, not purchases: one person buying five times is still one person, while five people buying is a far stronger signal. ${n} or more gets flagged as a cluster buy.`,
  },
  'ins.lookback': {
    vi: (n: number) => `Trong ${n} ngày gần nhất`,
    en: (n: number) => `Last ${n} days`,
  },
  'ins.colSymbol': { vi: 'Mã', en: 'Symbol' },
  'ins.colBuyers': { vi: 'Số người mua', en: 'Buyers' },
  'ins.colValue': { vi: 'Tổng tiền bỏ ra', en: 'Total spent' },
  'ins.colLast': { vi: 'Mua gần nhất', en: 'Last buy' },
  'ins.colWho': { vi: 'Ai mua', en: 'Who' },
  'ins.cluster': { vi: 'Cả nhóm cùng mua', en: 'Cluster buy' },
  'ins.shares': {
    vi: (n: number) => `${n.toLocaleString('vi-VN')} cp`,
    en: (n: number) => `${n.toLocaleString('en-US')} sh`,
  },
  'ins.noPrice': { vi: 'SEC không ghi giá', en: 'SEC listed no price' },
  'ins.viewFiling': { vi: 'Xem hồ sơ gốc ở SEC', en: 'View filing at SEC' },
  'ins.none': {
    vi: 'Không mã nào có người nội bộ mua trong kỳ.',
    en: 'No insider buying in any tracked symbol this period.',
  },
  'ins.noneNote': {
    vi: 'Đây thường là chuyện bình thường, nhất là với công ty lớn: sếp ở đó được cấp cổ phiếu rồi bán ra, hiếm khi tự bỏ tiền mua thêm. Bảng trống KHÔNG có nghĩa là tin xấu.',
    en: 'This is usually the normal state, especially for large companies: executives there are granted stock and sell it, and rarely buy more with their own money. An empty table is not bad news.',
  },
  'ins.noneTracked': {
    vi: 'Chưa có mã nào để theo dõi.',
    en: 'Nothing being tracked yet.',
  },
  'ins.noneTrackedNote': {
    vi: 'Tab này chỉ hỏi SEC về mã trong watchlist và mã đang thật sự giữ ở Schwab - khác hẳn bảng trống vì "đã hỏi, sạch thật". Thêm mã vào watchlist ở tab Sell Put Screener, hoặc bấm Đồng bộ lại nếu vừa kết nối Schwab.',
    en: 'This tab only asks SEC about watchlist symbols and what you actually hold at Schwab - not the same as an empty table because "asked, genuinely clean". Add symbols to your watchlist on the Sell Put Screener tab, or reconnect Schwab if you just did and press sync again.',
  },
  'ins.unavailableHead': { vi: 'Những mã chưa có dữ liệu', en: 'Symbols with no data yet' },
  'ins.unavail.noFiler': {
    vi: 'Mã này không có ai nộp Form 4 ở SEC — thường là ETF hoặc quỹ.',
    en: 'Nobody files Form 4 for this symbol — usually an ETF or a fund.',
  },
  'ins.unavail.neverChecked': {
    vi: 'Chưa hỏi SEC về mã này lần nào.',
    en: 'This symbol has never been looked up at SEC.',
  },
  'ins.unavail.fetchFailed': {
    vi: 'Có hỏi SEC nhưng không được, nên vẫn chưa biết gì.',
    en: 'SEC was asked but refused, so nothing is known yet.',
  },
  'ins.unavailableNote': {
    vi: 'Quan trọng: "đã hỏi SEC và không ai mua" khác hẳn "chưa hỏi được". Mã nào nằm dưới đây là app CHƯA biết gì về nó, đừng đọc thành sạch sẽ.',
    en: 'Important: "asked SEC and nobody is buying" is not the same as "could not ask". Anything listed below is a symbol this app knows nothing about yet — do not read it as clean.',
  },
  'ins.lastRun': {
    vi: (at: number) => `Đồng bộ lần cuối: ${new Date(at).toLocaleString('vi-VN')}`,
    en: (at: number) => `Last synced: ${new Date(at).toLocaleString('en-US')}`,
  },
  'ins.neverRun': {
    vi: 'Chưa đồng bộ với SEC lần nào. Vòng lặp nền chạy mỗi ngày một lần, hoặc bấm nút bên cạnh để chạy ngay.',
    en: 'Never synced with SEC. The background loop runs once a day, or press the button to run it now.',
  },
  'ins.syncNow': { vi: 'Đồng bộ ngay', en: 'Sync now' },
  'ins.syncing': { vi: 'Đang hỏi SEC…', en: 'Asking SEC…' },
  'ins.syncDone': {
    vi: (r: { checked: number; fetched: number }) =>
      `Đã kiểm tra ${r.checked} mã, tải thêm ${r.fetched} hồ sơ mới.`,
    en: (r: { checked: number; fetched: number }) =>
      `Checked ${r.checked} symbols, downloaded ${r.fetched} new filings.`,
  },
  'ins.holdingsError': {
    vi: 'Không đọc được danh mục đang giữ, nên bảng này chỉ gồm các mã trong watchlist. Mã đang giữ mà chưa thêm vào watchlist sẽ không được theo dõi.',
    en: 'Could not read your holdings, so this table covers watchlist symbols only. A held symbol that was never added to the watchlist is not being tracked.',
  },
  'ins.errors': { vi: 'Lỗi khi hỏi SEC', en: 'Errors talking to SEC' },
  'ins.scope': {
    vi: (n: number) =>
      `Theo dõi ${n} mã: cả rổ S&P 500, cộng watchlist và những mã đang thật sự giữ (có thể nằm ngoài rổ). Mã không nằm trong ba nhóm đó thì không được hỏi, và cũng không thể cảnh báo.`,
    en: (n: number) =>
      `Tracking ${n} symbols: the whole S&P 500, plus your watchlist and what you actually hold (which may fall outside the index). Anything outside those three is never asked about, and cannot be warned about either.`,
  },
  'ins.sp500Note': {
    vi: 'Rổ S&P 500 có khoảng 500 mã. Lượt quét NGUỘI đầu tiên (chưa có gì trong bộ nhớ) có thể mất hàng chục phút vì hỏi SEC tuần tự, giới hạn tốc độ để không bị chặn - cứ để app chạy, không cần ngồi canh. Từ ngày thứ hai trở đi chỉ còn vài mã mới thật sự phát sinh, rất nhanh.',
    en: 'The S&P 500 has roughly 500 symbols. The first COLD scan (nothing cached yet) can take tens of minutes - SEC is asked one symbol at a time, rate-limited on purpose to avoid getting blocked. Let it run in the background; no need to watch it. From the second day on, only genuinely new filings need fetching, which is fast.',
  },
  'ins.sp500Error': {
    vi: 'Không đọc được danh sách S&P 500 trên máy chủ - lượt này chỉ còn watchlist và mã đang giữ.',
    en: 'Could not read the S&P 500 list on the server - this run fell back to your watchlist and holdings only.',
  },
  'ins.andMore': {
    vi: (n: number) => `… và ${n} mã khác`,
    en: (n: number) => `… and ${n} more`,
  },


  /* ---- Giao dịch Quốc hội (Unusual Whales) ---- */
  'cg.title': { vi: 'Giao dịch Quốc hội', en: 'Congress Trading' },
  'cg.intro': {
    vi: 'Nghị sĩ và thành viên gia đình họ bắt buộc phải khai báo với Quốc hội trong 30-45 ngày mỗi khi mua bán cổ phiếu (Đạo luật STOCK Act). Số tiền chỉ được khai theo KHOẢNG (ví dụ "$1,000,001 - $5,000,000"), không phải số chính xác - đây là quy định của luật, không phải app này thiếu dữ liệu. Nguồn dữ liệu: Unusual Whales, tính năng trả phí - xem cảnh báo bên dưới nếu chưa cấu hình.',
    en: 'Members of Congress and their family must disclose stock trades within 30-45 days (the STOCK Act). Amounts are only disclosed as RANGES (e.g. "$1,000,001 - $5,000,000"), never exact figures - that is the law, not a data gap in this app. Data source: Unusual Whales, a paid feature - see the note below if not configured.',
  },
  'cg.notConfigured': {
    vi: 'Chưa cấu hình UW_API_KEY trên Render. Tính năng này cần khoá API trả phí của Unusual Whales.',
    en: 'UW_API_KEY is not set on Render. This feature needs a paid Unusual Whales API key.',
  },
  'cg.lastRun': {
    vi: (at: number) => `Đồng bộ lần cuối: ${new Date(at).toLocaleString('vi-VN')}`,
    en: (at: number) => `Last synced: ${new Date(at).toLocaleString('en-US')}`,
  },
  'cg.neverRun': {
    vi: 'Chưa đồng bộ lần nào. Vòng lặp nền chạy mỗi 15 phút, hoặc bấm nút bên cạnh để chạy ngay.',
    en: 'Never synced. The background loop runs every 15 minutes, or press the button to run it now.',
  },
  'cg.syncNow': { vi: 'Đồng bộ ngay', en: 'Sync now' },
  'cg.syncing': { vi: 'Đang tải…', en: 'Syncing…' },
  'cg.holdingsError': {
    vi: 'Không đọc được danh mục đang giữ, nên chỉ theo dõi được rổ S&P 500 và watchlist.',
    en: 'Could not read your holdings, so only the S&P 500 and watchlist are tracked.',
  },
  'cg.lookback': {
    vi: (n: number) => `Trong ${n} ngày gần nhất`,
    en: (n: number) => `Last ${n} days`,
  },
  'cg.colTraders': { vi: 'Số nghị sĩ', en: 'Members' },
  'cg.colLast': { vi: 'Gần nhất', en: 'Last' },
  'cg.colWho': { vi: 'Ai giao dịch', en: 'Who' },
  'cg.house': { vi: 'Hạ viện', en: 'House' },
  'cg.senate': { vi: 'Thượng viện', en: 'Senate' },
  'cg.none': {
    vi: 'Không mã nào có nghị sĩ giao dịch trong kỳ.',
    en: 'No Congress trading in any tracked symbol this period.',
  },
  'cg.noneNote': {
    vi: 'Giao dịch của nghị sĩ hiếm hơn hẳn giao dịch của sếp công ty (tab Insider Trade) - phần lớn mã sẽ không có gì hầu hết thời gian. Bảng trống KHÔNG có nghĩa là tin xấu.',
    en: 'Congress trades are far rarer than corporate insider trades (Insider Trade tab) - most symbols will show nothing most of the time. An empty table is not bad news.',
  },


  /* ---- Options Flow (Unusual Whales) ---- */
  'of.title': { vi: 'Lệnh quyền chọn bất thường', en: 'Options Flow' },
  'of.intro': {
    vi: 'Lệnh quyền chọn khối lượng lớn/bất thường mà Unusual Whales tự lọc thành đáng chú ý (sweep, lệnh sàn, lặp lại nhiều lần) - không phải mọi lệnh quyền chọn thô. Tín hiệu ngắn hạn, chỉ giữ lại 14 ngày gần nhất vì một lệnh bất thường từ tuần trước không còn liên quan tới quyết định hôm nay.',
    en: 'Large/unusual option orders that Unusual Whales itself already flags as notable (sweeps, floor trades, repeated hits) - not every raw option trade. A short-lived signal, kept for 14 days only since a notable order from last week has nothing to say about today.',
  },
  'of.closed': {
    vi: 'Ngoài giờ giao dịch nên tạm dừng tự động đồng bộ - quyền chọn chỉ khớp lệnh trong giờ sàn mở cửa. Bấm "Đồng bộ ngay" vẫn hoạt động bình thường.',
    en: 'Outside market hours, so automatic syncing pauses - options only trade while the exchange is open. "Sync now" still works normally.',
  },
  'of.colSweeps': { vi: 'Sweep', en: 'Sweeps' },
  'of.put': { vi: 'Put', en: 'Put' },
  'of.call': { vi: 'Call', en: 'Call' },
  'of.sweep': { vi: 'Sweep', en: 'Sweep' },
  'of.floor': { vi: 'Sàn', en: 'Floor' },
  'of.oi': { vi: 'Số hợp đồng mở (OI)', en: 'Open interest (OI)' },
  'of.none': { vi: 'Không mã nào có lệnh bất thường trong kỳ.', en: 'No unusual flow in any tracked symbol this period.' },
  'of.noneNote': {
    vi: 'Bình thường với phần lớn mã - lệnh quyền chọn bất thường chỉ xuất hiện khi có hoạt động thật sự khác lạ. Bảng trống KHÔNG có nghĩa là tin xấu.',
    en: 'Normal for most symbols - unusual option flow only shows up when something genuinely out of the ordinary happens. An empty table is not bad news.',
  },

  /* ---- Dark Pool (Unusual Whales) ---- */
  'dp.title': { vi: 'Dark Pool', en: 'Dark Pool' },
  'dp.intro': {
    vi: (min: number) =>
      `Lệnh khớp ngoài sàn (dark pool) khối lượng lớn - chỉ giữ lệnh trên ${min.toLocaleString('vi-VN')}$ để tránh ngập trong hàng nghìn lệnh nhỏ lẻ mỗi ngày. Tín hiệu ngắn hạn, chỉ giữ 14 ngày gần nhất.`,
    en: (min: number) =>
      `Large off-exchange (dark pool) block prints - only kept above $${min.toLocaleString('en-US')} to avoid drowning in thousands of small daily prints. A short-lived signal, kept for 14 days only.`,
  },
  'dp.closed': {
    vi: 'Ngoài giờ giao dịch nên tạm dừng tự động đồng bộ - dark pool chỉ khớp lệnh trong giờ sàn mở cửa, đợi ngoài giờ chỉ tốn hạn mức request. Bấm "Đồng bộ ngay" vẫn hoạt động bình thường.',
    en: "Outside market hours, so automatic syncing pauses - dark pool prints only happen while the exchange is open, checking off-hours only burns request quota. \"Sync now\" still works normally.",
  },
  'dp.colTotal': { vi: 'Tổng premium', en: 'Total premium' },
  'dp.colBuyVol': { vi: 'KL nghiêng mua', en: 'Est. buy vol' },
  'dp.colSellVol': { vi: 'KL nghiêng bán', en: 'Est. sell vol' },
  'dp.volNote': {
    vi: 'Tổng cổ phiếu của các lệnh được suy đoán là nghiêng mua/bán (xem chú thích bên dưới) - không tính lệnh không rõ hướng. Vẫn là ước lượng, không phải số liệu chắc chắn.',
    en: 'Total shares across prints estimated as leaning buy/sell (see note below) - unclear-direction prints are excluded. Still an estimate, not certain data.',
  },
  'dp.shares': { vi: 'cổ phiếu', en: 'shares' },
  'dp.extHours': { vi: 'ngoài giờ', en: 'ext. hours' },
  'dp.sideNote': {
    vi: 'Lệnh dark pool luôn có CẢ người mua lẫn người bán khớp cùng lúc - không có nhãn "mua" hay "bán" thật, kể cả từ chính Unusual Whales. "Nghiêng mua/bán" dưới mỗi lệnh là suy đoán tự tính (so giá khớp với giá chào mua-bán tốt nhất lúc đó), không phải dữ liệu chắc chắn hay khuyến nghị.',
    en: 'A dark pool print always has BOTH a buyer and a seller matched at once - there is no real "buy" or "sell" label, not even from Unusual Whales itself. The "leaning buy/sell" note under each print is a self-computed estimate (comparing the print price to the best bid/ask at that moment), not certain data or a recommendation.',
  },
  'dp.sideBuy': { vi: 'nghiêng mua (ước lượng)', en: 'leaning buy (estimate)' },
  'dp.sideSell': { vi: 'nghiêng bán (ước lượng)', en: 'leaning sell (estimate)' },
  'dp.sideNeutral': { vi: 'không rõ hướng (ước lượng)', en: 'unclear (estimate)' },
  'dp.none': { vi: 'Không mã nào có lệnh dark pool lớn trong kỳ.', en: 'No large dark pool prints in any tracked symbol this period.' },
  'dp.noneNote': {
    vi: 'Bình thường với phần lớn mã, nhất là mã thanh khoản thấp - lệnh khối lớn ngoài sàn không xảy ra mỗi ngày. Bảng trống KHÔNG có nghĩa là tin xấu.',
    en: 'Normal for most symbols, especially lower-liquidity ones - large off-exchange blocks don\'t happen every day. An empty table is not bad news.',
  },

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
