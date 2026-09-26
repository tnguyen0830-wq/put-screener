import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol } from '@/lib/watchlist';
import { xPostsFor } from '@/lib/xsymbol';

/**
 * Bài đăng X về một mã cho tab Analyze — gọi RIÊNG, sau `/api/analyze`, để
 * X chậm hay lỗi không kéo cả trang theo (khuôn `/api/analyze/uw`). Một
 * request mỗi mã mỗi 30 phút (`lib/xsymbol.ts`), không có token thì 0
 * request. Mở cho người nhà như `/api/analyze`: X tính tiền theo lượng đọc,
 * nhưng cache theo mã giữ cho hai người mở cùng một mã chỉ trả một lần.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbol');
  if (!raw) return NextResponse.json({ error: 'Thiếu tham số symbol' }, { status: 400 });
  const r = await xPostsFor(normalizeSymbol(raw));
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
}
