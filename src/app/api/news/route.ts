import { NextRequest, NextResponse } from 'next/server';
import { loadNews } from '@/lib/newsfeed';

/**
 * Tab Tin tức: hai cột tiêu đề (thị trường | chính trị-kinh tế) từ bốn loại
 * nguồn, kèm TRẠNG THÁI TỪNG NGUỒN — vì không nguồn nào đo được từ sandbox,
 * dòng trạng thái đó chính là probe (xem đầu `lib/newsfeed.ts`).
 *
 * Mọi thứ lỗi đều đã nằm trong `sources[]`; route này chỉ 500 khi chính bộ
 * gom ném — tức lỗi code, không phải lỗi nguồn.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  try {
    const payload = await loadNews({ refresh });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e).slice(0, 300) }, { status: 500 });
  }
}
