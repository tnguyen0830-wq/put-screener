import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol } from '@/lib/watchlist';
import { loadUwContext } from '@/lib/uwcontext';

/**
 * Dữ liệu Unusual Whales cho một mã ở tab Analyze — gọi RIÊNG, sau
 * `/api/analyze`, để một UW chậm hay đang 429 không kéo cả trang Analyze
 * theo. Mở cho người nhà như `/api/analyze`: hai request mỗi mã mỗi 10
 * phút, không phải nút đồng bộ cả rổ (#192). Không ghi Hoạt động — lượt
 * mở Analyze đã ghi `analyze` cho đúng hành động này.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbol');
  if (!raw) return NextResponse.json({ error: 'Thiếu tham số symbol' }, { status: 400 });
  const symbol = normalizeSymbol(raw);
  const ctx = await loadUwContext(symbol);
  return NextResponse.json(ctx, { headers: { 'Cache-Control': 'no-store' } });
}
