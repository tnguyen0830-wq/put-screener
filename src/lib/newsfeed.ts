import { rssDecode, rssShape, rssTag, gnewsTopic, gnewsBlockedUntil } from './gnews';
import { xConfigured, xGet, XError, parseSearch, authorQuery } from './xnews';
import { uwConfigured, uwGet, UwError } from './unusualwhales';

/**
 * Tab Tin tức: tiêu đề chứng khoán + chính trị liên quan kinh tế, hai cột.
 *
 * Chủ app: "Tôi muốn làm tab news chuyên về tính tin tức chứng khoán và chính
 * trị liên quan kinh tế." Chốt trước ba điều: nguồn = CẢ BỐN (RSS báo lớn,
 * Google News theo chủ đề, X theo danh sách tài khoản, Unusual Whales news);
 * tiếng Việt = nút "Tóm tắt" gọi Claude MỘT lần trên vài chục tiêu đề (không
 * dịch từng dòng — 60 tiêu đề × mỗi lần mở tab là 60 lượt gọi cho thứ người
 * đọc lướt qua trong 10 giây); bố cục = hai cột Thị trường | Chính trị.
 *
 * ============================================================
 * KHÔNG MỘT NGUỒN NÀO Ở ĐÂY ĐO ĐƯỢC TỪ SANDBOX — và tab này TỰ LÀ PROBE.
 * ============================================================
 *
 * Đo 2026-09-19: 22 URL feed của CNBC, MarketWatch, WSJ, Reuters, AP,
 * Bloomberg, FT, Yahoo, Fed, NPR, Politico, The Hill, WaPo, Investing.com,
 * Seeking Alpha và Google News ĐỀU bị proxy từ chối 403 ở bước CONNECT. Tức
 * tình trạng y hệt Yahoo (`news.ts`) và Google News (`gnews.ts`) — hai nguồn
 * đang chạy thật ở production — nên "không đo được từ đây" không phải rủi ro
 * mới. Theo khuôn CBOE (#109) và Google News (#149): đọc DUNG THỨ, và khi
 * một nguồn hỏng thì IN RA trạng thái + 160 ký tự đầu của thứ thật sự nhận
 * được, ngay trên màn hình, theo TỪNG nguồn. Một feed đã đổi URL, một feed
 * chặn máy chủ, một feed trả HTML thay vì XML — ba chuyện đó phải hiện thành
 * ba dòng khác nhau chứ không phải một cột trống trông y như "hôm nay không
 * có tin". Chủ app đọc dòng trạng thái đó ở production là phép đo; feed nào
 * chết thì gỡ khỏi `FEEDS`, feed nào sống thì giữ.
 *
 * Danh sách feed là PHỎNG ĐOÁN có chủ đích, không phải sự thật đã đo:
 *  - Reuters đã NGỪNG feed RSS công khai từ 2020, AP không có RSS chính thức
 *    — nên cả hai KHÔNG có trong danh sách dù chủ app nhắc tới; bài của họ
 *    vẫn về qua Google News theo chủ đề (bộ gom tin của hàng trăm báo).
 *  - Bloomberg/WSJ/FT có feed nhưng nổi tiếng chặn máy chủ trung tâm dữ liệu
 *    — để trong danh sách cho probe trả lời, không đoán trước.
 *
 * ============================================================
 * BỐN NGUỒN, BỐN TƯ THẾ CHI PHÍ KHÁC NHAU
 * ============================================================
 *
 *  - RSS báo lớn: miễn phí, không key, không hạn mức. Cache 5 phút.
 *  - Google News theo chủ đề: miễn phí, nhưng ĐÃ ĐO là trả 503 ở production
 *    (#153/#157) — nên là nguồn PHỤ, đi qua đúng cửa `gnewsFetch` với thời
 *    gian nghỉ 6 tiếng khi đo được là bị chặn. Bị chặn thì cột không trống:
 *    RSS vẫn còn, và dòng trạng thái nói Google đang nghỉ.
 *  - X: TRẢ THEO LƯỢNG DÙNG (#161), nên có cache RIÊNG 15 phút mà nút "Làm
 *    mới" KHÔNG vượt qua được — bấm làm mới 20 lần một phút là 20 lần trả
 *    tiền cho cùng một đống bài. Danh sách tài khoản là của CHỦ APP (biến
 *    môi trường), app không tự chọn ai đáng tin; chưa đặt thì nguồn tự tắt.
 *  - Unusual Whales `news/headlines`: có key, hạn mức ngày. CHƯA ĐO hình
 *    dạng — `/api/uwprobe` có thêm bước `news-headlines` để chủ app chạy
 *    một lần; ở đây đọc dung thứ nhiều tên trường và in khoá thật khi bóc
 *    hụt. Đi chung cache 5 phút → tối đa ~288 request/ngày, nhỏ so với
 *    30.000.
 */

