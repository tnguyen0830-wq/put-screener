import { NextResponse } from 'next/server';
import { runOnce } from '@/lib/alert-runner';
import { readSnapshot } from '@/lib/pricewatch';

/**
 * "Kiểm tra ngay" của tab Alerts — chủ app (OWNER_ONLY trong users.ts).
 * Chạy đúng `runOnce(true)`: kiểm giá + hỗ trợ + mức đặt kể cả ngoài giờ,
 * và GỬI thật qua kênh đã cấu hình, nên nó vừa là phép đo vừa là lượt
 * cảnh báo. Trả về ảnh chụp mới để màn hình thay bảng ngay.
 */
export const dynamic = 'force-dynamic';

export async function POST() {
  const run = await runOnce(true);
  const snap = await readSnapshot();
  return NextResponse.json({ run, rows: snap?.rows ?? [], report: snap?.report ?? run.price ?? null });
}
