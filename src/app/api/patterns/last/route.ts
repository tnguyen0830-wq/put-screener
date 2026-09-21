import { NextRequest, NextResponse } from 'next/server';
import { readPatScan } from '@/lib/pat-store';
import { requireUser } from '@/lib/userstore';

/** Kết quả quét mẫu hình gần nhất của một phạm vi — mở lại tab là có ngay. */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });
  const universe = req.nextUrl.searchParams.get('universe') === 'sp500' ? 'sp500' : 'watchlist';
  try {
    return NextResponse.json({ scan: await readPatScan(universe, user) });
  } catch (e: any) {
    /* Đọc kho hỏng ≠ chưa quét lần nào — hai cách sửa khác nhau. */
    return NextResponse.json({ scan: null, error: String(e?.message ?? e) }, { status: 500 });
  }
}
