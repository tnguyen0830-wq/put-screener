import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { dailyHistory } from '@/lib/schwab';
import { jsonWithCors, corsOptionsResponse, errorResponse } from '@/lib/md-cors';

export const dynamic = 'force-dynamic';

// Own cache directory (full OHLCV) separate from the existing web
// screener's close-only cache (./.cache/history) so neither one changes
// the other's file format.
const HIST_DIR = path.resolve('./.cache/md-history');

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const days = Number(req.nextUrl.searchParams.get('days') ?? '260');
  if (!symbol) return errorResponse('Missing symbol', 400);

  try {
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(HIST_DIR, `${symbol.replace('/', '_')}.json`);

    let candles: any[] | null = null;
    try {
      const cached = JSON.parse(await fs.readFile(file, 'utf8'));
      if (cached.d === today) candles = cached.candles;
    } catch {
      /* cache miss */
    }

    if (!candles) {
      const years = Math.max(1, Math.min(2, Math.ceil(days / 252)));
      const data = await dailyHistory(symbol, years);
      candles = data?.candles ?? [];
      await fs.mkdir(HIST_DIR, { recursive: true });
      await fs.writeFile(file, JSON.stringify({ d: today, candles }));
    }

    const out = (candles ?? []).slice(-days).map((c: any) => ({
      timestamp: new Date(c.datetime).toISOString().slice(0, 10),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    return jsonWithCors({ symbol, bars: out });
  } catch (e: any) {
    const msg = String(e.message ?? e);
    return errorResponse(msg, msg.includes('REAUTH_REQUIRED') ? 401 : 500);
  }
}
