import { NextRequest, NextResponse } from 'next/server';
import { touchPresence } from '@/lib/activity';
import { isTab } from '@/lib/tabs';
import { requireUser } from '@/lib/userstore';

/**
 * Nhịp báo "tôi đang mở tab nào".
 *
 * MỞ cho cả người nhà — chính người nhà là thứ màn hình Hoạt động sinh ra
 * để xem, nên một cái cổng chỉ-chủ-app ở đây sẽ làm cả tính năng vô nghĩa.
 * Điều đó an toàn vì route này chỉ GHI một ô trạng thái của CHÍNH người
 * gọi và không đọc ra gì: câu trả lời luôn là `{ok:true}`, không mang một
 * chữ nào về người khác. Phần ĐỌC nhật ký nằm ở `/api/users/activity`, dưới
 * tiền tố `/api/users` nên đã được middleware gác cho riêng chủ app.
 *
 * Danh tính KHÔNG lấy từ body: `requireUser` đọc header do middleware gắn
 * (middleware luôn ghi đè header đó), nên không ai báo nhịp thay người khác
 * được. Dùng `requireUser` chứ không `currentUser` để một tài khoản đã bị
 * xoá mà cookie còn hạn không tiếp tục hiện "đang online".
 *
 * Tên tab phải nằm trong danh sách cho phép (`lib/tabs.ts`) — cùng luật với
 * `readRememberedOneOf`: một chuỗi tuỳ ý từ client đi thẳng vào màn hình
 * quản trị là chuyện không cần phải cho phép.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!isTab(body?.tab)) return NextResponse.json({ error: 'BAD_TAB' }, { status: 400 });

  await touchPresence(user, body.tab);
  return NextResponse.json({ ok: true });
}
