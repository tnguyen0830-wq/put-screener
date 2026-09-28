/**
 * Reddit: bài bàn tán về MỘT mã trong vài subreddit chứng khoán, cho tab
 * Analyze.
 *
 * CHƯA ĐO ĐƯỢC. Reddit không tới được từ sandbox, nên endpoint, dạng
 * Listing (`data.children[].data`) và tên trường là NHỚ ĐƯỢC. Hai đường, và
 * màn hình nói đang dùng đường nào:
 *
 * - **Có `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET`** → OAuth "app-only"
 *   (`grant_type=client_credentials`) rồi hỏi `oauth.reddit.com`. Đây là
 *   đường Reddit chính thức cho máy chủ; token chỉ ĐỌC, không đăng được bài.
 * - **Không có** → thử `www.reddit.com/.../search.json` không khoá. Reddit
 *   hay chặn dải IP trung tâm dữ liệu (Render là một), nên đường này có thể
 *   hỏng hẳn — và khi hỏng thì lỗi nói thẳng là bị chặn + cách sửa, chứ không
 *   hiện thành "không ai bàn".
 *
 * Luật lọc là phần quan trọng nhất, và nó giống luật X (#159/#231): ALL, ON,
 * IT, NOW, KEY, DD, CEO... vừa là mã vừa là chữ Reddit viết HOA suốt ngày.
 * Nên một bài chỉ được giữ khi nó nhắc `$MÃ`, hoặc TÊN công ty, hoặc mã viết
 * hoa đứng riêng — và vế cuối KHÔNG áp cho mã một chữ cái hay mã trùng từ
 * thông dụng. Bài không qua được bị ĐẾM (`notAbout`), không rơi im lặng.
 *
 * File không import gì để biên dịch và `require()` độc lập được khi test.
 */

export const SUBREDDITS = ['wallstreetbets', 'stocks', 'investing', 'options', 'StockMarket'];
export const MAX_SHOWN = 12;
/** Cache mỗi mã cho CẢ StockTwits lẫn Reddit (`social.ts`), kể cả khi lỗi. */
export const CACHE_MS = 30 * 60_000;

/** Mã trùng chữ hay gặp VIẾT HOA trên Reddit — chỉ nhận `$MÃ` hoặc tên. */
export const AMBIGUOUS = new Set(
  (
    'ALL ON IT NOW KEY CAR ARE BE CAN DO GO HAS SO SEE OUT ANY BIG BIT CAT EAT FUN HE HI LOW MAN MO NEW OR ' +
    'PLAY RUN TAP TRUE UP WELL YOU DD CEO IPO USA EPS ATH YOLO FOMO EV AI ONE OPEN REAL LOVE GOOD BEST FAST ' +
    'LIFE HOME TWO PEAK CASH NICE WISH SAVE MAIN BRO AGO AM US FOR BY AN AT NO WAY IRS SEC FED GDP CPI ETF ' +
    'OTC PM MS GE HD ICE NOV WEN TD IQ PT TA EOD EOW ITM OTM ATM IV DTE'
  ).split(' ')
);

export type RdPost = {
  id: string;
  title: string;
  snippet: string;
  subreddit: string | null;
  author: string | null;
  createdAt: string | null;
  score: number | null;
  comments: number | null;
  url: string;
  /** Vì sao bài được giữ: `$MÃ`, tên công ty, hay mã viết hoa. */
  matchedBy: 'cashtag' | 'name' | 'ticker';
};

export type RdFailure = 'blocked' | 'rate-limited' | 'bad-key' | 'bad-shape' | 'unavailable';

