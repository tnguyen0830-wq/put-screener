import { NextRequest, NextResponse } from 'next/server';
import { uwGet, uwConfigured } from '@/lib/unusualwhales';
import { uwTicker } from '@/lib/uwgex';
import { describeShape } from '@/lib/uwshape';

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
 * LẦN ĐO ĐẦU (2026-09-06) TRẢ LỜI KHÔNG — CHO ĐÚNG BA ENDPOINT ĐÃ HỎI, và
 * đó là chỗ kết luận bị nói quá. `greek-exposure` khoá theo `date`,
 * `spot-exposures` khoá theo `start_time` (mỗi mốc đúng 1 giá), `gex-levels`
 * cho 4 mức. Từ ba cái đó đã viết thành "UW không có gamma theo strike" —
 * một lời khẳng định về CẢ catalogue rút ra từ ba mẫu.
 *
 * Bề mặt thứ HAI nói ngược lại: chính trang web UW vẽ tab gamma/delta theo
 * strike, thời gian thực — chủ app nhìn thấy và hỏi lại. Tức backend của UW
 * CÓ, và câu chưa ai đo là API trong gói của chủ app có trả ra hay không.
 * Đúng hình dạng #108: suy từ một bề mặt, bề mặt thứ hai lật ngược.
 *
 * Nên vòng đo này thêm các endpoint ỨNG VIÊN theo strike. Tên của chúng là
 * NHỚ ĐƯỢC từ tài liệu, không phải đo được — và điều đó KHÔNG sao, vì ở một
 * probe thì chính lời từ chối là phát hiện: 404 nghĩa là tên sai hoặc không
 * tồn tại, 403 nghĩa là có thật nhưng gói không mở, 200 nghĩa là có và đọc
 * được hình dạng ngay tại đó. Ba kết luận khác nhau, ba cách xử lý khác
 * nhau, nên chúng KHÔNG bao giờ được gộp thành một chữ "hỏng".
 *
 * CỐ TÌNH không trả về nguyên payload: chuỗi quyền chọn có thể hàng nghìn
 * dòng, mà thứ cần biết chỉ là các khoá và kiểu dữ liệu. Khoá API không bao
 * giờ đi ra ngoài - uwGet() giữ nó ở phía máy chủ.
 */
export const dynamic = 'force-dynamic';

type Probe = { name: string; path: string; params?: Record<string, string> };

const ENDPOINTS = (t: string): Probe[] => [
  { name: 'greek-exposure', path: `/api/stock/${encodeURIComponent(t)}/greek-exposure` },
  { name: 'spot-exposures', path: `/api/stock/${encodeURIComponent(t)}/spot-exposures` },
  // Cái app đang dùng, để đối chiếu trong cùng một lần đo.
  { name: 'gex-levels', path: `/api/stock/${encodeURIComponent(t)}/gex-levels` },

  /* ỨNG VIÊN THEO STRIKE — tên nhớ được, chưa đo. Xếp theo mức QUYẾT ĐỊNH,
     không theo khả năng tồn tại: cái đầu tiên trả 200 kèm `looksPerStrike`
     là cái đủ để thay CBOE cho SPX, và đọc tới đó là dừng được.

     Mỗi cái hỏi một câu khác nhau, nên một cái 404 KHÔNG làm mấy cái kia vô
     nghĩa — `allSettled` bên dưới giữ chúng độc lập. Chi phí một lượt bấm
     là đúng số endpoint trong danh sách này (khoảng chục request) trên hạn
     mức 30.000/ngày, tức không đáng kể; cái đắt là gọi theo TỪNG MÃ trong
     vòng lặp nền, và đó là thứ #78 đã đốt sạch hạn mức, không phải đây. */
  {
    name: 'greek-exposure/strike',
    path: `/api/stock/${encodeURIComponent(t)}/greek-exposure/strike`,
  },
  {
    name: 'greek-exposure/expiry',
    path: `/api/stock/${encodeURIComponent(t)}/greek-exposure/expiry`,
  },
  {
    name: 'greek-exposure/strike-expiry',
    path: `/api/stock/${encodeURIComponent(t)}/greek-exposure/strike-expiry`,
  },
  {
    name: 'spot-exposures/strike',
    path: `/api/stock/${encodeURIComponent(t)}/spot-exposures/strike`,
  },
  { name: 'oi-per-strike', path: `/api/stock/${encodeURIComponent(t)}/oi-per-strike` },
  { name: 'greeks', path: `/api/stock/${encodeURIComponent(t)}/greeks` },
  /* Chuỗi quyền chọn thô. Nếu cái này mở thì mọi panel hiện có chạy được
     NGUYÊN SI trên nó — `mmexposure.ts` và `gex.ts` chỉ cần greek + open
     interest theo hợp đồng, y như `cboeToChain()` đã làm cho CBOE. `limit`
     để một chuỗi SPX hàng chục nghìn dòng không nuốt cả câu trả lời; hình
     dạng đọc được từ vài dòng. */
  {
    name: 'option-chains',
    path: `/api/stock/${encodeURIComponent(t)}/option-chains`,
    params: { limit: '50' },
  },
  {
    name: 'option-contracts',
    path: `/api/stock/${encodeURIComponent(t)}/option-contracts`,
    params: { limit: '50' },
  },
  /* Tab Tin tức đọc `news/headlines` (newsfeed.ts, `parseUwNews`) theo tên
     trường NHỚ ĐƯỢC từ tài liệu (`headline`, `source`, `created_at`, `url`,
     `is_major`). Bước này in khoá + kiểu thật để sửa `parseUwNews` theo cái
     đo được. Đường dẫn không phụ thuộc mã; `limit=5` là đủ để đọc hình
     dạng. Endpoint không có trong gói thì UW tự nói bằng 403/404 — chính
     lời từ chối là phát hiện. */
  { name: 'news-headlines', path: `/api/news/headlines?limit=5` },
];

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
    ENDPOINTS(ticker).map(async (e) => ({
      name: e.name,
      ...describeShape(await uwGet(e.path, e.params ?? {})),
    }))
  );

  return NextResponse.json({
    ticker,
    note:
      'Chỉ dò hình dạng, không phải tính năng. ĐỌC `usableForExposure` TRƯỚC: ' +
      'true = endpoint đó đủ dựng ba panel Phơi nhiễm MM (theo strike + có ' +
      'gamma + có OI hoặc khối lượng để nhân), tức thay được CBOE cho SPX và ' +
      'bỏ được độ trễ 15 phút. looksPerStrike = có trường strike với nhiều giá ' +
      'khác nhau. deltaKeys rỗng chỉ mất panel 3 (delta theo kỳ), không mất ' +
      'panel 1 và 2. Endpoint ok:false thì đọc `status`: 404 = tên sai hoặc ' +
      'không tồn tại (tên là NHỚ ĐƯỢC, chưa đo), 403 = có thật nhưng gói chưa ' +
      'mở, 401 = khoá hỏng. Ba thứ đó ba cách xử lý khác nhau. ' +
      'curveShape.looksLikePriceCurve = nhiều mức GIÁ trong cùng một mốc thời ' +
      'gian (đường cong theo giá, khác chuỗi thời gian của giá spot).',
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
