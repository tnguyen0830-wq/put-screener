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
  /* Xếp theo SỐ TIỀN, không phải số lần sweep.
     Cũ: sweepCount giảm dần - tức một mã có ba sweep nhỏ đứng trên một mã
     có một lệnh 5 triệu đô. Câu hỏi của luồng quyền chọn là "tiền lớn đang
     ở đâu", nên tiền phải là khoá xếp hạng. Sweep vẫn là một cột, chỉ
     không còn quyết định thứ tự. */
  rows.sort(
    (a, b) =>
      b.totalPremium - a.totalPremium ||
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
  // force: true - cùng lý do darkpool.ts: nút bấm chủ động của người
  // dùng luôn cho phép, bất kể giờ giao dịch.
  void syncOptionFlow(true).catch(() => {});
  return NextResponse.json({ started: true, alreadyRunning: optionFlowSyncing() });
}
