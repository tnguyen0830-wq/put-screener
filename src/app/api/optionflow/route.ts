import { NextRequest, NextResponse } from 'next/server';
import { startAlertLoop } from '@/lib/alert-runner';
import {
  LOOKBACK_DAYS,
  getOptionFlowLastRun,
  optionFlowSyncing,
  readOptionFlow,
  syncOptionFlow,
} from '@/lib/optionflow';
import { trackedSymbols } from '@/lib/insiders';
import { uwConfigured } from '@/lib/unusualwhales';

/** Lệnh quyền chọn bất thường (options flow), qua Unusual Whales. Cùng
 *  khuôn mẫu /api/congress: chỉ đọc từ kho đã đồng bộ, không chạm mạng. */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  startAlertLoop();

  const { symbols, holdingsError, sp500Error } = await trackedSymbols();
  const rows = await readOptionFlow(symbols);
  rows.sort(
    (a, b) =>
      b.sweepCount - a.sweepCount ||
      (b.lastAlertAt ?? '').localeCompare(a.lastAlertAt ?? '')
  );

  return NextResponse.json({
    configured: uwConfigured(),
    rows,
    lookbackDays: LOOKBACK_DAYS,
    lastRun: getOptionFlowLastRun(),
    syncing: optionFlowSyncing(),
    trackedCount: symbols.length,
    holdingsError,
    sp500Error,
  });
}

export async function POST(_req: NextRequest) {
  void syncOptionFlow().catch(() => {});
  return NextResponse.json({ started: true, alreadyRunning: optionFlowSyncing() });
}
