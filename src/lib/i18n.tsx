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
  'login.username': { vi: 'Tên đăng nhập', en: 'Username' },
  'login.password': { vi: 'Mật khẩu', en: 'Password' },
  'login.enter': { vi: 'Vào', en: 'Enter' },
  'login.checking': { vi: 'Đang kiểm tra…', en: 'Checking…' },
  'login.wrong': {
    // Cố tình KHÔNG nói cái nào sai: nói "không có tên này" là nói cho người
    // lạ biết tên nào có thật trên máy này.
    vi: 'Sai tên đăng nhập hoặc mật khẩu.',
    en: 'Wrong username or password.',
  },
  'login.tooMany': {
    vi: (s: number) => `Thử sai quá nhiều lần. Chờ ${Math.ceil(s / 60)} phút rồi thử lại.`,
    en: (s: number) => `Too many attempts. Wait ${Math.ceil(s / 60)} minutes and try again.`,
  },
  'login.noPassword': {
    vi: 'Server chưa đặt mật khẩu, nên không có gì để đăng nhập. Đặt APP_PASSWORD rồi deploy lại.',
    en: 'The server has no password set, so there is nothing to sign in to. Set APP_PASSWORD and redeploy.',
  },
  'login.unknown': {
    // Gần như chắc chắn là trang đang mở đã cũ hơn server: tải lại bằng
    // Ctrl+Shift+R là xong. Có in kèm mã thật để còn lần ra được.
    vi: (code: string) =>
      `Server trả về mã lạ (${code}). Trang này có thể là bản cũ - tải lại trang (Ctrl+Shift+R) rồi thử lại.`,
    en: (code: string) =>
      `The server returned an unfamiliar code (${code}). This page may be an old copy - reload it (Ctrl+Shift+R) and try again.`,
  },
  'login.forgot': { vi: 'Quên mật khẩu?', en: 'Forgot your password?' },
  'login.backToLogin': { vi: '← Quay lại đăng nhập', en: '← Back to sign in' },
  'login.failed': { vi: 'Không kết nối được server.', en: 'Could not reach the server.' },
  'login.what': {
    vi: 'Công cụ cá nhân, một người dùng. Đọc dữ liệu thị trường qua API chính thức dành cho nhà phát triển của Charles Schwab, bằng chính tài khoản của chủ trang. Ô mật khẩu phía trên là để bảo vệ dữ liệu của chủ trang, không thu thập thông tin của ai khác.',
    en: 'A private, single-user tool. It reads market data through Charles Schwab\u2019s official developer API using the owner\u2019s own credentials. The password above protects the owner\u2019s own data and is not collected from anyone else.',
  },
  'login.notAffiliated': {
    vi: 'Không liên kết, không được bảo trợ và không do Charles Schwab & Co., Inc. vận hành. Trang này không bao giờ hỏi mật khẩu Schwab của bạn — việc đăng nhập Schwab diễn ra trên schwab.com.',
    en: 'Not affiliated with, endorsed by, or operated by Charles Schwab & Co., Inc. This page never asks for your Schwab credentials — Schwab sign-in happens on schwab.com.',
  },
  /* ---- Quản lý tài khoản (/accounts, chỉ chủ app) ---- */
  'reset.title': { vi: 'Đặt lại mật khẩu bằng mã', en: 'Reset your password with a code' },
  'reset.intro': {
    vi: 'Xin chủ app một mã đặt lại (họ bấm “Tạo mã đặt lại” trong Quản lý tài khoản). Mã sống 30 phút và chỉ dùng được một lần.',
    en: 'Ask the app owner for a reset code (they press "Create reset code" in Manage accounts). A code lasts 30 minutes and works once.',
  },
  'reset.ownerNote': {
    // Nói thẳng, nếu không chủ app sẽ ngồi chờ một cái mã không bao giờ tồn
    // tại. Mã đặt lại CỐ TÌNH không áp dụng cho chủ app - xem userstore.ts.
    vi: 'Nếu bạn là chủ app: mã đặt lại không dùng cho tài khoản của bạn. Mật khẩu của bạn là APP_PASSWORD — đổi nó trong Render → Environment rồi deploy lại (xem DEPLOY.md).',
    en: 'If you are the app owner: reset codes do not apply to your account. Your password is APP_PASSWORD — change it in Render → Environment and redeploy (see DEPLOY.md).',
  },
  'reset.username': { vi: 'Tên đăng nhập', en: 'Username' },
  'reset.code': { vi: 'Mã đặt lại', en: 'Reset code' },
  'reset.codePlaceholder': { vi: 'ví dụ: ABCD-EFGH', en: 'e.g. ABCD-EFGH' },
  'reset.newPassword': { vi: 'Mật khẩu mới (ít nhất 8 ký tự)', en: 'New password (8 characters minimum)' },
  'reset.submit': { vi: 'Đổi mật khẩu', en: 'Change password' },
  'reset.saving': { vi: 'Đang đổi…', en: 'Changing…' },
  'reset.done': {
    vi: 'Đổi xong. Đăng nhập bằng mật khẩu mới.',
    en: 'Done. Sign in with your new password.',
  },
  'reset.err.bad-code': {
    // Một câu cho cả ba trường hợp: không có tên đó, chưa phát mã, và mã
    // sai. Nói rõ cái nào là nói cho người lạ biết tên nào có thật.
    vi: 'Tên đăng nhập hoặc mã không đúng.',
    en: 'Wrong username or code.',
  },
  'reset.err.expired': {
    vi: 'Mã này đã hết hạn. Xin chủ app tạo mã mới.',
    en: 'That code has expired. Ask the owner for a new one.',
  },
  'reset.err.weak-password': {
    vi: 'Mật khẩu mới phải dài ít nhất 8 ký tự. Mã của bạn vẫn còn dùng được.',
    en: 'The new password must be at least 8 characters. Your code still works.',
  },
  'reset.err.failed': { vi: 'Không đổi được. Thử lại.', en: 'Could not change it. Try again.' },
  'reset.tooMany': {
    vi: (s: number) => `Thử sai quá nhiều lần. Chờ ${Math.ceil(s / 60)} phút rồi thử lại.`,
    en: (s: number) => `Too many attempts. Wait ${Math.ceil(s / 60)} minutes and try again.`,
  },
  'acct.title': { vi: 'Tài khoản gia đình', en: 'Family accounts' },
  'acct.open': { vi: 'Quản lý tài khoản', en: 'Manage accounts' },
  'acct.intro': {
    vi: 'Mỗi người nhà một tên đăng nhập và mật khẩu riêng. Họ dùng được Sell Put Screener, Analyze, Heatmap, Insider Trade và có watchlist riêng — nhưng không thấy My Portfolio, P/L đã chốt, cảnh báo, và không kết nối Schwab được. Mật khẩu lưu dưới dạng đã băm, không ai đọc lại được, kể cả bạn.',
    en: 'Each family member gets their own username and password. They can use Sell Put Screener, Analyze, Heatmap and Insider Trade, and keep their own watchlist — but not My Portfolio, realized P/L or alerts, and they cannot connect Schwab. Passwords are stored hashed; nobody can read them back, including you.',
  },
  'acct.listTitle': { vi: 'Đang có', en: 'Existing accounts' },
  'acct.loading': { vi: 'Đang tải…', en: 'Loading…' },
  'acct.empty': {
    vi: 'Chưa có tài khoản nào cho người nhà. Thêm ở dưới.',
    en: 'No family accounts yet. Add one below.',
  },
  'acct.loadFailed': {
    vi: (e: string) => `Không đọc được danh sách tài khoản: ${e}`,
    en: (e: string) => `Could not load the account list: ${e}`,
  },
  'acct.colName': { vi: 'Tên đăng nhập', en: 'Username' },
  'acct.colCreated': { vi: 'Tạo ngày', en: 'Created' },
  'acct.colUpdated': { vi: 'Đổi mật khẩu', en: 'Password changed' },
  'acct.resetBtn': { vi: 'Đặt lại mật khẩu', en: 'Reset password' },
  'acct.deleteBtn': { vi: 'Xoá', en: 'Delete' },
  'acct.codeBtn': { vi: 'Tạo mã đặt lại', en: 'Create reset code' },
  'acct.codeTitle': {
    vi: (name: string) => `Mã đặt lại cho “${name}”`,
    en: (name: string) => `Reset code for "${name}"`,
  },
  'acct.codeShown': {
    // Nói trước, không nói sau: trên đĩa chỉ có bản băm, nên đóng hộp này
    // lại là mã biến mất thật. Người đọc phải biết điều đó TRƯỚC khi đóng.
    vi: 'Đọc mã này cho họ ngay. Mã chỉ hiện một lần — đóng đi là không xem lại được, phải tạo mã khác.',
    en: 'Read this out to them now. It is shown once — close this and it is gone for good; you would have to create another.',
  },
  'acct.codeExpires': {
    vi: (hhmm: string) => `Hết hạn lúc ${hhmm}, và chỉ dùng được một lần.`,
    en: (hhmm: string) => `Expires at ${hhmm}, and works once.`,
  },
  'acct.codeWhere': {
    vi: 'Họ vào trang đăng nhập, bấm “Quên mật khẩu?”, rồi nhập tên + mã này + mật khẩu mới do họ tự chọn.',
    en: 'They open the sign-in page, press "Forgot your password?", then enter their username, this code, and a new password of their own choosing.',
  },
  'acct.codeDone': { vi: 'Đã đọc xong', en: 'Done reading it' },
  'acct.codePending': {
    vi: (hhmm: string) => `đang có mã, hết hạn ${hhmm}`,
    en: (hhmm: string) => `code pending, expires ${hhmm}`,
  },
  'acct.codeCancel': { vi: 'Huỷ mã', en: 'Cancel code' },
  'acct.codeCancelled': {
    vi: (name: string) => `Đã huỷ mã đặt lại của “${name}”.`,
    en: (name: string) => `Cancelled the reset code for "${name}".`,
  },
  'acct.ownerNoCode': {
    vi: 'Mã đặt lại chỉ dành cho người nhà. Mật khẩu của chính bạn là APP_PASSWORD trên Render — cố tình để ngoài kho tài khoản, để một cái mã lọt ra ngoài không bao giờ chạm được tới danh mục.',
    en: 'Reset codes are for family accounts only. Your own password is APP_PASSWORD on Render — deliberately kept outside the account store, so a leaked code can never reach the portfolio.',
  },

  'acct.resetTitle': {
    vi: (n: string) => `Đặt mật khẩu mới cho ${n}`,
    en: (n: string) => `Set a new password for ${n}`,
  },
  'acct.newPassword': { vi: 'Mật khẩu mới (ít nhất 8 ký tự)', en: 'New password (8 characters minimum)' },
  'acct.save': { vi: 'Lưu', en: 'Save' },
  'acct.cancel': { vi: 'Huỷ', en: 'Cancel' },
  'acct.addTitle': { vi: 'Thêm người', en: 'Add someone' },
  'acct.name': { vi: 'Tên đăng nhập', en: 'Username' },
  'acct.namePlaceholder': { vi: 'chữ thường, ví dụ: vo, con', en: 'lowercase, e.g. wife, son' },
  'acct.password': { vi: 'Mật khẩu (ít nhất 8 ký tự)', en: 'Password (8 characters minimum)' },
  'acct.addBtn': { vi: 'Tạo tài khoản', en: 'Create account' },
  'acct.saving': { vi: 'Đang lưu…', en: 'Saving…' },
  'acct.added': {
    vi: (n: string) => `Đã tạo tài khoản "${n}". Đưa tên và mật khẩu cho họ.`,
    en: (n: string) => `Created "${n}". Give them the username and password.`,
  },
  'acct.reset': {
    vi: (n: string) => `Đã đổi mật khẩu cho "${n}".`,
    en: (n: string) => `Password changed for "${n}".`,
  },
  'acct.deleted': {
    vi: (n: string) => `Đã xoá "${n}".`,
    en: (n: string) => `Deleted "${n}".`,
  },
  'acct.confirmDelete': {
    vi: (n: string) => `Xoá tài khoản "${n}"? Họ sẽ không đăng nhập được nữa. Watchlist của họ vẫn còn trên đĩa nếu sau này tạo lại đúng tên đó.`,
    en: (n: string) => `Delete "${n}"? They will no longer be able to log in. Their watchlist stays on disk if you later recreate the same name.`,
  },
  'acct.note': {
    vi: 'Mọi người dùng chung phiên Schwab và chung hạn mức của bạn: người nhà quét cả rổ là tiêu vào 100 request/phút của bạn, bấm "Nhờ Claude phân tích" là tiêu tiền API của bạn. Xoá một người thì họ không đăng nhập lại được ngay, nhưng phiên đang mở của họ còn xem được dữ liệu thị trường tới khi hết hạn (tối đa 7 ngày) — danh mục của bạn thì không bao giờ.',
    en: 'Everyone shares your Schwab session and your quotas: a family member scanning the full basket spends your 100 requests/minute, and pressing "Ask Claude" spends your API credit. Deleting someone blocks new logins immediately, but an open session of theirs can still read market data until it expires (7 days at most) — never your portfolio.',
  },
  'acct.err.invalid-name': {
    vi: 'Tên chỉ được gồm chữ thường, số, gạch dưới và gạch ngang, tối đa 20 ký tự.',
    en: 'Username may only contain lowercase letters, digits, underscore and hyphen, up to 20 characters.',
  },
  'acct.err.reserved-name': {
    vi: '"owner" là tên dành riêng cho tài khoản của bạn.',
    en: '"owner" is reserved for your own account.',
  },
  'acct.err.duplicate-name': { vi: 'Tên này đã có người dùng.', en: 'That username is already taken.' },
  'acct.err.weak-password': { vi: 'Mật khẩu phải dài ít nhất 8 ký tự.', en: 'Password must be at least 8 characters.' },
  'acct.err.not-found': { vi: 'Không tìm thấy tài khoản này.', en: 'No such account.' },
  'acct.err.failed': { vi: 'Không lưu được. Thử lại.', en: 'Could not save. Try again.' },

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
  'gex.absGamma': { vi: 'Gamma tuyệt đối', en: 'Abs gamma' },
  'gex.currentPrice': {
    vi: (p: string) => `Giá hiện tại ${p}`,
    en: (p: string) => `Current price ${p}`,
  },
  'gex.calls': { vi: 'Call', en: 'Calls' },
  'gex.puts': { vi: 'Put', en: 'Puts' },
  'gex.tipStrike': { vi: 'Strike', en: 'Strike' },
  'gex.axisLabel': {
    vi: 'Gamma exposure (triệu $ / 1% biến động)',
    en: 'Gamma exposure ($M per 1% move)',
  },
  'gex.zeroGamma': { vi: 'Zero gamma', en: 'Zero gamma' },
  'gex.srcSchwab': { vi: 'App (Schwab)', en: 'App (Schwab)' },
  'gex.srcCboe': { vi: 'App (CBOE)', en: 'App (CBOE)' },
  'gex.cboeSource': {
    vi: (v: any) =>
      `Chuỗi quyền chọn ở đây lấy từ feed công khai trễ 15 phút của CBOE (file ${v.file}, dấu giờ CBOE: ${v.asOf}) - cùng nguồn mà tapchiphowall.com dùng - rồi app tự tính bằng đúng công thức như mọi mã khác. Không phải chuỗi Schwab: giá và greeks là của CBOE, trễ 15 phút; open interest chỉ đổi mỗi ngày một lần nên các mức tường không bị ảnh hưởng đáng kể.`,
    en: (v: any) =>
      `This chain comes from CBOE's public 15-minute-delayed feed (file ${v.file}, CBOE timestamp ${v.asOf}) - the same source tapchiphowall.com reads - and the app computes it with the same formula as every other symbol. It is not the Schwab chain: prices and greeks are CBOE's and 15 minutes stale; open interest only changes once a day, so the walls are barely affected.`,
  },
  'gex.cboeWhy': {
    vi: (why: string) => `Đi đường CBOE vì chuỗi Schwab không dùng được cho mã này: ${why}`,
    en: (why: string) => `Using CBOE because Schwab's option chain is unusable for this symbol: ${why}`,
  },
  'gex.cboeFailed': {
    vi: (d: string) => `CBOE (feed công khai, bậc cho biểu đồ cột) cũng không cho chuỗi: ${d}`,
    en: (d: string) => `CBOE (the public feed that would give the bar chart) failed too: ${d}`,
  },
  'gex.srcUw': { vi: 'Unusual Whales', en: 'Unusual Whales' },
  'gex.diff': { vi: 'Lệch', en: 'Diff' },
  'gex.compareNote': {
    vi: (v: any) =>
      `Số bên trái app tự tính từ chuỗi quyền chọn ${v.left ?? 'Schwab'}; bên phải là của Unusual Whales (cơ sở "${v.basis}", ngày ${v.date}). Hai mô hình khác nhau trên hai nguồn dữ liệu khác nhau — lệch nhau là bình thường, không bên nào là chuẩn.`,
    en: (v: any) =>
      `Left column is self-computed from the ${v.left ?? 'Schwab'} option chain; right is Unusual Whales' own (basis "${v.basis}", ${v.date}). Two models on two different data feeds — a gap is expected, neither side is the reference.`,
  },
  'gex.uwFailed': {
    vi: (d: string) => `Không lấy được mức của Unusual Whales để đối chiếu: ${d}`,
    en: (d: string) => `Could not fetch Unusual Whales levels to compare against: ${d}`,
  },
  'gex.stale': {
    vi: (at: string) =>
      `SỐ CŨ — cả Schwab lẫn Unusual Whales đều không trả lời, đây là bản đọc lúc ${at}. Đừng giao dịch theo bảng này.`,
    en: (at: string) =>
      `STALE — both Schwab and Unusual Whales failed; this is the reading saved at ${at}. Do not trade off it.`,
  },
  'gex.bothDown': {
    vi: 'Không có biểu đồ cột và không có phân tích AI vì cả hai đều cần chuỗi quyền chọn sống.',
    en: 'No bar chart and no AI briefing here — both need a live option chain.',
  },
  'gex.netGex': { vi: 'Net GEX', en: 'Net GEX' },
  'gex.noStrike': {
    vi: (w: string) =>
      `Put wall ${w} là strike có gamma ròng âm nhất (put trội hơn call) — vùng dealer phải mua vào để hedge, nên thường hành xử như hỗ trợ.`,
    en: (w: string) =>
      `Put wall ${w} is the most net-negative strike (puts outweigh calls) — where dealers must buy to hedge, so it often behaves like support.`,
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
  'gex.narrowed': {
    vi: (v: any) =>
      `Chỉ tính trên ${v.days} ngày đáo hạn gần nhất và ${v.strikes} strike mỗi bên quanh giá - Schwab từ chối trả cả chuỗi cho mã này vì phản hồi quá lớn (mã có kỳ đáo hạn gần như mỗi ngày thì chuỗi đầy đủ lên tới hàng chục nghìn hợp đồng). Các mức tường là lớn nhất TRONG phạm vi đó, không phải của toàn bộ chuỗi.`,
    en: (v: any) =>
      `Computed over just the next ${v.days} days of expirations and ${v.strikes} strikes each side of spot - Schwab refuses the full chain for this symbol because the response is too large (a symbol expiring almost daily runs to tens of thousands of contracts). The walls are the largest WITHIN that window, not across the whole chain.`,
  },
  'gex.sliced': {
    vi: (v: any) =>
      `Ghép từ ${v.expirations} kỳ đáo hạn GẦN NHẤT, mỗi kỳ ${v.strikes} strike quanh giá - Schwab từ chối trả nhiều kỳ trong một lượt cho mã này, nên app xin từng kỳ một rồi ghép lại. Các mức tường là lớn nhất TRONG ${v.expirations} kỳ đó, không phải của toàn bộ chuỗi; các kỳ xa hơn không được tính.`,
    en: (v: any) =>
      `Stitched from the ${v.expirations} NEAREST expirations, ${v.strikes} strikes each around spot - Schwab refuses to return several expirations at once for this symbol, so the app requests them one at a time and merges. The walls are the largest WITHIN those ${v.expirations} expirations; anything further out is not counted.`,
  },
  'gex.gammaMagnet': { vi: 'Gamma magnet', en: 'Gamma magnet' },
  'gex.nearbyFlips': { vi: 'Các mốc lật gần', en: 'Nearby flips' },
  'gex.uwSource': {
    vi: (v: any) =>
      `Số này do Unusual Whales tính (cơ sở: ${v.basis}, ngày ${v.date}), KHÔNG phải app tự tính từ chuỗi quyền chọn Schwab như các mã khác - hai cách tính có thể ra số khác nhau. UW chỉ trả về các mức chính nên không vẽ được biểu đồ cột theo từng strike, và phần Phân tích giao dịch AI cũng không chạy được ở đây vì nó cần giá từng hợp đồng thật.`,
    en: (v: any) =>
      `These numbers come from Unusual Whales (basis: ${v.basis}, date ${v.date}), NOT self-computed from the Schwab option chain like every other symbol - the two methods can disagree. UW only returns the key levels, so there is no per-strike bar chart here, and the AI Trade Briefing can't run either since it needs real per-contract prices.`,
  },
  'gex.uwWhy': {
    // "Từ chối" là sai khi Schwab trả status=SUCCESS kèm cả nghìn hợp đồng
    // mà openInterest = 0 - nó không từ chối, nó gửi một chuỗi rỗng ruột.
    // Hai chuyện đó sửa khác nhau nên câu chữ phải để cho phần chi tiết nói,
    // đừng khẳng định sai ngay ở câu đầu.
    vi: (why: string) =>
      `Phải dùng UW vì chuỗi quyền chọn Schwab không dùng được cho mã này: ${why}`,
    en: (why: string) =>
      `Falling back to UW because Schwab's option chain is unusable for this symbol: ${why}`,
  },
  'gex.uwUnreadable': {
    vi: 'Không đọc được mức nào từ UW. Các trường họ thật sự trả về',
    en: 'Could not read any level from UW. The fields they actually returned',
  },
  'gex.refreshFailed': {
    vi: (v: any) => `Đang hiện bản đọc lúc ${v.at} - lần tải lại vừa rồi lỗi: ${v.error}`,
    en: (v: any) => `Showing the reading from ${v.at} - the latest refresh failed: ${v.error}`,
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
  'tb.cboeNote': {
    vi: (asOf: string) =>
      `Kèo dưới đây dựng từ chuỗi CBOE trễ 15 phút (dấu giờ ${asOf}), không phải chuỗi Schwab - giá bid/ask có thể đã dịch so với lúc bạn đọc. Kiểm tra lại giá trên Schwab trước khi đặt lệnh.`,
    en: (asOf: string) =>
      `These ideas are built from CBOE's 15-minute-delayed chain (timestamp ${asOf}), not Schwab's - bid/ask may have moved since. Re-check prices on Schwab before placing an order.`,
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
    vi: 'Tự tính từ chuỗi quyền chọn Schwab của chính bạn (giống biểu đồ GEX ở tab Phân tích). Mã nào Schwab không trả dữ liệu (SPX và các chỉ số) thì lấy chuỗi từ feed công khai trễ 15 phút của CBOE và màn hình nói rõ. Tự làm mới mỗi 10 phút.',
    en: "Self-computed from your own Schwab option chain (same method as the Analyze tab's GEX chart). Where Schwab returns no data (SPX and other indices) the chain comes from CBOE's public 15-minute-delayed feed instead, and the screen says so. Auto-refreshes every 10 minutes.",
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
  'dd.gateUnknown': { vi: 'chưa có dữ liệu', en: 'no data' },
  /* Ngày earnings do tastytrade ƯỚC TÍNH, chưa phải ngày công ty xác nhận.
     Một hợp đồng bị loại vì ngày đoán bị loại trên bằng chứng yếu hơn hẳn -
     người đọc phải biết để còn tự kiểm lại. */
  'dd.gateEstimated': { vi: 'ngày ước tính', en: 'estimated date' },
  'dd.gateEstimatedWhy': {
    vi: 'tastytrade đánh dấu ngày báo cáo này là ƯỚC TÍNH, không phải ngày công ty đã xác nhận. Cổng vẫn tính nó là earnings trong kỳ, nhưng nên kiểm lại trước khi bỏ qua hẳn một hợp đồng vì nó.',
    en: 'tastytrade marks this report date as an ESTIMATE, not a company-confirmed date. The gate still counts it as earnings inside the window, but check it before discarding a contract over it.',
  },
  'dd.gateUnknownWhy': {
    vi: 'Không có ngày earnings nào cho mã này, nên cổng không xét được — KHÁC với "đã xét và không có earnings trong kỳ". Lịch earnings chỉ được dựng cho mã trong watchlist.',
    en: 'No earnings dates exist for this symbol, so the gate could not judge it — which is NOT the same as "checked, and no earnings in the window". The earnings calendar is only built for watchlist symbols.',
  },
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
  'hm.subMap': { vi: 'Bản đồ nhiệt', en: 'Heatmap' },
  'hm.subFearGreed': { vi: 'Fear & Greed', en: 'Fear & Greed' },
  'hm.subRrg': { vi: 'RRG', en: 'RRG' },
  'hm.subGex': { vi: 'GEX', en: 'GEX' },
  'hm.subInternals': { vi: 'Bề rộng TT', en: 'Internals' },
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
  /* Câu cũ ghi "ngoài giờ nên không kiểm tra" - giờ SAI: cảnh báo 8-K chạy
     bất kể giờ. Một chú thích hứa sai về thứ màn hình đang làm đúng là bẫy
     #136, nên nó phải nói đúng hai nửa. */
  'al.closed': {
    vi: 'Ngoài giờ giao dịch: cảnh báo danh mục (ITM, earnings, skew) tạm nghỉ vì giá không đổi. Hồ sơ 8-K VẪN được kiểm — phần lớn 8-K nộp sau khi sàn đóng.',
    en: 'Outside market hours: portfolio alerts (ITM, earnings, skew) pause because prices do not move. SEC 8-K filings are STILL checked — most 8-Ks are filed after the close.',
  },
  'al.watching': {
    vi: (n: number) => `Đang theo dõi ${n} mã (vị thế đang nắm + watchlist): hồ sơ 8-K trọng yếu, giá chạy quá 7%, tiêu đề báo chí, và bài đăng trên X.`,
    en: (n: number) => `Watching ${n} symbols (open positions + watchlist) for material 8-K filings, moves over 7%, press headlines, and X posts.`,
  },
  /* "Lượt này chưa hỏi tin" phải KHÁC hẳn "đã hỏi và không có gì": tầng báo
     chí chạy ~60 phút một lần, nên nếu không nói ra thì mấy con số 0 đọc
     thành "báo chí im lặng" trong khi thật ra chưa ai hỏi. */
  'al.pressIdle': {
    vi: 'Tiêu đề báo chí (Yahoo Finance) được hỏi khoảng 60 phút một lần chứ không phải mỗi lượt — Yahoo tốn một request cho MỖI mã. Cửa sổ cảnh báo là 90 phút nên nhịp này không bỏ sót bài nào. Bấm "Chạy thử ngay" để kiểm tin luôn.',
    en: 'Press headlines (Yahoo Finance) are checked about hourly, not every run — Yahoo costs one request per symbol. The alert window is 90 minutes, so nothing is missed. Press "Send a test now" to check them immediately.',
  },
  'al.press': {
    vi: (v: any) => `Báo chí: đã hỏi tin ${v.checked} mã.`,
    en: (v: any) => `Press: checked ${v.checked} symbols.`,
  },
  /* Yên tĩnh có chủ đích phải hiện thành CON SỐ, đúng khuôn `al.evUnknown`:
     không có con số này thì "bộ lọc quá chặt" và "hôm nay không có tin gì"
     trông y hệt nhau, mà hai thứ đó cần hai hành động ngược nhau. */
  'al.pressQuiet': {
    vi: (v: any) =>
      `Trong 90 phút qua: ${v.routine} bài riêng về một mã nhưng không khớp từ khoá đáng báo, ${v.broad} bài gắn nhiều mã (bản tin thị trường) — đều ĐƯỢC ĐẾM chứ không gửi, để hộp thư không kêu suốt.`,
    en: (v: any) =>
      `In the last 90 minutes: ${v.routine} single-ticker articles matched no alert keyword and ${v.broad} were tagged with several tickers (market wraps) — both COUNTED, not sent, so the inbox stays quiet.`,
  },
  'al.pressOverflow': {
    vi: (n: number) => `${n} cảnh báo báo chí nữa bị cắt vì chạm trần mỗi lượt (5). Mã nặng nhất và mới nhất được giữ.`,
    en: (n: number) => `${n} more press alerts were cut by the per-run ceiling (5). The most severe and most recent were kept.`,
  },
  'al.pressSkipped': {
    vi: (n: number) => `${n} mã chưa được hỏi tin vì vượt trần 60 mã mỗi lượt (vị thế đang nắm được ưu tiên trước).`,
    en: (n: number) => `${n} symbols were not checked for news, over the 60-symbol per-run cap (open positions come first).`,
  },
  'al.pressErr': {
    vi: (m: string) => `Không lấy được tin báo chí: ${m}`,
    en: (m: string) => `Could not fetch press headlines: ${m}`,
  },
  /* Tầng X - thứ tư, và tự tắt như UW/Telegram khi chưa đặt X_BEARER_TOKEN. */
  'al.xIdle': {
    vi: 'X (Twitter) chưa được cấu hình - đặt X_BEARER_TOKEN trên Render để bật tầng cảnh báo nhanh nhất (bài đăng trên X về mã đang nắm).',
    en: 'X (Twitter) is not configured - set X_BEARER_TOKEN on Render to enable the fastest alert tier (X posts about held symbols).',
  },
  'al.x': {
    vi: (v: any) => `X: đã hỏi ${v.checked} mã trong ${v.batches} lô.`,
    en: (v: any) => `X: checked ${v.checked} symbols in ${v.batches} batches.`,
  },
  'al.xQuiet': {
    vi: (n: number) => `Trong 90 phút qua: ${n} bài khớp mã nhưng không khớp từ khoá đáng báo - ĐƯỢC ĐẾM chứ không gửi.`,
    en: (n: number) => `In the last 90 minutes: ${n} posts matched a symbol but no alert keyword - counted, not sent.`,
  },
  'al.xOverflow': {
    vi: (n: number) => `${n} cảnh báo X nữa bị cắt vì chạm trần mỗi lượt (5). Bài nặng nhất và mới nhất được giữ.`,
    en: (n: number) => `${n} more X alerts were cut by the per-run ceiling (5). The most severe and most recent were kept.`,
  },
  'al.xErr': {
    vi: (m: string) => `Không lấy được bài trên X: ${m}`,
    en: (m: string) => `Could not fetch X posts: ${m}`,
  },
  'al.evHeldErr': {
    vi: 'Không đọc được danh mục nên chỉ đang theo dõi watchlist. Nếu phiên Schwab hết hạn thì bấm Kết nối lại.',
    en: 'Could not read the portfolio, so only the watchlist is being watched. If the Schwab session expired, press Reconnect.',
  },
  'al.evSecErr': {
    vi: (m: string) => `Không lấy được hồ sơ SEC: ${m}`,
    en: (m: string) => `Could not fetch SEC filings: ${m}`,
  },
  'al.evQuoteErr': {
    vi: (m: string) => `Không lấy được giá nên phần cảnh báo giá chạy mạnh đang tắt: ${m}`,
    en: (m: string) => `Could not fetch quotes, so the big-move alert is off: ${m}`,
  },
  'al.evWindowShort': {
    vi: 'SEC đang có quá nhiều hồ sơ nên danh sách trả về không phủ hết 90 phút — có thể đã bỏ sót một vài hồ sơ.',
    en: 'SEC filing volume is high enough that the feed no longer covers the full 90-minute window — some filings may have been missed.',
  },
  'al.evUnknown': {
    vi: (c: string) => `Mã mục 8-K app chưa biết, nên KHÔNG báo: ${c}. Nếu mục nào trong đó đáng báo, nói tôi thêm vào.`,
    en: (c: string) => `8-K item codes this app does not know, so they did NOT alert: ${c}. Say the word if any of them should.`,
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
  /* ---------------- Long-term Investment ---------------- */
  'tab.longterm': { vi: 'Đầu tư dài hạn', en: 'Long-term' },
  'lt.lead': {
    vi: 'Tìm mã ĐANG RỚT VỀ một vùng hỗ trợ mà công ty vẫn có lãi, vẫn tăng trưởng và định giá chưa đắt. Vùng hỗ trợ tự tính từ 3 năm nến ngày (đáy xoay đã được nến hai bên xác nhận, gom theo giá); bội số và giá mục tiêu từ Finviz; doanh thu/EPS/FCF nhiều năm và pha loãng cổ phiếu bóc từ 10-K trên SEC EDGAR.',
    en: 'Finds stocks FALLING TOWARD a support zone while the company is still profitable, still growing and not expensively priced. Support zones are computed here from 3 years of daily bars (confirmed pivot lows, clustered by price); multiples and the analyst target come from Finviz; multi-year revenue/EPS/FCF and share dilution are parsed from 10-K filings on SEC EDGAR.',
  },
  'lt.watchlist': { vi: 'Watchlist', en: 'Watchlist' },
  'lt.sp500': { vi: 'Cả rổ S&P 500', en: 'Full S&P 500' },
  'lt.aboveSma200': {
    vi: 'Chỉ lấy mã còn trên SMA200',
    en: 'Only stocks still above their SMA200',
  },
  /* Nói ngay cạnh ô tích cái giá phải trả khi bật, vì cái giá đó ĐÃ ĐO:
     mã rớt đủ sâu để tab này quan tâm thì phần lớn đã thủng SMA200. Không
     có câu này thì người bật ô tích gặp bảng trống và không biết vì sao. */
  'lt.aboveSma200Note': {
    vi: 'Bật = chặt hơn: bỏ hẳn những mã đã thủng SMA200, chỉ giữ mã còn nằm trên đường này. Tab này đi tìm mã ĐANG RỚT, mà rớt đủ sâu thì thường đã thủng SMA200 — nên bật ô này bảng sẽ ngắn hơn nhiều, có lúc trống. Tắt = quay lại mức cũ: cho thủng SMA200 miễn là SMA200 vẫn dốc lên.',
    en: 'On = stricter: drops every stock that has broken below its SMA200, keeping only those still above it. This tab looks for stocks that are FALLING, and anything down far enough has usually lost its SMA200 already — so expect a much shorter table, sometimes an empty one. Off = the previous behaviour: below SMA200 is allowed as long as the SMA200 itself is still sloping up.',
  },
  'lt.belowSmaCount': {
    vi: (n: number) =>
      `${n} mã bị loại vì đang nằm dưới SMA200. Bỏ tích ô "Chỉ lấy mã còn trên SMA200" thì chúng được xét tiếp (vẫn phải qua các cổng còn lại).`,
    en: (n: number) =>
      `${n} symbols were dropped for sitting below their SMA200. Untick "Only stocks still above their SMA200" to let them through to the remaining gates.`,
  },
  // ---- nút vốn hoá, dùng chung hai tab ----
  'cap.label': { vi: 'Vốn hoá', en: 'Market cap' },
  'cap.mega': { vi: 'Mega ≥200 tỷ', en: 'Mega ≥$200B' },
  'cap.big': { vi: 'Big 10–200 tỷ', en: 'Big $10–200B' },
  'cap.mid': { vi: 'Mid 2–10 tỷ', en: 'Mid $2–10B' },
  /* Không bấm nút nào là KHÔNG lọc, không phải "loại sạch" - ba nút tối
     thui trông y hệt một bộ lọc đang chặn hết, nên phải nói ra. */
  'cap.none': {
    vi: 'Chưa chọn nhóm nào = không lọc theo vốn hoá (mã nhỏ hơn 2 tỷ cũng vào). Bấm được nhiều nút cùng lúc.',
    en: 'Nothing selected = no market-cap filter (stocks under $2B come through too). You can select several at once.',
  },
  'cap.some': {
    vi: 'Chỉ giữ các nhóm đang sáng. Vốn hoá tính từ dữ liệu Schwab (giá × số cổ phiếu lưu hành), nên là số sống; mã Schwab không trả số cổ phiếu thì vẫn đi qua và được đánh dấu.',
    en: 'Only the highlighted groups are kept. Market cap is computed from Schwab data (price × shares outstanding), so it is live; a symbol whose share count Schwab does not return still passes, and is flagged.',
  },
  // ---- nút dòng tiền RRG (tab Đầu tư dài hạn) ----
  'rrgf.label': { vi: 'Dòng tiền vào ngành (RRG)', en: 'Sector money flow (RRG)' },
  /* Câu này phải nói HAI điều, và điều thứ hai quan trọng hơn: đây là góc
     phần tư của NGÀNH, không phải của mã. Thiếu vế đó thì cái nhãn "đang
     hồi" bị đọc thành một nhận định về chính công ty. */
  'rrgf.none': {
    vi: 'Chưa chọn góc nào = không lọc theo dòng tiền. Muốn “ngành đang uptrend mạnh” thì bấm Dẫn đầu (mạnh hơn thị trường VÀ còn đang mạnh lên); Đang hồi là ngành còn yếu hơn thị trường nhưng đã quay đầu lên — thường là chỗ mã rớt về hỗ trợ hay nằm. Đây là góc phần tư của NGÀNH (11 quỹ ngành so với SPY, cùng số với biểu đồ RRG bên tab Heatmap), KHÔNG phải của riêng mã — một mã yếu vẫn có thể nằm trong ngành đang hồi, và ngược lại.',
    en: 'Nothing selected = no money-flow filter. For "sectors in a strong uptrend" pick Leading (stronger than the market AND still strengthening); Improving means still weaker than the market but turning up — often where stocks falling toward support sit. This is the quadrant of the SECTOR (11 sector ETFs against SPY, the same numbers as the RRG chart in the Heatmap tab), NOT of the individual stock — a weak stock can sit in an improving sector, and the other way round.',
  },
  'rrgf.some': {
    vi: 'Chỉ giữ mã thuộc ngành đang ở các góc đang sáng. Nhắc lại: đây là góc của NGÀNH, không phải của mã. Mã không tra được ngành (ngoài rổ S&P 500) vẫn đi qua và được đánh dấu.',
    en: 'Only stocks whose sector sits in a highlighted quadrant are kept. Again: this is the SECTOR’s quadrant, not the stock’s. A symbol whose sector cannot be looked up (outside the S&P 500 list) still passes, and is flagged.',
  },
  'lt.rrgDropped': {
    vi: (n: number) =>
      `${n} mã bị loại vì ngành của chúng không nằm trong các góc đã chọn. Bỏ chọn hết các nút dòng tiền thì chúng được xét tiếp (vẫn phải qua các cổng còn lại).`,
    en: (n: number) =>
      `${n} symbols were dropped because their sector is not in the selected quadrants. Clear the money-flow buttons to let them through to the remaining gates.`,
  },
  /* Vòng xoay ngành hỏng KHÁC HẲN "ngành này không nằm trong góc đã chọn":
     một bên là cả bảng mất cột, một bên là lọc đúng luật. Nói ra lý do thật
     chứ không để cột trống tự giải thích. */
  'lt.rrgError': {
    vi: (m: string) => `Không tính được vòng xoay dòng tiền ngành (${m}) — cổng dòng tiền hiện dấu "?" cho mọi mã, và cột ngành để trống.`,
    en: (m: string) => `Could not compute the sector rotation (${m}) — the money-flow gate shows "?" for every symbol and the sector column is blank.`,
  },
  'lt.col.rrg': { vi: 'Dòng tiền ngành', en: 'Sector flow' },
  'lt.capDropped': {
    vi: (n: number) =>
      `${n} mã bị loại vì vốn hoá ngoài nhóm đã chọn. Bỏ chọn hết các nút vốn hoá thì chúng được xét tiếp (vẫn phải qua các cổng còn lại).`,
    en: (n: number) =>
      `${n} symbols were dropped for sitting outside the selected market-cap groups. Clear the market-cap buttons to let them through to the remaining gates.`,
  },
  'lt.col.cap': { vi: 'Vốn hoá', en: 'Mkt cap' },
  'lt.scan': { vi: 'Quét', en: 'Scan' },
  'lt.scanning': { vi: 'Đang quét…', en: 'Scanning…' },
  'lt.phase.quotes': { vi: 'Đang lấy giá và đỉnh/đáy 52 tuần (gộp lô)…', en: 'Fetching quotes and 52-week range (batched)…' },
  'lt.phase.support': { vi: 'Đang dựng vùng hỗ trợ từ nến ngày…', en: 'Building support zones from daily bars…' },
  'lt.phase.fundamentals': { vi: 'Đang lấy cơ bản từ Finviz…', en: 'Fetching fundamentals from Finviz…' },
  /* Phiên Schwab chết là lỗi HAY GẶP NHẤT của app (refresh token bị Schwab
     chặn cứng 7 ngày, không gia hạn được), và cách sửa khác hẳn mọi lỗi
     quét khác: bấm kết nối lại, chứ không phải quét lại. In nguyên chuỗi
     `REAUTH_REQUIRED Schwab 401` ra màn hình thì đúng về kỹ thuật nhưng
     không nói cho người đọc biết phải làm gì - nên nó được tách ra. */
  'lt.errExpired': {
    vi: 'Phiên Schwab đã hết hạn. Bấm ⚙ → Kết nối lại rồi quét lại.',
    en: 'The Schwab session has expired. Open ⚙ → Reconnect, then scan again.',
  },
  'lt.error': { vi: (m: string) => `Lượt quét lỗi: ${m}`, en: (m: string) => `Scan failed: ${m}` },
  'lt.summary': {
    vi: (v: any) => `Đã xét ${v.scanned} mã, ${v.kept} mã qua hết cổng.`,
    en: (v: any) => `Scanned ${v.scanned} symbols, ${v.kept} passed every gate.`,
  },
  /* Ảnh chụp, không phải giá sống. Cùng câu chữ với `res.saved` của tab
     Screener, vì đúng là cùng một sự thật - và nói y như nhau ở hai tab thì
     người đọc học một lần là hiểu cả hai. */
  'lt.saved': {
    vi: (at: number) => {
      const d = new Date(at);
      const same = d.toDateString() === new Date().toDateString();
      const gio = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const ngay = same ? 'hôm nay' : d.toLocaleDateString('vi-VN');
      return `Kết quả của lần quét lúc ${gio} ${ngay} - đây là ảnh chụp, giá đã cũ. Bấm quét lại để lấy số mới.`;
    },
    en: (at: number) => {
      const d = new Date(at);
      const same = d.toDateString() === new Date().toDateString();
      const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const day = same ? 'today' : d.toLocaleDateString('en-US');
      return `From the scan at ${time} ${day} - a snapshot, so prices are stale. Run the scan again for fresh numbers.`;
    },
  },
  'lt.empty': {
    vi: 'Không mã nào qua hết cổng lần này. Bảng trống ở đây là một CÂU TRẢ LỜI, không phải lỗi: phần lớn thời gian không có mã nào vừa rớt đủ sâu, vừa còn trên vùng hỗ trợ, vừa còn lãi và chưa đắt.',
    en: 'Nothing passed every gate this run. An empty table here is an ANSWER, not a failure: most of the time no stock is simultaneously down enough, still above a support zone, still profitable and not expensive.',
  },
  /* Không có câu này thì một bảng tên "công ty tốt đang rẻ" tự đọc thành
     danh sách khuyến nghị mua. */
  'lt.caveat': {
    vi: 'Đây là bộ LỌC, không phải khuyến nghị. Vùng hỗ trợ là thống kê của quá khứ chứ không phải lời hứa của tương lai — giá thủng qua nó suốt. Cơ bản Finviz là số cào từ trang web, trễ tới một quý. Và cổng "đang có lãi" chỉ nói công ty CÓ lãi, không nói lãi đó bền.',
    en: 'This is a FILTER, not a recommendation. A support zone is a statistic about the past, not a promise about the future — price breaks through them all the time. Finviz fundamentals are scraped and can lag by a quarter. And the "profitable" gate says a company IS profitable, not that it will stay so.',
  },
  'lt.col.symbol': { vi: 'Mã', en: 'Symbol' },
  'lt.col.price': { vi: 'Giá', en: 'Price' },
  'lt.col.offHigh': { vi: 'Rớt từ đỉnh 52T', en: 'Off 52w high' },
  'lt.col.support': { vi: 'Hỗ trợ gần nhất', en: 'Nearest support' },
  'lt.col.trend': { vi: 'Xu hướng', en: 'Trend' },
  'lt.col.quality': { vi: 'Chất lượng', en: 'Quality' },
  'lt.col.value': { vi: 'Định giá', en: 'Valuation' },
  'lt.col.score': { vi: 'Điểm', en: 'Score' },
  'lt.awayTouches': {
    vi: (v: any) => `cách ${v.away} · đã chạm ${v.touches} lần`,
    en: (v: any) => `${v.away} away · touched ${v.touches}×`,
  },
  'lt.brokenTag': { vi: (p: string) => `⚠ đã thủng ${p}`, en: (p: string) => `⚠ broke ${p}` },
  'lt.aboveSma': { vi: 'Trên SMA200', en: 'Above SMA200' },
  'lt.belowSma': { vi: 'Dưới SMA200', en: 'Below SMA200' },
  'lt.slope': { vi: (v: string) => `dốc SMA200 ${v}`, en: (v: string) => `SMA200 slope ${v}` },
  'lt.roe': { vi: 'ROE', en: 'ROE' },
  'lt.margin': { vi: 'Biên LN', en: 'Margin' },
  'lt.fwdPe': { vi: 'P/E dự phóng', en: 'Fwd P/E' },
  'lt.pePct': { vi: (v: string) => `phân vị P/E ${v}`, en: (v: string) => `${v}th P/E pctile` },
  'lt.peWarming': {
    vi: (n: number) => `phân vị P/E: còn thiếu ${n} lần đọc`,
    en: (n: number) => `P/E pctile: ${n} more readings needed`,
  },
  'lt.gates': { vi: 'Cổng cứng', en: 'Hard gates' },
  'lt.gateUnknown': { vi: 'chưa có dữ liệu', en: 'no data' },
  'lt.scoreHead': { vi: 'Điểm số chi tiết', en: 'Score breakdown' },
  'lt.supportHead': { vi: 'Vùng hỗ trợ', en: 'Support zone' },
  'lt.zoneDetail': {
    vi: (v: any) => `Tâm vùng ${v.price} (dải ${v.low}–${v.high}). Đã chạm ${v.touches} lần, lần đầu ${v.first}, gần nhất ${v.last}.`,
    en: (v: any) => `Zone centre ${v.price} (band ${v.low}–${v.high}). Touched ${v.touches} times, first ${v.first}, most recently ${v.last}.`,
  },
  'lt.noZone': {
    vi: 'Không tìm thấy vùng hỗ trợ nào NẰM DƯỚI giá hiện tại trong 3 năm nến ngày. Nghĩa là dưới chân giá không có mức nào từng được bảo vệ hai lần trở lên.',
    en: 'No support zone was found BELOW the current price in 3 years of daily bars. Nothing beneath this price has been defended twice or more.',
  },
  /* "Đã thủng" và "đang tới" trông giống nhau trên biểu đồ (giá nằm cạnh một
     đường kẻ) nhưng hành động thì ngược nhau, nên chúng được nói tách hẳn. */
  'lt.brokenDetail': {
    vi: (p: string) => `Giá đã rơi xuống DƯỚI vùng ${p}. Một vùng đã thủng không phải là một vùng đang tới — mức đó giờ là kháng cự phía trên, không phải đỡ phía dưới.`,
    en: (p: string) => `Price has already fallen BELOW the zone at ${p}. A broken zone is not an approaching one — that level is now resistance above, not a floor below.`,
  },
  'lt.zoneCount': {
    vi: (n: number) => `Tìm được ${n} vùng hỗ trợ trong 3 năm (mỗi vùng phải có ít nhất 2 lần chạm; một đáy đơn độc không được tính là vùng).`,
    en: (n: number) => `${n} support zones found over 3 years (each needs at least 2 touches; a single low is never counted as a zone).`,
  },
  'lt.faHead': { vi: 'Cơ bản (Finviz)', en: 'Fundamentals (Finviz)' },
  'lt.target': { vi: 'Giá mục tiêu', en: 'Analyst target' },
  'lt.targetNote': {
    vi: 'Giá mục tiêu được HIỆN nhưng cố ý KHÔNG dùng làm cổng lọc: nó gần như luôn nằm trên giá hiện tại, nên lấy nó làm cổng là giao quyền lọc cho sự lạc quan nghề nghiệp của người khác. Nó chỉ góp một phần vào điểm số.',
    en: 'The analyst target is shown but deliberately NOT used as a gate: it sits above the current price almost by default, so gating on it would hand the filtering over to someone else’s professional optimism. It only contributes to the score.',
  },
  'lt.faMissing': {
    vi: (k: string) => `Finviz không trả số cho những ô này: ${k}. Cổng liên quan hiện dấu “?” chứ không phải ✓ — có thể là công ty thật sự không có chỉ số đó, cũng có thể Finviz đổi giao diện và bộ cào cần sửa.`,
    en: (k: string) => `Finviz returned no value for: ${k}. The affected gates show “?” rather than ✓ — either the company genuinely has no such metric, or Finviz changed its layout and the scraper needs fixing.`,
  },
  'lt.peHead': { vi: 'Định giá so với chính mã này', en: 'Valuation vs its own history' },
  'lt.peDetail': {
    vi: (v: any) => `P/E hiện tại nằm ở phân vị ${v.pct} trong ${v.readings} lần đọc P/E của chính mã này. Trung vị ${v.median}; hiện lệch ${v.vs} so với trung vị đó.`,
    en: (v: any) => `Current P/E sits at the ${v.pct}th percentile of ${v.readings} readings of this stock’s own P/E. Median ${v.median}; now ${v.vs} versus that median.`,
  },
  /* Vế "rẻ so với chính nó" phải tự tích luỹ, nên trong nhiều tuần đầu nó là
     KHÔNG BIẾT chứ không phải "ở mức bình thường" - và màn hình nói rõ còn
     thiếu bao nhiêu, chứ không chỉ hiện một dấu gạch ngang câm. */
  'lt.peWarmingDetail': {
    vi: (v: any) => `Chưa đủ dữ liệu: mới có ${v.have} lần đọc, cần thêm ${v.need} lần nữa. Không nguồn nào cho sẵn chuỗi P/E quá khứ nên app tự ghi mỗi lần quét một dòng. Tới lúc đó, đây là KHÔNG BIẾT — không phải “đang ở mức bình thường” — và nó không kéo điểm lên hay xuống.`,
    en: (v: any) => `Not enough data yet: ${v.have} readings so far, ${v.need} more needed. No source provides a past P/E series, so this app records one reading per scan. Until then this is UNKNOWN — not “about average” — and it moves the score neither way.`,
  },
  /* ---- SEC 10-K trong tab Đầu tư dài hạn ---- */
  'lt.col.growth': { vi: 'Tăng trưởng', en: 'Growth' },
  'lt.revCagr': { vi: (v: string) => `DT ${v}/năm`, en: (v: string) => `Rev ${v}/yr` },
  'lt.sharesCagr': {
    vi: (v: string) => `cổ phiếu ${v}/năm`,
    en: (v: string) => `shares ${v}/yr`,
  },
  'lt.secNone': { vi: 'SEC: không có', en: 'SEC: none' },
  'lt.secHead': { vi: 'Tài chính nhiều năm (SEC 10-K)', en: 'Multi-year financials (SEC 10-K)' },
  'lt.secLead': {
    vi: (v: any) => `Bóc từ XBRL của ${v.years} năm 10-K trên SEC EDGAR. Năm tài chính gần nhất kết thúc ${v.fy}, nộp ${v.filed}. Thẻ doanh thu: ${v.tag}.`,
    en: (v: any) => `Parsed from XBRL of ${v.years} fiscal years of 10-K filings on SEC EDGAR. Latest fiscal year ended ${v.fy}, filed ${v.filed}. Revenue tag: ${v.tag}.`,
  },
  'lt.secFy': { vi: 'Năm TC', en: 'FY' },
  'lt.secRevenue': { vi: 'Doanh thu', en: 'Revenue' },
  'lt.secEps': { vi: 'EPS pha loãng', en: 'Diluted EPS' },
  'lt.secFcf': { vi: 'FCF', en: 'FCF' },
  'lt.secShares': { vi: 'Số CP (BQ pha loãng)', en: 'Shares (wtd. diluted)' },
  'lt.secCagr': {
    vi: (v: any) => `CAGR 3 năm — doanh thu ${v.rev}, EPS ${v.eps}, FCF ${v.fcf}. Biên FCF năm gần nhất ${v.margin}. Số cổ phiếu ${v.shares}/năm (dương = pha loãng, âm = mua lại).`,
    en: (v: any) => `3-year CAGR — revenue ${v.rev}, EPS ${v.eps}, FCF ${v.fcf}. Latest FCF margin ${v.margin}. Share count ${v.shares}/yr (positive = dilution, negative = buybacks).`,
  },
  'lt.secCagr5': {
    vi: (v: any) => `CAGR 5 năm — doanh thu ${v.rev}, EPS ${v.eps}.`,
    en: (v: any) => `5-year CAGR — revenue ${v.rev}, EPS ${v.eps}.`,
  },
  /* Ba lý do khác nhau cần ba cách sửa khác nhau, nên không gộp thành một
     câu "SEC không có dữ liệu". */
  'lt.secNoCik': {
    vi: 'SEC không có hồ sơ cho mã này (ETF, hoặc mã chưa có trong danh bạ CIK của SEC). Ba cổng SEC hiện dấu “?”, không phải ✓.',
    en: 'SEC has no filer record for this symbol (an ETF, or a ticker missing from the SEC CIK directory). The three SEC gates show “?”, not ✓.',
  },
  'lt.secNoData': {
    vi: (d: string) => `SEC có hồ sơ nhưng app không bóc được doanh thu cả năm. Đây là hình dạng THẬT của dữ liệu — nếu bạn thấy dòng này, thang thẻ XBRL cần sửa: ${d}`,
    en: (d: string) => `SEC has a filer record but the app could not extract full-year revenue. This is the REAL shape of the data — if you see this line, the XBRL tag ladder needs fixing: ${d}`,
  },
  'lt.secError': {
    vi: (e: string) => `Không lấy được dữ liệu SEC: ${e}. Ba cổng SEC hiện “?”; lần quét sau sẽ thử lại.`,
    en: (e: string) => `Could not fetch SEC data: ${e}. The three SEC gates show “?”; the next scan retries.`,
  },
  /* Đo được ở AAPL: 10-K chỉ mang 3 năm so sánh nên điều chỉnh split chỉ với
     ngược 3 năm; xa hơn là số chưa điều chỉnh, và CAGR EPS/số cổ phiếu vắt
     qua chỗ gãy sẽ ra một con số sai trông như thật. */
  'lt.secSplit': {
    vi: (y: string) => `Số cổ phiếu nhảy bậc tại ${y} — dấu hiệu chia tách cổ phiếu mà SEC chỉ điều chỉnh ngược 3 năm. CAGR của EPS và số cổ phiếu vắt qua mốc này bị bỏ trống thay vì in một con số sai; cổng pha loãng hiện “?”.`,
    en: (y: string) => `Share count jumps at ${y} — a stock split that SEC filings only restate three years back. EPS and share-count CAGRs spanning that point are left blank rather than printed wrong; the dilution gate shows “?”.`,
  },
  'lt.secDilutionWarn': {
    vi: 'EPS tăng nhưng số cổ phiếu cũng tăng — phần tăng EPS đang bị pha loãng, đọc con số EPS với sự dè dặt.',
    en: 'EPS is growing but so is the share count — per-share growth is being diluted; read the EPS figure with caution.',
  },
  'lt.whyHead': { vi: 'Tại sao rớt?', en: 'Why did it fall?' },
  'lt.whyBtn': { vi: 'Kiểm tin tức và hỏi Claude', en: 'Check the news and ask Claude' },
  'lt.whyBusy': { vi: 'Đang đọc…', en: 'Reading…' },
  'lt.whyNote': {
    vi: 'Lấy tin gần nhất của mã (Yahoo) rồi để Claude đọc cùng TA và FA ở trên. Mọi con số đều do code tính, Claude chỉ diễn giải — và được dặn phải NÓI THẲNG khi tin tức không giải thích được cú rớt, thay vì bịa một lý do nghe lọt tai.',
    en: 'Fetches the stock’s recent headlines (Yahoo) and has Claude read them alongside the TA and FA above. Every number is computed in code; Claude only interprets — and is instructed to SAY SO when the news does not explain the fall, rather than inventing a plausible cause.',
  },
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
  'rrg.colDirection': { vi: 'Hướng', en: 'Direction' },

  'rrg.weeks5': { vi: '5 tuần', en: '5 weeks' },
  'rrg.weeks10': { vi: '10 tuần', en: '10 weeks' },
  'rrg.weeks20': { vi: '20 tuần', en: '20 weeks' },
  'rrg.weeksAll': { vi: 'Tất cả', en: 'All' },

  'rrg.fullscreen': { vi: 'Toàn màn hình', en: 'Fullscreen' },
  'rrg.exitFullscreen': { vi: 'Thoát toàn màn hình', en: 'Exit fullscreen' },

  'rrg.aiTitle': { vi: 'Phân tích AI về RRG', en: 'AI analysis of the RRG' },
  'rrg.aiRun': { vi: 'Phân tích AI', en: 'Run AI analysis' },
  'rrg.aiRerun': { vi: 'Phân tích lại', en: 'Run again' },
  'rrg.aiNote': {
    vi: 'Claude chỉ đọc đúng RS-Ratio/RS-Momentum/góc phần tư/hướng đang hiện trong bảng trên - không gọi thêm dữ liệu nào khác. Đây là ngành, không phải cổ phiếu: nhãn góc phần tư mô tả trạng thái dòng tiền của cả ngành, không phải khuyến nghị mua bán một mã nào.',
    en: 'Claude reads only the RS-Ratio/RS-Momentum/quadrant/direction already in the table above - no extra data fetched. This describes a SECTOR, not a stock: a quadrant label is a state of sector money flow, not a buy/sell call on any ticker.',
  },
  'rrg.note': {
    vi: 'Toạ độ tính từ giá tuần của 11 quỹ ngành SPDR so với SPY, lấy từ Schwab: chênh lệch hai đường EMA của sức mạnh tương đối, rồi so với mặt bằng của cả 11 ngành trong cùng tuần — nên 100 nghĩa là ngang bằng mặt bằng chung, không phải ngang bằng SPY. Công thức RS-Ratio/RS-Momentum gốc của JdK không được công bố, đây là bản dựng lại: vòng xoay và thứ tự ngành đọc như bản gốc, con số tuyệt đối thì không nhất thiết trùng. Vị trí góc phần tư mô tả trạng thái, không phải khuyến nghị mua bán.',
    en: 'Coordinates are computed from weekly Schwab prices for the 11 SPDR sector funds against SPY: the gap between two EMAs of relative strength, then scored against where all 11 sectors sit that same week — so 100 means level with the pack, not level with SPY. JdK\u2019s original RS-Ratio/RS-Momentum formula is unpublished; this is a reconstruction, so the rotation and the ordering read like the original while the absolute numbers need not match. A quadrant describes a state, not a recommendation.',
  },

  // ---- market internals (tab Heatmap → Bề rộng TT) ----
  'int.title': { vi: 'Bề rộng thị trường', en: 'Market internals' },
  'int.loading': { vi: 'Đang tải…', en: 'Loading…' },
  'int.loadFailed': { vi: 'Không tải được market internals.', en: 'Could not load market internals.' },
  'int.note': {
    vi: 'Mọi con số ở đây app ĐỌC ĐƯỢC (khác khung TradingView), và mỗi thẻ tự nói nó lấy từ đâu. Nến phút thật từ Schwab (4 chỉ báo) và chuỗi trong ngày từ UW (market tide) làm mới mỗi lần mở trang. Bốn chỉ báo còn lại chỉ có SỐ HIỆN TẠI nên app tự lấy mẫu mỗi ~15 phút — đường THÔ hơn hẳn: NASDAQ TICK, NYSE ADV−DECL, Put/Call Equity (Schwab), Put/Call Total (UW). IV Rank trung bình đọc từ kho tastytrade đã đồng bộ sẵn cho cổng earnings. Put/Call Total tính từ khối lượng quyền chọn toàn thị trường của UW — đo ngày 18/09 ra 0,73, khớp với CBOE trên TradingView cùng phiên, nhưng hai bên tính trên hai feed khác nhau nên không phải lúc nào cũng trùng.',
    en: 'Every number here is one the app can READ (unlike the TradingView frame), and each card names its source. Real minute candles from Schwab (four indicators) and an intraday series from UW (market tide) refresh on every page load. Four more only give a CURRENT NUMBER, so the app self-samples every ~15 minutes — a much coarser line: NASDAQ TICK, NYSE ADV−DECL, Put/Call Equity (Schwab), Put/Call Total (UW). Average IV Rank comes from the tastytrade store already synced for the earnings gate. Put/Call Total is computed from UW’s market-wide option volume — measured 0.73 on Sep 18, matching CBOE on TradingView the same session, but the two are computed on different feeds and need not always agree.',
  },
  'int.viewTv': { vi: 'TradingView', en: 'TradingView' },
  'int.viewApp': { vi: 'Số liệu app', en: "App's own data" },
  'int.tvNote': {
    vi: 'Tám biểu đồ này nhúng thẳng từ TradingView (nguồn USI) — đầy đủ cả 8 chỉ báo kèm lịch sử, kể cả 2 cái Schwab không có mã nào để quote. ĐÁNH ĐỔI: đây là một KHUNG HÌNH của TradingView, app KHÔNG đọc được con số bên trong — không cảnh báo được, không đưa vào "Hỏi Claude" được. Muốn số liệu app tự đọc được thì gạt sang "Số liệu app".',
    en: 'These eight charts are embedded straight from TradingView (USI source) — all eight indicators with full history, including the two Schwab has no symbol for. THE TRADE-OFF: this is a TradingView FRAME, the app cannot read the numbers inside it — no alerts, nothing for "Ask Claude". Switch to "App\'s own data" for numbers the app can actually read.',
  },
  'int.tvBlocked': {
    vi: 'Nếu các ô dưới đây trống hoặc xám: trình duyệt, tiện ích chặn quảng cáo hoặc mạng đang chặn tradingview.com — app không tự biết được điều đó (khung của bên thứ ba, app không đọc được vào trong), nên dòng này nói trước.',
    en: 'If the boxes below are empty or grey: your browser, an ad blocker, or the network is blocking tradingview.com — the app cannot detect that itself (a third-party frame is opaque to it), which is why this line says so up front.',
  },
  'int.sourceSchwab': { vi: 'nến thật (Schwab)', en: 'real candles (Schwab)' },
  'int.sourceSampled': { vi: 'tự lấy mẫu ~15 phút', en: 'self-sampled ~15min' },
  'int.asOf': { vi: (t: any) => `lúc ${t}`, en: (t: any) => `as of ${t}` },
  'int.noHistory': { vi: 'Không có nến trong ngày.', en: 'No intraday candles.' },
  'int.noSamplesYet': { vi: 'Chưa có mẫu nào hôm nay.', en: 'No samples yet today.' },
  'int.unavailable': {
    vi: 'Đã hỏi cả ba nguồn app có key và không nguồn nào có: Schwab không quote mã nào, UW không bán bề rộng cổ phiếu, tastytrade/dxFeed không trả dữ liệu cho cách viết nào đã thử. Muốn nhìn thì xem chế độ TradingView.',
    en: 'All three keyed sources were asked and none carries it: Schwab quotes no symbol for it, UW does not sell equity breadth, and tastytrade/dxFeed returned nothing for any spelling tried. Use the TradingView view to look at it.',
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
  'an.companyTranslated': {
    vi: 'Lĩnh vực, ngành, quốc gia và mô tả ở trên do Claude dịch tự động từ nguyên văn tiếng Anh của Finviz/FMP - có thể chưa chính xác 100%.',
    en: 'The sector, industry, country and description above were auto-translated by Claude from the original English Finviz/FMP text - may not be 100% accurate.',
  },
  // Vì sao phần này vẫn hiện tiếng Anh dù đang ở chế độ tiếng Việt - trước
  // đây mọi lý do lùi về tiếng Anh trông giống hệt nhau (im lặng), nên báo
  // lại đúng một triệu chứng không cách nào biết đang thiếu key hay hết hạn
  // mức hay lỗi khác. Ba lý do sửa khác nhau nên tách ba câu.
  'an.companyTranslateNoKey': {
    vi: 'Chưa dịch được: server chưa có ANTHROPIC_API_KEY. Thêm biến đó trên Render rồi mở lại mã này.',
    en: 'Not translated: the server has no ANTHROPIC_API_KEY. Add it on Render and reopen this symbol.',
  },
  'an.companyTranslateBadKey': {
    vi: 'Chưa dịch được: khoá API bị từ chối. Kiểm tra lại ANTHROPIC_API_KEY trên Render.',
    en: 'Not translated: the API key was rejected. Check ANTHROPIC_API_KEY on Render.',
  },
  'an.companyTranslateRateLimited': {
    vi: 'Chưa dịch được: Anthropic đang giới hạn tần suất. Mở lại mã này sau ít phút.',
    en: 'Not translated: Anthropic is rate limiting. Reopen this symbol in a few minutes.',
  },
  'an.companyTranslateTruncated': {
    vi: 'Bản dịch bị cắt giữa chừng vì mô tả quá dài. Mở lại mã này để dịch lại - nếu vẫn vậy thì cần nới hạn mức token của phần dịch.',
    en: 'The translation was cut off because the description ran long. Reopen this symbol to retry - if it keeps happening the translation token ceiling needs raising.',
  },
  'an.companyTranslateBadRequest': {
    vi: 'Chưa dịch được: Anthropic từ chối yêu cầu (lỗi tham số phía app). Thử lại cũng không hết - cần sửa code.',
    en: 'Not translated: Anthropic rejected the request (a parameter bug in the app). Retrying will not help - this needs a code fix.',
  },
  'an.companyTranslateFailed': {
    vi: 'Chưa dịch được lần này. Mở lại mã này để thử lại.',
    en: 'Translation failed this time. Reopen this symbol to try again.',
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
  /* Câu này từng nói SAI hai chuyện, và chuyện thứ hai nặng hơn.
     (1) Sau #135 nguồn không còn là một file: `loadEarnings()` HỢP
         `data/earnings.json` với lịch tastytrade.
     (2) Nó hứa "phân biệt rõ ngày đã công bố với ngày ước tính" - nhưng
         sự phân biệt đó nằm trong `_comment` của file (văn xuôi cho
         người đọc) và trong cờ `estimated` của tastytrade, còn DÒNG TRÊN
         MÀN HÌNH chỉ in một ngày trơ, không mang nhãn nào. Hứa một sự
         chắc chắn mà màn hình không hề thể hiện là đúng thứ degradation
         idiom của repo này cấm - nên câu mới nói thẳng rằng nhãn đó chỉ
         có ở Hard gates bên tab Screener.
     Dấu — cũng được nói rõ là GỘP "chưa biết gì" với "đã kiểm, không có",
     vì `nextEarnings` là `find(d => d >= today) ?? null`: mã vắng mặt, mã
     mang mảng rỗng (ETF) và mã chỉ còn ngày trong quá khứ đều ra null. */
  'an.earningsNote': {
    vi: 'Ngày earnings kế tiếp là HỢP của hai nguồn: data/earnings.json (dựng bằng tay cho mã trong watchlist, làm mới hằng tuần qua GitHub Actions) và lịch tastytrade (phủ mọi mã, nhưng chỉ ngày kế tiếp). Dòng trên in ngày sớm nhất còn ở phía trước và KHÔNG nói ngày đó công ty đã xác nhận hay mới chỉ là ước tính — nhãn "ngày ước tính" chỉ có ở phần Hard gates bên tab Screener. Dấu — nghĩa là không nguồn nào có ngày ở phía trước, và nó gộp chung "chưa biết gì về mã này" với "đã kiểm, mã này không có earnings".',
    en: 'The next-earnings date is the UNION of two sources: data/earnings.json (hand-built for watchlist symbols, refreshed weekly by a GitHub Action) and tastytrade\'s calendar (covers every symbol, but only the next date). The row above prints the earliest date still ahead and does NOT say whether the company confirmed it or it is an estimate — that "estimated date" tag only appears under Hard gates on the Screener tab. A — means neither source has a future date, and it collapses "nothing is known about this symbol" together with "checked, this symbol has no earnings".',
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
  /* Google News không gắn mã cho bài, nên đây là CHƯA BIẾT - không được in
     "riêng mã này" cho một bài chưa ai kiểm là viết về công ty nào. */
  'an.tickerUnknown': {
    vi: 'chưa rõ có riêng mã này không',
    en: 'not tagged to a ticker',
  },
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
  'ai.title': { vi: 'Claude đọc toàn bộ chỉ số', en: 'Claude reads all the indicators' },
  'ai.run': { vi: 'Nhờ Claude phân tích', en: 'Ask Claude' },
  'ai.rerun': { vi: 'Phân tích lại', en: 'Run again' },
  'ai.running': { vi: 'Đang đọc…', en: 'Reading…' },
  'ai.idle': {
    vi: 'Claude đọc TẤT CẢ chỉ số trên trang này trong một lượt - kỹ thuật (SMA, RSI, MACD, ATR, Bollinger, HV), biến động ngụ ý, cơ bản, và cấu trúc gamma (put wall, call wall, zero gamma, net GEX từ biểu đồ cuối trang) - rồi nói chúng hợp nhau hay mâu thuẫn ở đâu. Mỗi lần bấm tốn khoảng 3 cent tiền API, nên nó chỉ chạy khi bạn bấm.',
    en: 'Claude reads ALL the indicators on this page in one pass - technical (SMA, RSI, MACD, ATR, Bollinger, HV), implied vol, fundamentals, and the gamma structure (put wall, call wall, zero gamma, net GEX from the chart at the bottom) - and says where they agree and where they contradict each other. Each run costs a few cents of API credit, so it only runs when you ask.',
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
  'scan.busy': {
    vi: 'Một người khác trong nhà đang quét. Hai lần quét cùng lúc sẽ giành nhau hạn mức Schwab và làm chậm cả hai — chờ lần quét kia xong rồi bấm lại.',
    en: 'Someone else in the household is scanning. Two scans at once fight over the same Schwab rate limit and slow each other down — wait for theirs to finish, then try again.',
  },
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

  /* Độ trễ công bố. Giao diện trước đây chỉ nói "30-45 ngày" theo luật, đó là
     TRẦN PHÁP LÝ chứ không phải thực tế - đo thật thì trung vị Thượng viện là
     116 ngày và không có giao dịch nào trong 7 ngày gần nhất. Không nói ra
     thì bảng này đọc như tín hiệu sống trong khi nó là hồ sơ lịch sử. */
  'cg.lagHead': { vi: 'Công bố trễ (đo thật)', en: 'Disclosure lag (measured)' },
  'cg.lagMedian': {
    vi: (n: number) => `Trung vị ${n} ngày`,
    en: (n: number) => `Median ${n} days`,
  },
  'cg.lagNote': {
    vi: 'Luật cho phép khai trong 30-45 ngày, nhưng đó là TRẦN chứ không phải thực tế. Con số bên trái là đo thật trên chính dữ liệu đang hiện: từ ngày nghị sĩ giao dịch tới ngày hồ sơ được công bố. Bảng này là HỒ SƠ LỊCH SỬ, không phải tín hiệu trong ngày - giá đã chạy xong từ lâu trước khi bạn nhìn thấy dòng này.',
    en: 'The law allows 30-45 days, but that is a CEILING, not reality. The figure on the left is measured from the data actually on screen: from the day the member traded to the day the filing was published. This table is a HISTORICAL RECORD, not an intraday signal - the price moved long before the row appeared here.',
  },
  'cg.lagUnknown': {
    vi: 'Không tính được - dữ liệu đang hiện không có ngày công bố nào.',
    en: 'Cannot be computed - none of the records on screen carry a filing date.',
  },
  'cg.colSide': { vi: 'Mua / Bán', en: 'Buy / Sell' },
  'cg.colCount': { vi: 'Số lệnh', en: 'Trades' },
  'cg.colLag': { vi: 'Trễ (ngày)', en: 'Lag (days)' },
  'cg.buy': { vi: 'Mua', en: 'Buy' },
  'cg.sell': { vi: 'Bán', en: 'Sell' },
  'cg.keyBuy': { vi: 'Lượt mua', en: 'Buys' },
  'cg.keySell': { vi: 'Lượt bán', en: 'Sells' },
  /* Cùng bài học với `of.keyCaveat` (#125): nói thẳng thứ dữ liệu KHÔNG cho
     biết. Thiếu câu này thì một hàng toàn màu đỏ đọc thành "nghị sĩ biết tin
     xấu", trong khi phần lớn lệnh bán là quỹ uỷ thác mù, cân lại danh mục hay
     bán để đóng thuế. */
  'cg.keyCaveat': {
    vi: 'Màu chỉ nói mua hay bán. Một lệnh bán KHÔNG có nghĩa là nghị sĩ biết tin xấu - phần lớn là quỹ uỷ thác mù, cân lại danh mục hoặc bán để nộp thuế, và nhiều tài khoản do người nhà quản lý.',
    en: 'Colour only says buy or sell. A sale does NOT mean the member knows something bad - most are blind trusts, rebalancing or selling to pay tax, and many accounts are managed by a family member.',
  },
  'cg.sideSplit': {
    vi: (buyPct: number) => `${buyPct}% mua`,
    en: (buyPct: number) => `${buyPct}% buys`,
  },
  'cg.sideNone': { vi: 'không rõ phía', en: 'side unknown' },
  /* Khác 0 nghĩa là UW gửi kiểu giao dịch lạ (không phải Purchase/Sale). Nói
     ra chứ đừng cộng lén vào "mua" - xem `tradeSide()` trong congress.ts. */
  'cg.otherSide': {
    vi: (n: number) => `+${n} không rõ`,
    en: (n: number) => `+${n} unknown`,
  },
  'cg.dWho': { vi: 'Nghị sĩ', en: 'Member' },
  'cg.dAccount': { vi: 'Tài khoản', en: 'Account' },
  'cg.dSide': { vi: 'Loại', en: 'Type' },
  'cg.dAmount': { vi: 'Khoảng tiền', en: 'Amount range' },
  'cg.dTraded': { vi: 'Ngày giao dịch', en: 'Traded' },
  'cg.dFiled': { vi: 'Ngày công bố', en: 'Filed' },
  'cg.dLag': { vi: 'Trễ', en: 'Lag' },
  'cg.dNotes': { vi: 'Ghi chú', en: 'Notes' },
  'cg.days': {
    vi: (n: number) => `${n} ngày`,
    en: (n: number) => `${n}d`,
  },
  'cg.amountWhat': {
    vi: 'Luật STOCK Act chỉ bắt khai theo KHOẢNG, không phải số chính xác. Đây là nguyên văn khoảng được khai, app không quy ra số.',
    en: 'The STOCK Act only requires a RANGE, never an exact figure. This is the disclosed range verbatim; the app does not convert it to a number.',
  },
  /* Ai đứng tên tài khoản. UW viết thường: self / spouse / joint /
     dependent / undisclosed - và họ thêm giá trị mới lúc nào không báo, nên
     `issuerLabel()` in NGUYÊN chữ của UW khi gặp giá trị lạ thay vì in ra
     khoá `cg.issuer.xxx` (cùng lý do với `ruleLabel()` ở Options Flow). */
  'cg.issuer.self': { vi: 'Chính nghị sĩ', en: 'The member' },
  'cg.issuer.spouse': { vi: 'Vợ/chồng', en: 'Spouse' },
  'cg.issuer.joint': { vi: 'Tài khoản chung', en: 'Joint' },
  'cg.issuer.dependent': { vi: 'Con phụ thuộc', en: 'Dependent child' },
  'cg.issuer.undisclosed': { vi: 'Không khai', en: 'Undisclosed' },
  'cg.noPhoto': {
    vi: 'Chưa có ảnh chân dung cho nghị sĩ này.',
    en: 'No portrait available for this member.',
  },
  /* Xem theo MÃ hay theo NGHỊ SĨ. Hai câu hỏi khác nhau: "mã này ai đụng
     vào" và "người này đang làm gì" - một bảng xếp theo mã không trả lời
     được câu thứ hai. */
  'cg.bySymbol': { vi: 'Theo mã', en: 'By symbol' },
  'cg.byMember': { vi: 'Theo nghị sĩ', en: 'By member' },
  'cg.mTrades': { vi: 'Lệnh', en: 'Trades' },
  'cg.mSymbols': { vi: 'Mã', en: 'Symbols' },
  'cg.mLast': { vi: 'Gần nhất', en: 'Last traded' },
  'cg.mLag': { vi: 'Trễ (trung vị)', en: 'Lag (median)' },
  'cg.mNoneKnown': { vi: 'Không rõ', en: 'Unknown' },
  /* Đảng/bang chỉ hiện khi UW thật sự trả về. Đoán đảng của một nghị sĩ là
     bịa ra một sự thật chính trị - để trống thật thà hơn nhiều. */
  'cg.party.democrat': { vi: 'Dân chủ', en: 'Democrat' },
  'cg.party.republican': { vi: 'Cộng hoà', en: 'Republican' },
  'cg.party.independent': { vi: 'Độc lập', en: 'Independent' },
  'cg.noVolume': {
    vi: 'Không có cột "tổng tiền" như các trang khác: luật STOCK Act chỉ cho khai theo KHOẢNG, nên mọi con số tổng đều là do trang đó tự đoán giữa khoảng. App này đếm SỐ LỆNH - thứ đếm được chính xác.',
    en: 'There is deliberately no "total volume" column like other sites show: the STOCK Act only allows ranges, so any total is that site guessing a point inside each range. This app counts TRADES instead - the thing that can be counted exactly.',
  },
  /* Vì sao chưa có ảnh / chưa có đảng. Bốn trạng thái này trước đây trông
     y hệt nhau trên màn hình (một vòng tròn chữ cái đầu), mà cách sửa của
     mỗi cái lại khác hẳn: bấm đồng bộ / báo cho Claude / không làm gì được.
     Im lặng ở đây đọc thành "app hỏng", đúng thứ degradation idiom cấm. */
  'cg.noPhotoHead': { vi: 'Chưa có ảnh chân dung', en: 'No portraits yet' },
  'cg.noPhotoBioguide': {
    vi: (id: string) =>
      `Unusual Whales trả mã định danh dạng "${id}", không phải Bioguide ID (một chữ cái + 6 chữ số, ví dụ P000197). Kho ảnh công khai chỉ tra được bằng Bioguide ID, nên app KHÔNG dựng đường dẫn ảnh - vẽ đường dẫn đoán bừa chỉ tạo ra một loạt ảnh vỡ. Gửi dòng này cho Claude để nối thêm bảng tra tên → Bioguide ID.`,
    en: (id: string) =>
      `Unusual Whales returns an id shaped like "${id}", not a Bioguide ID (one letter + 6 digits, e.g. P000197). The public portrait repository can only be looked up by Bioguide ID, so the app does not build an image URL — a guessed one would just produce broken images. Send this line to Claude to add a name → Bioguide ID lookup.`,
  },
  'cg.noPhotoUnknown': {
    vi: 'Chưa đồng bộ lần nào từ khi app biết đọc mã định danh, nên chưa đo được UW trả gì. Bấm "Đồng bộ ngay" ở trên rồi mở lại tab này.',
    en: 'No sync has run since the app learned to read the member id, so there is nothing measured yet. Press "Sync now" above, then reopen this tab.',
  },
  'cg.noParty': {
    vi: 'Chưa có dữ liệu đảng cho các nghị sĩ bên dưới, nên không có vòng màu quanh ảnh. Bản ghi đã lưu trước khi app biết đọc trường này - bấm "Đồng bộ ngay" ở trên để lấy lại. Nếu bấm rồi mà vẫn trống thì nghĩa là UW không trả trường đảng, và app sẽ KHÔNG đoán đảng từ tên hay bang.',
    en: 'No party data for the members below, so the portraits carry no coloured ring. These records were stored before the app read that field — press "Sync now" above to refresh them. If it stays empty after that, Unusual Whales does not send a party, and the app will NOT guess one from a name or a state.',
  },
  'cg.uwKeys': {
    vi: (keys: string) => `Tên trường thật UW gửi về: ${keys}`,
    en: (keys: string) => `Real field names Unusual Whales sends: ${keys}`,
  },
  'cg.photoSource': {
    vi: 'Ảnh chân dung thuộc phạm vi công cộng, lấy từ kho unitedstates/images - chỉ hiện khi mã định danh đúng dạng Bioguide, nếu không màn hình vẽ chữ cái đầu tên.',
    en: 'Portraits are public-domain images from the unitedstates/images repository - shown only when the member id matches the Bioguide format; otherwise initials are drawn instead.',
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
  'of.colPremium': { vi: 'Tổng tiền', en: 'Premium' },
  'of.colSplit': { vi: 'Call / Put', en: 'Call / Put' },
  'of.colBiggest': { vi: 'Lệnh lớn nhất', en: 'Biggest' },
  'of.colCount': { vi: 'Số lệnh', en: 'Alerts' },
  'of.keyCall': { vi: 'Tiền vào Call', en: 'Money into calls' },
  'of.keyPut': { vi: 'Tiền vào Put', en: 'Money into puts' },
  'of.keyCaveat': {
    // Giới hạn thật của dữ liệu, phải nói ra. UW cho biết tiền đổ vào phía
    // nào, KHÔNG cho biết ai mua ai bán - mà một lệnh call lớn hoàn toàn có
    // thể là người ta đang BÁN call. Không có câu này thì "tiền vào Call"
    // đọc thành "đang đặt cược giá lên", một kết luận sai chứ không phải
    // một thông tin thiếu.
    vi: 'Đây là tiền đổ vào phía nào, KHÔNG phải ai mua ai bán — một lệnh call lớn có thể là người ta bán call.',
    en: 'This is which side the money went into, NOT who bought or sold — a large call trade can be someone selling calls.',
  },
  'of.splitLabel': {
    vi: (pct: number) => `${pct}% call`,
    en: (pct: number) => `${pct}% calls`,
  },
  'of.splitNone': { vi: 'không rõ phía', en: 'side unknown' },
  'of.otherSide': {
    vi: (m: string) => `· ${m} không rõ phía`,
    en: (m: string) => `· ${m} unknown side`,
  },
  'of.dWhen': { vi: 'Lúc', en: 'When' },
  'of.dContract': { vi: 'Hợp đồng', en: 'Contract' },
  'of.dDte': { vi: 'Còn (ngày)', en: 'DTE' },
  'of.dPremium': { vi: 'Tiền', en: 'Premium' },
  'of.dVolOi': { vi: 'KL/OI', en: 'Vol/OI' },
  'of.dTags': { vi: 'Dấu hiệu', en: 'Flags' },
  'of.multi': { vi: 'Nhiều chân', en: 'Multi-leg' },
  'of.sweepWhat': {
    vi: 'Một lệnh bị xé ra quét qua nhiều sàn cùng lúc — người đặt chấp nhận giá xấu hơn để khớp cho bằng được. Dấu hiệu của sự vội vàng.',
    en: 'One order split across several exchanges at once — the buyer accepted a worse price to get filled immediately. A sign of urgency.',
  },
  'of.floorWhat': {
    vi: 'Khớp trên sàn giao dịch truyền thống, thường là lệnh lớn của tổ chức thay vì lệnh máy.',
    en: 'Executed on the exchange floor — usually a large institutional order rather than an algorithmic one.',
  },
  'of.multiWhat': {
    vi: 'Lệnh có nhiều chân (spread), không phải một cú đặt cược thẳng một chiều — đừng đọc số tiền này như đặt cược tăng hay giảm.',
    en: 'A multi-leg order (a spread), not a one-directional bet — do not read this premium as bullish or bearish.',
  },
  'of.volOiWhat': {
    vi: 'Khối lượng chia cho số hợp đồng đang mở. Trên 1 nghĩa là hôm nay giao dịch nhiều hơn toàn bộ hợp đồng đang tồn tại ở mức giá đó — gần như chắc chắn là vị thế MỚI.',
    en: 'Volume divided by open interest. Above 1 means more traded today than all contracts that existed at that strike — almost certainly a new position.',
  },

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
