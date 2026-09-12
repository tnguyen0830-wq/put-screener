import { NextRequest, NextResponse } from 'next/server';
import { readWatchlist, writeWatchlist } from '@/lib/watchlist';
import { currentUser } from '@/lib/users';

/**
 * Watchlist của CHÍNH người đang đăng nhập - xem lý do tách theo người ở
 * lib/watchlist.ts. Danh tính lấy từ header do middleware gắn, không phải
 * từ body, nên không ai đọc hay sửa được danh sách của người khác.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return NextResponse.json({ symbols: await readWatchlist(currentUser(req)) });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (!Array.isArray(body?.symbols)) {
    return NextResponse.json({ error: 'Cần mảng symbols' }, { status: 400 });
  }
  if (body.symbols.length > 200) {
    return NextResponse.json(
      { error: 'Watchlist tối đa 200 mã' },
      { status: 400 }
    );
  }
  return NextResponse.json({
    symbols: await writeWatchlist(body.symbols, currentUser(req)),
  });
}
