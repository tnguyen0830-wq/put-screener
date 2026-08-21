import { NextRequest } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { quotes, putChain, dailyHistory } from '@/lib/schwab';
import {
  evaluate,
  flattenPuts,
  realizedVol,
  sma,
  recordIv,
  flushSnapshots,
  loadEarnings,
  windowFrom,
  windowTo,
  type Bar,
  type UnderlyingContext,
} from '@/lib/screener';
import { readWatchlist } from '@/lib/watchlist';
import type { Filters, StreamEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 900;

type Constituent = { symbol: string; name: string; sector: string };

async function constituents(): Promise<Constituent[]> {
  const raw = await fs.readFile(
    path.resolve(process.cwd(), 'data/sp500.json'),
    'utf8'
  );
  return JSON.parse(raw);
}

/* Price history barely moves during a session and costs a request each,
   so it is cached per symbol per day. */
const HIST_DIR = path.resolve('./.cache/history');

async function historyBars(symbol: string): Promise<Bar[]> {
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(HIST_DIR, `${symbol.replace('/', '_')}.json`);
  try {
    const cached = JSON.parse(await fs.readFile(file, 'utf8'));
    if (cached.d === today) return cached.bars as Bar[];
  } catch {
    /* cache miss */
  }
  const data = await dailyHistory(symbol, 1);
  const bars: Bar[] = (data?.candles ?? []).map((c: any) => ({
    datetime: c.datetime,
    close: c.close,
  }));
  await fs.mkdir(HIST_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify({ d: today, bars }));
  return bars;
}

async function pooled<T>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<void>
) {
  let i = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function POST(req: NextRequest) {
  const filters = (await req.json()) as Filters;
  const started = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));

      try {
        const earnings = await loadEarnings();
        const index = await constituents();
        let list: Constituent[];

        if (filters.universe === 'watchlist') {
          const saved = await readWatchlist();
          if (!saved.length) {
            send({
              type: 'error',
              message: 'Watchlist đang trống. Thêm mã ở panel bên trái.',
            });
            return;
          }
          // Names and sectors come free for index members; anything else still
          // scans fine, it just shows without a company name.
          const bySymbol = new Map(index.map((c) => [c.symbol, c]));
          list = saved.map(
            (sym) => bySymbol.get(sym) ?? { symbol: sym, name: sym, sector: '' }
          );
        } else {
          list = index;
          if (filters.sectors.length)
            list = list.filter((c) => filters.sectors.includes(c.sector));
          if (filters.limit > 0) list = list.slice(0, filters.limit);
        }

        send({ type: 'phase', phase: 'quotes', detail: `${list.length} mã` });
        const q = await quotes(list.map((c) => c.symbol));

        // Cheap pass first: anything whose 100 shares cost more than the
        // capital budget can never produce a tradeable put.
        const survivors: (Constituent & { quote: any })[] = [];
        for (const c of list) {
          const row = q[c.symbol];
          const spot = row?.quote?.lastPrice;
          if (!spot) {
            send({ type: 'skip', symbol: c.symbol, reason: 'no quote' });
            continue;
          }
          if (spot * 100 > filters.maxCapital) {
            send({ type: 'skip', symbol: c.symbol, reason: 'quá vốn' });
            continue;
          }
          if (spot < 5) {
            send({ type: 'skip', symbol: c.symbol, reason: 'giá quá thấp' });
            continue;
          }
          survivors.push({ ...c, quote: row });
        }

        send({
          type: 'phase',
          phase: 'chains',
          detail: `${survivors.length} mã vừa vốn`,
        });

        const from = windowFrom(filters);
        const to = windowTo(filters);
        let done = 0;
        let found = 0;

        await pooled(survivors, 4, async (c) => {
          try {
            const bars = await historyBars(c.symbol);
            const u: UnderlyingContext = {
              symbol: c.symbol,
              name: c.name,
              sector: c.sector,
              exchange:
                c.quote?.reference?.exchangeName ??
                c.quote?.reference?.exchange ??
                '',
              spot: c.quote.quote.lastPrice,
              low52: c.quote.quote['52WeekLow'] ?? 0,
              high52: c.quote.quote['52WeekHigh'] ?? 0,
              sma200: sma(bars, 200),
              hv20: realizedVol(bars, 20),
            };

            if (filters.requireAboveSma200 && u.sma200 && u.spot <= u.sma200) {
              send({ type: 'skip', symbol: c.symbol, reason: 'dưới SMA200' });
              return;
            }

            const chain = await putChain(c.symbol, from, to);
            const contracts = flattenPuts(chain);

            // One IV reading per symbol per day builds the IV Rank history.
            const ref = contracts
              .filter((x) => x.volatility > 0 && Math.abs(x.delta ?? 0) > 0)
              .sort(
                (a, b) =>
                  Math.abs(Math.abs(a.delta) - 0.3) -
                  Math.abs(Math.abs(b.delta) - 0.3)
              )[0];
            if (ref) await recordIv(c.symbol, ref.volatility / 100);

            const best = await evaluate(u, contracts, filters, earnings);
            if (best) {
              found++;
              send({ type: 'candidate', data: best });
            }
          } catch (e: any) {
            if (String(e.message).includes('REAUTH_REQUIRED')) throw e;
            send({ type: 'skip', symbol: c.symbol, reason: 'lỗi dữ liệu' });
          } finally {
            done++;
            send({ type: 'progress', done, total: survivors.length });
          }
        });

        await flushSnapshots();
        send({
          type: 'done',
          scanned: survivors.length,
          found,
          ms: Date.now() - started,
        });
      } catch (e: any) {
        const msg = String(e.message).includes('REAUTH_REQUIRED')
          ? 'Phiên Schwab đã hết hạn. Bấm Kết nối lại.'
          : e.message;
        send({ type: 'error', message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
