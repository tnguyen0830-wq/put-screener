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
  'tab.analyze': { vi: 'Phân tích mã', en: 'Analyze' },
  'tab.heatmap': { vi: 'Bản đồ nhiệt', en: 'Heatmap' },
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

  // ---- ticker tape ----
  'tape.vix': { vi: 'VIX', en: 'VIX' },
  'tape.spx': { vi: 'S&P 500', en: 'S&P 500' },
  'tape.ndx': { vi: 'Nasdaq 100', en: 'Nasdaq 100' },
  'tape.rut': { vi: 'Russell 2000', en: 'Russell 2000' },
  'tape.gold': { vi: 'Vàng · GLD', en: 'Gold · GLD' },
  'tape.oil': { vi: 'Dầu · USO', en: 'Oil · USO' },
  'tape.btc': { vi: 'Bitcoin · IBIT', en: 'Bitcoin · IBIT' },

  // ---- filter panel ----
  'filters.head': { vi: 'Tiêu chí lọc', en: 'Filters' },
  'filters.scope': { vi: 'Phạm vi quét', en: 'Scan universe' },
  'filters.sp500': { vi: 'Cả S&P 500', en: 'All of S&P 500' },
  'filters.watchlist': { vi: 'Watchlist', en: 'Watchlist' },
  'filters.lead': {
    vi: 'Bỏ tick một tiêu chí để không áp dụng tiêu chí đó. Số đã nhập vẫn được giữ, tick lại là dùng nguyên như cũ.',
    en: 'Untick a criterion to stop applying it. The number you typed is kept, so ticking it back restores it.',
  },
  'filters.capital': {
    vi: 'Vốn tối đa mỗi vị thế (USD)',
    en: 'Max capital per position (USD)',
  },
  'filters.capitalOff': {
    vi: 'Không loại mã đắt trước khi tải chuỗi quyền chọn, nên quét sẽ lâu hơn đáng kể.',
    en: 'Expensive tickers are no longer dropped before their option chain is fetched, so scans get considerably slower.',
  },
  'filters.delta': { vi: 'Delta (tuyệt đối)', en: 'Delta (absolute)' },
  'filters.deltaMin': { vi: 'Delta tối thiểu', en: 'Minimum delta' },
  'filters.deltaMax': { vi: 'Delta tối đa', en: 'Maximum delta' },
  'filters.dte': { vi: 'Số ngày đến đáo hạn', en: 'Days to expiration' },
  'filters.dteMin': { vi: 'DTE tối thiểu', en: 'Minimum DTE' },
  'filters.dteMax': { vi: 'DTE tối đa', en: 'Maximum DTE' },
  'filters.dteOff': {
    vi: 'Vẫn giới hạn 180 ngày tới — quét mọi đáo hạn xa hơn thì chuỗi quyền chọn phình quá to mà không dùng để bán put.',
    en: 'Still capped at the next 180 days — scanning further out inflates the option chain for expirations nobody sells puts against.',
  },
  'filters.roc': {
    vi: 'Lợi suất quy năm tối thiểu (%)',
    en: 'Minimum annualized return (%)',
  },
  'filters.liquidity': { vi: 'Thanh khoản', en: 'Liquidity' },
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
    vi: 'Rớt từ đỉnh 52 tuần tối thiểu (%)',
    en: 'Minimum drop from 52-week high (%)',
  },
  'filters.drawdownHint': {
    vi: 'Chỉ lấy mã đã rớt ít nhất bấy nhiêu % so với đỉnh 52 tuần. Gõ 10 hoặc 20 tuỳ mức chiết khấu bạn muốn.',
    en: 'Only tickers that have fallen at least this far from their 52-week high. Type 10 or 20 depending on the discount you want.',
  },
  'filters.ivhv': { vi: 'IV / HV20 tối thiểu', en: 'Minimum IV / HV20' },
  'filters.ivhvHint': {
    vi: 'IV cao so với biến động thực tế 20 phiên. 1.0 = quyền chọn đang được trả đúng bằng mức dao động thật.',
    en: 'Implied vol against realized vol over 20 sessions. 1.0 means the option pays exactly what the stock actually moves.',
  },
  'filters.iv': { vi: 'IV tối thiểu (%)', en: 'Minimum IV (%)' },
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
