import { NextRequest, NextResponse } from 'next/server';
import { uwGet, uwConfigured } from '@/lib/unusualwhales';
import { uwTicker } from '@/lib/uwgex';

/**
 * Dò HÌNH DẠNG thật của các endpoint GEX còn lại bên Unusual Whales.
 *
 * Vì sao cần một route riêng: sandbox phát triển không có mạng ra ngoài, nên
 * không cách nào gọi thử UW từ đó. Mà chuyện đọc tài liệu rồi code theo đã
 * sai nhiều lần trong repo này (xem congress.ts's `name` mặc định, hay
 * uwgex.ts's "mọi giá trị là chuỗi"). Nên thay vì đoán, mở đúng một đường
 * để CHẠY THẬT trên production một lần, đọc lấy hình dạng, rồi mới viết code
 * theo cái đã đo.
 *
 * Câu hỏi cần trả lời, chỉ một: có endpoint nào trả gamma THEO TỪNG STRIKE
 * không? Nếu có thì SPX vẽ được biểu đồ cột và chạy được AI Trade Briefing
 * mà không cần Schwab - `gex-levels` (thứ app đang dùng) chỉ cho 4 mức tổng
 * hợp nên không làm được việc đó.
 *
 * CỐ TÌNH không trả về nguyên payload: chuỗi quyền chọn có thể hàng nghìn
 * dòng, mà thứ cần biết chỉ là các khoá và kiểu dữ liệu. Khoá API không bao
 * giờ đi ra ngoài - uwGet() giữ nó ở phía máy chủ.
 */
export const dynamic = 'force-dynamic';

const ENDPOINTS = (t: string) => [
  { name: 'greek-exposure', path: `/api/stock/${encodeURIComponent(t)}/greek-exposure` },
  { name: 'spot-exposures', path: `/api/stock/${encodeURIComponent(t)}/spot-exposures` },
  // Cái app đang dùng, để đối chiếu trong cùng một lần đo.
  { name: 'gex-levels', path: `/api/stock/${encodeURIComponent(t)}/gex-levels` },
];

/** Tên trường hay dùng cho strike.
 *
 *  CỐ TÌNH KHÔNG có 'price' trong này. Bản đầu có, và nó báo nhầm:
 *  `spot-exposures` trả về trường `price` là GIÁ SPOT tại thời điểm đó, không
 *  phải strike - đúng như tên endpoint. Probe khi ấy kêu looksPerStrike=true
 *  cho một endpoint hoàn toàn không theo strike. Một cái nhãn sai còn tệ hơn
 *  không có nhãn, vì nó khiến người đọc tin vào kết luận sai. */
const STRIKE_HINTS = ['strike'];
const GAMMA_HINTS = ['gamma', 'call_gamma', 'put_gamma', 'gamma_exposure', 'charm', 'vanna'];

