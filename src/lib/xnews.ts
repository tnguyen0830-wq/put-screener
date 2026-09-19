/**
 * X (Twitter) — máy khách CHỈ ĐỌC, và probe đi kèm.
 *
 * Chủ app đặt hàng: "Tôi muốn tin tức cảnh báo từ x cho những stock tôi đang
 * nắm giữ". Đây đúng là chỗ X ĐÁNG tiền — #155 đã nói vậy khi từ chối X cho
 * tab Đầu tư dài hạn: ưu thế duy nhất của X là NHANH, mà tiền mua-và-giữ
 * không đổi quyết định vì 30 phút; còn một vị thế đang nắm thì có.
 *
 * ============================================================
 * CHƯA CÓ TÍNH NĂNG. Đây là PROBE, đúng khuôn #127 (tastytrade).
 * ============================================================
 *
 * X là host CÓ KEY, và luật của repo với host có key là: probe ở production
 * trước, đọc hình dạng THẬT, rồi mới viết tính năng theo cái đo được. Lý do
 * không phải sự cẩn thận suông — repo này đã bị bỏng đúng kiểu đó nhiều lần:
 * `congress-trader` âm thầm mặc định `name="Nancy Pelosi"`, `gex-levels` trả
 * MỌI giá trị dạng chuỗi, và tài liệu tastytrade mà tôi nhớ thì SAI về chính
 * cách gắn header (#130).
 *
 * Đo 2026-09-18: `api.x.com`, `api.twitter.com`, `developer.x.com` và
 * `docs.x.com` đều bị proxy từ chối 403 ở bước CONNECT. Nên KHÔNG có một chữ
 * nào trong file này được xác nhận từ sandbox.
 *
 * ============================================================
 * BỐN CÂU HỎI PROBE PHẢI TRẢ LỜI, và vì sao từng câu quyết định thiết kế
 * ============================================================
 *
 *  1. **Toán tử `$AAPL` (cashtag) có dùng được ở gói của chủ app không?**
 *     Đây là câu QUYẾT ĐỊNH, không phải chi tiết. Nếu được thì tìm theo mã là
 *     đường thẳng nhất. Nếu KHÔNG (tôi nhớ cashtag là toán tử bậc cao, nhưng
 *     nhớ không phải đo) thì phải đổi hẳn sang bám theo DANH SÁCH TÀI KHOẢN
 *     (`from:`) rồi lọc trong app — tức một kiến trúc khác. Vì vậy cả HAI
 *     kiểu câu truy vấn đều được viết sẵn ở đây và probe thử cả hai.
 *  2. **Mức đã dùng** (`/2/usage/tweets`). LƯU Ý: đó là endpoint của mô hình
 *     CŨ tính theo tháng. Ảnh chụp `developer.x.com` chủ app gửi ngày
 *     2026-09-18 cho thấy X giờ bán **tín dụng trả theo lượng dùng, không
 *     cam kết** (cộng một bậc Enterprise), nên endpoint này có thể từ chối —
 *     và chính lời từ chối đó là phát hiện, nên probe in nguyên trạng thái
 *     thật chứ không giả vờ.
 *  3. **`since_id` có hoạt động đúng nghĩa không.** Đây là CƠ CHẾ giữ chi phí
 *     xuống: hỏi lại sau 15 phút mà không có bài mới thì phải về 0 bài, tức
 *     tốn 0 đồng. **Trả theo lượng dùng làm câu này QUAN TRỌNG HƠN chứ không
 *     nhẹ đi**: một hạn mức tháng ít ra còn tự dừng khi cạn, còn trả theo
 *     lượng dùng mà đọc lại cùng đống bài cũ thì tiền chảy ra liên tục, không
 *     có trần nào tự chặn.
 *  4. **Tên và KIỂU trường thật** của một bài, và trần độ dài câu truy vấn.
 *
 * ============================================================
 * XÁC THỰC: CHỈ token ứng dụng (app-only bearer), và đó là lập luận an toàn
 * ============================================================
 *
 * `X_BEARER_TOKEN` lấy ở cổng developer của X. Token này **chỉ đọc được, và
 * không đăng được bài** — nó không mang danh tính người dùng. Cố ý KHÔNG dùng
 * OAuth 2.0 theo ngữ cảnh người dùng dù nó cũng đọc được: token đó ĐĂNG BÀI
 * ĐƯỢC dưới tên chủ app, và token thì nằm trong bảng biến môi trường của
 * Render. Rò một token chỉ-đọc là mất vài dòng tin công khai; rò một token
 * đăng-được là người lạ đăng bài dưới tên chủ app. Cùng đúng lập luận
 * least-privilege đã ghi cho tastytrade (`read` chứ không `trade`).
 *
 * Không có `X_BEARER_TOKEN` thì mọi thứ ở đây TỰ TẮT, y như UW/Telegram/web
 * push — máy không đổi hành vi, không ném lỗi.
 */

