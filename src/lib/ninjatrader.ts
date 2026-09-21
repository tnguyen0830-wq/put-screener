/**
 * NinjaTrader web (web.ninjatrader.com) = nền tảng Tradovate — máy khách
 * CHỈ ĐỌC, và probe đi kèm. CHƯA CÓ TÍNH NĂNG NÀO dùng file này.
 *
 * Chủ app: "Tôi có đăng nhập được web.ninjatrader.com, làm probe đi" — sau
 * khi đặt hàng một tab daytrade (cổ phiếu + 0DTE SPX, luồng thời gian thực,
 * footprint). NinjaTrader mua Tradovate năm 2022 và nền web của họ chạy trên
 * đúng API Tradovate, nên đây là host CÓ KEY, và luật của repo với host có
 * key là: probe ở production trước, đọc hình dạng THẬT, rồi mới viết tính
 * năng theo cái đo được (#127 tastytrade, #159 X). Lý do không phải cẩn
 * thận suông: tài liệu tôi nhớ đã sai ba lần ở repo này (`congress-trader`
 * mặc định `name`, `gex-levels` toàn chuỗi, header tastytrade #130).
 *
 * Đo 2026-09-21: `live.tradovateapi.com`, `demo.tradovateapi.com` và
 * `md.tradovateapi.com` đều bị proxy từ chối ở bước CONNECT từ sandbox. Nên
 * KHÔNG một chữ nào về endpoint/trường trong file này được xác nhận từ đây.
 *
 * ============================================================
 * ĐO 2026-09-21 TỪ MÀN HÌNH CHỦ APP — probe CHƯA TỪNG CHẠY, và ba trong
 * năm câu hỏi dưới đây đã có đáp án mà không tốn một request nào
 * ============================================================
 *
 * Chủ app mở `web.ninjatrader.com` và chụp màn hình từng tab. Sáu phép đo,
 * xếp theo mức quyết định:
 *
 *  A. **Dữ liệu là TRỄ 10 PHÚT, nguyên văn lời Tradovate.** Bấm vào biểu
 *     tượng đồng hồ cạnh mã, hộp thoại hiện: *"NQZ6 data is delayed by 10
 *     minutes. To get real-time data, please subscribe to a CME data
 *     package."* Khớp với `Settings → Subscriptions → Market Data` in
 *     **"No rows"** — hai bề mặt độc lập nói cùng một điều (khác hẳn vụ SPX
 *     #108, nơi bề mặt thứ hai lật ngược kết luận). Tức **câu hỏi 3 và 4
 *     coi như đã trả lời**: không có gói dữ liệu CME thì luồng md qua API
 *     giỏi lắm cũng trễ 10 phút, và một footprint dựng trên dữ liệu trễ 10
 *     phút là thứ SAI mà TRÔNG Y HỆT ĐÚNG — đúng hình dạng lỗi nguy hiểm
 *     nhất mà cả repo này chống.
 *
 *  B. **Cách viết tên hợp đồng: `NQZ6` — MỘT chữ số năm.** Đây là câu hỏi
 *     5, và phỏng đoán `ESZ6` viết sẵn trong `/api/ntprobe` là ĐÚNG (không
 *     phải `NQZ26`/`ESZ26`). Đọc thẳng từ màn hình hợp đồng E-MINI NASDAQ
 *     100, hết hạn 12/18/2026.
 *
 *  C. **`Settings → API Access` có thật**, tiêu đề "API Access Add-On" —
 *     xác nhận nó là gói THÊM như câu hỏi 1 giả định. Nhưng phần thân
 *     TRỐNG, và danh sách `Add-Ons` (phần nhìn thấy được) KHÔNG có card
 *     nào tên API Access. **Giá vẫn CHƯA ĐO ĐƯỢC.**
 *
 *  D. **Footprint đã có sẵn, đã trả tiền.** `Add-Ons` cho thấy
 *     **Order Flow + ACTIVE, $59,00/tháng** — mô tả của chính Tradovate:
 *     "Bid/Ask and TPO advanced chart types, Volume Profile indicators and
 *     drawing tools, and VWAP and Cumulative Delta". Cộng thêm
 *     **Advanced Charting** (ACTIVE, Free) có "Bid/ask volume candles" và
 *     **Tick Stream** (ACTIVE, Free) có từng tick kèm mili-giây. Tức thứ
 *     tab daytrade định xây thì chủ app ĐANG TRẢ TIỀN để dùng trong chính
 *     nền tảng đó rồi.
 *
 *  E. **KHÔNG có tài khoản demo.** `Settings → Accounts` chỉ có MỘT tài
 *     khoản, gắn nhãn `LIVE`. Nên lời khuyên "đặt `NT_ENV=demo` để đo an
 *     toàn" ở DEPLOY.md **không áp dụng được cho tài khoản này** — mật khẩu
 *     đặt lên Render sẽ là mật khẩu của tài khoản thật, và token Tradovate
 *     đặt lệnh được. Xem phần AN TOÀN bên dưới.
 *
 *  F. **Quy mô không đỡ nổi chi phí.** Net Liquidity **$200**; NQ có
 *     `Standard Day Margin` **$1.000**, tick value $5,00, $20/điểm. Cộng
 *     $59/tháng đang trả + gói API Access (chưa biết giá) + gói dữ liệu CME
 *     (chưa biết giá) thì tiền thuê hạ tầng mỗi tháng lớn hơn hẳn phần nó
 *     phục vụ.
 *
 * **KẾT LUẬN (2026-09-21): đường NinjaTrader DỪNG, không xoá.** Không phải
 * vì code hỏng — file này và `/api/ntprobe` vẫn đúng và vẫn chạy được ngay
 * khi đặt 4 biến env. Mà vì điều kiện cần KHÔNG có: không dữ liệu real-time,
 * không tài khoản demo, footprint đã có sẵn chỗ khác, và Tradovate là sàn
 * FUTURES nên không bao giờ cho cổ phiếu hay 0DTE SPX — đúng nửa quan trọng
 * của thứ chủ app đặt hàng. Nếu sau này chủ app mua gói dữ liệu CME và gói
 * API Access thì bật lại bằng cách đặt env rồi mở `/api/ntprobe`; mọi câu
 * hỏi còn lại (1, 2, và phần `withHistogram` của 4) vẫn chờ ở đó.
 *
 * ============================================================
 * NĂM CÂU HỎI PROBE PHẢI TRẢ LỜI, theo thứ tự quyết định thiết kế
 * ============================================================
 *
 *  1. **Tài khoản có được gọi API không?** Tradovate bán quyền gọi API như
 *     một gói THÊM ("API Access") — có tài khoản, đăng nhập web được, vẫn có
 *     thể bị `accesstokenrequest` từ chối. Lời từ chối in nguyên văn: đó
 *     chính là câu trả lời, không phải lỗi của probe. Tradovate còn hay trả
 *     HTTP **200 kèm `errorText`** thay vì mã 4xx — nên probe đọc THÂN trước
 *     khi tin mã trạng thái, cùng lối `classifyEleven()` (#195).
 *  2. **Có `p-ticket` không?** Khi đăng nhập quá dày Tradovate trả
 *     `{p-ticket, p-time, p-captcha}` thay vì token: phải chờ `p-time` giây
 *     rồi gửi lại KÈM `p-ticket`; `p-captcha: true` nghĩa là phải giải
 *     captcha trên web — tức KHÔNG tự động hoá được từ server. Probe nói ra
 *     cái nào.
 *  3. **Token dữ liệu thị trường có riêng không** (`mdAccessToken`), và
 *     WebSocket `md.tradovateapi.com` có nhận nó không. Không có luồng md
 *     thì tab daytrade không tồn tại.
 *  4. **`md/getChart` kiểu Tick có `withHistogram`** — đó là thứ vẽ được
 *     footprint (khối lượng bid/ask theo từng mức giá). Nếu chỉ có OHLC thì
 *     footprint không làm được từ nguồn này.
 *  5. **Tên hợp đồng thật** (`contract/suggest` ra `ESZ6`? `ESZ26`?) — mọi
 *     lượt đăng ký đều cần đúng cách viết, và cách viết là thứ dễ nhớ sai
 *     nhất (SPX ở Schwab tốn sáu PR vì chuyện này).
 *     → **ĐÃ TRẢ LỜI 2026-09-21 bằng ảnh chụp: MỘT chữ số năm (`NQZ6`),
 *     tức `ESZ6` là đúng.** Xem mục B của khối ĐO ĐƯỢC ở trên.
 *
 * ============================================================
 * AN TOÀN
 * ============================================================
 *
 * Tradovate KHÔNG có OAuth: `accesstokenrequest` nhận đúng TÊN + MẬT KHẨU
 * đăng nhập cộng cặp khoá API (`cid`/`sec`) — nên rủi ro lớn nhất là MẬT
 * KHẨU, không phải token.
 *
 * **Sửa một câu file này từng khẳng định sai.** Nó viết "token dùng được cho
 * CẢ đặt lệnh lẫn đọc, không có scope `read` như tastytrade". Trang hỗ trợ
 * của chính hãng (`support.ninjatrader.com` / `support.tradovate.com`, bài
 * *Tradovate API Access*, đọc 2026-09-21) mô tả màn hình tạo key có bước
 * **chọn quyền cho key** trước khi bấm `Generate`. Tức có thể có một bộ
 * quyền hẹp hơn; danh sách quyền cụ thể **CHƯA ĐO ĐƯỢC** (gói API Access
 * đòi tài khoản LIVE nạp tối thiểu $1.000, chủ app đang $200 nên tab
 * `Add-Ons` không hiện card). Cách viết đúng lúc này: quyền là thứ chủ app
 * chọn lúc tạo key, chọn hẹp nhất có thể, và ghi lại danh sách thật khi
 * nhìn thấy nó — đừng để lại một lời khẳng định chưa ai kiểm. Nên:
 *   - Nếu tài khoản là tài khoản THẬT có tiền, mật khẩu nằm trong bảng env
 *     của Render là mật khẩu vào được tiền đó. `NT_ENV` mặc định `demo`; đặt
 *     `live` là quyết định có ý thức của chủ app, ghi ở DEPLOY.md.
 *     → **ĐO 2026-09-21: tài khoản của chủ app KHÔNG có bản demo** (chỉ một
 *     tài khoản, nhãn `LIVE`), nên mặc định `demo` KHÔNG cứu được ai ở đây:
 *     muốn probe chạy là phải đặt `NT_ENV=live` và để mật khẩu tài khoản
 *     thật trên Render. Đó là một lý do nữa để dừng, xem mục E ở trên.
 *   - File này KHÔNG có hàm đặt lệnh, và probe chỉ gọi endpoint đọc.
 *   - Không bao giờ trả mật khẩu, `sec`, hay bất kỳ token nào ra ngoài:
 *     `redact()` che chúng trong mọi thông điệp ghi lại, và route còn quét
 *     lại cả chuỗi JSON cuối cùng trước khi gửi (test ghim).
 *
 * WebSocket của Tradovate dùng khung kiểu SockJS: server gửi `o` khi mở,
 * `h` là nhịp tim (client phải trả `[]`), `a[...]` là mảng thông điệp,
 * `c[...]` là đóng. Client gửi văn bản `endpoint\nid\nquery\nbody`. Toàn bộ
 * phần bóc/đóng khung là hàm thuần để test không cần mạng — đúng như
 * `dxprobe.ts`.
 */

