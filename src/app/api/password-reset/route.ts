import { NextRequest, NextResponse } from 'next/server';
import { redeemResetCode } from '@/lib/userstore';
import {
  clientIp,
  newBucket,
  recordFailure,
  retryAfter,
  clear,
} from '@/lib/ratelimit';

/**
 * Người nhà quên mật khẩu: nhập tên + mã chủ app đưa + mật khẩu mới.
 *
 * Cửa này nằm trong `OPEN` của middleware, tức MỞ CHO CẢ INTERNET - bắt
 * buộc phải thế, vì người quên mật khẩu thì chưa đăng nhập được. Ba thứ giữ
 * cho nó không thành lỗ hổng, và cả ba đều nằm ở chỗ khác chứ không ở đây:
 *
 *   1. `createResetCode()` TỪ CHỐI phát mã cho chủ app. Nên dù mã có lọt ra
 *      ngoài thì cùng lắm mất một tài khoản phụ - vốn không xem được danh
 *      mục, P/L hay cảnh báo. Không có đường nào từ cửa này tới tab danh mục.
 *   2. Mã ngẫu nhiên 8 ký tự trong bảng 31 chữ (~8.5e11 tổ hợp), sống 30
 *      phút, dùng một lần, trên đĩa chỉ còn chuỗi băm.
 *   3. Bộ đếm dưới đây - dò mã bằng máy sẽ đụng trần trước khi tới đâu.
 *
 * Bộ đếm RIÊNG với bộ đếm của `/api/session`: người nhà gõ nhầm mã năm lần
 * không được phép làm chủ app hết lượt đăng nhập. Cùng một cơ chế
 * (lib/ratelimit.ts), hai cái xô khác nhau.
 */
export const dynamic = 'force-dynamic';

/** Chặt hơn đăng nhập (8): mã là thứ được đưa tận tay, gõ sai 5 lần liên
 *  tiếp thì gần như chắc chắn không phải người cầm mã. */
const MAX_TRIES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const bucket = newBucket();

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const wait = retryAfter(bucket, ip, MAX_TRIES);
  if (wait !== null) {
    return NextResponse.json(
      { error: 'TOO_MANY_TRIES', retryInSec: wait },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username : '';
  const code = typeof body?.code === 'string' ? body.code : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const r = await redeemResetCode(username, code, password);
  if (!r.ok) {
    // Mật khẩu mới quá ngắn là lỗi của chính người dùng, không phải một lần
    // dò mã - tính vào bộ đếm thì họ tự khoá mình ra chỉ vì gõ thiếu ký tự.
    if (r.error !== 'weak-password') recordFailure(bucket, ip, WINDOW_MS);
    return NextResponse.json({ error: r.error }, { status: 400 });
  }

  clear(bucket, ip);
  // KHÔNG tự phát phiên đăng nhập ở đây. Đổi mật khẩu xong thì gõ lại mật
  // khẩu mới một lần - đó là cách người dùng biết mình nhớ đúng nó, và là
  // cách cửa này không bao giờ trở thành một đường đăng nhập thứ hai.
  return NextResponse.json({ ok: true });
}