function describe(payload: any) {
  const topLevelKeys = Object.keys(payload ?? {});
  // UW bọc trong { data: ... } ở hầu hết endpoint, nhưng không phải tất cả -
  // chấp nhận cả hai, cùng cách phòng thủ như uwgex.ts.
  const body = payload?.data ?? payload;
  const isArray = Array.isArray(body);
  const rows: any[] = isArray ? body : [];
  const first = rows[0];
  const recordKeys = first && typeof first === 'object' ? Object.keys(first) : [];

  const has = (hints: string[]) =>
    recordKeys.filter((k) => hints.some((h) => k.toLowerCase().includes(h)));

  const strikeKeys = has(STRIKE_HINTS);
  const distinctStrikes = strikeKeys.length
    ? new Set(rows.map((r) => r?.[strikeKeys[0]])).size
    : 0;

  /* Một endpoint có `price` + một trường thời gian có thể là HAI thứ khác
     hẳn nhau, và chỉ đếm tổng số giá thì không phân biệt được:

       (a) đường cong theo giá TẠI MỘT thời điểm - nhiều `price` cùng chung
           một mốc thời gian. Vẽ được bản đồ gamma theo mức giá.
       (b) chuỗi thời gian của giá spot - mỗi mốc thời gian đúng một `price`.
           Không vẽ được gì theo giá.

     Phân biệt bằng cách nhóm theo mốc thời gian rồi đếm số giá TRONG một
     nhóm. Đây chính là câu hỏi còn treo sau lần đo đầu với spot-exposures
     (564 dòng, 11 giá: 51 mốc × 11 giá, hay 564 mốc?). */
  /* Thứ tự ƯU TIÊN, không phải thứ tự xuất hiện trong bản ghi. `start_time`
     là mốc GOM NHÓM, còn `time` là dấu thời gian riêng của từng dòng - gom
     theo `time` thì mỗi nhóm đúng một dòng và phép đo thành vô nghĩa. Bản
     đầu lấy theo thứ tự khoá trong bản ghi, mà production trả về `time`
     đứng trước `start_time`, nên rơi đúng vào cái bẫy đó. */
  const TIME_PREFERENCE = ['start_time', 'date', 'timestamp', 'time'];
  const timeKeys = TIME_PREFERENCE.filter((p) =>
    recordKeys.some((k) => k.toLowerCase() === p)
  ).map((p) => recordKeys.find((k) => k.toLowerCase() === p)!);
  const priceKeys = recordKeys.filter((k) => k.toLowerCase() === 'price');
  let curveShape: Record<string, unknown> | null = null;
  if (timeKeys.length && priceKeys.length && rows.length) {
    const tk = timeKeys[0];
    const pk = priceKeys[0];
    const buckets = new Map<string, Set<unknown>>();
    for (const r of rows) {
      const t = String(r?.[tk]);
      if (!buckets.has(t)) buckets.set(t, new Set());
      buckets.get(t)!.add(r?.[pk]);
    }
    const sizes = [...buckets.values()].map((v) => v.size);
    curveShape = {
      groupedBy: tk,
      timestamps: buckets.size,
      pricesPerTimestampMax: Math.max(...sizes),
      pricesPerTimestampMin: Math.min(...sizes),
      // Đây là câu trả lời: nhiều giá trong CÙNG một mốc thời gian nghĩa là
      // có một đường cong theo giá, vẽ được.
      looksLikePriceCurve: Math.max(...sizes) > 1,
    };
  }

  return {
    topLevelKeys,
    dataIsArray: isArray,
    rowCount: isArray ? rows.length : null,
    recordKeys,
    // Trả lời thẳng câu hỏi duy nhất đáng hỏi. Chỉ tính trường có chữ
    // "strike" trong tên - xem chú thích ở STRIKE_HINTS về lần báo nhầm.
    looksPerStrike: strikeKeys.length > 0 && distinctStrikes > 1,
    strikeKeys,
    distinctStrikes,
    /** Chỉ có khi payload vừa có thời gian vừa có `price` - phân biệt đường
     *  cong theo giá với chuỗi thời gian. null = không áp dụng. */
    curveShape,
    gammaKeys: has(GAMMA_HINTS),
    /** Một bản ghi thật kèm KIỂU của từng trường - chỉ có kiểu mới phân biệt
     *  "không gửi" với "gửi dưới dạng chuỗi", đúng bài học từ #97. */
    sampleTypes:
      first && typeof first === 'object'
        ? Object.fromEntries(Object.entries(first).map(([k, v]) => [k, typeof v]))
        : typeof first,
    sample: JSON.stringify(first ?? body).slice(0, 500),
  };
}

export async function GET(req: NextRequest) {
  if (!uwConfigured()) {
    return NextResponse.json(
      { error: 'UW_API_KEY chưa được cấu hình - không có gì để dò.' },
      { status: 400 }
    );
  }
  const symbol = req.nextUrl.searchParams.get('symbol') ?? 'SPX';
  const ticker = uwTicker(symbol);

  const results = await Promise.allSettled(
    ENDPOINTS(ticker).map(async (e) => ({ name: e.name, ...describe(await uwGet(e.path)) }))
  );

  return NextResponse.json({
    ticker,
    note:
      'Chỉ dò hình dạng, không phải tính năng. looksPerStrike = có gamma theo ' +
      'từng STRIKE (vẽ được biểu đồ cột). curveShape.looksLikePriceCurve = có ' +
      'nhiều mức GIÁ trong cùng một mốc thời gian (vẽ được đường cong theo giá, ' +
      'khác với chỉ là chuỗi thời gian của giá spot).',
    endpoints: ENDPOINTS(ticker).map((e, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') return { ...r.value, ok: true };
      const err: any = r.reason;
      // Giữ nguyên lời thật của UW: 401/403 (key hết hạn) khác hẳn 404
      // (endpoint không tồn tại) khác hẳn 403 vì gói không mở - ba chuyện
      // sửa khác nhau.
      return {
        name: e.name,
        ok: false,
        status: err?.status ?? null,
        error: String(err?.message ?? err),
        body: err?.body ? String(err.body).slice(0, 300) : undefined,
      };
    }),
  });
}
