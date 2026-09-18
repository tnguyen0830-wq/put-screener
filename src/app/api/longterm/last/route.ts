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
  try {
    return NextResponse.json({ scan: await readLtScan(universe, user) });
  } catch (e: any) {
    /* Đọc hỏng thì NÓI RA. Trả `{scan:null}` kèm 200 sẽ hiện y hệt "chưa
       quét lần nào", mà hai thứ đó cần hai cách sửa khác nhau. */
    return NextResponse.json(
      { scan: null, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
