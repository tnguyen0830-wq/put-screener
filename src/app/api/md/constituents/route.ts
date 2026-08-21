import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { quotes } from '@/lib/schwab';
import { buildEarningsIndex, lookupEarnings } from '@/lib/md-earnings';
import { jsonWithCors, corsOptionsResponse, errorResponse } from '@/lib/md-cors';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Constituent = { symbol: string; name: string; sector: string; industry: string };

// One bulk quotes() call already returns quote + fundamental together
// (Schwab's API gives both in a single payload), and earnings.json is a
// local file. Folding all three into this one response means the mobile
// app's full-universe scan needs ONE request per ticker afterwards
// (price history, which has no bulk endpoint) instead of four - see
// src/data/schwabProvider.ts's constituentsCache.
//
// v2: cache filename bumped so a same-day cache written by the old
// (price/marketCap-only) shape never gets served back with fields missing.
const CACHE_FILE = path.resolve('./.cache/md-constituents-v2.json');

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  try {
    const noCache = req.nextUrl.searchParams.get('refresh') === '1';
    const today = new Date().toISOString().slice(0, 10);

    if (!noCache) {
      try {
        const cached = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
        if (cached.d === today) return jsonWithCors(cached.data);
      } catch {
        /* cache miss, fall through */
      }
    }

    const raw = await fs.readFile(path.resolve('./data/sp500.json'), 'utf8');
    const index: Constituent[] = JSON.parse(raw);
    const earningsIndex = await buildEarningsIndex();

    type Row = {
      price: number;
      change: number;
      changePercent: number;
      volume: number;
      realtime: boolean;
      quoteTime: number;
      pe: number | null;
      eps: number | null;
      dividendYield: number | null;
      sharesOutstanding: number;
      marketCap: number;
    };
    const bySymbol: Record<string, Row> = {};

    for (let i = 0; i < index.length; i += 100) {
      const chunk = index.slice(i, i + 100).map((c) => c.symbol);
      const q = await quotes(chunk);
      for (const symbol of chunk) {
        const row = q[symbol];
        const price = row?.quote?.lastPrice ?? 0;
        const f = row?.fundamental ?? {};
        const shares = f.sharesOutstanding ?? 0;
        bySymbol[symbol] = {
          price,
          change: row?.quote?.netChange ?? 0,
          changePercent: row?.quote?.netPercentChange ?? 0,
          volume: row?.quote?.totalVolume ?? 0,
          realtime: Boolean(row?.realtime),
          quoteTime: row?.quote?.quoteTime ?? Date.now(),
          pe: typeof f.peRatio === 'number' && f.peRatio > 0 ? f.peRatio : null,
          eps: typeof f.eps === 'number' ? f.eps : null,
          dividendYield: typeof f.divYield === 'number' ? f.divYield : null,
          sharesOutstanding: shares,
          marketCap: price * shares,
        };
      }
    }

    const data = index.map((c) => {
      const row = bySymbol[c.symbol];
      const earn = lookupEarnings(earningsIndex, c.symbol);
      return {
        ticker: c.symbol,
        companyName: c.name,
        sector: c.sector,
        industry: c.industry,
        price: row?.price ?? 0,
        change: row?.change ?? 0,
        changePercent: row?.changePercent ?? 0,
        volume: row?.volume ?? 0,
        realtime: row?.realtime ?? false,
        quoteTime: row?.quoteTime ?? Date.now(),
        marketCap: row?.marketCap ?? 0,
        pe: row?.pe ?? null,
        eps: row?.eps ?? null,
        dividendYield: row?.dividendYield ?? null,
        sharesOutstanding: row?.sharesOutstanding ?? null,
        nextEarningsDate: earn.nextEarningsDate,
        earningsConfirmed: earn.confirmed,
      };
    });

    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify({ d: today, data }));

    return jsonWithCors(data);
  } catch (e: any) {
    return errorResponse(String(e.message ?? e));
  }
}
