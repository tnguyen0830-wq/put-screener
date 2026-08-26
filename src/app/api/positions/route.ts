import { NextResponse } from 'next/server';
import { loadPortfolio, PortfolioLoadError } from '@/lib/portfolio';

/**
 * Danh mục cho trang web.
 *
 * Toàn bộ phần đọc và tính nằm ở lib/portfolio.ts, vì bộ kiểm tra cảnh báo
 * chạy ngầm (lib/alerts.ts) phải dùng đúng cùng một bộ luật. Nhân bản logic
 * ra hai nơi thì sớm muộn thông báo trên điện thoại sẽ nói một đằng còn màn
 * hình hiện một nẻo.
 *
 * Chỉ đọc - không có PUT. Không nằm dưới /api/md/*, vốn bị MD_API_TOKEN chặn
 * cho app điện thoại.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await loadPortfolio());
  } catch (e) {
    if (e instanceof PortfolioLoadError) {
      // Phiên hết hạn (401) khác hẳn thiếu quyền Accounts and Trading (502):
      // một cái bấm "Kết nối lại" là xong, cái kia phải xin Schwab duyệt.
      if (e.kind === 'SCHWAB_SESSION_EXPIRED') {
        return NextResponse.json(
          { error: 'SCHWAB_SESSION_EXPIRED', reason: 'SCHWAB_SESSION_EXPIRED' },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: 'NO_TRADER_ACCESS', reason: 'NO_TRADER_ACCESS', status: e.status },
        { status: 502 }
      );
    }
    throw e;
  }
}
