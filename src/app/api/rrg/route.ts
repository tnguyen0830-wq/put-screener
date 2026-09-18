import { rrgSectors, RrgError } from '@/lib/rrgsectors';

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
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await rrgSectors());
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
