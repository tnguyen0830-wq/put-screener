import { NextRequest, NextResponse } from 'next/server';
import { type GexCacheResponse, type GexLevelsResponse, type GexUwLevels } from '@/lib/gex';
import { GexChainError, loadGexChain } from '@/lib/gexchain';
import { uwConfigured } from '@/lib/unusualwhales';
import { uwGexLevels } from '@/lib/uwgex';
import { lastGexSnapshot, recordGexSnapshot } from '@/lib/gexhistory';

export const dynamic = 'force-dynamic';

/**
 * Bậc thang nguồn cho GEX, từ trên xuống:
 *
 *   Schwab (mọi cách viết ký hiệu) → CBOE (feed công khai trễ 15 phút)
 *   → mức của Unusual Whales → bản đọc cũ trên đĩa → lỗi
 *
 * Hai bậc đầu nằm trong lib/gexchain.ts vì /api/tradebrief cũng cần đúng
 * chuỗi đó (phân tích AI dựng kèo từ giá từng hợp đồng). Hai bậc sau là
 * việc của route này: UW chỉ có 4 mức, không vẽ được cột; đĩa là số cũ.
 *
 * Riêng HẾT PHIÊN Schwab thì không xuống bậc nào cả - trả 401 thẳng. Lặng
 * lẽ hiện số của CBOE/UW lúc đó sẽ che mất việc cả app đang mất kết nối
 * Schwab; người dùng cần bấm kết nối lại, không cần một bảng GEX trông vẫn
 * bình thường (#101).
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Thiếu tham số symbol' }, { status: 400 });
  }

  /* Gọi chuỗi (Schwab→CBOE) VÀ UW song song, mỗi lần xem GEX.
     Trước đây UW chỉ được gọi khi Schwab đã hỏng, nên không bao giờ có hai
     con số cùng lúc để đối chiếu - mà đối chiếu tay giữa app và một trang
     GEX khác chính là thứ đã tìm ra lỗi định nghĩa call wall (#94). Gọi
     song song vừa cho phép so sánh liên tục, vừa để UW đỡ được NGAY khi
     cả Schwab lẫn CBOE hỏng.

     Chi phí quota UW chấp nhận được: /api/gex chỉ chạy khi người dùng mở
     màn hình có GEX, panel Heatmap tự làm mới 10 phút/lần - kịch bản xấu
     nhất (mở cả ngày) khoảng 144 request, so với hạn mức 30.000/ngày. Khác
     hẳn dark pool, thứ từng đốt hết quota vì gọi mỗi mã trong vòng lặp nền
     (xem darkpool.ts). */
  const [chainRes, uwRes] = await Promise.allSettled([
    loadGexChain(symbol),
    uwConfigured() ? uwGexLevels(symbol) : Promise.resolve(null),
  ]);

  const uwLevels: GexUwLevels | null = uwRes.status === 'fulfilled' ? uwRes.value : null;
  const uwDetail =
    uwRes.status === 'rejected'
      ? `${String(uwRes.reason?.message ?? uwRes.reason)}${
          uwRes.reason?.body ? ` — ${String(uwRes.reason.body).slice(0, 150)}` : ''
        }`.slice(0, 200)
      : undefined;

  if (chainRes.status === 'fulfilled') {
    const { profile, window, source, schwabDetail, cboeAsOf, cboeSymbol } = chainRes.value;
    const levels = {
      putWall: profile.putWall,
      callWall: profile.callWall,
      zeroGamma: profile.zeroGamma,
      absGamma: profile.absGamma,
      totalGex: profile.totalGex,
    };
    // Bản đọc qua CBOE ghi vào ô `cboe`, KHÔNG ghi vào ô `schwab`: lịch sử
    // là để thấy nguồn nào chết khi nào, ghi lẫn là mất đúng thông tin đó.
    await recordGexSnapshot(symbol, {
      at: new Date().toISOString(),
      spot: profile.spot,
      schwab: source === 'schwab' ? levels : null,
      cboe: source === 'cboe' ? levels : null,
      uw: uwLevels,
    });

    return NextResponse.json({
      ...profile,
      chainWindow: window,
      uw: uwLevels,
      uwDetail,
      ...(source === 'cboe'
        ? { source: 'cboe', cboeAsOf: cboeAsOf ?? null, cboeSymbol, schwabDetail: clip(schwabDetail ?? '') }
        : {}),
    });
  }

  const err = chainRes.reason;
  if (err instanceof GexChainError) {
    if (err.reauth) {
      return NextResponse.json({ error: 'Phiên Schwab hết hạn' }, { status: 401 });
    }
    return chainUnusable(symbol, err.schwabDetail, err.cboeDetail, uwLevels, uwDetail, {
      error: err.message,
      status: err.failedStatus ? 404 : 500,
    });
  }
  // Không phải GexChainError: lỗi bất ngờ (bug) trong bậc thang. Vẫn đi
  // cùng đường xuống cấp, nhưng nói rõ nó là gì.
  const msg = String((err as any)?.message ?? err);
  if (msg.includes('REAUTH_REQUIRED')) {
    return NextResponse.json({ error: 'Phiên Schwab hết hạn' }, { status: 401 });
  }
  return chainUnusable(symbol, msg.slice(0, 300), 'không thử (lỗi trước khi tới CBOE)', uwLevels, uwDetail, {
    error: 'Không lấy được chuỗi quyền chọn',
    status: 500,
  });
}

