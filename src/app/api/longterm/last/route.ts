import { NextRequest, NextResponse } from 'next/server';
import { readLtScan, type LtUniverse } from '@/lib/lt-store';
import { parseCaps } from '@/lib/marketcap';
import type { Quadrant } from '@/lib/rrg';
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
  const caps = parseCaps(req.nextUrl.searchParams.get('caps'));
  /* Cùng luật chuẩn hoá với route quét: đủ bốn góc = không lọc, và thứ tự
     không được quyết định ô nhớ nào bị đọc. */
  const ALL_Q: Quadrant[] = ['leading', 'weakening', 'lagging', 'improving'];
  const picked = (req.nextUrl.searchParams.get('rrg') ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x): x is Quadrant => (ALL_Q as string[]).includes(x));
  const quadrants =
    picked.length === ALL_Q.length ? [] : ALL_Q.filter((q) => picked.includes(q));
  try {
    return NextResponse.json({
      scan: await readLtScan(universe, user, aboveSma200, caps, quadrants),
    });
  } catch (e: any) {
    /* Đọc hỏng thì NÓI RA. Trả `{scan:null}` kèm 200 sẽ hiện y hệt "chưa
       quét lần nào", mà hai thứ đó cần hai cách sửa khác nhau. */
    return NextResponse.json(
      { scan: null, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
