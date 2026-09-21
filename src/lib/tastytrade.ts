/**
 * Máy khách dùng chung cho tastytrade Open API.
 *
 * Cùng vai trò như lib/unusualwhales.ts và lib/schwab.ts: một chỗ xác thực,
 * một bộ giới hạn tốc độ, một kiểu lỗi. Tự TẮT khi thiếu biến môi trường,
 * đúng khuôn mẫu Telegram / web push / UW của app này.
 *
 * Vì sao có tastytrade khi đã có Schwab: Schwab không cho ngày earnings và
 * không cho IV rank, nên hard gate "không có earnings trong kỳ hợp đồng"
 * đang PASS cho mọi mã ngoài watchlist chỉ vì không có dữ liệu (xem
 * screener.ts: `earnings[u.symbol] || []` → rỗng → `!earn` → qua cổng).
 * tastytrade có `/market-metrics` với cả hai thứ đó, miễn phí cho người có
 * tài khoản. Đây là dữ liệu thị trường - KHÔNG bao giờ đặt lệnh, không đọc
 * vị thế.
 *
 * **Chưa có gì ở đây được xác nhận bằng một lượt gọi thật.** Sandbox không
 * ra được mạng, và repo này đã bị "đọc tài liệu rồi code theo" phản bội vài
 * lần (congress-trader mặc định "Nancy Pelosi", gex-levels toàn chuỗi). Nên
 * file này chỉ là cái vỏ tối thiểu để `/api/ttprobe` chạy được trong
 * production và in ra HÌNH DẠNG thật; mọi tính năng phía trên phải viết theo
 * cái probe đo được, không theo chú thích này.
 *
 * Hai cách xác thực, theo tài liệu tôi nhớ - probe sẽ nói cách nào đúng:
 *
 *   1. OAuth (ưu tiên): `TT_CLIENT_SECRET` + `TT_REFRESH_TOKEN` (+
 *      `TT_CLIENT_ID` nếu có), đổi lấy access token ngắn hạn qua
 *      `POST /oauth/token`. Refresh token tạo trong phần API của tài khoản
 *      tastytrade, thu hồi được, KHÔNG phải mật khẩu đăng nhập. Đây là cách
 *      nên dùng trên Render.
 *
 *      **Ứng dụng OAuth phải xin đúng scope `read`, KHÔNG xin `trade`.**
 *      Ranh giới này không nằm trong code được - nó do màn hình tạo ứng
 *      dụng bên tastytrade quyết định, một lần, vĩnh viễn. Client này chỉ
 *      đọc dữ liệu thị trường; nếu token mang thêm quyền `trade` thì một
 *      lần lộ biến môi trường không còn là lộ dữ liệu mà là người lạ đặt
 *      được lệnh trên tài khoản môi giới thật. Quyền tối thiểu ở đây đổi
 *      hậu quả tệ nhất từ MẤT TIỀN thành lộ vài con số thị trường.
 *   2. Phiên (dự phòng): `TT_USERNAME` + `TT_PASSWORD` qua `POST /sessions`.
 *      Đặt mật khẩu tài khoản môi giới vào biến môi trường là thứ tôi không
 *      thích - chỉ để ở đây phòng khi tài khoản chưa mở được OAuth. Tài liệu
 *      nói token phiên đi trong `Authorization` KHÔNG kèm chữ "Bearer" -
 *      probe thử cả hai và báo cái nào được chấp nhận.
 */

const BASE = () => (process.env.TT_BASE_URL || 'https://api.tastyworks.com').replace(/\/$/, '');

export type TtAuthMethod = 'oauth' | 'session' | null;

export function ttAuthMethod(): TtAuthMethod {
  if (process.env.TT_CLIENT_SECRET && process.env.TT_REFRESH_TOKEN) return 'oauth';
  if (process.env.TT_USERNAME && process.env.TT_PASSWORD) return 'session';
  return null;
}

