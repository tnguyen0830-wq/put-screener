import { NextRequest, NextResponse } from 'next/server';
import { fullChain } from '@/lib/schwab';
import { computeGex } from '@/lib/gex';

export const dynamic = 'force-dynamic';

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Thiếu tham số symbol' }, { status: 400 });
  }

  try {
    // Gamma concentrates in near expirations, so a 60-day window captures the
    // walls that actually matter without pulling LEAPS noise into the profile.
    const chain = await fullChain(symbol, addDays(0), addDays(60));
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
    return NextResponse.json(profile);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const reauth = msg.includes('REAUTH_REQUIRED');
    // Chuỗi chung chung "Không lấy được chuỗi quyền chọn" từng nuốt mất lý do
    // thật Schwab trả về - đúng cái bẫy self-diagnosing idiom của app này
    // muốn tránh (CRWD's earnings đã bị bỏ sót đúng kiểu này). schwab.ts's
    // get() đã ném ra `Schwab ${path} ${status}: ${body}` sẵn - chỉ cần
    // không vứt nó đi. Cắt ngắn vì body lỗi của Schwab đôi khi là cả khối
    // JSON dài. Phát hiện thật: symbol="$SPX" lỗi ở đây trong khi "$VIX"
    // (cũng có tiền tố $) và "QQQ" chạy bình thường - không phải lỗi phiên
    // (không phải REAUTH_REQUIRED), rất có thể Schwab từ chối đúng ký hiệu
    // "$SPX" cho endpoint /chains dù chấp nhận nó cho /quotes.
    return NextResponse.json(
      {
        error: reauth ? 'Phiên Schwab hết hạn' : 'Không lấy được chuỗi quyền chọn',
        detail: reauth ? undefined : msg.slice(0, 300),
      },
      { status: reauth ? 401 : 500 }
    );
  }
}
