import { NextResponse } from 'next/server';
import {
  xConfigured,
  xGet,
  XError,
  parseSearch,
  xDiagnosis,
  cashtagQuery,
  authorQuery,
  symbolsIn,
  type RateInfo,
} from '@/lib/xnews';

/**
 * Đo HÌNH DẠNG thật của X API, chạy một lần ở production.
 *
 * Cùng lý do tồn tại với `/api/uwprobe` và `/api/ttprobe`: sandbox không gọi
 * được X (đo 2026-09-18: `api.x.com`, `api.twitter.com`, `developer.x.com`,
 * `docs.x.com` đều bị từ chối 403 ở bước CONNECT), và "đọc tài liệu rồi code
 * theo" đã sai nhiều lần trong repo này.
 *
 * **Chưa có tính năng nào đọc X.** Chạy probe một lần, đọc con số thật, rồi
 * mới viết cảnh báo theo cái đo được — đúng khuôn #127.
 *
 * Nằm trong OWNER_ONLY: chỉ trả về hình dạng, nhưng mỗi lượt bấm ĂN VÀO HẠN
 * MỨC THÁNG mà chủ app trả tiền. Người nhà không được là người bấm nút đó.
 *
 * KHÔNG BAO GIỜ trả về token: mọi thứ về xác thực đi ra ngoài đều là boolean,
 * tên khoá, hoặc mã trạng thái. Một test ghim đúng điều đó.
 */
export const dynamic = 'force-dynamic';

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Mã và tài khoản dùng để thử. Mega-cap nên gần như chắc chắn có bài mới —
 *  một câu truy vấn về mã ít người nhắc mà ra 0 bài thì không phân biệt được
 *  "toán tử không dùng được" với "đúng là không ai nhắc". */
const TEST_SYMBOLS = ['AAPL', 'TSLA', 'NVDA'];
const TEST_HANDLES = ['Reuters', 'business', 'CNBC'];

const FIELDS = {
  'tweet.fields': 'created_at,author_id,entities,lang,public_metrics',
  expansions: 'author_id',
  'user.fields': 'username,name',
};

type Step = {
  ok: boolean;
  status?: number;
  /** `json-api-error` = X đọc giấy tờ rồi từ chối; `html-edge` = bị chặn ở
   *  rìa, tức request chưa từng tới API (#130). Hai cách sửa ngược nhau. */
  bodyKind?: string;
  error?: string;
  rate?: RateInfo | null;
  [k: string]: unknown;
};

