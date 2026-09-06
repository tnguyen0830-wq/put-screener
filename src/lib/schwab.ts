import fs from 'node:fs/promises';
import path from 'node:path';

const OAUTH_BASE = 'https://api.schwabapi.com/v1/oauth';
const MARKET_BASE = 'https://api.schwabapi.com/marketdata/v1';
/**
 * Trader API: số dư và vị thế của chính tài khoản.
 *
 * Cùng một OAuth với market data - không phải đăng nhập lần nữa - nhưng là một
 * sản phẩm riêng trên dashboard Schwab. App phải được duyệt "Accounts and
 * Trading Production" thì token mới gọi được; chưa duyệt thì Schwab trả 401
 * hoặc 403 dù phiên vẫn còn sống.
 */
const TRADER_BASE = 'https://api.schwabapi.com/trader/v1';

export type Tokens = {
  access_token: string;
  refresh_token: string;
  /** epoch ms when the access token dies (30 min) */
  access_expires_at: number;
  /** epoch ms when the refresh token dies (7 days, hard limit) */
  refresh_expires_at: number;
};

const tokenPath = () =>
  path.resolve(process.env.TOKEN_PATH || './.tokens.json');

function creds() {
  const key = process.env.SCHWAB_APP_KEY;
  const secret = process.env.SCHWAB_APP_SECRET;
  const callback = process.env.SCHWAB_CALLBACK_URL;
  if (!key || !secret || !callback) {
    throw new Error(
      'Missing SCHWAB_APP_KEY, SCHWAB_APP_SECRET or SCHWAB_CALLBACK_URL. Copy .env.example to .env and fill it in.'
    );
  }
  return { key, secret, callback };
}

function basicAuth() {
  const { key, secret } = creds();
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
}

/**
 * Gốc để quay về sau khi đăng nhập xong: chính là gốc của SCHWAB_CALLBACK_URL.
 *
 * Callback route từng dựng URL này từ req.nextUrl.origin - đúng cho điều
 * hướng cùng gốc (như middleware chuyển sang /login), nhưng sai cho chính
 * request này: nó tới từ schwabapi.com, tính origin kiểu đó ra địa chỉ nội bộ
 * của container trên Render (localhost:10000) thay vì tên miền thật, và người
 * vừa đăng nhập xong bị đưa tới một trang không tồn tại.
 *
 * SCHWAB_CALLBACK_URL do chính ta khai báo và đăng ký với Schwab, nên gốc của
 * nó luôn đúng, không phụ thuộc proxy tính toán ra sao.
 */
export function appOrigin(): string {
  return new URL(creds().callback).origin;
}

export function authorizeUrl() {
  const { key, callback } = creds();
  const q = new URLSearchParams({
    client_id: key,
    redirect_uri: callback,
    response_type: 'code',
  });
  return `${OAUTH_BASE}/authorize?${q.toString()}`;
}

export async function readTokens(): Promise<Tokens | null> {
  try {
    return JSON.parse(await fs.readFile(tokenPath(), 'utf8')) as Tokens;
  } catch {
    return null;
  }
}

async function writeTokens(t: Tokens) {
  await fs.writeFile(tokenPath(), JSON.stringify(t, null, 2), { mode: 0o600 });
}

function shapeTokens(raw: any, previousRefreshExpiry?: number): Tokens {
  const now = Date.now();
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    access_expires_at: now + (raw.expires_in ?? 1800) * 1000,
    // Schwab caps refresh tokens at 7 days and does NOT extend them on refresh.
    refresh_expires_at: previousRefreshExpiry ?? now + 7 * 24 * 60 * 60 * 1000,
  };
}

