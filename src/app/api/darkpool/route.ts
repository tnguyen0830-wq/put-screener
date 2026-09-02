import { NextRequest, NextResponse } from 'next/server';
import { startAlertLoop } from '@/lib/alert-runner';
import {
  LOOKBACK_DAYS,
  MIN_PREMIUM,
  darkpoolSyncing,
  getDarkpoolLastRun,
  readDarkpool,
  syncDarkpool,
} from '@/lib/darkpool';
import { trackedSymbols } from '@/lib/insiders';
import { uwConfigured } from '@/lib/unusualwhales';

/** Lệnh in ngoài sàn (dark pool) khối lượng lớn, qua Unusual Whales. */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  startAlertLoop();

  const { symbols, holdingsError, sp500Error } = await trackedSymbols();
  const rows = await readDarkpool(symbols);
  rows.sort(
    (a, b) =>
      b.totalPremium - a.totalPremium ||
      (b.lastPrintAt ?? '').localeCompare(a.lastPrintAt ?? '')
  );

  return NextResponse.json({
    configured: uwConfigured(),
    rows,
    lookbackDays: LOOKBACK_DAYS,
    minPremium: MIN_PREMIUM,
    lastRun: getDarkpoolLastRun(),
    syncing: darkpoolSyncing(),
    trackedCount: symbols.length,
    holdingsError,
    sp500Error,
  });
}

export async function POST(_req: NextRequest) {
  void syncDarkpool().catch(() => {});
  return NextResponse.json({ started: true, alreadyRunning: darkpoolSyncing() });
}
