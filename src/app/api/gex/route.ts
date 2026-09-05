import { NextRequest, NextResponse } from 'next/server';
import { fullChainAdaptive, type ChainWindow } from '@/lib/schwab';
import {
  computeGex,
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
  for (const candidate of candidates) {
    try {
      const { chain, window } = await fullChainAdaptive(candidate);
      return { chain, window, attempts };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      attempts.push({ symbol: candidate, error: msg });
      // Chỉ đáng thử ký hiệu khác khi lỗi THẬT SỰ là "tham số sai" (400) -
      // REAUTH_REQUIRED hay lỗi mạng sẽ lặp lại y hệt cho mọi ký hiệu, thử
      // thêm chỉ tổ tốn request mà không đổi được gì.
      if (!/ 400:/.test(msg)) throw e;
    }
  }
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
      // Cùng lý do thêm `detail` ở nhánh lỗi bên dưới: Schwab trả về (không
      // văng lỗi) nhưng computeGex() không tính ra gì - có thể thiếu spot,
      // thiếu callExpDateMap/putExpDateMap, hoặc chuỗi rỗng thật. Ghi lại
      // đúng các khoá cấp cao nhất của response thay vì chỉ nói "không đủ dữ
      // liệu" - cùng idiom với insiders.ts's rawKeys.
      return NextResponse.json(
        {
          error: 'Chuỗi quyền chọn không đủ dữ liệu gamma',
          detail: `topLevelKeys: ${Object.keys(chain ?? {}).join(', ') || '(rỗng)'}`,
        },
        { status: 404 }
      );
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
      schwabDetail: msg.slice(0, 200),
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
      schwabDetail: detailOf(msg, err?.attempts),
      uwDetail,
    };
    return NextResponse.json(payload);
  }

  /* Chuỗi chung chung "Không lấy được chuỗi quyền chọn" từng nuốt mất lý do
     thật Schwab trả về - đúng cái bẫy self-diagnosing idiom của app này muốn
     tránh (CRWD's earnings đã bị bỏ sót đúng kiểu này). schwab.ts's get() đã
     ném ra `Schwab ${path} ${status}: ${body}` sẵn - chỉ cần không vứt nó đi. */
  return NextResponse.json(
    {
      error: 'Không lấy được chuỗi quyền chọn',
      detail: `Schwab: ${detailOf(msg, err?.attempts)}${uwDetail ? ` · UW: ${uwDetail}` : ''}`,
    },
    { status: 500 }
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