export type RdResult = {
  symbol: string;
  /** Đường đã dùng: OAuth (có khoá) hay JSON công khai (không khoá). */
  route: 'oauth' | 'public';
  query: string;
  subreddits: string[];
  fetchedAt: string;
  posts: RdPost[];
  returned: number;
  kept: number;
  dropped: { notAbout: number };
  /** Mã trùng từ thông dụng → chỉ khớp `$MÃ` hoặc tên. */
  ambiguousTicker: boolean;
  error: string | null;
  errorKind: RdFailure | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Mã trần để khớp chữ: bỏ `$` chỉ số, lớp cổ phiếu bằng dấu chấm. */
export const rdTicker = (symbol: string) =>
  symbol.replace(/^\$/, '').replace(/\.X$/i, '').replace('/', '.').toUpperCase();

export const isAmbiguous = (ticker: string) => ticker.replace(/\..*$/, '').length <= 1 || AMBIGUOUS.has(ticker);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Bài này có nói về mã này không. THUẦN. Trả lý do khớp, hoặc null.
 *
 * Thứ tự theo độ chắc: `$MÃ` (người viết tự đánh dấu là mã) → tên công ty
 * (≥ 4 ký tự, nguyên từ) → mã viết HOA đứng riêng (chỉ khi mã không mơ hồ).
 */
export function mentionOf(text: string, ticker: string, name: string | null): RdPost['matchedBy'] | null {
  const t = rdTicker(ticker);
  if (new RegExp(`\\$${esc(t)}(?![A-Za-z0-9])`, 'i').test(text)) return 'cashtag';
  const n = (name ?? '').trim();
  if (n.length >= 4 && new RegExp(`(^|[^A-Za-z0-9])${esc(n)}(?![A-Za-z0-9])`, 'i').test(text)) return 'name';
  if (!isAmbiguous(t) && new RegExp(`(^|[^A-Za-z0-9$])${esc(t)}(?![A-Za-z0-9])`).test(text)) return 'ticker';
  return null;
}

/** Câu tìm kiếm gửi Reddit — rộng; phần lọc thật nằm ở `mentionOf`. */
export function rdQuery(ticker: string, name: string | null): string {
  const t = rdTicker(ticker);
  const n = (name ?? '').trim();
  const parts = [`"${t}"`];
  if (n.length >= 4 && n.toUpperCase() !== t) parts.push(`"${n}"`);
  return parts.join(' OR ');
}

/**
 * Bóc Listing + lọc + xếp. THUẦN.
 *
 * Ném khi có bản ghi mà không bóc được bài nào — kèm khoá thật (#109 idiom).
 */
export function parseListing(
  ticker: string,
  name: string | null,
  payload: any
): Pick<RdResult, 'posts' | 'returned' | 'kept' | 'dropped'> {
  const children = payload?.data?.children;
  if (!Array.isArray(children)) {
    const keys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 12).join(',') : typeof payload;
    const dkeys =
      payload?.data && typeof payload.data === 'object' ? ` · data keys: ${Object.keys(payload.data).slice(0, 12).join(',')}` : '';
    throw new Error(`no data.children array; top-level keys: ${keys}${dkeys}`);
  }
  const rows = children.map((c: any) => c?.data).filter((d: any) => d && typeof d === 'object');
  const parsed = rows
    .map((d: any) => {
      const id = typeof d.id === 'string' ? d.id : null;
      const title = typeof d.title === 'string' ? d.title : null;
      if (!id || !title) return null;
      const self = typeof d.selftext === 'string' ? d.selftext : '';
      const created = num(d.created_utc);
      const permalink = typeof d.permalink === 'string' ? d.permalink : null;
      return {
        id,
        title: title.replace(/\s+/g, ' ').trim().slice(0, 300),
        self,
        snippet: self.replace(/\s+/g, ' ').trim().slice(0, 240),
        subreddit: typeof d.subreddit === 'string' ? d.subreddit : null,
        author: typeof d.author === 'string' ? d.author : null,
        createdAt: created !== null ? new Date(created * 1000).toISOString() : null,
        score: num(d.score),
        comments: num(d.num_comments),
        url: permalink ? `https://www.reddit.com${permalink}` : `https://www.reddit.com/comments/${id}`,
      };
    })
    .filter((p: any) => !!p) as (Omit<RdPost, 'matchedBy'> & { self: string })[];
  if (rows.length && !parsed.length) {
    throw new Error(`${rows.length} posts but none parsed; first post keys: ${Object.keys(rows[0]).slice(0, 16).join(',')}`);
  }
  let notAbout = 0;
  const kept: RdPost[] = [];
  for (const p of parsed) {
    const m = mentionOf(`${p.title}\n${p.self}`, ticker, name);
    if (!m) {
      notAbout++;
      continue;
    }
    const { self: _self, ...rest } = p;
    kept.push({ ...rest, matchedBy: m });
  }
  const shown = [...kept].sort((a, b) => {
    const sa = a.score ?? -1;
    const sb = b.score ?? -1;
    if (sa !== sb) return sb - sa;
    return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
  });
  return { posts: shown.slice(0, MAX_SHOWN), returned: rows.length, kept: kept.length, dropped: { notAbout } };
}

/** Phân loại câu trả lời hỏng theo THÂN trước, mã sau (#130, #195). */
export function classifyRdFailure(status: number, body: string, route: 'oauth' | 'public'): RdFailure {
  const b = body.slice(0, 4000).toLowerCase();
  if (status === 429 || /too many requests|rate limit/.test(b)) return 'rate-limited';
  if (route === 'oauth' && (status === 401 || /invalid_grant|invalid_client|unauthorized_client/.test(b))) return 'bad-key';
  if (status === 403 || /blocked|whoa there|cloudflare|access denied|<html/.test(b)) return 'blocked';
  return 'unavailable';
}

export const clip = (s: string, n = 160) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
