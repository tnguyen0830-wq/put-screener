import { NextRequest, NextResponse } from 'next/server';
import { createUser, deleteUser, listUsers, setPassword } from '@/lib/userstore';

/**
 * Quản lý tài khoản người nhà. **Chỉ chủ app** - `/api/users` nằm trong
 * `OWNER_ONLY` ở lib/users.ts, nên middleware đã chặn trước khi tới đây;
 * route này không tự kiểm tra lại quyền, và đó là có chủ ý (một chỗ gác,
 * không phải hai chỗ có thể lệch nhau).
 *
 * Không có endpoint nào đọc được mật khẩu hay chuỗi băm - `listUsers()` cố
 * tình chỉ trả tên và thời điểm. Đổi mật khẩu là GHI ĐÈ, không phải đọc rồi
 * so: chủ app đặt lại hộ người nhà khi họ quên, chứ không xem được cái cũ.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const r = await createUser(name, password);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, users: await listUsers() });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const r = await setPassword(name, password);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, users: await listUsers() });
}

export async function DELETE(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name') ?? '';
  const r = await deleteUser(name);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, users: await listUsers() });
}