import { classifyBody, type TtBodyKind } from './tastytrade';

export type NtEnv = 'live' | 'demo';

export function ntEnv(): NtEnv {
  return (process.env.NT_ENV || '').trim().toLowerCase() === 'live' ? 'live' : 'demo';
}

/** Chỉ cần tên + mật khẩu là probe chạy được; `cid`/`sec` thiếu thì chính
 *  lời từ chối của Tradovate sẽ nói có bắt buộc hay không. */
export function ntConfigured(): boolean {
  return Boolean(process.env.NT_USER && process.env.NT_PASSWORD);
}

/** Base REST theo môi trường. Nhớ được, chưa đo — `NT_BASE_URL` ghi đè. */
export function ntBaseUrl(): string {
  const o = process.env.NT_BASE_URL;
  if (o) return o.replace(/\/$/, '');
  return ntEnv() === 'live' ? 'https://live.tradovateapi.com/v1' : 'https://demo.tradovateapi.com/v1';
}

/** WebSocket dữ liệu thị trường — theo tài liệu là CHUNG cho live/demo. */
export function ntMdWsUrl(): string {
  return process.env.NT_MD_WS_URL || 'wss://md.tradovateapi.com/v1/websocket';
}

export class NtError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly bodyKind: TtBodyKind | null,
    /** ≤ 300 ký tự thân thật, ĐÃ che bí mật. */
    readonly body: string | null
  ) {
    super(message);
    this.name = 'NtError';
  }
}