/** Step 3 of the OAuth dance: authorization code -> tokens. */
export async function exchangeCode(code: string): Promise<Tokens> {
  const { callback } = creds();
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callback,
    }),
  });
  const raw = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(raw)}`);
  const tokens = shapeTokens(raw);
  await writeTokens(tokens);
  return tokens;
}

async function refresh(t: Tokens): Promise<Tokens> {
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
    }),
  });
  const raw = await res.json();
  if (!res.ok) {
    throw new Error('REAUTH_REQUIRED');
  }
  const tokens = shapeTokens(raw, t.refresh_expires_at);
  await writeTokens(tokens);
  return tokens;
}

/* Schwab xoay refresh token mỗi lần dùng: gọi refresh hai lần cùng lúc thì lần
   sau dùng một refresh token đã bị tiêu, và access token của lần thắng cũng bị
   vô hiệu theo. Vì screener chạy 4 worker song song còn các route dùng
   Promise.all, tình huống đó xảy ra thật — biểu hiện là hàng loạt 401 dù
   .tokens.json trông vẫn còn hạn. Gom mọi lần làm mới vào đúng một chuyến bay.

   Khoá phải nằm trên globalThis chứ không phải biến cấp module: Next dev
   hot-reload sinh ra nhiều bản của chính file này trong cùng một tiến trình,
   mỗi bản mang biến riêng, nên khoá cấp module không chặn nổi hai route gọi
   refresh cùng lúc. Đây chính là lý do bản vá trước vẫn để lọt 401. */
const slot: { p: Promise<Tokens> | null } = ((globalThis as any).__schwabRefresh ??= {
  p: null,
});

export async function accessToken(): Promise<string> {
  const t = await readTokens();
  if (!t) throw new Error('REAUTH_REQUIRED');
  if (Date.now() > t.refresh_expires_at) throw new Error('REAUTH_REQUIRED');
  if (Date.now() < t.access_expires_at - 60_000) return t.access_token;

  if (!slot.p) {
    slot.p = (async () => {
      // Đọc lại ngay trong khoá. Bản `t` ở trên có thể đã cũ: một request khác
      // vừa làm mới xong và tiêu mất refresh token đó, nên dùng lại sẽ hỏng cả
      // access token của lượt vừa thành công.
      const latest = (await readTokens()) ?? t;
      if (Date.now() < latest.access_expires_at - 60_000) return latest;
      return refresh(latest);
    })().finally(() => {
      slot.p = null;
    });
  }
  return (await slot.p).access_token;
}

/**
 * Ép làm mới ngay cả khi hạn ghi trên đĩa trông vẫn còn.
 *
 * Dùng sau khi Schwab đã trả 401: lúc đó con số hạn trong .tokens.json không
 * còn đáng tin, vì token có thể đã bị vô hiệu từ phía Schwab.
 */
async function forceRefresh(): Promise<string> {
  if (!slot.p) {
    slot.p = (async () => {
      const t = await readTokens();
      if (!t) throw new Error('REAUTH_REQUIRED');
      if (Date.now() > t.refresh_expires_at) throw new Error('REAUTH_REQUIRED');
      return refresh(t);
    })().finally(() => {
      slot.p = null;
    });
  }
  return (await slot.p).access_token;
}

/* ---------- rate limiting: Schwab allows ~120 requests/minute ---------- */

class RateLimiter {
  private times: number[] = [];
  constructor(private max: number, private windowMs: number) {}
  async take() {
    for (;;) {
      const now = Date.now();
      this.times = this.times.filter((t) => now - t < this.windowMs);
      if (this.times.length < this.max) {
        this.times.push(now);
        return;
      }
      const wait = this.windowMs - (now - this.times[0]) + 25;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Deliberately under the documented 120/min ceiling.
const limiter = new RateLimiter(100, 60_000);

async function request(
  base: string,
  pathname: string,
  params: Record<string, string>,
  retriedAfter401 = false
): Promise<any> {
  await limiter.take();
  const token = retriedAfter401 ? await forceRefresh() : await accessToken();
  const url = `${base}${pathname}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 5000));
    return request(base, pathname, params, retriedAfter401);
  }
  /* Schwab trả 401 khi access token bị vô hiệu sớm hơn hạn ghi trên đĩa — dấu
     hiệu là hạn còn gần 30 phút mà mọi request đều hỏng. Làm mới một lần rồi
     thử lại; chỉ một lần, để refresh token hết hạn thật thì báo lỗi luôn chứ
     không quay vòng. */
  if (res.status === 401 && !retriedAfter401) {
    return request(base, pathname, params, true);
  }
  if (!res.ok) {
    const body = await res.text();
    /* 401 SỐNG SÓT qua cả lượt làm mới ép buộc ở trên = phiên đã chết thật.
       Phải ném ra đúng REAUTH_REQUIRED, vì đó là chuỗi mà MỌI route trong app
       dùng để nhận ra "hết phiên, mời bấm kết nối lại" (portfolio.ts, analyze,
       heatmap, gex, tape, rrg, scan-job, toàn bộ /api/md/*).

       Trước đây chỗ này ném ra `Schwab /chains 401: ...` - không chứa chuỗi
       đó, nên lọt qua hết mọi lần kiểm tra và mỗi route lại xử lý sai theo
       kiểu riêng. Ở /api/gex thì hậu quả nặng nhất: 401 bị coi như "Schwab
       không dùng được" nên rơi xuống lấy mức của Unusual Whales, và màn hình
       hiện số bình thường trong khi cả app đang mất kết nối Schwab - đúng cái
       việc mà chú thích ở /api/gex nói là TUYỆT ĐỐI không được làm.

       Giữ nguyên văn lỗi gốc phía sau để vẫn chẩn đoán được. */
    if (res.status === 401) {
      throw new Error(`REAUTH_REQUIRED — Schwab ${pathname} 401: ${body}`);
    }
    throw new Error(`Schwab ${pathname} ${res.status}: ${body}`);
  }
  return res.json();
}

