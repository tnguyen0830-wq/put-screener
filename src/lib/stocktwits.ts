/**
 * StockTwits: dòng bài đăng về MỘT mã cho tab Analyze.
 *
 * CHƯA ĐO ĐƯỢC. `api.stocktwits.com` không tới được từ sandbox, nên endpoint
 * `/api/2/streams/symbol/{SYM}.json` và mọi tên trường dưới đây là NHỚ ĐƯỢC
 * (từ tài liệu API công khai cũ, vốn không cần khoá cho luồng theo mã). Repo
 * này đã sai ba lần vì code theo tài liệu nhớ được, nên file viết để TỰ NÓI
 * RA thứ nhận được: mã HTTP + loại thân (JSON / HTML / trang chặn Cloudflare)
 * + 160 ký tự đầu, và khi JSON về mà không bóc được bài nào thì in KHOÁ THẬT
 * của bản ghi đầu — đúng khuôn `/api/uwprobe` và tab Tin tức (#181).
 *
 * Ba điều làm nên thiết kế:
 *
 * 1. **Nhãn Bullish/Bearish là của NGƯỜI ĐĂNG tự gắn**, không phải một phép
 *    đo cảm xúc. Nó được ĐẾM và in ra (đó là dữ liệu thật StockTwits trả),
 *    nhưng cả màn hình lẫn prompt đều nói rõ đây là lời tự khai.
 * 2. **30 bài của một mã sôi động có thể chỉ phủ 20 phút**, còn của một mã
 *    im ắng thì phủ hai tuần. Tỉ lệ Bullish/Bearish không có khoảng thời gian
 *    đi kèm là một con số không đọc được — nên `spanMinutes` luôn đi cùng.
 * 3. Bài gắn hơn `MAX_TAGS` mã là bài điểm danh để câu view (cùng luật X,
 *    #231) — bị loại và ĐẾM, không rơi im lặng.
 *
 * File không import gì để biên dịch và `require()` độc lập được khi test.
 */

export const MAX_TAGS = 4;
export const MAX_SHOWN = 12;

export type StSentiment = 'bullish' | 'bearish' | null;

export type StPost = {
  id: string;
  body: string;
  createdAt: string | null;
  user: string | null;
  followers: number | null;
  likes: number | null;
  sentiment: StSentiment;
  symbols: string[];
  url: string;
};

export type StFailure = 'blocked' | 'rate-limited' | 'not-found' | 'bad-shape' | 'unavailable';

export type StResult = {
  symbol: string;
  /** Cách viết mã đã gửi cho StockTwits (BRK/B → BRK.B, $SPX → SPX). */
  asked: string;
  fetchedAt: string;
  posts: StPost[];
  /** StockTwits trả về bao nhiêu bài trước khi lọc. */
  returned: number;
  kept: number;
  dropped: { spam: number; otherTicker: number };
  /** Đếm trên MỌI bài giữ lại, không chỉ 12 bài hiện ra. */
  tags: { bullish: number; bearish: number; none: number };
  /** Khoảng thời gian bài cũ nhất → mới nhất trong các bài giữ lại. */
  spanMinutes: number | null;
  error: string | null;
  errorKind: StFailure | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Mã theo cách StockTwits viết: bỏ `$` chỉ số, lớp cổ phiếu bằng dấu chấm. */
export const stSymbol = (symbol: string) =>
  symbol.replace(/^\$/, '').replace(/\.X$/i, '').replace('/', '.').toUpperCase();

export function sentimentOf(m: any): StSentiment {
  const raw = m?.entities?.sentiment?.basic ?? m?.sentiment?.basic ?? m?.sentiment;
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return s === 'bullish' ? 'bullish' : s === 'bearish' ? 'bearish' : null;
}

function parseMessage(m: any): StPost | null {
  const id = m?.id;
  const body = typeof m?.body === 'string' ? m.body : null;
  if ((typeof id !== 'number' && typeof id !== 'string') || !body) return null;
  const symbols: string[] = Array.isArray(m?.symbols)
    ? m.symbols
        .map((s: any) => (typeof s === 'string' ? s : s?.symbol))
        .filter((s: any): s is string => typeof s === 'string')
        .map((s: string) => s.toUpperCase())
    : [];
  const user = typeof m?.user?.username === 'string' ? m.user.username : null;
  return {
    id: String(id),
    body: body.replace(/\s+/g, ' ').trim().slice(0, 400),
    createdAt: typeof m?.created_at === 'string' ? m.created_at : null,
    user,
    followers: num(m?.user?.followers),
    likes: num(m?.likes?.total ?? m?.likes),
    sentiment: sentimentOf(m),
    symbols,
    url: user ? `https://stocktwits.com/${user}/message/${id}` : `https://stocktwits.com/message/${id}`,
  };
}

/**
 * Bóc + lọc + đếm. THUẦN.
 *
 * Ném khi có bản ghi mà không bóc được bài nào — kèm khoá thật, để một tên
 * trường nhớ sai hiện thành một dòng đọc được chứ không thành "không ai bàn".
 */
export function parseStream(
  symbol: string,
  payload: any
): Omit<StResult, 'symbol' | 'asked' | 'fetchedAt' | 'error' | 'errorKind'> {
  const raw: any[] = Array.isArray(payload?.messages) ? payload.messages : [];
  if (!Array.isArray(payload?.messages)) {
    const keys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 12).join(',') : typeof payload;
    throw new Error(`no "messages" array; top-level keys: ${keys}`);
  }
  const parsed = raw.map(parseMessage).filter((p): p is StPost => !!p);
  if (raw.length && !parsed.length) {
    const keys = raw[0] && typeof raw[0] === 'object' ? Object.keys(raw[0]).slice(0, 16).join(',') : typeof raw[0];
    throw new Error(`${raw.length} messages but none parsed; first message keys: ${keys}`);
  }
  const want = stSymbol(symbol);
  let spam = 0;
  let otherTicker = 0;
  const kept: StPost[] = [];
  for (const p of parsed) {
    if (p.symbols.length && !p.symbols.includes(want)) {
      otherTicker++;
      continue;
    }
    if (p.symbols.length > MAX_TAGS) {
      spam++;
      continue;
    }
    kept.push(p);
  }
  const tags = { bullish: 0, bearish: 0, none: 0 };
  for (const p of kept) {
    if (p.sentiment === 'bullish') tags.bullish++;
    else if (p.sentiment === 'bearish') tags.bearish++;
    else tags.none++;
  }
  const times = kept.map((p) => Date.parse(String(p.createdAt ?? ''))).filter(Number.isFinite);
  const spanMinutes = times.length >= 2 ? Math.round((Math.max(...times) - Math.min(...times)) / 60_000) : null;
  const shown = [...kept].sort((a, b) => {
    const la = a.likes ?? -1;
    const lb = b.likes ?? -1;
    if (la !== lb) return lb - la;
    return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
  });
  return {
    posts: shown.slice(0, MAX_SHOWN),
    returned: raw.length,
    kept: kept.length,
    dropped: { spam, otherTicker },
    tags,
    spanMinutes,
  };
}

