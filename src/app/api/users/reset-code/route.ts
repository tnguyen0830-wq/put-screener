import { NextRequest, NextResponse } from 'next/server';
import {
  clearResetCode,
  createResetCode,
  formatCode,
  listUsers,
} from '@/lib/userstore';

/**
 * Tạo (hoặc huỷ) mã đặt lại mật khẩu cho một người nhà.
 *
 * **Chỉ chủ app.** Nằm dưới `/api/users`, mà `/api/users` ở trong
 * `OWNER_ONLY` của lib/users.ts và `isOwnerOnly()` khớp cả tiền tố - nên
 * middleware đã chặn trước khi tới đây. Route không tự kiểm tra lại quyền,
 * giống `/api/users`: một chỗ gác, không phải hai chỗ có thể lệch nhau.
 *
 * Mã thô đi ra khỏi server ĐÚNG MỘT LẦN, trong câu trả lời này. Trên đĩa
 * chỉ còn chuỗi băm, nên không có endpoint nào đọc lại được - kể cả cho
 * chủ app. Mất mã thì tạo mã mới.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';

  const r = await createResetCode(name);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    // Có gạch giữa cho dễ đọc to; lúc nhập thì gõ kiểu gì cũng nhận.
    code: formatCode(r.code),
    expiresAt: r.expiresAt,
    users: await listUsers(),
  });
}

export async function DELETE(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name') ?? '';
  const r = await clearResetCode(name);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, users: await listUsers() });
}