const BASE = 'https://api.x.com/2';

/**
 * User-Agent thật. `sec.ts` ghi rõ thiếu UA là ăn 403, và #130 tốn cả buổi vì
 * một cái 401 hoá ra do lớp chống bot ở RÌA chứ không phải do giấy tờ sai.
 * Gửi UA là rẻ; không gửi là mời lại đúng lỗi đó.
 */
const UA = 'put-screener/1.0 (market data reader)';

export const xConfigured = () => !!process.env.X_BEARER_TOKEN;

export class XError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** `json-api-error` = X đã đọc giấy tờ rồi từ chối (sửa phía X).
     *  `html-edge` = bị chặn trước khi tới API (sửa phía mình). #130. */
    readonly bodyKind: BodyKind,
    readonly rate: RateInfo | null
  ) {
    super(message);
  }
}

export type BodyKind = 'json-api-error' | 'html-edge' | 'empty' | 'other';

/**
 * Cùng phép tách của `classifyBody()` bên tastytrade, và cùng lý do: một mã
 * lỗi trần KHÔNG nói được lỗi của ai. 401 kèm JSON nghĩa là token sai; 401
 * kèm HTML nghĩa là request chưa từng tới API — hai cách sửa ngược nhau, và
 * đoán nhầm là đi cấp lại một bộ khoá vốn không hề sai.
 */
export function classifyXBody(body: string): BodyKind {
  const b = (body ?? '').trim();
  if (!b) return 'empty';
  if (b.startsWith('{') || b.startsWith('[')) return 'json-api-error';
  if (/<html|<!doctype|<title/i.test(b)) return 'html-edge';
  return 'other';
}

export type RateInfo = {
  limit: number | null;
  remaining: number | null;
  /** epoch giây, theo header của X. */
  reset: number | null;
};

/**
 * Hạn mức đọc được từ header. `null` khi X không gửi — và `null` phải KHÁC
 * `0`: "không biết còn bao nhiêu" với "đã hết sạch" dẫn tới hai hành động
 * ngược nhau, đúng luật đã dùng cho `disclosureLagDays()` và `marketCap()`.
 */
export function rateFrom(h: Headers): RateInfo {
  const n = (k: string) => {
    const v = h.get(k);
    if (v == null || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  return {
    limit: n('x-rate-limit-limit'),
    remaining: n('x-rate-limit-remaining'),
    reset: n('x-rate-limit-reset'),
  };
}

const clip = (s: string, n = 200) => s.replace(/\s+/g, ' ').slice(0, n);

/** Một lượt GET có kèm phân loại lỗi và đọc hạn mức. KHÔNG log token. */
export async function xGet(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<{ json: any; rate: RateInfo; status: number }> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) throw new XError('X_NOT_CONFIGURED', 0, 'empty', null);

  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
    cache: 'no-store',
  });
  const rate = rateFrom(r.headers);
  const text = await r.text().catch(() => '');

  if (!r.ok) {
    const kind = classifyXBody(text);
    /* Thứ tự: đường dẫn, trạng thái, KẾT LUẬN, rồi mới tới trích thân —
       chuỗi này bị cắt khi lên màn hình, và bài học #102 là thứ đáng giá
       nhất phải đứng trước. */
    throw new XError(`X ${path} ${r.status} ${kind} - ${clip(text)}`, r.status, kind, rate);
  }

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new XError(`X ${path} 200 nhưng KHÔNG phải JSON - ${clip(text)}`, 200, classifyXBody(text), rate);
  }
  return { json, rate, status: r.status };
}

/* ------------------------------------------------------------------ *
 *  Câu truy vấn. Hàm THUẦN.
 * ------------------------------------------------------------------ */

/**
 * X viết mã nhiều lớp thế nào thì CHƯA ĐO ĐƯỢC. Schwab dùng gạch chéo
 * (`BRK/B`), `links.ts` trong repo này đã đổi sang dấu chấm cho link chia sẻ,
 * và `$BRK.B` là cách viết phổ biến nhất trên X — nên dùng dấu chấm, và ghi
 * rõ đây là phỏng đoán chưa xác nhận chứ không phải sự thật đã đo.
 */
export const toCashtag = (symbol: string) => `$${symbol.replace('/', '.').toUpperCase()}`;

export type BuiltQuery = {
  query: string;
  /** Phần THỰC SỰ vào được câu truy vấn. */
  used: string[];
  /** Phần bị bỏ vì chạm trần độ dài — ĐẾM ĐƯỢC, không rơi im lặng. */
  dropped: string[];
};

