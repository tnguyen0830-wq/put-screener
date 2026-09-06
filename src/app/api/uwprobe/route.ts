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

/** Tên trường hay dùng cho strike, để trả lời thẳng câu hỏi "có theo strike
 *  không" thay vì bắt người đọc tự soi danh sách khoá. */
const STRIKE_HINTS = ['strike', 'strike_price', 'price'];
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

  return {
    topLevelKeys,
    dataIsArray: isArray,
    rowCount: isArray ? rows.length : null,
    recordKeys,
    // Trả lời thẳng câu hỏi duy nhất đáng hỏi.
    looksPerStrike: strikeKeys.length > 0 && distinctStrikes > 1,
    strikeKeys,
    distinctStrikes,
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
      'Chỉ dò hình dạng, không phải tính năng. looksPerStrike = true nghĩa là ' +
      'endpoint đó có gamma theo từng strike, tức là vẽ được biểu đồ cột cho SPX.',
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