const UA = () => process.env.NT_USER_AGENT || 'put-screener/1.0 (personal trading tool probe)';

/**
 * Che mọi bí mật trong một chuỗi. Dùng cho thông điệp WebSocket ghi lại
 * (thông điệp `authorize` mang nguyên token) và cho câu trả lời cuối của
 * route. Bí mật rỗng/ngắn dưới 4 ký tự bị bỏ qua — thay thế chuỗi rỗng là
 * vô nghĩa, và một bí mật 1-3 ký tự thì "che" sẽ phá nát mọi chữ.
 */
export function redact(text: string, secrets: (string | undefined | null)[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s || s.length < 4) continue;
    out = out.split(s).join('<đã che>');
  }
  return out;
}

/** Quét che LẦN CUỐI trên chuỗi JSON của route: một trường lạ mang token
 *  (tài liệu nhớ sai tên khoá) vẫn không lọt. Test ghim hàm này. */
export function scrubJson(out: unknown, secrets: (string | undefined | null)[]): unknown {
  return JSON.parse(redact(JSON.stringify(out), secrets));
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

export type TokenReply = {
  status: number;
  /** Khoá cấp một của thân trả lời — in nguyên, đó là hình dạng. */
  keys: string[];
  /** Có token hay không — CHỈ boolean, không bao giờ giá trị. */
  hasAccessToken: boolean;
  hasMdAccessToken: boolean;
  expirationTime: string | null;
  userStatus: string | null;
  hasLive: boolean | null;
  /** Tradovate nói không bằng `errorText` trong một cái 200. */
  errorText: string | null;
  /** Nhịp chống dò: có `p-ticket` nghĩa là phải chờ `p-time` giây rồi gửi
   *  lại kèm ticket; `p-captcha` true thì phải giải captcha trên web. */
  pTicket: boolean;
  pTime: number | null;
  pCaptcha: boolean | null;
};

/** Bóc câu trả lời `accesstokenrequest` thành hình dạng — thuần, có test. */
export function describeTokenReply(status: number, json: any): TokenReply {
  const o = json && typeof json === 'object' ? json : {};
  const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? null : String(v));
  return {
    status,
    keys: Object.keys(o),
    hasAccessToken: typeof o.accessToken === 'string' && o.accessToken.length > 0,
    hasMdAccessToken: typeof o.mdAccessToken === 'string' && o.mdAccessToken.length > 0,
    expirationTime: str(o.expirationTime),
    userStatus: str(o.userStatus),
    hasLive: typeof o.hasLive === 'boolean' ? o.hasLive : null,
    errorText: str(o.errorText),
    pTicket: typeof o['p-ticket'] === 'string' && o['p-ticket'].length > 0,
    pTime: typeof o['p-time'] === 'number' ? o['p-time'] : null,
    pCaptcha: typeof o['p-captcha'] === 'boolean' ? o['p-captcha'] : null,
  };
}