/**
 * Ghép các phần bằng `OR` cho tới khi chạm trần độ dài, rồi BÁO phần không
 * nhét được.
 *
 * Trần độ dài câu truy vấn của X thay đổi theo gói và chưa đo được, nên nó là
 * tham số chứ không phải hằng số chôn trong code. Điều quan trọng hơn con số:
 * phần bị bỏ đi hiện thành một DANH SÁCH. Một cổng lọc âm thầm bỏ mất nửa số
 * mã đang nắm là đúng thứ lỗi mà `missing` của tastytrade sinh ra để chặn.
 */
export function joinOr(parts: string[], suffix: string, maxLen: number): BuiltQuery {
  const used: string[] = [];
  const dropped: string[] = [];
  let body = '';
  for (const p of parts) {
    const next = body ? `${body} OR ${p}` : p;
    if (`(${next})${suffix}`.length > maxLen) {
      dropped.push(p);
      continue;
    }
    body = next;
    used.push(p);
  }
  return { query: body ? `(${body})${suffix}` : '', used, dropped };
}

/** `-is:retweet` bỏ bài đăng lại: cùng một tin đếm hai lần là bằng chứng mạnh
 *  hơn sự thật — đúng lý do `news.ts` gộp trùng SAU khi xếp hạng. */
const SUFFIX = ' -is:retweet -is:reply';

/** Tìm theo mã. CHỈ chạy được nếu gói của chủ app cho dùng toán tử cashtag —
 *  chính là câu hỏi số 1 của probe. */
export function cashtagQuery(symbols: string[], maxLen = 512): BuiltQuery {
  return joinOr(symbols.map(toCashtag), SUFFIX, maxLen);
}

/**
 * CHIA thành nhiều câu truy vấn để phủ HẾT danh sách mã, không bỏ mã nào.
 *
 * `cashtagQuery()`/`joinOr()` chỉ dựng MỘT câu và báo phần bị BỎ khi tràn
 * 512 ký tự — đúng cho probe (đo một mẫu), sai cho cảnh báo (phải hỏi hết
 * watchlist). Hàm này gọi `joinOr` lặp lại trên phần dư cho tới khi hết mã,
 * nên một watchlist vài chục mã chỉ cần vài LÔ chứ không phải một request
 * cho từng mã — khác hẳn kiến trúc "1 request/mã" của tầng báo chí
 * (`pressalerts.ts`, giới hạn bởi chính Yahoo), vì X cho gộp `$A OR $B`
 * trong một câu.
 */
export function cashtagBatches(symbols: string[], maxLen = 512): BuiltQuery[] {
  const out: BuiltQuery[] = [];
  let rest = symbols;
  while (rest.length) {
    const b = cashtagQuery(rest, maxLen);
    if (!b.used.length) break; // một mã đơn lẻ vẫn không vừa - đừng lặp vô hạn
    out.push(b);
    rest = b.dropped;
  }
  return out;
}

/** Tìm theo TÀI KHOẢN. Đây là đường lùi nếu cashtag không dùng được, và nó
 *  cũng là đường RẺ hơn: một câu truy vấn cho cả danh sách, lọc mã trong app
 *  — đúng khuôn "một feed chung" của tab Quốc hội và của cảnh báo 8-K. */
export function authorQuery(handles: string[], maxLen = 512): BuiltQuery {
  return joinOr(
    handles.map((h) => `from:${h.replace(/^@/, '')}`),
    SUFFIX,
    maxLen
  );
}

/* ------------------------------------------------------------------ *
 *  Bóc kết quả. Hàm THUẦN.
 * ------------------------------------------------------------------ */

export type XPost = {
  id: string;
  text: string;
  createdAt: string | null;
  authorId: string | null;
  authorHandle: string | null;
  authorName: string | null;
  /** Mã X tự gắn cho bài, nếu có (`entities.cashtags`). */
  cashtags: string[];
  /** Ảnh đầu tiên đính kèm bài, nếu có — cần `expansions=attachments.media_keys`
   *  và `media.fields=url,preview_image_url,type` trên chính request tìm
   *  kiếm; thiếu hai tham số đó thì `includes.media` không tồn tại và
   *  trường này luôn `null`, không phải lỗi. */
  imageUrl: string | null;
};

