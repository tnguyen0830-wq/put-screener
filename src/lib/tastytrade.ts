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
 *   1. OAuth (ưu tiên): `TT_CLIENT_SECRET` + `TT_REFRESH_TOKEN`, đổi lấy
 *      access token ngắn hạn qua `POST /oauth/token`. Refresh token tạo trong
 *      phần API của tài khoản tastytrade, thu hồi được, KHÔNG phải mật khẩu
 *      đăng nhập. Đây là cách nên dùng trên Render.
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

async function postJson(path: string, body: Record<string, unknown>) {
  await limiter.take();
  const res = await fetch(`${BASE()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
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
 * Lấy token, làm mới khi hết hạn. Trả về mô tả KHÔNG chứa token để probe
 * in ra được: cách nào đã dùng, khoá nào trong câu trả lời.
 */
export async function ttAuthenticate(force = false): Promise<{
  method: Exclude<TtAuthMethod, null>;
  scheme: 'bearer' | 'raw';
  responseKeys: string[];
  dataKeys: string[];
  expiresInSec: number;
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
    };
  }

  if (method === 'oauth') {
    const { res, text, json } = await postJson('/oauth/token', {
      grant_type: 'refresh_token',
      client_secret: process.env.TT_CLIENT_SECRET,
      refresh_token: process.env.TT_REFRESH_TOKEN,
    });
    if (!res.ok) throw new TtError(`tastytrade ${res.status} ở /oauth/token`, res.status, text.slice(0, 300));
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
    const { res, text, json } = await postJson('/sessions', {
      login: process.env.TT_USERNAME,
      password: process.env.TT_PASSWORD,
      'remember-me': false,
    });
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
      headers: { Authorization: authHeader({ ...held!, scheme }), Accept: 'application/json' },
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