export const ttConfigured = () => ttAuthMethod() !== null;

export class TtError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Vài trăm ký tự đầu của thân lỗi thật - 401 vì token sai khác hẳn 401
     *  vì sai định dạng header, và chỉ thân lỗi mới nói được. */
    readonly body?: string
  ) {
    super(message);
    this.name = 'TtError';
  }
}

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
      await new Promise((r) => setTimeout(r, this.windowMs - (now - this.times[0]) + 25));
    }
  }
}
/** tastytrade không công bố giới hạn rõ; giữ mức thận trọng như UW. */
const limiter = new RateLimiter(4, 1000);

/** Token đang giữ trong RAM. Không ghi đĩa: access token OAuth sống ~15
 *  phút, và token phiên là thứ không nên nằm lại đâu cả. */
type Held = {
  token: string;
  /** Cách gắn vào header - đo được từ probe, không phải giả định. */
  scheme: 'bearer' | 'raw';
  expiresAt: number;
  /** Chỉ để probe báo cáo - KHÔNG BAO GIỜ trả token ra ngoài. */
  responseKeys: string[];
  dataKeys: string[];
};
let held: Held | null = null;

/**
 * Tự khai danh tính. Node `fetch` không gửi User-Agent thật, và đó là thứ
 * các lớp chống bot chặn thẳng tay - `sec.ts` trong repo này đã học đúng bài
 * đó (thiếu User-Agent là SEC trả 403). Cho phép đổi bằng biến môi trường
 * phòng khi tastytrade muốn một dạng khác.
 */
const UA = () =>
  process.env.TT_USER_AGENT ||
  'put-screener/1.0 (personal options screener; contact via tastytrade account)';

/** Một cách gửi thân request. Xem `TOKEN_VARIANTS` bên dưới về lý do có hai. */
export type TtEncoding = 'form' | 'json';

/**
 * Phân loại một câu trả lời lỗi. Đây mới là thứ đáng giá, không phải mã số.
 *
 * 401 kèm JSON `{"error":"invalid_grant"}` = API ĐÃ xem giấy tờ và từ chối →
 * sai refresh token, sai secret, hoặc thiếu scope. Sửa ở phía tastytrade.
 *
 * 401 kèm HTML của nginx (nhất là khi có `<script src="/…">` đường dẫn ngẫu
 * nhiên) = bị chặn ở RÌA, request chưa bao giờ tới API. Giấy tờ có thể hoàn
 * toàn đúng. Sửa ở phía mình: cách gửi, header, User-Agent.
 *
 * Gộp hai thứ này vào một chữ "401" là cách tốn cả buổi đi đổi lại đúng bộ
 * khoá vốn không sai.
 */
export type TtBodyKind = 'json-api-error' | 'bot-wall' | 'html-other' | 'empty' | 'unknown';

export function classifyBody(text: string): TtBodyKind {
  const t = (text ?? '').trim();
  if (!t) return 'empty';
  if (t.startsWith('{') || t.startsWith('[')) return 'json-api-error';
  const low = t.toLowerCase();
  if (low.includes('<html')) {
    // Trang lỗi nginx trần thì chỉ là định tuyến sai; kèm một thẻ script lạ
    // thì gần như chắc chắn là tường chống bot.
    if (low.includes('<script') || low.includes('captcha') || low.includes('access denied')) {
      return 'bot-wall';
    }
    return 'html-other';
  }
  return 'unknown';
}

async function post(
  path: string,
  body: Record<string, unknown>,
  opts: { encoding?: TtEncoding; withUa?: boolean } = {}
) {
  const { encoding = 'form', withUa = true } = opts;
  await limiter.take();

  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) clean[k] = String(v);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (withUa) headers['User-Agent'] = UA();
  headers['Content-Type'] =
    encoding === 'form' ? 'application/x-www-form-urlencoded' : 'application/json';

  const res = await fetch(`${BASE()}${path}`, {
    method: 'POST',
    headers,
    body: encoding === 'form' ? new URLSearchParams(clean).toString() : JSON.stringify(clean),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* để nguyên null, báo lỗi ở dưới với thân thật */
  }
  return { res, text, json };
}

