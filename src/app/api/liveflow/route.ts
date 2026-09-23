import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/userstore';
import { loadLiveFlow } from '@/lib/liveflowload';

/**
 * Luồng cho tab Live Flow. Mở cho người nhà: mọi người xem đọc CHUNG một bộ
 * đệm phía server (`liveflowload.ts`), nên thêm người xem KHÔNG thêm request
 * UW nào — khác nút "Đồng bộ ngay" của Options Flow, thứ đi vượt cổng và vì
 * vậy chỉ chủ app bấm được (#192).
 *
 * Không ghi Hoạt động: panel tự làm mới vài giây một lần, ghi mỗi lượt là
 * nhấn chìm cả nhật ký — nhịp báo tab `liveflow` đã nói người đó đang xem.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });
  const r = await loadLiveFlow();
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
}
