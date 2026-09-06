import { NextRequest, NextResponse } from 'next/server';
import { fullChainAdaptive, type ChainWindow } from '@/lib/schwab';
import {
  chainStatusFailed,
  computeGex,
  usableContractCount,
  gexDiagnosis,
  type GexCacheResponse,
  type GexLevelsResponse,
  type GexUwLevels,
} from '@/lib/gex';
import { uwConfigured } from '@/lib/unusualwhales';
import { uwGexLevels } from '@/lib/uwgex';
import { lastGexSnapshot, recordGexSnapshot } from '@/lib/gexhistory';

export const dynamic = 'force-dynamic';

/**
 * Xác nhận thật trên production (#86's error detail): Schwab /chains trả
 * 400 "Check Param Values" cho đúng ký hiệu "$SPX", trong khi "$VIX" và
 * "QQQ" chạy bình thường qua cùng một đoạn code - nên không phải lỗi chung
 * cho mọi mã có tiền tố $, mà là Schwab từ chối riêng "$SPX" cho endpoint
 * /chains (dù /quotes chấp nhận nó, TickerTape/volatility route đã dùng ổn).
 *
 * Chưa biết chắc Schwab muốn ký hiệu nào - "$SPX.X" (quy ước index option
 * kiểu TD Ameritrade cũ) và "SPX" (root option trần trụi, không tiền tố)
 * đều là khả năng hợp lý. Thay vì đoán đúng 1 lần rồi lại phải chờ người
 * dùng báo lỗi lần nữa, thử LẦN LƯỢT vài cách viết hợp lý - còn mã thường
 * (không có $) thì chỉ có đúng 1 lựa chọn nên không tốn thêm request nào.
 */
const INDEX_ROOTS = new Set(['SPX', 'VIX', 'NDX', 'RUT', 'DJX', 'XSP', 'SPXW']);

function indexSymbolCandidates(symbol: string): string[] {
  const bare = symbol.startsWith('$') ? symbol.slice(1) : symbol;
  // Nhận ra mã chỉ số kể cả khi người dùng gõ tay KHÔNG có "$" - chuyện đã
  // xảy ra thật: gõ "SPX" vào ô tìm mã chỉ thử đúng một cách viết rồi báo
  // lỗi, trong khi bấm nút preset ("$SPX") mới chạy đủ ba. Cùng một mã thì
  // phải cùng một hành vi, bất kể gõ kiểu nào.
  if (!INDEX_ROOTS.has(bare.toUpperCase())) return [symbol];
  return [`$${bare}`, `$${bare}.X`, bare];
}

type Attempt = { symbol: string; error: string };

