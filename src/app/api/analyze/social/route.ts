import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol } from '@/lib/watchlist';
import { basketEntry } from '@/lib/moveload';
import { cleanCompanyName } from '@/lib/gnews';
import { socialFor } from '@/lib/social';

/**
 * StockTwits + Reddit về một mã cho tab Analyze — gọi RIÊNG, sau
 * `/api/analyze`, để hai nguồn chậm hay bị chặn không kéo cả trang theo
 * (khuôn `/api/analyze/x`). Mỗi nguồn một request mỗi mã mỗi 30 phút, cache
 * cả khi lỗi (`lib/social.ts`). Mở cho người nhà như `/api/analyze`.
 *
 * Tên công ty lấy từ rổ S&P 500 trước (tên sạch); mã ngoài rổ thì nhận tên
 * trang đang hiện (`name=`), cắt ngắn — Reddit cần tên để tìm được mã trùng
 * từ thông dụng (ALL, ON, IT) mà không ra rác.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbol');
  if (!raw) return NextResponse.json({ error: 'Thiếu tham số symbol' }, { status: 400 });
  const symbol = normalizeSymbol(raw);
  const entry = await basketEntry(symbol);
  const given = (req.nextUrl.searchParams.get('name') ?? '').slice(0, 80);
  const name = cleanCompanyName(entry?.name ?? given) || null;
  const r = await socialFor(symbol, name);
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
}