export type NewsColumn = 'market' | 'politics';
export type NewsKind = 'rss' | 'gnews' | 'x' | 'uw';

export type Headline = {
  id: string;
  title: string;
  link: string;
  /** Tên báo / tài khoản X / "Unusual Whales". */
  outlet: string;
  /** ISO. Tiêu đề không có ngày bị BỎ — không xếp được theo thời gian thì
   *  không thuộc về một trang "mới nhất". */
  published: string;
  column: NewsColumn;
  kind: NewsKind;
};

export type SourceStatus = {
  id: string;
  label: string;
  kind: NewsKind;
  column: NewsColumn;
  ok: boolean;
  count: number;
  /** Lỗi thật, trạng thái đứng trước trích thân (#102). */
  error?: string;
  status?: number;
  /** `not-configured` = thiếu key/danh sách (tự tắt, không phải hỏng);
   *  `paused` = app tự nghỉ vì lần trước đo được là bị chặn/chết. */
  skipped?: 'not-configured' | 'paused';
  /** Hết nghỉ lúc nào (ISO), khi `skipped: 'paused'`. */
  pausedUntil?: string;
};

export type NewsPayload = {
  at: string;
  market: Headline[];
  politics: Headline[];
  sources: SourceStatus[];
  xConfigured: boolean;
  uwConfigured: boolean;
};

/* ------------------------------------------------------------------ *
 *  Danh sách nguồn. Phỏng đoán có chủ đích — xem đầu file.
 * ------------------------------------------------------------------ */

export type Feed = { id: string; label: string; url: string; column: NewsColumn };