const get = (pathname: string, params: Record<string, string>) =>
  request(MARKET_BASE, pathname, params);

/**
 * Gọi Trader API.
 *
 * Tách riêng khỏi get() vì đây là sản phẩm khác trên cùng một token: quyền có
 * thể thiếu ngay cả khi market data chạy tốt, nên lỗi ở đây không có nghĩa là
 * phiên Schwab hỏng.
 */
export const traderGet = (pathname: string, params: Record<string, string> = {}) =>
  request(TRADER_BASE, pathname, params);

/** Batch quotes. Schwab accepts a comma separated symbol list. */
export async function quotes(symbols: string[]) {
  const out: Record<string, any> = {};
  for (let i = 0; i < symbols.length; i += 100) {
    const chunk = symbols.slice(i, i + 100);
    const data = await get('/quotes', {
      symbols: chunk.join(','),
      fields: 'quote,fundamental,reference',
      indicative: 'false',
    });
    Object.assign(out, data);
  }
  return out;
}

export async function putChain(symbol: string, fromDate: string, toDate: string) {
  return get('/chains', {
    symbol,
    contractType: 'PUT',
    strategy: 'SINGLE',
    range: 'OTM',
    fromDate,
    toDate,
    includeUnderlyingQuote: 'true',
  });
}

/** Full chain (calls + puts, all strikes) for a local GEX calculation.
 *
 *  `strikeCount` giới hạn số strike mỗi bên quanh giá hiện tại. Bỏ trống =
 *  lấy hết, đúng như trước; chỉ `fullChainAdaptive()` bên dưới truyền vào
 *  khi buộc phải thu hẹp. */
export async function fullChain(
  symbol: string,
  fromDate: string,
  toDate: string,
  opts: { strikeCount?: number } = {}
) {
  return get('/chains', {
    symbol,
    contractType: 'ALL',
    strategy: 'SINGLE',
    range: 'ALL',
    fromDate,
    toDate,
    includeUnderlyingQuote: 'true',
    ...(opts.strikeCount ? { strikeCount: String(opts.strikeCount) } : {}),
  });
}

export type ChainWindow = {
  days: number;
  strikeCount?: number;
  /** Chỉ có ở chế độ ghép: số kỳ đáo hạn ĐÃ thực sự lấy được. Wall tính
   *  trên ngần ấy kỳ, không phải trên cả cửa sổ - giao diện phải nói ra. */
  expirations?: number;
  /** Đã phải ghép từ nhiều lượt gọi, mỗi lượt một kỳ đáo hạn. */
  sliced?: boolean;
};