async function fetchChainWithFallback(
  symbol: string
): Promise<{ chain: any; window: ChainWindow; attempts: Attempt[] }> {
  const candidates = indexSymbolCandidates(symbol);
  const attempts: Attempt[] = [];
  /* Chuỗi CÓ về nhưng rỗng ruột vẫn được giữ lại: nếu không cách viết nào
     cho dữ liệu thật thì vẫn trả cái này ra, để phần chẩn đoán nói được
     Schwab thực sự gửi gì thay vì chỉ báo "không cách viết nào chạy". */
  let empty: { chain: any; window: ChainWindow } | null = null;
  for (const candidate of candidates) {
    try {
      const { chain, window } = await fullChainAdaptive(candidate);
      /* 200 KHÔNG có nghĩa là có dữ liệu. Với $SPX, Schwab trả status=SUCCESS
         kèm 3600 hợp đồng qua 28 kỳ mà openInterest = 0 ở tất cả - đúng hình
         dạng một chuỗi đầy đủ, chỉ là rỗng ruột. Bản trước `return` ngay khi
         không văng lỗi, nên dừng luôn ở "$SPX" và KHÔNG BAO GIỜ thử "$SPX.X"
         hay "SPX" - hai cách viết vốn được thêm vào chính vì lý do này. Một
         chuỗi không dùng được cũng đáng thử cách viết tiếp theo y như một
         lỗi 400. */
      if (usableContractCount(chain) > 0) return { chain, window, attempts };
      if (!empty) empty = { chain, window };
      attempts.push({
        symbol: candidate,
        error: 'Schwab 200: chuỗi không có hợp đồng nào còn open interest',
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      attempts.push({ symbol: candidate, error: msg });
      // Chỉ đáng thử ký hiệu khác khi lỗi THẬT SỰ là "tham số sai" (400) -
      // REAUTH_REQUIRED hay lỗi mạng sẽ lặp lại y hệt cho mọi ký hiệu, thử
      // thêm chỉ tổ tốn request mà không đổi được gì.
      if (!/ 400:/.test(msg)) throw e;
    }
  }
  // Có chuỗi rỗng ruột thì trả nó ra chứ không ném lỗi: nhánh !profile sẽ
  // chạy gexDiagnosis() trên chính chuỗi đó và in ra con số thật (bao nhiêu
  // kỳ, bao nhiêu hợp đồng, bị loại vì gì) - thông tin đó mất hẳn nếu ném.
  if (empty) return { ...empty, attempts };
  const last: any = new Error(attempts[attempts.length - 1]?.error ?? 'unknown');
  last.attempts = attempts;
  throw last;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Thiếu tham số symbol' }, { status: 400 });
  }

  /* Gọi CẢ HAI nguồn song song, mỗi lần xem GEX.
     Trước đây UW chỉ được gọi khi Schwab đã hỏng, nên không bao giờ có hai
     con số cùng lúc để đối chiếu - mà đối chiếu tay giữa app và một trang
     GEX khác chính là thứ đã tìm ra lỗi định nghĩa call wall (#94). Gọi
     song song vừa cho phép so sánh liên tục, vừa để UW đỡ được NGAY khi
     Schwab hỏng thay vì phải chờ đúng mã lỗi 400/502.

     Chi phí quota UW chấp nhận được: /api/gex chỉ chạy khi người dùng mở
     màn hình có GEX, panel Heatmap tự làm mới 10 phút/lần - kịch bản xấu
     nhất (mở cả ngày) khoảng 144 request, so với hạn mức 30.000/ngày. Khác
     hẳn dark pool, thứ từng đốt hết quota vì gọi mỗi mã trong vòng lặp nền
     (xem darkpool.ts). */
  const [schwabRes, uwRes] = await Promise.allSettled([
    fetchChainWithFallback(symbol),
    uwConfigured() ? uwGexLevels(symbol) : Promise.resolve(null),
  ]);

  const uwLevels: GexUwLevels | null =
    uwRes.status === 'fulfilled' ? uwRes.value : null;
  const uwDetail =
    uwRes.status === 'rejected'
      ? `${String(uwRes.reason?.message ?? uwRes.reason)}${
          uwRes.reason?.body ? ` — ${String(uwRes.reason.body).slice(0, 150)}` : ''
        }`.slice(0, 200)
      : undefined;

  if (schwabRes.status === 'fulfilled') {
    const { chain, window } = schwabRes.value;
    // Luôn truyền lại đúng ký hiệu người dùng đã chọn (không phải biến thể
    // nội bộ như "$SPX.X" lỡ chạy được) - GexProfile.symbol chỉ để hiển thị,
    // lộ ra biến thể nội bộ sẽ làm nhãn trên UI trông sai/lạ.
    const profile = computeGex(chain, symbol);
    if (!profile) {
      /* Schwab trả về (không văng lỗi) nhưng computeGex() không dựng được gì.
         Liệt kê khoá cấp cao nhất là CHƯA ĐỦ - đã gặp đúng chuyện này với
         SPX: khoá có đủ cả callExpDateMap lẫn underlyingPrice mà vẫn không
         ra hợp đồng nào, và danh sách khoá không nói được vì sao. Đếm rõ số
         hợp đồng bị loại theo TỪNG lý do, kèm nguyên văn một hợp đồng thật
         và KIỂU dữ liệu của từng trường - chỉ có kiểu mới phân biệt được
         "Schwab không gửi gamma" với "Schwab gửi gamma dưới dạng chuỗi". */
      const d = gexDiagnosis(chain);
      /* Schwab nói thẳng là hỏng (HTTP 200 nhưng status != SUCCESS) thì đó là
         một LOẠI lỗi khác hẳn "chuỗi có mà không tính được", và cách sửa cũng
         khác: một bên là quyền dữ liệu/mã, bên kia là cách app đọc trường.
         Gộp chung thành một câu là tự làm mù mình. */
      const failedStatus = chainStatusFailed(chain);
      const meta =
        `status=${d.status ?? '?'}, numberOfContracts=${d.numberOfContracts ?? '?'}, ` +
        `isIndex=${d.isIndex ?? '?'}, isDelayed=${d.isDelayed ?? '?'}, ` +
        `truncated=${d.isChainTruncated ?? '?'}, assetMainType=${d.assetMainType ?? '?'}`;
      const why =
        `${meta} · spot=${d.spot ?? 'thiếu'} · ${d.expirations} kỳ · ` +
        `${d.contracts} hợp đồng · loại: gamma thiếu ${d.droppedNoGamma}, ` +
        `gamma=-999 ${d.droppedSentinelGamma}, OI=0 ${d.droppedNoOi}, ` +
        `strike thiếu ${d.droppedNoStrike}` +
        (d.sample ? ` · mẫu: ${d.sample}` : '');
      /* Chuỗi vô dụng cũng là "Schwab không dùng được" - phải xuống cấp y hệt
         lúc Schwab văng lỗi, chứ không trả thẳng lỗi và vứt đi mức UW vừa lấy
         được. Đây chính là chỗ SPX bị mất đường sống ở #96. */
      const tried = schwabRes.value.attempts.length
        ? ` · đã thử: ${schwabRes.value.attempts.map((a) => a.symbol).join(', ')}`
        : '';
      return schwabUnusable(symbol, why + tried, uwLevels, uwDetail, {
        error: failedStatus
          ? `Schwab từ chối chuỗi quyền chọn (status ${failedStatus})`
          : 'Chuỗi quyền chọn không đủ dữ liệu gamma',
        // Danh sách ký hiệu đã thử phải có ở CẢ nhánh báo lỗi, không chỉ nhánh
        // rơi sang UW: đây đúng là lúc người đọc cần biết đã thử những gì.
        detail: why + tried,
        status: 404,
      });
    }

    await recordGexSnapshot(symbol, {
      at: new Date().toISOString(),
      spot: profile.spot,
      schwab: {
        putWall: profile.putWall,
        callWall: profile.callWall,
        zeroGamma: profile.zeroGamma,
        absGamma: profile.absGamma,
        totalGex: profile.totalGex,
      },
      uw: uwLevels,
    });

    return NextResponse.json({
      ...profile,
      chainWindow: window,
      uw: uwLevels,
      uwDetail,
    });
  }

  const err: any = schwabRes.reason;
  const msg = String(err?.message ?? err);
  const reauth = msg.includes('REAUTH_REQUIRED');

  /* Hết phiên Schwab thì PHẢI hiện đúng là hết phiên, kể cả khi UW vẫn trả
     số. Lặng lẽ hiện số của UW sẽ che mất việc cả app đang mất kết nối
     Schwab - người dùng cần bấm kết nối lại, không cần một bảng GEX trông
     vẫn bình thường. */
  if (reauth) {
    return NextResponse.json({ error: 'Phiên Schwab hết hạn' }, { status: 401 });
  }

  return schwabUnusable(symbol, detailOf(msg, err?.attempts), uwLevels, uwDetail, {
    error: 'Không lấy được chuỗi quyền chọn',
    detail: `Schwab: ${detailOf(msg, err?.attempts)}${uwDetail ? ` · UW: ${uwDetail}` : ''}`,
    status: 500,
  });
}

/**
 * Schwab không dùng được, vì BẤT KỲ lý do gì - văng lỗi, hay trả về một
 * chuỗi mà computeGex() không dựng được gì. Cùng một bậc thang xuống cấp:
 * mức của UW (nếu đang có trong tay) → bản đọc cũ trên đĩa → báo lỗi.
 *
 * Gom về một chỗ là để sửa đúng lỗi đã gây ra ở #95/#96: nhánh "Schwab trả
 * về nhưng chuỗi vô dụng" lúc đó VỨT ĐI mức UW vừa lấy song song rồi trả
 * thẳng 404. Trước đó SPX đi đường Schwab-văng-lỗi nên vẫn được UW đỡ và
 * người dùng vẫn xem được; #96 làm Schwab thôi văng lỗi (giờ nó trả về một
 * chuỗi rỗng/vô dụng), thế là SPX rơi sang đúng cái nhánh không có UW đỡ và
 * biến thành màn hình lỗi. Một bậc thang duy nhất thì không thể lệch nhau
 * kiểu đó nữa.
 */
async function schwabUnusable(
  symbol: string,
  schwabDetail: string,
  uwLevels: GexUwLevels | null,
  uwDetail: string | undefined,
  fallbackError: { error: string; detail: string; status: number }
) {
  if (uwLevels) {
    await recordGexSnapshot(symbol, {
      at: new Date().toISOString(),
      spot: null,
      schwab: null,
      uw: uwLevels,
    });
    const payload: GexLevelsResponse = {
      source: 'uw',
      symbol,
      levels: uwLevels,
      schwabDetail: schwabDetail.slice(0, 300),
    };
    return NextResponse.json(payload);
  }

  /* Cả hai nguồn cùng chết. Bản đọc gần nhất trên đĩa còn hơn màn hình
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
      uw: cached.uw,
      schwabDetail,
      uwDetail,
    };
    return NextResponse.json(payload);
  }

  return NextResponse.json(
    { error: fallbackError.error, detail: fallbackError.detail },
    { status: fallbackError.status }
  );

}

/** `attempts` (khi có) liệt kê MỌI ký hiệu đã thử qua fetchChainWithFallback()
 *  và lỗi thật của từng cái - nếu cả 3 cách viết đều sai thì thấy ngay cả 3,
 *  không phải đoán tiếp lần 4. Gộp gọn: mỗi lần thử chỉ còn "KÝ_HIỆU→MÃ_LỖI",
 *  rồi kèm đúng MỘT lỗi thô đầy đủ ở cuối. Bản trước nối nguyên văn cả ba lỗi
 *  rồi cắt ở 500 ký tự - ba khối JSON gần giống hệt nhau nên phần bị cắt lại
 *  đúng là phần cần biết (ký hiệu thứ ba có chạy không). */
function detailOf(msg: string, attempts?: Attempt[]): string {
  if (!attempts) return msg.slice(0, 300);
  const statusOf = (err: string) => err.match(/ (\d{3}):/)?.[1] ?? '?';
  return `${attempts.map((a) => `${a.symbol}→${statusOf(a.error)}`).join(', ')} · ${
    attempts[attempts.length - 1]?.error ?? ''
  }`.slice(0, 400);
}
