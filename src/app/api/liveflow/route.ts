import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/userstore';
import { loadLiveFlow } from '@/lib/liveflowload';
import { wsSnapshot } from '@/lib/liveflowws';
import { uwConfigured } from '@/lib/unusualwhales';

/**
 * Luồng cho tab Live Flow, hai nguồn tách hẳn (`?src=`):
 *
 *   - `trades` (mặc định): TỪNG LỆNH KHỚP qua WebSocket UW (`liveflowws.ts`,
 *     #219) — chưa đo, nên luôn trả kèm khối chẩn đoán;
 *   - `alerts`: alert REST đã lọc (`liveflowload.ts`, #218).
 *
 * Chỉ nguồn đang được xem mới chạy: xem từng lệnh thì không gọi REST (không
 * tốn hạn mức), xem alert thì không giữ WebSocket (đóng sau 90 giây không ai
 * hỏi). Hai bảng không bao giờ trộn: một alert gộp nhiều lệnh và một lệnh
 * đơn lẻ là hai thứ khác bản chất.
 *
 * Mở cho người nhà: mọi người xem đọc CHUNG một bộ đệm/một kết nối, thêm
 * người xem không thêm request UW nào. Không ghi Hoạt động (nhịp báo tab đủ).
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });
  const src = req.nextUrl.searchParams.get('src') === 'alerts' ? 'alerts' : 'trades';
  const headers = { 'Cache-Control': 'no-store' };
  if (src === 'alerts') {
    return NextResponse.json({ src, ...(await loadLiveFlow(req.nextUrl.searchParams.get('tickers'))) }, { headers });
  }
  if (!uwConfigured()) return NextResponse.json({ src, configured: false }, { headers });
  const snap = wsSnapshot();
  return NextResponse.json(
    { src, configured: true, now: Date.now(), rows: snap.rows, minPremium: snap.minPremium, ws: snap.diag },
    { headers }
  );
}
