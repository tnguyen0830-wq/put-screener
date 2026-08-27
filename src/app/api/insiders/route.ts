import { NextRequest, NextResponse } from 'next/server';
import { startAlertLoop } from '@/lib/alert-runner';
import {
  CLUSTER_MIN_BUYERS,
  LOOKBACK_DAYS,
  getInsiderLastRun,
  readInsiders,
  syncTracked,
  trackedSymbols,
} from '@/lib/insiders';

/**
 * Người nội bộ đang mua gì.
 *
 * Chỉ đọc từ kho đã đồng bộ, không chạm SEC - mở tab lên là có ngay.
 * Việc ra mạng do vòng lặp nền lo, nên tab này không bao giờ phải chờ.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  // Cùng lý do như /api/alerts/status: vòng lặp nền cần một cú chạm đầu
  // tiên sau khi deploy để khởi động.
  startAlertLoop();

  const { symbols, holdingsError } = await trackedSymbols();
  const rows = await readInsiders(symbols);

  // Xếp mã có nhiều người mua nhất lên trước, rồi tới mua gần đây nhất.
  rows.sort(
    (a, b) =>
      b.buyerCount - a.buyerCount ||
      (b.lastBuyDate ?? '').localeCompare(a.lastBuyDate ?? '')
  );

  return NextResponse.json({
    rows,
    lookbackDays: LOOKBACK_DAYS,
    clusterMinBuyers: CLUSTER_MIN_BUYERS,
    lastRun: getInsiderLastRun(),
    holdingsError,
  });
}

/** Nút "đồng bộ ngay". Bỏ qua hạn một ngày và hỏi lại SEC. */
export async function POST(req: NextRequest) {
  const force = new URL(req.url).searchParams.get('force') === '1';
  try {
    return NextResponse.json({ run: await syncTracked(force) });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 502 }
    );
  }
}
