import { NextRequest, NextResponse } from 'next/server';
import { fullChainAdaptive, type ChainWindow } from '@/lib/schwab';
import { computeGex, type GexLevelsResponse } from '@/lib/gex';
import { uwConfigured } from '@/lib/unusualwhales';
import { uwGexLevels } from '@/lib/uwgex';

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

  try {
    // Cửa sổ ngày/strike do fullChainAdaptive() quyết định: bắt đầu rộng
    // (60 ngày, mọi strike) rồi tự hẹp lại nếu Schwab từ chối vì phản hồi
    // quá lớn - xem chú thích ở schwab.ts.
    const { chain, window } = await fetchChainWithFallback(symbol);
    // Luôn truyền lại đúng ký hiệu người dùng đã chọn (không phải biến thể
    // nội bộ như "$SPX.X" lỡ chạy được) - GexProfile.symbol chỉ để hiển thị,
    // lộ ra biến thể nội bộ sẽ làm nhãn trên UI trông sai/lạ.
    const profile = computeGex(chain, symbol);
    if (!profile) {
      // Cùng lý do thêm `detail` ở nhánh catch bên dưới: Schwab trả về
      // (không văng lỗi) nhưng computeGex() không tính ra gì - có thể thiếu
      // spot, thiếu callExpDateMap/putExpDateMap, hoặc chuỗi rỗng thật. Ghi
      // lại đúng các khoá cấp cao nhất của response thay vì chỉ nói "không
      // đủ dữ liệu" - cùng idiom với insiders.ts's rawKeys.
      return NextResponse.json(
        {
          error: 'Chuỗi quyền chọn không đủ dữ liệu gamma',
          detail: `topLevelKeys: ${Object.keys(chain ?? {}).join(', ') || '(rỗng)'}`,
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ ...profile, chainWindow: window });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const reauth = msg.includes('REAUTH_REQUIRED');

    // Schwab đã thử hết mọi cách viết mà vẫn 400 - với SPX thì đây là kết
    // cục đã xác nhận trên production (#86/#88/#90), không phải chuyện đoán
    // nữa. Quay sang lấy các mức của Unusual Whales thay vì để bảng trống.
    // KHÔNG áp dụng cho lỗi phiên: REAUTH_REQUIRED phải hiện đúng là hết
    // phiên để người dùng bấm kết nối lại, chứ không âm thầm lấy số nơi
    // khác rồi che mất việc cả app đang mất kết nối Schwab.
    // Cả hai kiểu Schwab từ chối đều đáng quay sang UW: 400 (từ chối tham
    // số) và 502 TooBigBody vẫn còn sau khi đã thu hẹp hết mức
    // (fullChainAdaptive đã thử 60d → 21d/120 → 7d/60 rồi mới ném ra đây).
    const schwabRefused = / 400:/.test(msg) || /TooBigBody|Body buffer overflow/i.test(msg);
    if (!reauth && schwabRefused && uwConfigured()) {
      try {
        const levels = await uwGexLevels(symbol);
        const payload: GexLevelsResponse = {
          source: 'uw',
          symbol,
          levels,
          schwabDetail: msg.slice(0, 200),
        };
        return NextResponse.json(payload);
      } catch (uwErr: any) {
        // UW cũng hỏng: nói ra CẢ HAI lý do. Chỉ báo mỗi lỗi UW sẽ khiến
        // người đọc tưởng Schwab vẫn ổn, mà thật ra Schwab hỏng trước.
        const uwMsg = String(uwErr?.message ?? uwErr);
        const uwBody = uwErr?.body ? ` — ${String(uwErr.body).slice(0, 150)}` : '';
        return NextResponse.json(
          {
            error: 'Không lấy được chuỗi quyền chọn',
            detail: `Schwab: ${msg.slice(0, 150)} · UW: ${uwMsg}${uwBody}`,
          },
          { status: 502 }
        );
      }
    }
    // Chuỗi chung chung "Không lấy được chuỗi quyền chọn" từng nuốt mất lý do
    // thật Schwab trả về - đúng cái bẫy self-diagnosing idiom của app này
    // muốn tránh (CRWD's earnings đã bị bỏ sót đúng kiểu này). schwab.ts's
    // get() đã ném ra `Schwab ${path} ${status}: ${body}` sẵn - chỉ cần
    // không vứt nó đi. `attempts` (khi có) liệt kê MỌI ký hiệu đã thử qua
    // fetchChainWithFallback() và lỗi thật của từng cái - nếu cả 3 cách viết
    // đều sai thì thấy ngay cả 3, không phải đoán tiếp lần 4.
    const attempts: Attempt[] | undefined = e?.attempts;
    // Gộp gọn: mỗi lần thử chỉ còn "KÝ_HIỆU→MÃ_LỖI", rồi kèm đúng MỘT lỗi
    // thô đầy đủ ở cuối. Bản trước nối nguyên văn cả ba lỗi rồi cắt ở 500 ký
    // tự - ba khối JSON gần giống hệt nhau nên phần bị cắt lại đúng là phần
    // cần biết (ký hiệu thứ ba có chạy không).
    const statusOf = (err: string) => err.match(/ (\d{3}):/)?.[1] ?? '?';
    const detail = reauth
      ? undefined
      : attempts
        ? `${attempts.map((a) => `${a.symbol}→${statusOf(a.error)}`).join(', ')} · ${
            attempts[attempts.length - 1]?.error ?? ''
          }`.slice(0, 400)
        : msg.slice(0, 300);
    return NextResponse.json(
      {
        error: reauth ? 'Phiên Schwab hết hạn' : 'Không lấy được chuỗi quyền chọn',
        detail,
      },
      { status: reauth ? 401 : 500 }
    );
  }
}