/**
 * Thu hẹp dần cửa sổ dữ liệu khi cổng API của Schwab từ chối vì phản hồi
 * quá lớn.
 *
 * Lỗi thật gặp trên production với SPX:
 *   Schwab /chains 502: {"fault":{"faultstring":"Body buffer overflow",
 *   "detail":{"errorcode":"protocol.http.TooBigBody"}}}
 * Đây KHÔNG phải lỗi ký hiệu (từng nghi vậy suốt #86-#91): Schwab nhận mã,
 * dựng xong phản hồi, rồi chính cổng của họ chặn vì quá to. SPX có kỳ đáo
 * hạn gần như mỗi ngày giao dịch, nên xin 60 ngày × mọi strike là hàng
 * chục nghìn hợp đồng - mã thường không bao giờ chạm ngưỡng đó.
 *
 * Hẹp lại không làm hỏng ý nghĩa của GEX: gamma tập trung quanh giá hiện
 * tại và ở các kỳ gần, mà biểu đồ vốn đã cắt về ±25% quanh giá. Nhưng nó
 * CÓ đổi con số (wall là wall lớn nhất trong phạm vi đã xin), nên hàm trả
 * về luôn cửa sổ thật đã dùng để giao diện nói rõ thay vì im lặng.
 */
export const GEX_WINDOWS: ChainWindow[] = [
  { days: 60 },
  { days: 21, strikeCount: 120 },
  { days: 7, strikeCount: 60 },
];

const chainDay = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const tooBig = (e: unknown) =>
  /TooBigBody|Body buffer overflow/i.test(String((e as any)?.message ?? e));

/** Khoá kỳ đáo hạn Schwab trả về là "2026-10-16:41" - phần trước dấu hai
 *  chấm là ngày, phần sau là số ngày còn lại. */
const expDate = (key: string) => key.split(':')[0];

function expirationsOf(chain: any): string[] {
  return [
    ...new Set([
      ...Object.keys(chain?.callExpDateMap ?? {}),
      ...Object.keys(chain?.putExpDateMap ?? {}),
    ].map(expDate)),
  ].sort();
}

/** Gộp phản hồi của nhiều lượt gọi thành một đối tượng chuỗi duy nhất, đúng
 *  hình dạng computeGex() đang đọc. Không hợp nhất ở mức strike: hai lượt
 *  gọi khác kỳ đáo hạn thì khoá cấp một đã khác nhau, không đụng nhau. */
function mergeChains(parts: any[]): any {
  const out: any = { callExpDateMap: {}, putExpDateMap: {} };
  for (const p of parts) {
    if (out.underlyingPrice == null) {
      out.underlyingPrice = p?.underlyingPrice ?? p?.underlying?.last ?? p?.underlying?.mark;
    }
    if (!out.underlying && p?.underlying) out.underlying = p.underlying;
    for (const side of ['callExpDateMap', 'putExpDateMap'] as const) {
      for (const [k, v] of Object.entries(p?.[side] ?? {})) out[side][k] = v;
    }
  }
  return out;
}

/**
 * Phương án cuối cho những mã mà MỌI cửa sổ hẹp vẫn bị cổng Schwab từ chối
 * vì phản hồi quá lớn - trên thực tế là SPX.
 *
 * Ý tưởng: đơn vị nhỏ nhất mà /chains còn nhận là MỘT kỳ đáo hạn. Xin từng
 * kỳ một rồi ghép lại thì kích thước mỗi phản hồi bị chặn cứng, bất kể cả
 * chuỗi to đến đâu. Đây là điểm khác căn bản so với fullChainAdaptive: ở đó
 * vẫn là một lượt gọi và chỉ hy vọng nó đủ nhỏ.
 *
 * Danh sách kỳ đáo hạn lấy bằng một lượt "thăm dò" strikeCount=1 - mỗi kỳ
 * đúng một strike nên phản hồi rất nhỏ, mà vẫn liệt kê đủ các kỳ.
 *
 * Có TRẦN SỐ LƯỢT GỌI, và đó là lựa chọn có ý thức: SPX có kỳ đáo hạn gần
 * như mỗi ngày giao dịch, 60 ngày là hơn 40 kỳ - lấy hết sẽ để người dùng
 * ngồi chờ hàng chục giây cho một màn hình họ vừa mới mở. Lấy các kỳ GẦN
 * nhất trước, vì gamma tập trung ở đó, rồi dừng ở trần. Số kỳ thực sự lấy
 * được trả về trong `window.expirations` để màn hình nói rõ wall này tính
 * trên bao nhiêu kỳ - im lặng thì một wall trên 12 kỳ trông y hệt một wall
 * trên cả chuỗi.
 */
