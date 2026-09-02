import { NextRequest, NextResponse } from 'next/server';
import { startAlertLoop } from '@/lib/alert-runner';
import {
  LOOKBACK_DAYS,
  congressSyncing,
  getCongressLastRun,
  readCongress,
  syncCongress,
} from '@/lib/congress';
import { trackedSymbols } from '@/lib/insiders';
import { uwConfigured } from '@/lib/unusualwhales';

/**
 * Nghị sĩ Quốc hội đang mua/bán gì, qua Unusual Whales.
 *
 * Cùng khuôn mẫu /api/insiders: chỉ đọc từ kho đã đồng bộ, không chạm
 * mạng - mở tab lên là có ngay. Việc kéo dữ liệu do vòng lặp nền lo.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  startAlertLoop();

  const { symbols, holdingsError, sp500Error } = await trackedSymbols();
  const rows = await readCongress(symbols);
  rows.sort(
    (a, b) =>
      b.traderCount - a.traderCount ||
      (b.lastTradeDate ?? '').localeCompare(a.lastTradeDate ?? '')
  );

  return NextResponse.json({
    configured: uwConfigured(),
    rows,
    lookbackDays: LOOKBACK_DAYS,
    lastRun: getCongressLastRun(),
    syncing: congressSyncing(),
    trackedCount: symbols.length,
    holdingsError,
    sp500Error,
  });
}

/** Nút "đồng bộ ngay" - khởi động rồi trả lời ngay, không chờ xong (cùng
 *  lý do /api/insiders: chờ ở đây từng làm proxy Render tự trả HTML). */
export async function POST(_req: NextRequest) {
  void syncCongress().catch(() => {});
  return NextResponse.json({ started: true, alreadyRunning: congressSyncing() });
}
