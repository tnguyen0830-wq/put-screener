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
    throw new Error(`Schwab ${pathname} ${res.status}: ${await res.text()}`);
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

/** Full chain (calls + puts, all strikes) for a local GEX calculation. */
export async function fullChain(symbol: string, fromDate: string, toDate: string) {
  return get('/chains', {
    symbol,
    contractType: 'ALL',
    strategy: 'SINGLE',
    range: 'ALL',
    fromDate,
    toDate,
    includeUnderlyingQuote: 'true',
  });
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