export type NtTokens = { accessToken: string; mdAccessToken: string | null; reply: TokenReply };

/**
 * POST `/auth/accesstokenrequest`. Thân JSON (tài liệu Tradovate nói JSON,
 * khác OAuth chuẩn) — nếu bị chặn ở rìa thì probe nói ra `bodyKind`, và
 * đó là lúc thử cách gửi khác, không phải lúc đổi mật khẩu (#130).
 */
export async function ntRequestToken(fetchFn: typeof fetch = fetch): Promise<NtTokens> {
  const name = process.env.NT_USER || '';
  const password = process.env.NT_PASSWORD || '';
  const cid = process.env.NT_CID || '';
  const sec = process.env.NT_SEC || '';
  const body: Record<string, unknown> = {
    name,
    password,
    appId: process.env.NT_APP_ID || 'put-screener',
    appVersion: process.env.NT_APP_VERSION || '1.0',
    deviceId: process.env.NT_DEVICE_ID || 'put-screener-probe',
  };
  if (cid) body.cid = Number.isFinite(Number(cid)) ? Number(cid) : cid;
  if (sec) body.sec = sec;

  const secrets = [password, sec];
  const res = await fetchFn(`${ntBaseUrl()}/auth/accesstokenrequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* thân không phải JSON: phân loại bên dưới */
  }
  const tokenSecrets = [...secrets, json?.accessToken, json?.mdAccessToken];
  if (json === null) {
    throw new NtError(
      `accesstokenrequest ${res.status}: thân không phải JSON`,
      res.status,
      classifyBody(text),
      redact(text.slice(0, 300), tokenSecrets)
    );
  }
  const reply = describeTokenReply(res.status, json);
  if (!reply.hasAccessToken) {
    // 200 kèm errorText, hoặc p-ticket, hoặc 4xx có JSON — đều là API ĐÃ
    // trả lời; mã trạng thái đứng trước, thân đã che đứng sau (#102).
    // `errorText` là lời của server — nó CÓ THỂ nhắc lại mật khẩu/khoá, nên
    // che luôn trong message chứ không chỉ trong body (test ghim).
    throw new NtError(
      redact(`accesstokenrequest ${res.status}: không có accessToken` + (reply.errorText ? ` — ${reply.errorText}` : reply.pTicket ? ' — p-ticket (bị giãn nhịp)' : ''), tokenSecrets),
      res.status,
      'json-api-error',
      redact(JSON.stringify(json).slice(0, 300), tokenSecrets)
    );
  }
  return { accessToken: json.accessToken, mdAccessToken: reply.hasMdAccessToken ? json.mdAccessToken : null, reply };
}

/** GET có Bearer. Trả JSON đã parse + status; ném NtError kèm thân đã che. */
export async function ntGet(path: string, accessToken: string, fetchFn: typeof fetch = fetch): Promise<{ status: number; json: any }> {
  const res = await fetchFn(`${ntBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': UA() },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new NtError(`${path} ${res.status}: thân không phải JSON`, res.status, classifyBody(text), redact(text.slice(0, 300), [accessToken]));
  }
  if (!res.ok) {
    throw new NtError(`${path} ${res.status}`, res.status, 'json-api-error', redact(text.slice(0, 300), [accessToken]));
  }
  return { status: res.status, json };
}

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Hình dạng một mảng bản ghi: số dòng, khoá + kiểu của dòng đầu. Không in
 *  giá trị — riêng `pick` là những trường CÔNG KHAI (tên hợp đồng, loại tài
 *  khoản) đáng đọc. */
export function describeList(json: any, pick: string[] = []) {
  const rows: any[] = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
  const first = rows[0] && typeof rows[0] === 'object' ? rows[0] : null;
  return {
    isArray: Array.isArray(json),
    count: rows.length,
    keys: first ? Object.keys(first) : Object.keys(json ?? {}),
    types: first ? Object.fromEntries(Object.entries(first).map(([k, v]) => [k, typeOf(v)])) : {},
    picked: rows.slice(0, 10).map((r) => Object.fromEntries(pick.filter((k) => r && k in r).map((k) => [k, r[k]]))),
  };
}

// ---------------------------------------------------------------------------
// WebSocket framing (SockJS-style) — thuần
// ---------------------------------------------------------------------------

export type Frame =
  | { kind: 'open' }
  | { kind: 'heartbeat' }
  | { kind: 'array'; items: any[] }
  | { kind: 'close'; code: number | null; reason: string | null }
  | { kind: 'unknown'; text: string };

export function parseFrame(text: string): Frame {
  if (text === 'o') return { kind: 'open' };
  if (text === 'h') return { kind: 'heartbeat' };
  const head = text[0];
  if (head === 'a' || head === 'c') {
    try {
      const arr = JSON.parse(text.slice(1));
      if (head === 'a') return { kind: 'array', items: Array.isArray(arr) ? arr : [arr] };
      const [code, reason] = Array.isArray(arr) ? arr : [null, null];
      return { kind: 'close', code: typeof code === 'number' ? code : null, reason: typeof reason === 'string' ? reason : null };
    } catch {
      /* rơi xuống unknown */
    }
  }
  return { kind: 'unknown', text };
}

/** Khung request Tradovate: `endpoint\nid\nquery\nbody`. `query` là chuỗi
 *  URL-encoded (rỗng nếu không có), `body` là JSON hoặc chuỗi thô (token). */
export function buildRequest(endpoint: string, id: number, query = '', body?: unknown): string {
  const b = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return `${endpoint}\n${id}\n${query}\n${b}`;
}

export type WsMessage = { at: number; dir: 'sent' | 'recv'; text: string };

export type MdObservation = {
  /** Mảng thông điệp `a[...]` có mang `e: "md"`: đúng hình dạng dữ liệu. */
  mdFrames: number;
  /** Thông điệp có `e` khác `md` (props, clock...) đếm theo tên. */
  otherEvents: Record<string, number>;
  /** Trả lời có `i` (id request) → `s` (status) — nói request nào được nhận. */
  replies: Record<string, number>;
  /** Khoá của quote đầu tiên và của `entries` trong nó — Bid/Offer/Trade là
   *  thứ tab daytrade cần. */
  quoteKeys: string[] | null;
  quoteEntryKeys: string[] | null;
  /** Thanh đầu tiên của `md/getChart`: có `histogram`/bid-ask volume không
   *  quyết định footprint làm được hay không. */
  chartKeys: string[] | null;
  chartBarKeys: string[] | null;
  chartBars: number;
  domKeys: string[] | null;
};

export function emptyObservation(): MdObservation {
  return { mdFrames: 0, otherEvents: {}, replies: {}, quoteKeys: null, quoteEntryKeys: null, chartKeys: null, chartBarKeys: null, chartBars: 0, domKeys: null };
}

/** Gộp một khung `array` vào quan sát. Đọc dung thứ: mọi nhánh đều "có thì
 *  ghi", không nhánh nào giả định hình dạng đúng như tôi nhớ. */
export function observe(items: any[], into: MdObservation): void {
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    if (typeof it.i === 'number' && 's' in it) {
      const key = `${it.i}→${it.s}`;
      into.replies[key] = (into.replies[key] ?? 0) + 1;
    }
    if (typeof it.e === 'string') {
      if (it.e === 'md') {
        into.mdFrames++;
        const d = it.d ?? {};
        const q = Array.isArray(d.quotes) ? d.quotes[0] : null;
        if (q && !into.quoteKeys) {
          into.quoteKeys = Object.keys(q);
          into.quoteEntryKeys = q.entries && typeof q.entries === 'object' ? Object.keys(q.entries) : null;
        }
        const charts = Array.isArray(d.charts) ? d.charts : [];
        for (const c of charts) {
          if (!c || typeof c !== 'object') continue;
          if (!into.chartKeys) into.chartKeys = Object.keys(c);
          const bars = Array.isArray(c.bars) ? c.bars : Array.isArray(c.tks) ? c.tks : [];
          into.chartBars += bars.length;
          if (bars[0] && typeof bars[0] === 'object' && !into.chartBarKeys) into.chartBarKeys = Object.keys(bars[0]);
        }
        const dom = Array.isArray(d.doms) ? d.doms[0] : null;
        if (dom && !into.domKeys) into.domKeys = Object.keys(dom);
      } else {
        into.otherEvents[it.e] = (into.otherEvents[it.e] ?? 0) + 1;
      }
    }
  }
}