/**
 * Bốn cách gửi, xếp theo khả năng đúng giảm dần.
 *
 * Bản đầu gửi JSON không kèm User-Agent, và production trả về 401 kèm HTML
 * nginx + một thẻ `<script>` đường dẫn ngẫu nhiên - tức bị tường chống bot
 * chặn, chưa tới API. Hai thứ khác nhau so với những client ĐANG CHẠY THẬT
 * trong repo này: `schwab.ts` gửi token request bằng `x-www-form-urlencoded`
 * (đúng chuẩn OAuth2 RFC 6749, JSON là ngoài chuẩn), và `sec.ts` gửi
 * User-Agent (thiếu là bị 403).
 *
 * KHÔNG đoán cái nào là nguyên nhân. Thử cả bốn, nhớ cái chạy được, và để
 * probe in ra kết quả từng cái - một lần đo trả lời dứt điểm thay vì ba lần
 * deploy đoán mò.
 */
const TOKEN_VARIANTS: { encoding: TtEncoding; withUa: boolean }[] = [
  { encoding: 'form', withUa: true },
  { encoding: 'form', withUa: false },
  { encoding: 'json', withUa: true },
  { encoding: 'json', withUa: false },
];

/** Cách gửi đã biết là chạy được, nhớ trong RAM để lần sau khỏi dò lại. */
let workingVariant: { encoding: TtEncoding; withUa: boolean } | null = null;

/**
 * Lấy token, làm mới khi hết hạn. Trả về mô tả KHÔNG chứa token để probe
 * in ra được: cách nào đã dùng, khoá nào trong câu trả lời.
 */
