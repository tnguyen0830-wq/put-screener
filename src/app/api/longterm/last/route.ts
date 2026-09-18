import { NextRequest, NextResponse } from 'next/server';
import { readLtScan, type LtUniverse } from '@/lib/lt-store';
import { requireUser } from '@/lib/userstore';

/** Kết quả quét Long-term gần nhất của một phạm vi, để mở lại tab là có ngay. */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });

  const u = req.nextUrl.searchParams.get('universe');
  const universe: LtUniverse = u === 'watchlist' ? 'watchlist' : 'sp500';
  /* Bật và tắt ô tích SMA200 là hai bảng khác nhau, lưu ở hai khoá khác
     nhau - nên phải hỏi đúng cái đang bật, không thì màn hình hiện bảng của
     lần quét kia dưới cái ô vừa gạt. */
  const aboveSma200 = req.nextUrl.searchParams.get('aboveSma200') === '1';
  try {
    return NextResponse.json({ scan: await readLtScan(universe, user, aboveSma200) });
  } catch (e: any) {
    /* Đọc hỏng thì NÓI RA. Trả `{scan:null}` kèm 200 sẽ hiện y hệt "chưa
       quét lần nào", mà hai thứ đó cần hai cách sửa khác nhau. */
    return NextResponse.json(
      { scan: null, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