/** Phân loại một câu trả lời hỏng theo THÂN trước, mã sau (#130, #195). */
export function classifyStFailure(status: number, body: string): StFailure {
  const b = body.slice(0, 4000).toLowerCase();
  if (/just a moment|attention required|cf-chl|cloudflare|access denied|captcha/.test(b)) return 'blocked';
  if (status === 429 || /rate limit/.test(b)) return 'rate-limited';
  if (status === 404) return 'not-found';
  if (status === 401 || status === 403) return 'blocked';
  return 'unavailable';
}

export const clip = (s: string, n = 160) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

const UA = 'Mozilla/5.0 (compatible; put-screener/1.0; personal research tool)';

/** Một lượt gọi. Không bao giờ ném — lỗi đi vào `error`/`errorKind`. */
export async function fetchStocktwits(
  symbol: string,
  now = Date.now(),
  fetchImpl: typeof fetch = fetch
): Promise<StResult> {
  const asked = stSymbol(symbol);
  const base: StResult = {
    symbol,
    asked,
    fetchedAt: new Date(now).toISOString(),
    posts: [],
    returned: 0,
    kept: 0,
    dropped: { spam: 0, otherTicker: 0 },
    tags: { bullish: 0, bearish: 0, none: 0 },
    spanMinutes: null,
    error: null,
    errorKind: null,
  };
  const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(asked)}.json`;
  let status = 0;
  let body = '';
  try {
    const r = await fetchImpl(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    } as RequestInit);
    status = r.status;
    body = await r.text();
  } catch (e: any) {
    const code = e?.cause?.code ? ` (${e.cause.code})` : '';
    return { ...base, error: `network: ${String(e?.message ?? e).slice(0, 120)}${code}`, errorKind: 'unavailable' };
  }
  let json: any = null;
  try {
    json = JSON.parse(body);
  } catch {
    /* thân không phải JSON — phân loại theo chữ */
  }
  if (status < 200 || status >= 300 || !json) {
    const apiMsg = Array.isArray(json?.errors) ? json.errors.map((x: any) => x?.message).filter(Boolean).join('; ') : '';
    return {
      ...base,
      error: `HTTP ${status} · ${apiMsg || clip(body) || '(thân trống)'}`,
      errorKind: classifyStFailure(status, body),
    };
  }
  try {
    return { ...base, ...parseStream(asked, json) };
  } catch (e: any) {
    return { ...base, error: `HTTP ${status} · ${String(e?.message ?? e).slice(0, 240)}`, errorKind: 'bad-shape' };
  }
}
