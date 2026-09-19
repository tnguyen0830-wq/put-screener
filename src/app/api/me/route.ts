import { NextRequest, NextResponse } from 'next/server';
import { roleOf } from '@/lib/users';
import { requireUser } from '@/lib/userstore';
import { clientIp } from '@/lib/ratelimit';

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
  /* Hai trường đo, cho chính người đang hỏi về chính họ (không lộ gì của ai
     khác): `ip` là thứ bộ đếm chống dò mật khẩu (`lib/ratelimit.ts`) đang
     khoá theo, `xff` là chuỗi X-Forwarded-For thô mà proxy của Render gửi
     tới. `clientIp()` lấy phần tử ĐẦU của chuỗi đó; nếu Render NỐI THÊM vào
     header client tự gửi thay vì ghi đè, thì phần tử đầu là do client bịa
     và bộ đếm dò mật khẩu vô hiệu. Chưa đo được từ sandbox — đọc hai trường
     này ở production là phép đo, rồi mới quyết định lấy đầu hay lấy cuối. */
  return NextResponse.json({
    user,
    role: roleOf(user),
    ip: clientIp(req),
    xff: req.headers.get('x-forwarded-for'),
  });
}