export async function ttAuthenticate(force = false): Promise<{
  method: Exclude<TtAuthMethod, null>;
  scheme: 'bearer' | 'raw';
  responseKeys: string[];
  dataKeys: string[];
  expiresInSec: number;
  /** Cách gửi nào lọt qua được ở token endpoint. null khi dùng `/sessions`. */
  tokenVariant: string | null;
}> {
  const method = ttAuthMethod();
  if (!method) throw new TtError('tastytrade chưa được cấu hình');

  if (!force && held && held.expiresAt > Date.now() + 30_000) {
    return {
      method,
      scheme: held.scheme,
      responseKeys: held.responseKeys,
      dataKeys: held.dataKeys,
      expiresInSec: Math.round((held.expiresAt - Date.now()) / 1000),
      tokenVariant: workingVariant
        ? `${workingVariant.encoding}${workingVariant.withUa ? '+UA' : ''}`
        : null,
    };
  }

  if (method === 'oauth') {
    /* `client_id` gửi kèm KHI CÓ. OAuth2 chuẩn đòi nó ở grant
       `refresh_token`, nhưng vài nhà cung cấp chỉ cần `client_secret` -
       chưa gọi thật được từ sandbox nên không biết tastytrade thuộc nhóm
       nào. Gửi thừa một tham số chuẩn thì vô hại; thiếu nó thì hỏng, nên
       chọn phía gửi. */
    const payload = {
      grant_type: 'refresh_token',
      ...(process.env.TT_CLIENT_ID ? { client_id: process.env.TT_CLIENT_ID } : {}),
      client_secret: process.env.TT_CLIENT_SECRET,
      refresh_token: process.env.TT_REFRESH_TOKEN,
    };

    /* Thử cách đã biết chạy được trước, rồi tới các cách còn lại. Dừng NGAY
       khi API thật sự trả lời - kể cả trả lời là "sai giấy tờ": một
       `json-api-error` nghĩa là request đã qua được tường và tới API, nên
       đổi cách gửi thêm nữa cũng vô ích, chỉ tốn thêm lượt gọi với đúng bộ
       khoá đó. Chỉ tường chống bot (`bot-wall`/`html-other`) mới đáng thử
       cách khác. */
    const order = workingVariant
      ? [workingVariant, ...TOKEN_VARIANTS.filter((v) => v.encoding !== workingVariant!.encoding || v.withUa !== workingVariant!.withUa)]
      : TOKEN_VARIANTS;

    let last: { res: Response; text: string; json: any; variant: typeof order[number] } | null = null;
    for (const variant of order) {
      const r = await post('/oauth/token', payload, variant);
      last = { ...r, variant };
      if (r.res.ok) {
        workingVariant = variant;
        break;
      }
      if (classifyBody(r.text) === 'json-api-error') break;
    }

    const { res, text, json, variant } = last!;
    if (!res.ok) {
      const kind = classifyBody(text);
      /* Nói ra ba thứ KHÔNG nhìn thấy được từ mã trạng thái: đã gửi kèm
         client_id chưa, gửi bằng cách nào, và cái 401 này là của API hay
         của tường chống bot. Chính chỗ cuối là thứ quyết định sẽ đi sửa ở
         đâu - phía tastytrade hay phía mình. */
      const hint = process.env.TT_CLIENT_ID ? 'có client_id' : 'KHÔNG có client_id';
      const how = `${variant.encoding}${variant.withUa ? '+UA' : ' không UA'}`;
      const wall =
        kind === 'bot-wall' || kind === 'html-other'
          ? ' — đây là HTML chặn ở RÌA, không phải lỗi của API: giấy tờ có thể vẫn đúng, đã thử cả 4 cách gửi'
          : '';
      throw new TtError(
        `tastytrade ${res.status} ở /oauth/token (${hint}, gửi ${how}, thân=${kind})${wall}`,
        res.status,
        text.slice(0, 300)
      );
    }
    // Tên trường theo tài liệu OAuth chuẩn; nếu sai, `responseKeys` trong
    // probe sẽ chỉ ra tên thật.
    const token = json?.access_token ?? json?.data?.access_token;
    if (typeof token !== 'string' || !token) {
      throw new TtError(
        `tastytrade /oauth/token trả về 200 nhưng không thấy access_token; khoá thật: ${Object.keys(json ?? {}).join(',')}`,
        res.status,
        text.slice(0, 300)
      );
    }
    const ttl = Number(json?.expires_in ?? 900);
    held = {
      token,
      scheme: 'bearer',
      expiresAt: Date.now() + (Number.isFinite(ttl) ? ttl : 900) * 1000,
      responseKeys: Object.keys(json ?? {}),
      dataKeys: Object.keys(json?.data ?? {}),
    };
  } else {
    const { res, text, json } = await post('/sessions', {
      login: process.env.TT_USERNAME,
      password: process.env.TT_PASSWORD,
      'remember-me': false,
      // `/sessions` nhận JSON (khác token endpoint của OAuth2), nhưng
      // User-Agent thì đường nào cũng cần - cùng tường chống bot.
    }, { encoding: 'json', withUa: true });
    if (!res.ok) throw new TtError(`tastytrade ${res.status} ở /sessions`, res.status, text.slice(0, 300));
    const token = json?.data?.['session-token'] ?? json?.data?.session_token;
    if (typeof token !== 'string' || !token) {
      throw new TtError(
        `tastytrade /sessions trả về 200 nhưng không thấy session-token; khoá thật: data{${Object.keys(json?.data ?? {}).join(',')}}`,
        res.status,
        text.slice(0, 300)
      );
    }
    held = {
      token,
      // Tài liệu nói token phiên KHÔNG kèm "Bearer". ttGet() thử cả hai nếu
      // 401 và ghi nhớ cái được chấp nhận.
      scheme: 'raw',
      expiresAt: Date.now() + 20 * 60 * 60 * 1000,
      responseKeys: Object.keys(json ?? {}),
      dataKeys: Object.keys(json?.data ?? {}),
    };
  }

  return {
    method,
    scheme: held.scheme,
    responseKeys: held.responseKeys,
    dataKeys: held.dataKeys,
    expiresInSec: Math.round((held.expiresAt - Date.now()) / 1000),
    /** Cách gửi nào lọt qua được - null khi dùng `/sessions`. */
    tokenVariant: workingVariant ? `${workingVariant.encoding}${workingVariant.withUa ? '+UA' : ''}` : null,
  };
}

