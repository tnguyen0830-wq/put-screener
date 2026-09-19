import { NextRequest, NextResponse } from 'next/server';
import { ONLINE_MS, readActivity } from '@/lib/activity';

/**
 * Nhật ký hoạt động — CHỈ chủ app đọc được.
 *
 * Nằm dưới `/api/users` là có chủ ý: tiền tố đó đã nằm trong `OWNER_ONLY`
 * của middleware, nên route này được gác mà không phải thêm một danh sách
 * thứ hai có thể trôi lệch — đúng cách `/api/users/reset-code` đã làm.
 *
 * Trả `onlineMs` kèm theo thay vì để màn hình tự đặt ngưỡng: "còn đang mở"
 * là một định nghĩa, và hai định nghĩa (một ở server, một ở client) sẽ lệch
 * nhau đúng lúc không ai để ý.
 */
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const { events, presence } = await readActivity();
    return NextResponse.json({ events, presence, onlineMs: ONLINE_MS, now: Date.now() });
  } catch (e: any) {
    // Lý do thật: một danh sách trống vì lỗi trông y hệt một danh sách trống
    // vì chưa ai dùng gì — hai chuyện sửa khác hẳn nhau.
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