export async function fullChainSliced(
  symbol: string,
  opts: { days?: number; strikeCount?: number; maxRequests?: number } = {}
): Promise<{ chain: any; window: ChainWindow }> {
  const days = opts.days ?? 60;
  const strikeCount = opts.strikeCount ?? 120;
  const maxRequests = opts.maxRequests ?? 12;

  // Thăm dò: 1 strike mỗi kỳ. Nếu ngay cả cái này cũng quá to thì rút ngắn
  // cửa sổ thăm dò chứ không bỏ cuộc - chỉ cần biết TÊN các kỳ.
  let probe: any = null;
  let probeErr: unknown;
  for (const d of [days, 21, 7]) {
    try {
      probe = await fullChain(symbol, chainDay(0), chainDay(d), { strikeCount: 1 });
      break;
    } catch (e) {
      probeErr = e;
      if (!tooBig(e)) throw e;
    }
  }
  if (!probe) throw probeErr;

  const exps = expirationsOf(probe);
  if (!exps.length) throw probeErr ?? new Error('Schwab /chains: không có kỳ đáo hạn nào');

  const parts: any[] = [];
  let last: unknown;
  for (const exp of exps.slice(0, maxRequests)) {
    try {
      parts.push(await fullChain(symbol, exp, exp, { strikeCount }));
    } catch (e) {
      last = e;
      // Một kỳ hỏng không nên giết cả lượt xem: bỏ qua và đi tiếp. Chỉ khi
      // KHÔNG kỳ nào lấy được mới ném ra.
      if (!tooBig(e)) throw e;
    }
  }
  if (!parts.length) throw last ?? probeErr;

  return {
    chain: mergeChains(parts),
    window: { days, strikeCount, expirations: parts.length, sliced: true },
  };
}

export async function fullChainAdaptive(
  symbol: string,
  windows: ChainWindow[] = GEX_WINDOWS
): Promise<{ chain: any; window: ChainWindow }> {
  let last: unknown;
  for (const w of windows) {
    try {
      const chain = await fullChain(symbol, chainDay(0), chainDay(w.days), {
        strikeCount: w.strikeCount,
      });
      return { chain, window: w };
    } catch (e: any) {
      last = e;
      // Chỉ hẹp lại khi lỗi ĐÚNG LÀ "phản hồi quá lớn". Ký hiệu sai, hết
      // phiên hay lỗi mạng thì xin ít dữ liệu hơn cũng không cứu được -
      // ném ra ngay để tầng trên xử lý đúng loại lỗi của nó.
      if (!tooBig(e)) throw e;
    }
  }
  // Hẹp hết cỡ vẫn quá to (SPX): chuyển sang ghép từng kỳ đáo hạn - đơn vị
  // nhỏ nhất mà /chains còn nhận.
  try {
    return await fullChainSliced(symbol);
  } catch (e) {
    // Giữ lỗi GỐC của lượt hẹp nhất khi cách ghép cũng hỏng vì cùng lý do:
    // nó mới là lỗi mô tả đúng vấn đề, còn lỗi của lượt ghép chỉ là hệ quả.
    throw tooBig(e) ? last : e;
  }
}

export async function dailyHistory(symbol: string, years = 1) {
  return get('/pricehistory', {
    symbol,
    periodType: 'year',
    period: String(years),
    frequencyType: 'daily',
    frequency: '1',
    needExtendedHoursData: 'false',
  });
}