const authHeader = (h: Held) => (h.scheme === 'bearer' ? `Bearer ${h.token}` : h.token);

/**
 * GET một endpoint, trả JSON. Kèm `scheme` đã dùng để probe báo cáo.
 *
 * Trên 401 với token phiên, thử lại đúng một lần với cách gắn header còn
 * lại rồi GHI NHỚ - đây là điểm tài liệu và thực tế hay lệch nhau nhất, và
 * đo một lần rẻ hơn nhiều so với đoán sai rồi để tính năng chết im lặng.
 */
export async function ttGet<T = any>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<{ data: T; scheme: 'bearer' | 'raw'; status: number }> {
  await ttAuthenticate();
  if (!held) throw new TtError('không có token sau khi xác thực');

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const query = qs.toString();
  const url = `${BASE()}${path}${query ? `?${query}` : ''}`;

  const attempt = async (scheme: 'bearer' | 'raw') => {
    await limiter.take();
    const res = await fetch(url, {
      headers: {
        Authorization: authHeader({ ...held!, scheme }),
        Accept: 'application/json',
        // Cùng tường chống bot chặn token endpoint cũng chặn đường này.
        'User-Agent': UA(),
      },
      /* `fetch` trong route của Next 14 bị vá để CACHE TRÊN ĐĨA mặc định
         (`.next/cache/fetch-cache`). ĐO ĐƯỢC khi chạy `/api/dxtapeprobe`
         với máy chủ giả: thân câu trả lời của `/api-quote-tokens` — MANG
         NGUYÊN token streamer — nằm dạng base64 trong `.next/cache/`; sau
         khi thêm dòng này thì thư mục đó trống.

         Hai lý do, lý do sau nặng hơn. Token streamer là thứ NGẮN HẠN:
         phục vụ lại một bản cache nghĩa là một ngày nào đó bắt tay bằng
         token đã hết hạn rồi báo "streaming hỏng", tức công cụ chẩn đoán
         nói sai nguyên nhân — đúng bài học #185 (cache của `listVoices`
         lọt vào `/api/ttsprobe`). Và không lượt gọi nào ở đây là dữ liệu
         đáng cache: tất cả đều là số thị trường sống.

         CHƯA ĐO: tastytrade thật có gửi `Cache-Control: no-store` không —
         nếu có thì Next tôn trọng và chuyện trên chỉ xảy ra với máy chủ
         giả. Không đoán chuyện đó: nói thẳng ra là mình không muốn cache,
         đúng như chín module khác trong repo đã làm. */
      cache: 'no-store',
    });
    const text = await res.text();
    return { res, text };
  };

  let scheme = held.scheme;
  let { res, text } = await attempt(scheme);
  if (res.status === 401 && held.scheme === 'raw') {
    const other: 'bearer' = 'bearer';
    const second = await attempt(other);
    if (second.res.ok) {
      held.scheme = other;
      scheme = other;
      res = second.res;
      text = second.text;
    }
  }

  if (!res.ok) throw new TtError(`tastytrade ${res.status} cho ${path}`, res.status, text.slice(0, 300));
  try {
    return { data: JSON.parse(text), scheme, status: res.status };
  } catch {
    throw new TtError(`tastytrade trả về thứ không phải JSON cho ${path}`, res.status, text.slice(0, 300));
  }
}