/** Cắt bớt cho vừa màn hình, nhưng ĐỂ LẠI dấu "…": một chuỗi đứt ngang mà
 *  không có dấu gì thì đọc thành "Schwab chỉ gửi tới đó", trong khi thật ra
 *  là app tự cắt. Giới hạn nới rộng vì đây là phần chẩn đoán - thứ duy nhất
 *  nói được vì sao không tính ra GEX. */
const DETAIL_MAX = 600;
const clip = (s: string) => (s.length > DETAIL_MAX ? `${s.slice(0, DETAIL_MAX)}…` : s);

/**
 * Cả Schwab lẫn CBOE đều không cho chuỗi, vì BẤT KỲ lý do gì. Phần còn lại
 * của bậc thang: mức của UW (nếu đang có trong tay) → bản đọc cũ trên đĩa
 * → báo lỗi, và lỗi thì mang lý do THẬT của cả ba nguồn, không gộp.
 *
 * Gom về một chỗ là để sửa đúng lỗi đã gây ra ở #95/#96: nhánh "Schwab trả
 * về nhưng chuỗi vô dụng" lúc đó VỨT ĐI mức UW vừa lấy song song rồi trả
 * thẳng 404. Một bậc thang duy nhất thì không thể lệch nhau kiểu đó nữa.
 */
async function chainUnusable(
  symbol: string,
  schwabDetail: string,
  cboeDetail: string,
  uwLevels: GexUwLevels | null,
  uwDetail: string | undefined,
  fallbackError: { error: string; status: number }
) {
  if (uwLevels) {
    await recordGexSnapshot(symbol, {
      at: new Date().toISOString(),
      spot: null,
      schwab: null,
      cboe: null,
      uw: uwLevels,
    });
    const payload: GexLevelsResponse = {
      source: 'uw',
      symbol,
      levels: uwLevels,
      schwabDetail: clip(schwabDetail),
      cboeDetail: clip(cboeDetail),
    };
    return NextResponse.json(payload);
  }

  /* Cả ba nguồn cùng chết. Bản đọc gần nhất trên đĩa còn hơn màn hình
     trống - nhưng trả về dưới một `source` riêng kèm giờ đọc, để giao diện
     buộc phải nói ra rằng đây là số cũ. */
  const cached = await lastGexSnapshot(symbol);
  if (cached) {
    const payload: GexCacheResponse = {
      source: 'cache',
      symbol,
      at: cached.at,
      spot: cached.spot,
      schwab: cached.schwab,
      cboe: cached.cboe ?? null,
      uw: cached.uw,
      schwabDetail: clip(schwabDetail),
      cboeDetail: clip(cboeDetail),
      uwDetail,
    };
    return NextResponse.json(payload);
  }

  /* Trước đây nhánh chuỗi-rỗng-ruột chỉ đưa lý do của Schwab vào `detail`
     và bỏ rơi lý do UW - nên khi UW chết (key trial hết hạn) màn hình không
     nói vì sao. Giờ cả ba nguồn đều có mặt. */
  return NextResponse.json(
    {
      error: fallbackError.error,
      detail: `Schwab: ${clip(schwabDetail)} · CBOE: ${clip(cboeDetail)}${
        uwDetail ? ` · UW: ${uwDetail}` : ''
      }`,
    },
    { status: fallbackError.status }
  );
}
