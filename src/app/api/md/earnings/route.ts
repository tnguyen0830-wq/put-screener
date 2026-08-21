import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { loadEarnings } from '@/lib/screener';
import { jsonWithCors, corsOptionsResponse, errorResponse } from '@/lib/md-cors';

export const dynamic = 'force-dynamic';

async function loadExternal(): Promise<Record<string, { date: string; confirmed: boolean }>> {
  try {
    const raw = await fs.readFile(path.resolve('./data/earnings-external.json'), 'utf8');
    return JSON.parse(raw).dates ?? {};
  } catch {
    return {};
  }
}

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) return errorResponse('Missing symbol', 400);

  try {
    const [earnings, external] = await Promise.all([loadEarnings(), loadExternal()]);
    const today = new Date().toISOString().slice(0, 10);

    const ext = external[symbol];
    if (ext?.date && ext.date >= today) {
      return jsonWithCors({ symbol, nextEarningsDate: ext.date, confirmed: ext.confirmed, source: 'earnings-external' });
    }

    const dates = (earnings[symbol] ?? []).filter((d) => d >= today).sort();
    if (dates.length) {
      return jsonWithCors({ symbol, nextEarningsDate: dates[0], confirmed: true, source: 'earnings.json' });
    }

    return jsonWithCors({ symbol, nextEarningsDate: null, confirmed: false, source: 'unavailable' });
  } catch (e: any) {
    return errorResponse(String(e.message ?? e));
  }
}
