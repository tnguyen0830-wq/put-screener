import { rrgSectors, RrgError, WEEKS_OPTIONS, type WeeksParam } from '@/lib/rrgsectors';

/**
 * Biểu đồ luân chuyển dòng tiền giữa 11 ngành của S&P 500.
 *
 * Không nằm dưới /api/md/*, vốn bị MD_API_TOKEN chặn cho app điện thoại: trình
 * duyệt mở trang này không có token để gửi.
 *
 * Phần tính đã chuyển sang `lib/rrgsectors.ts` để tab Đầu tư dài hạn lọc bằng
 * ĐÚNG con số biểu đồ này vẽ. Route chỉ còn là lớp vỏ HTTP - và cache cũng
 * nằm trong lib, nên mở biểu đồ rồi quét Đầu tư dài hạn không tốn thêm lượt
 * gọi nào.
 *
 * `?weeks=` chọn độ dài đuôi (5/10/20/all, đúng bốn nút của tapchiphowall.com)
 * - đọc dung thứ, giá trị lạ hay thiếu rơi về mặc định 10 chứ không lỗi, vì
 * đây chỉ là cách nhìn chứ không phải dữ liệu.
 */
export const dynamic = 'force-dynamic';

function parseWeeks(raw: string | null): WeeksParam {
  if (raw === 'all') return 'all';
  const n = Number(raw);
  return (WEEKS_OPTIONS as (number | string)[]).includes(n) ? (n as WeeksParam) : 10;
}

export async function GET(req: Request) {
  const weeks = parseWeeks(new URL(req.url).searchParams.get('weeks'));
  try {
    return Response.json(await rrgSectors(weeks));
  } catch (e: any) {
    if (e instanceof RrgError) {
      return Response.json({ error: e.message, ...(e.detail ?? {}) }, { status: 502 });
    }
    const msg = String(e?.message ?? e);
    return Response.json(
      { error: msg },
      { status: msg.includes('REAUTH_REQUIRED') ? 401 : 500 }
    );
  }
}
