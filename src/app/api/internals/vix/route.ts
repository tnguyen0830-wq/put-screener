import { vixSeries } from '@/lib/internals';

/**
 * Chỉ số VIX tiền mặt từ Schwab (nến 5 phút), cho ô VIX của khung
 * TradingView - xem `vixSeries()`. Một request Schwab, tách khỏi
 * `/api/internals` để mở khung TradingView không phải trả giá cả bốn mã.
 * Phiên hết hạn ra 401 thật, không nuốt (#101).
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await vixSeries());
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return Response.json({ error: msg }, { status: msg.includes('REAUTH_REQUIRED') ? 401 : 500 });
  }
}