export const FEEDS: Feed[] = [
  // ---- Thị trường ----
  { id: 'cnbc-top', label: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', column: 'market' },
  { id: 'cnbc-finance', label: 'CNBC Finance', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', column: 'market' },
  { id: 'mw-top', label: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', column: 'market' },
  { id: 'mw-pulse', label: 'MarketWatch Pulse', url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse', column: 'market' },
  { id: 'wsj-markets', label: 'WSJ Markets', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', column: 'market' },
  { id: 'yahoo', label: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', column: 'market' },
  { id: 'bbg-markets', label: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss', column: 'market' },
  // ---- Chính trị liên quan kinh tế ----
  { id: 'cnbc-politics', label: 'CNBC Politics', url: 'https://www.cnbc.com/id/10000113/device/rss/rss.html', column: 'politics' },
  { id: 'cnbc-economy', label: 'CNBC Economy', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', column: 'politics' },
  { id: 'bbg-politics', label: 'Bloomberg Politics', url: 'https://feeds.bloomberg.com/politics/news.rss', column: 'politics' },
  { id: 'politico-econ', label: 'Politico Economy', url: 'https://rss.politico.com/economy.xml', column: 'politics' },
  { id: 'hill-business', label: 'The Hill Business', url: 'https://thehill.com/business/feed/', column: 'politics' },
  { id: 'npr-business', label: 'NPR Business', url: 'https://feeds.npr.org/1006/rss.xml', column: 'politics' },
  // Thông cáo của Fed: là chính sách, không phải báo viết về chính sách —
  // nguồn gốc, cùng lập luận 8-K vs báo chí ở liveevents.ts.
  { id: 'fed', label: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml', column: 'politics' },
];

/** Câu tìm theo chủ đề trên Google News — nguồn PHỤ (xem đầu file). */
export const GNEWS_TOPICS: { id: string; label: string; column: NewsColumn; q: string }[] = [
  {
    id: 'gnews-market',
    label: 'Google News · thị trường',
    column: 'market',
    q: '"stock market" OR "Wall Street" OR "S&P 500" OR Nasdaq',
  },
  {
    id: 'gnews-politics',
    label: 'Google News · chính trị-kinh tế',
    column: 'politics',
    q: '"Federal Reserve" OR tariffs OR "White House" economy OR Congress budget',
  },
];

/** Tiêu đề cũ hơn mốc này không thuộc về một trang "tin mới". 48 giờ chứ
 *  không phải 24: cuối tuần không có tin thị trường, 24h là cột trống sáng
 *  thứ Bảy. */
export const MAX_AGE_MS = 48 * 60 * 60_000;
/** Mỗi nguồn góp nhiều nhất bấy nhiêu dòng — một feed 200 bài không được
 *  nhấn chìm sáu feed 20 bài, đúng bài học Form 4 nhấn chìm 8-K (#148). */
export const PER_SOURCE_CAP = 40;
export const PER_COLUMN_CAP = 80;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

/* ------------------------------------------------------------------ *
 *  Bóc RSS 2.0 / Atom. Hàm THUẦN, test được không cần mạng.
 * ------------------------------------------------------------------ */

export type FeedItem = { title: string; link: string; published: string };

/**
 * `<link>` trong Atom là `<link href="..."/>` (rỗng bên trong), trong RSS
 * là `<link>http://…</link>`; vài feed RSS viết `<link/>http://…` (thẻ tự
 * đóng rồi URL đứng trần ngay sau) — cả ba được đọc. Không đọc được thì
 * BỎ dòng: một tiêu đề không bấm vào được là một dòng vô dụng.
 */
function linkOf(block: string): string {
  const plain = rssTag(block, 'link');
  if (/^https?:\/\//i.test(plain)) return plain;
  // Atom: ưu tiên rel="alternate" (hoặc không có rel), bỏ rel="self"/"enclosure".
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)];
  for (const m of links) {
    const attrs = m[1];
    const rel = /\brel\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]?.toLowerCase();
    if (rel && rel !== 'alternate') continue;
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    if (href && /^https?:\/\//i.test(href)) return rssDecode(href);
  }
  // `<link/>http://…` — URL đứng trần sau thẻ tự đóng.
  const bare = /<link\s*\/>\s*(https?:\/\/[^\s<]+)/i.exec(block)?.[1];
  return bare ? rssDecode(bare) : '';
}

function dateOf(block: string): number {
  for (const tag of ['pubDate', 'published', 'updated', 'dc:date', 'lastBuildDate']) {
    const t = Date.parse(rssTag(block, tag));
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

/**
 * Hai nhánh hỏng cố ý KHÁC NHAU, cùng lý do với `parseGnewsRss`:
 *  - có `<channel>`/`<feed>` mà không có bài -> `[]` (feed thật, rỗng).
 *  - không có cả hai -> NÉM kèm 160 ký tự đầu: trang chặn, trang đăng nhập,
 *    HTML 404 — trả rỗng ở đây là biến "bị chặn" thành "hôm nay không có
 *    tin", và người đọc không có cách nào biết.
 */
export function parseFeed(xml: string, now = Date.now(), maxAgeMs = MAX_AGE_MS): FeedItem[] {
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const entries = items.length
    ? items
    : [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  if (!entries.length) {
    if (!/<(?:channel|feed)[\s>]/i.test(xml)) {
      throw new Error(`not an RSS/Atom feed (${rssShape(xml)})`);
    }
    return [];
  }
  const cutoff = now - maxAgeMs;
  const out: FeedItem[] = [];
  for (const b of entries) {
    const link = linkOf(b);
    if (!link) continue;
    const t = dateOf(b);
    // Tương lai xa (đồng hồ feed lệch) cũng bỏ: nó sẽ đứng đầu bảng mãi.
    if (!Number.isFinite(t) || t < cutoff || t > now + 6 * 3_600_000) continue;
    // Vài feed bọc tiêu đề trong thẻ HTML; gỡ thẻ SAU khi giải mã (#155).
    const title = rssTag(b, 'title').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    out.push({ title, link, published: new Date(t).toISOString() });
  }
  return out.sort((a, b) => b.published.localeCompare(a.published));
}

/** Khoá gộp trùng — cùng luật với `news.ts`: một bài về hai lần qua hai
 *  đường link (báo + Google News gom lại chính báo đó). */
export const dedupKey = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);

/**
 * Gộp các nguồn của MỘT cột: xếp mới nhất trước, bỏ trùng tiêu đề, cắt trần.
 * Trần TỪNG NGUỒN áp trước, trần cột áp sau — thứ tự ngược lại là để nguồn
 * nhiều bài nhất chiếm hết chỗ rồi mới cắt.
 */
export function mergeColumn(lists: Headline[][], perSource = PER_SOURCE_CAP, cap = PER_COLUMN_CAP): Headline[] {
  const all = lists.flatMap((l) => l.slice(0, perSource));
  all.sort((a, b) => b.published.localeCompare(a.published));
  const seen = new Set<string>();
  const out: Headline[] = [];
  for (const h of all) {
    const k = dedupKey(h.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(h);
    if (out.length >= cap) break;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  X: danh sách tài khoản của CHỦ APP. Hàm thuần.
 * ------------------------------------------------------------------ */

/** "@Reuters, cnbc  business" -> ["Reuters","cnbc","business"]; bỏ trùng và
 *  bỏ thứ không phải handle (X chỉ cho chữ, số, gạch dưới, ≤15 ký tự). */
export function parseHandles(raw: string | undefined | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tok of (raw ?? '').split(/[\s,;]+/)) {
    const h = tok.replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9_]{1,15}$/.test(h)) continue;
    const k = h.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

export function xAccounts(): Record<NewsColumn, string[]> {
  return {
    market: parseHandles(process.env.X_NEWS_ACCOUNTS),
    politics: parseHandles(process.env.X_NEWS_POLITICS_ACCOUNTS),
  };
}

/** Một bài X thành một dòng tiêu đề: dòng đầu / 200 ký tự đầu, bỏ link trần
 *  (t.co không nói gì với người đọc). */
export function postTitle(text: string): string {
  const s = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  return s.length > 200 ? `${s.slice(0, 199)}…` : s;
}

/* ------------------------------------------------------------------ *
 *  Unusual Whales news/headlines — CHƯA ĐO. Đọc dung thứ, in khoá khi hụt.
 * ------------------------------------------------------------------ */

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const pick = (o: any, keys: string[]) => {
  for (const k of keys) {
    const v = str(o?.[k]);
    if (v) return v;
  }
  return null;
};

/**
 * Tên trường là PHỎNG ĐOÁN theo tài liệu UW nhớ được (`headline`, `source`,
 * `created_at`, `url`, `tickers`, `is_major`) — và tài liệu UW nhớ được đã sai
 * hai lần ở repo này (`congress-trader`, `gex-levels`). Nên đọc nhiều tên,
 * và khi có dòng mà không bóc được dòng nào thì NÉM kèm khoá thật để dòng
 * trạng thái trên màn hình in ra — đó là phép đo, cùng khuôn `xDiagnosis`.
 */
export function parseUwNews(payload: any, now = Date.now()): Headline[] {
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const out: Headline[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const title = pick(r, ['headline', 'title', 'text']);
    const link = pick(r, ['url', 'link', 'source_url', 'article_url']);
    const when = pick(r, ['created_at', 'published_at', 'timestamp', 'time', 'date']);
    const t = when ? Date.parse(when) : NaN;
    if (!title || !Number.isFinite(t) || t < now - MAX_AGE_MS) continue;
    const outlet = pick(r, ['source', 'publisher', 'author']) ?? 'Unusual Whales';
    out.push({
      id: `uw:${pick(r, ['id']) ?? `${t}:${dedupKey(title)}`}`,
      title,
      // Không có link riêng thì trỏ về trang tin của UW — dòng vẫn bấm được.
      link: link ?? 'https://unusualwhales.com/news',
      outlet,
      published: new Date(t).toISOString(),
      column: 'market',
      kind: 'uw',
    });
  }
  if (rows.length && !out.length) {
    const first = rows.find((r) => r && typeof r === 'object');
    throw new Error(
      `UW news: ${rows.length} dòng nhưng không bóc được dòng nào - khoá: ${
        first ? Object.keys(first).join(',') : '(không phải object)'
      }`
    );
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  Gọi mạng: từng nguồn hỏng RIÊNG, trạng thái riêng.
 * ------------------------------------------------------------------ */

class FeedError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function fetchRss(feed: Feed): Promise<Headline[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const r = await fetch(feed.url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      cache: 'no-store',
      signal: ctl.signal,
    });
    const text = await r.text().catch(() => '');
    if (!r.ok) {
      // Trạng thái trước, trích thân sau (#102). Thân là thứ phân biệt "URL
      // đã đổi" (HTML 404 của báo) với "chặn máy chủ" (trang Cloudflare).
      throw new FeedError(`HTTP ${r.status}${text ? ` - ${rssShape(text)}` : ' (thân rỗng)'}`, r.status);
    }
    return parseFeed(text).map((it) => ({
      id: `rss:${feed.id}:${dedupKey(it.title)}`,
      title: it.title,
      link: it.link,
      outlet: feed.label,
      published: it.published,
      column: feed.column,
      kind: 'rss' as const,
    }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Nguồn hỏng theo kiểu "sẽ hỏng y hệt lần sau" (403 chặn, 404/410 URL chết)
 * thì nghỉ 60 phút chứ không hỏi lại mỗi 5 phút: một dòng lỗi lặp vô hạn là
 * một dòng lỗi bị bỏ qua (cùng lý do `BLOCK_COOLDOWN_MS` của Google). Lỗi
 * khác (timeout, 5xx) thì thử lại ngay lượt sau. RAM: deploy là quên — đúng
 * ý, vì deploy có thể đổi IP thoát.
 */
const PAUSE_MS = 60 * 60_000;
const PAUSE_STATUSES = new Set([401, 403, 404, 410, 429]);
const pausedUntil = new Map<string, number>();

async function withStatus(
  meta: { id: string; label: string; kind: NewsKind; column: NewsColumn },
  run: () => Promise<Headline[]>
): Promise<{ items: Headline[]; status: SourceStatus }> {
  const until = pausedUntil.get(meta.id) ?? 0;
  if (Date.now() < until) {
    return {
      items: [],
      status: { ...meta, ok: false, count: 0, skipped: 'paused', pausedUntil: new Date(until).toISOString() },
    };
  }
  try {
    const items = await run();
    pausedUntil.delete(meta.id);
    return { items, status: { ...meta, ok: true, count: items.length } };
  } catch (e: any) {
    const status: number | undefined =
      e instanceof FeedError ? e.status : e instanceof UwError ? e.status : e instanceof XError ? e.status : undefined;
    if (status && PAUSE_STATUSES.has(status)) pausedUntil.set(meta.id, Date.now() + PAUSE_MS);
    const msg = e?.name === 'AbortError' ? 'timeout 12s' : String(e?.message ?? e).slice(0, 220);
    return { items: [], status: { ...meta, ok: false, count: 0, error: msg, status } };
  }
}

async function fetchGnewsTopic(t: (typeof GNEWS_TOPICS)[number]): Promise<Headline[]> {
  const items = await gnewsTopic(t.q, PER_SOURCE_CAP);
  const cutoff = Date.now() - MAX_AGE_MS;
  return items
    .filter((it) => Date.parse(it.published) >= cutoff)
    .map((it) => ({
      id: `gnews:${t.id}:${dedupKey(it.title)}`,
      title: it.title,
      link: it.link,
      outlet: it.publisher || 'Google News',
      published: it.published,
      column: t.column,
      kind: 'gnews' as const,
    }));
}

/**
 * X có cache RIÊNG và DÀI HƠN trang (15 phút so với 5), và "Làm mới" không
 * vượt qua được — vì X trả theo lượng dùng (#161): mỗi lần hỏi lại là trả
 * tiền, và hỏi lại cùng đống bài cũ là tiền chảy ra không trần nào chặn.
 */
const X_CACHE_MS = 15 * 60_000;
const xCache = new Map<NewsColumn, { at: number; items: Headline[] }>();

async function fetchX(column: NewsColumn, handles: string[]): Promise<Headline[]> {
  const c = xCache.get(column);
  if (c && Date.now() - c.at < X_CACHE_MS) return c.items;
  const q = authorQuery(handles);
  if (!q.query) return [];
  const { json } = await xGet('/tweets/search/recent', {
    query: q.query,
    max_results: 50,
    'tweet.fields': 'created_at,author_id,entities',
    expansions: 'author_id',
    'user.fields': 'username,name',
  });
  const s = parseSearch(json);
  if (s.apiErrors.length && !s.posts.length) throw new Error(`X: ${s.apiErrors.join(' | ')}`);
  const cutoff = Date.now() - MAX_AGE_MS;
  const items: Headline[] = [];
  for (const p of s.posts) {
    const t = p.createdAt ? Date.parse(p.createdAt) : NaN;
    if (!Number.isFinite(t) || t < cutoff) continue;
    const title = postTitle(p.text);
    if (!title) continue;
    const handle = p.authorHandle ?? 'i';
    items.push({
      id: `x:${p.id}`,
      title,
      link: `https://x.com/${handle}/status/${p.id}`,
      outlet: `@${p.authorHandle ?? p.authorName ?? '?'}`,
      published: new Date(t).toISOString(),
      column,
      kind: 'x',
    });
  }
  xCache.set(column, { at: Date.now(), items });
  return items;
}

async function fetchUw(): Promise<Headline[]> {
  // Tên endpoint và tham số theo tài liệu nhớ được — probe mới là sự thật.
  const payload = await uwGet('/api/news/headlines', { limit: PER_SOURCE_CAP });
  return parseUwNews(payload);
}

/* ------------------------------------------------------------------ *
 *  Gom cả trang, cache 5 phút.
 * ------------------------------------------------------------------ */

const CACHE_MS = 5 * 60_000;
/** "Làm mới" vẫn phải cách nhau tối thiểu chừng này — 14 feed × mỗi cú bấm
 *  là 14 request, và người bấm liên tục thường chỉ đang đợi mạng chậm. */
const MIN_REFRESH_MS = 45_000;

let cache: { at: number; payload: NewsPayload } | null = null;
let inFlight: Promise<NewsPayload> | null = null;

export async function loadNews(opts: { refresh?: boolean } = {}): Promise<NewsPayload & { cached: boolean }> {
  const age = cache ? Date.now() - cache.at : Infinity;
  const fresh = opts.refresh ? age < MIN_REFRESH_MS : age < CACHE_MS;
  if (cache && fresh) return { ...cache.payload, cached: true };
  // Hai tab cùng mở thì chung MỘT lượt gọi, không phải hai lượt song song
  // đè nhau (cùng lý do scan-job "joins" một lượt quét đang chạy).
  if (!inFlight) {
    inFlight = collect().finally(() => {
      inFlight = null;
    });
  }
  const payload = await inFlight;
  return { ...payload, cached: false };
}

async function collect(): Promise<NewsPayload> {
  const jobs: Promise<{ items: Headline[]; status: SourceStatus }>[] = [];

  for (const f of FEEDS) {
    jobs.push(withStatus({ id: f.id, label: f.label, kind: 'rss', column: f.column }, () => fetchRss(f)));
  }

  for (const t of GNEWS_TOPICS) {
    const meta = { id: t.id, label: t.label, kind: 'gnews' as const, column: t.column };
    const until = gnewsBlockedUntil();
    if (Date.now() < until) {
      // Google đang nghỉ vì ĐÃ ĐO là bị chặn (gnews.ts) — nói ra là app
      // quyết định nghỉ, không phải Google im lặng.
      jobs.push(
        Promise.resolve({
          items: [],
          status: { ...meta, ok: false, count: 0, skipped: 'paused' as const, pausedUntil: new Date(until).toISOString() },
        })
      );
    } else {
      jobs.push(withStatus(meta, () => fetchGnewsTopic(t)));
    }
  }

  const accounts = xAccounts();
  for (const column of ['market', 'politics'] as NewsColumn[]) {
    const meta = { id: `x-${column}`, label: `X (${accounts[column].length} tài khoản)`, kind: 'x' as const, column };
    if (!xConfigured() || !accounts[column].length) {
      jobs.push(Promise.resolve({ items: [], status: { ...meta, ok: false, count: 0, skipped: 'not-configured' as const } }));
    } else {
      jobs.push(withStatus(meta, () => fetchX(column, accounts[column])));
    }
  }

  const uwMeta = { id: 'uw-news', label: 'Unusual Whales', kind: 'uw' as const, column: 'market' as const };
  jobs.push(
    uwConfigured()
      ? withStatus(uwMeta, fetchUw)
      : Promise.resolve({ items: [], status: { ...uwMeta, ok: false, count: 0, skipped: 'not-configured' as const } })
  );

  const results = await Promise.all(jobs);
  const byCol = (c: NewsColumn) => results.filter((r) => r.status.column === c).map((r) => r.items);

  const payload: NewsPayload = {
    at: new Date().toISOString(),
    market: mergeColumn(byCol('market')),
    politics: mergeColumn(byCol('politics')),
    sources: results.map((r) => r.status),
    xConfigured: xConfigured(),
    uwConfigured: uwConfigured(),
  };
  cache = { at: Date.now(), payload };
  return payload;
}

/** Chỉ để test đặt lại. Hai hàm tách nhau để test kiểm được rằng thời gian
 *  nghỉ của một nguồn SỐNG SÓT qua một lượt tải mới. */
export function _resetNewsCache() {
  cache = null;
  inFlight = null;
  xCache.clear();
}
export function _resetNewsPauses() {
  pausedUntil.clear();
}