export type MdProbeResult = {
  attempted: boolean;
  skipped: string | null;
  opened: boolean;
  /** `authorize` được trả `s: 200`. */
  authorized: boolean;
  heartbeats: number;
  observation: MdObservation;
  messages: WsMessage[];
  error: string | null;
};

const MAX_MSG = 60;
const CLIP = 500;

/**
 * Bắt tay md thật: `o` → `authorize` (token md) → `md/subscribeQuote` +
 * `md/getChart` Tick có histogram cho `symbol`, nghe `listenMs` rồi đóng.
 * Mọi thông điệp hai chiều ghi lại (đã che token) — khi đoán sai định dạng,
 * lời từ chối của Tradovate nói ra định dạng đúng.
 */
export async function ntMdHandshake(url: string, token: string, symbol: string, listenMs = 8000): Promise<MdProbeResult> {
  const out: MdProbeResult = { attempted: true, skipped: null, opened: false, authorized: false, heartbeats: 0, observation: emptyObservation(), messages: [], error: null };
  const WS: any = (globalThis as any).WebSocket;
  if (typeof WS !== 'function') return { ...out, attempted: false, skipped: 'môi trường Node này không có WebSocket toàn cục' };

  const log = (dir: 'sent' | 'recv', text: string) => {
    if (out.messages.length < MAX_MSG) out.messages.push({ at: Date.now(), dir, text: redact(text, [token]).slice(0, CLIP) });
  };

  return new Promise<MdProbeResult>((resolve) => {
    let ws: any;
    let done = false;
    let nextId = 1;
    const finish = (err?: string | null) => {
      if (done) return;
      done = true;
      if (err && !out.error) out.error = err;
      try {
        ws?.close();
      } catch {
        /* đã thu xong */
      }
      resolve(out);
    };
    const timer = setTimeout(() => finish(null), listenMs);
    if (typeof (timer as any).unref === 'function') (timer as any).unref();

    const send = (text: string) => {
      log('sent', text);
      try {
        ws.send(text);
      } catch (e: any) {
        finish(String(e?.message ?? e));
      }
    };

    try {
      ws = new WS(url);
    } catch (e: any) {
      clearTimeout(timer);
      return finish(`không mở được WebSocket: ${String(e?.message ?? e)}`);
    }

    ws.onmessage = (ev: any) => {
      const text = typeof ev?.data === 'string' ? ev.data : String(ev?.data ?? '');
      log('recv', text);
      try {
        const f = parseFrame(text);
        if (f.kind === 'open') {
          out.opened = true;
          send(buildRequest('authorize', nextId++, '', token));
        } else if (f.kind === 'heartbeat') {
          out.heartbeats++;
          send('[]');
        } else if (f.kind === 'array') {
          observe(f.items, out.observation);
          const authOk = f.items.some((it) => it && it.i === 1 && it.s === 200);
          if (authOk && !out.authorized) {
            out.authorized = true;
            send(buildRequest('md/subscribeQuote', nextId++, '', { symbol }));
            send(
              buildRequest('md/getChart', nextId++, '', {
                symbol,
                chartDescription: { underlyingType: 'Tick', elementSize: 1, elementSizeUnit: 'UnderlyingUnits', withHistogram: true },
                timeRange: { asMuchAsElements: 20 },
              })
            );
            send(buildRequest('md/subscribeDOM', nextId++, '', { symbol }));
          }
        } else if (f.kind === 'close') {
          finish(`server đóng: code=${f.code ?? '?'} reason=${f.reason ?? ''}`);
        }
      } catch (e: any) {
        log('recv', `[probe lỗi khi xử lý: ${String(e?.message ?? e)}]`);
      }
    };
    ws.onerror = (ev: any) => {
      const why = String(ev?.message ?? ev?.type ?? 'lỗi WebSocket');
      log('recv', `[onerror] ${why}`);
      // Chưa từng mở được (lỗi TLS/DNS/không phải 101) thì không có gì để
      // nghe: kết thúc ngay với lý do thật thay vì chờ hết cửa sổ và trả
      // `error: null` — "không nối được" phải khác "nối được mà im lặng".
      if (!out.opened) {
        clearTimeout(timer);
        finish(`không mở được WebSocket: ${why}`);
      }
    };
    ws.onclose = (ev: any) => {
      log('recv', `[onclose] code=${ev?.code ?? '?'} reason=${String(ev?.reason ?? '').slice(0, 120)}`);
      clearTimeout(timer);
      finish();
    };
  });
}