export type XSearch = {
  posts: XPost[];
  resultCount: number | null;
  newestId: string | null;
  nextToken: string | null;
  /**
   * X trả lỗi TỪNG PHẦN trong `errors` NGAY CẢ KHI mã trạng thái là 200.
   * Nên 200 KHÔNG đồng nghĩa với thành công, và đọc `data` rồi bỏ qua
   * `errors` là cách biến "một nửa bị từ chối" thành "không có gì cả".
   */
  apiErrors: string[];
};

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export function parseSearch(payload: any): XSearch {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const users = Array.isArray(payload?.includes?.users) ? payload.includes.users : [];
  const byId = new Map<string, any>();
  for (const u of users) if (u?.id) byId.set(String(u.id), u);
  // `includes.media` chỉ có mặt khi request TỰ hỏi qua `expansions`/
  // `media.fields` — thiếu hai tham số đó thì mảng này rỗng và mọi bài đều
  // ra `imageUrl: null`, đúng chứ không phải lỗi bóc tách.
  const media = Array.isArray(payload?.includes?.media) ? payload.includes.media : [];
  const mediaByKey = new Map<string, any>();
  for (const m of media) if (m?.media_key) mediaByKey.set(String(m.media_key), m);

  const posts: XPost[] = [];
  for (const d of data) {
    const id = str(d?.id);
    const text = str(d?.text);
    if (!id || !text) continue;
    const author = d?.author_id ? byId.get(String(d.author_id)) : null;
    const tags = Array.isArray(d?.entities?.cashtags) ? d.entities.cashtags : [];
    const mediaKeys: string[] = Array.isArray(d?.attachments?.media_keys) ? d.attachments.media_keys : [];
    let imageUrl: string | null = null;
    for (const k of mediaKeys) {
      const m = mediaByKey.get(String(k));
      if (!m || (m.type && m.type !== 'photo')) continue;
      const u = str(m.url) ?? str(m.preview_image_url);
      if (u) {
        imageUrl = u;
        break;
      }
    }
    posts.push({
      id,
      text,
      createdAt: str(d?.created_at),
      authorId: str(d?.author_id),
      authorHandle: str(author?.username),
      authorName: str(author?.name),
      cashtags: tags.map((t: any) => String(t?.tag ?? '').toUpperCase()).filter(Boolean),
      imageUrl,
    });
  }

  const errs = Array.isArray(payload?.errors) ? payload.errors : [];
  return {
    posts,
    resultCount: typeof payload?.meta?.result_count === 'number' ? payload.meta.result_count : null,
    newestId: str(payload?.meta?.newest_id),
    nextToken: str(payload?.meta?.next_token),
    apiErrors: errs.map((e: any) => clip(String(e?.title ?? e?.detail ?? JSON.stringify(e)), 120)),
  };
}

/** Bóc hụt thì IN RA khoá thật, không trả rỗng im lặng — khuôn CBOE #109. */
export function xDiagnosis(payload: any): string {
  if (!payload || typeof payload !== 'object') return `payload không phải object (${typeof payload})`;
  const top = Object.keys(payload);
  const first = Array.isArray(payload.data) ? payload.data[0] : null;
  return [
    `khoá gốc: ${top.join(',') || '(rỗng)'}`,
    `data: ${Array.isArray(payload.data) ? `mảng ${payload.data.length}` : typeof payload.data}`,
    first && typeof first === 'object' ? `khoá bài: ${Object.keys(first).join(',')}` : '',
    payload.meta ? `khoá meta: ${Object.keys(payload.meta).join(',')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/* ------------------------------------------------------------------ *
 *  Khớp bài với mã đang nắm. Hàm THUẦN.
 * ------------------------------------------------------------------ */

/**
 * Bài này nói về mã nào.
 *
 * **Bắt buộc phải có dấu `$` hoặc TÊN CÔNG TY — không bao giờ khớp mã trần.**
 * Đây là bài học đã đo của #149, không phải sự cẩn thận suông: ALL, ON, IT,
 * KEY, CAR, NOW, GOOD vừa là mã vừa là từ tiếng Anh thông dụng. Trên X thì
 * còn tệ hơn hẳn báo chí, vì văn viết ở đó là văn nói. Một bài "it is all on
 * now" sẽ khớp ba mã nếu cho phép mã trần, và cảnh báo sai trông y hệt cảnh
 * báo đúng.
 *
 * `entities.cashtags` của X được ưu tiên vì đó là phép gắn mã của CHÍNH X —
 * đo được chứ không phải ta tự suy, cùng lý do `relatedTickers` của Yahoo là
 * cổng số 1 của tầng báo chí (`pressalerts.ts`).
 */
export function symbolsIn(
  post: XPost,
  symbols: string[],
  names: Record<string, string> = {}
): string[] {
  const hit = new Set<string>();
  const tags = new Set(post.cashtags);
  const text = post.text.toLowerCase();

  for (const s of symbols) {
    const cash = toCashtag(s).slice(1); // bỏ dấu $
    if (tags.has(cash)) {
      hit.add(s);
      continue;
    }
    // X không gắn cashtag cho bài thì tự dò, nhưng VẪN đòi dấu $.
    if (text.includes(`$${cash.toLowerCase()}`)) {
      hit.add(s);
      continue;
    }
    const name = (names[s] ?? '').trim().toLowerCase();
    if (name.length >= 4 && text.includes(name)) hit.add(s);
  }
  return [...hit].sort();
}