async function step(run: () => Promise<Record<string, unknown>>): Promise<Step> {
  try {
    return { ok: true, ...(await run()) };
  } catch (e: any) {
    if (e instanceof XError) {
      return { ok: false, status: e.status, bodyKind: e.bodyKind, error: e.message, rate: e.rate };
    }
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

export async function GET() {
  if (!xConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'X_NOT_CONFIGURED',
        hint:
          'Đặt X_BEARER_TOKEN trên Render. Phải là App-only Bearer Token (chỉ đọc, ' +
          'KHÔNG đăng được bài) — đừng dùng token theo ngữ cảnh người dùng.',
      },
      { status: 400 }
    );
  }

  const out: Record<string, unknown> = {};

  /* 1. MỨC ĐÃ DÙNG. Đặt TRƯỚC mọi lượt tìm kiếm, cố ý: nếu tài khoản đã hết
        tiền/hết hạn mức thì mọi bước dưới sẽ hỏng vì lý do ĐÓ chứ không phải
        vì câu truy vấn sai, và không có bước này thì hai chuyện đó trông y
        hệt nhau.

        `/2/usage/tweets` là endpoint của mô hình CŨ tính theo tháng. Ảnh chụp
        `developer.x.com` (2026-09-18) cho thấy X giờ bán tín dụng TRẢ THEO
        LƯỢNG DÙNG, nên bước này có thể trả 404/403 — và đó KHÔNG phải lỗi,
        chính lời từ chối là phát hiện: nó nói rằng số dư phải đọc ở chỗ khác.
        Vì vậy `step()` giữ nguyên trạng thái thật thay vì nuốt đi. */
  out.usage = await step(async () => {
    const { json, rate, status } = await xGet('/usage/tweets');
    return {
      status,
      rate,
      keys: json?.data ? Object.keys(json.data) : Object.keys(json ?? {}),
      /* In nguyên văn: đây là con số, không phải bí mật. */
      data: json?.data ?? null,
    };
  });

  /* 2. CÂU HỎI QUYẾT ĐỊNH: toán tử cashtag có dùng được không.
        Được → tìm theo mã là đường thẳng. Không được → phải đổi sang bám
        danh sách tài khoản và lọc trong app, tức một kiến trúc khác hẳn.
        Một cái 403 ở đây KHÔNG phải lỗi của probe, nó CHÍNH LÀ câu trả lời,
        nên thông điệp thật của X được in nguyên. */
  const cq = cashtagQuery(TEST_SYMBOLS);
  out.cashtagQuery = { query: cq.query, used: cq.used, dropped: cq.dropped };
  const cashtag = await step(async () => {
    const { json, rate, status } = await xGet('/tweets/search/recent', {
      query: cq.query,
      max_results: 10,
      ...FIELDS,
    });
    const parsed = parseSearch(json);
    const first = Array.isArray(json?.data) ? json.data[0] : null;
    return {
      status,
      rate,
      resultCount: parsed.resultCount,
      parsedPosts: parsed.posts.length,
      /* 200 KÈM `errors` KHÔNG phải thành công — X từ chối từng phần. Đọc
         `data` rồi bỏ qua `errors` là biến "một nửa bị chặn" thành "không
         có gì cả". */
      apiErrors: parsed.apiErrors,
      newestId: parsed.newestId,
      topLevelKeys: Object.keys(json ?? {}),
      postKeys: first && typeof first === 'object' ? Object.keys(first) : [],
      postTypes:
        first && typeof first === 'object'
          ? Object.fromEntries(Object.entries(first).map(([k, v]) => [k, typeOf(v)]))
          : {},
      metaKeys: json?.meta ? Object.keys(json.meta) : [],
      /* X có tự gắn cashtag cho bài không — cổng lọc quan trọng nhất của
         tầng cảnh báo sẽ dựa vào trường này, đúng như `relatedTickers` của
         Yahoo ở tầng báo chí. */
      cashtagsPresent: parsed.posts.filter((p) => p.cashtags.length > 0).length,
      authorResolved: parsed.posts.filter((p) => p.authorHandle).length,
      /* Hỏi 3 mã thì bao nhiêu mã thật sự có bài — mã rơi im lặng là thứ
         một cổng lọc phải biết TRƯỚC khi tin vào nguồn. */
      symbolsSeen: [
        ...new Set(parsed.posts.flatMap((p) => symbolsIn(p, TEST_SYMBOLS))),
      ].sort(),
      diagnosis: parsed.posts.length ? undefined : xDiagnosis(json),
    };
  });
  out.cashtag = cashtag;

  /* 3. `since_id` — CƠ CHẾ giữ chi phí xuống, không phải chi tiết.
        Hỏi lại ngay với `since_id` là id mới nhất vừa nhận: phải ra ÍT hơn
        hẳn (gần như chắc chắn 0). Nếu nó trả lại nguyên chừng ấy bài thì
        `since_id` bị bỏ qua, và với cách tính TRẢ THEO LƯỢNG DÙNG thì mỗi
        lượt hỏi lại đọc lại cùng một đống bài cũ là tiền thật chảy ra liên
        tục — không có trần tháng nào tự chặn lại. */
  const sinceId = (cashtag.ok && (cashtag.newestId as string | null)) || null;
  out.sinceId = sinceId
    ? await step(async () => {
        const { json, rate, status } = await xGet('/tweets/search/recent', {
          query: cq.query,
          max_results: 10,
          since_id: sinceId,
          ...FIELDS,
        });
        const parsed = parseSearch(json);
        return {
          status,
          rate,
          resultCount: parsed.resultCount,
          /* Diễn giải nằm ngay cạnh con số, để người đọc không phải tự suy. */
          honoured: parsed.resultCount === 0 || (parsed.resultCount ?? 0) < 10,
        };
      })
    : { ok: false, error: 'bỏ qua: bước cashtag không trả về newest_id' };

  /* 4. Đường LÙI: tìm theo tài khoản. Chạy KỂ CẢ khi cashtag đã chạy được —
        nếu cashtag hỏng thì đây là kiến trúc thay thế, và biết trước nó có
        chạy hay không là thứ quyết định việc tiếp theo làm gì. */
  const aq = authorQuery(TEST_HANDLES);
  out.authorQuery = { query: aq.query, used: aq.used, dropped: aq.dropped };
  out.author = await step(async () => {
    const { json, rate, status } = await xGet('/tweets/search/recent', {
      query: aq.query,
      max_results: 10,
      ...FIELDS,
    });
    const parsed = parseSearch(json);
    return {
      status,
      rate,
      resultCount: parsed.resultCount,
      apiErrors: parsed.apiErrors,
      handlesSeen: [...new Set(parsed.posts.map((p) => p.authorHandle).filter(Boolean))],
    };
  });

  /* 5. Trần độ dài câu truy vấn. CHƯA ĐO được và nó quyết định bao nhiêu mã
        nhét vừa một lượt hỏi. Gửi hẳn một câu dài quá mức rồi đọc lời từ
        chối của chính X — con số thật thường nằm trong câu đó. Không đoán. */
  const long = cashtagQuery(
    Array.from({ length: 200 }, (_, i) => `SYM${i}`),
    100_000
  );
  out.queryLimit = {
    sentLength: long.query.length,
    ...(await step(async () => {
      const { status, rate } = await xGet('/tweets/search/recent', {
        query: long.query,
        max_results: 10,
      });
      return { status, rate, note: 'X CHẤP NHẬN câu truy vấn dài này' };
    })),
  };

  return NextResponse.json({ ok: true, at: Date.now(), ...out });
}
