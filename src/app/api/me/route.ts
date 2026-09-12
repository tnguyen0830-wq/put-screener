import { NextRequest, NextResponse } from 'next/server';
import { roleOf } from '@/lib/users';
import { requireUser } from '@/lib/userstore';

/**
 * Ai đang đăng nhập, và với vai trò gì.
 *
 * Giao diện cần biết để ẩn tab My Portfolio khỏi người nhà. Ẩn tab là việc
 * của sự TỬ TẾ chứ không phải của bảo mật - middleware mới là chỗ chặn thật
 * (`isOwnerOnly`), và nó chặn kể cả khi ai đó gọi thẳng `/api/positions`
 * bằng curl. Một cái tab hiện ra rồi bấm vào chỉ nhận lỗi 403 thì đúng là
 * đã an toàn, nhưng đọc như app bị hỏng.
 *
 * Không trả về mật khẩu, danh sách tài khoản, hay bất cứ thứ gì về người
 * khác - chỉ đúng tên của chính người đang hỏi.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  // Tài khoản đã bị xoá nhưng cookie còn hạn: nói thẳng, để giao diện đưa
  // họ ra trang đăng nhập thay vì hiện một app nửa vời.
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });
  return NextResponse.json({ user, role: roleOf(user) });
}
