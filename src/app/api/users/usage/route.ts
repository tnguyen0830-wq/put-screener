import { NextRequest, NextResponse } from 'next/server';
import { PRICES, readUsage, summarize } from '@/lib/usage';

/**
 * Sổ chi phí theo từng người — CHỈ chủ app đọc được.
 *
 * Nằm dưới `/api/users` vì cùng lý do `/api/users/activity`: tiền tố đó đã
 * nằm trong `OWNER_ONLY` của middleware, nên không có danh sách gác thứ hai
 * để trôi lệch. Người nhà không bao giờ thấy được ai tốn bao nhiêu.
 *
 * Trả cả tổng (tính ở server bằng `summarize()`, có test) lẫn từng lượt —
 * màn hình chỉ lọc theo người, không tự cộng lại lần nữa: hai phép cộng là
 * hai con số có thể cãi nhau trên cùng một trang.
 */
export const dynamic = 'force-dynamic';

const MAX_CALLS = 3000;

export async function GET(_req: NextRequest) {
  try {
    const now = Date.now();
    const all = await readUsage(now);
    const summary = summarize(all, now);
    /* Xếp theo THỜI GIAN, không theo thứ tự dòng trong file: nhiều route
       nối thêm cùng lúc nên dòng có thể xen nhau, và màn hình hứa "mới nhất
       trước". */
    const calls = [...all]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, MAX_CALLS);
    return NextResponse.json({
      summary,
      calls,
      truncated: Math.max(0, all.length - MAX_CALLS),
      prices: PRICES,
      now,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
