import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { quotes } from '@/lib/schwab';
import { requireUser } from '@/lib/userstore';
import { readWatchlist } from '@/lib/watchlist';
import { historyCandles } from '@/lib/history';
import { finvizQuote } from '@/lib/finviz';
import { peContext, recordPe, flushPe } from '@/lib/pehistory';
import { pivotLows, readSupport, readTrend, supportZones } from '@/lib/support';
import {
  gatesFor,
  parseFundamentals,
  scoreComponents,
  scoreOf,
  MIN_ABOVE_52W_LOW_PCT,
  MIN_OFF_HIGH_PCT,
  type LtCandidate,
} from '@/lib/longterm';

export const dynamic = 'force-dynamic';

/**
 * Quét Long-term Investment, BA TẦNG, xếp theo giá của từng tầng.
 *
 * Ràng buộc định hình toàn bộ route này: Finviz là MỘT lần cào HTML cho mỗi
 * mã. Quét cả rổ 503 mã kiểu ngây thơ là 503 lần cào - chậm tới mức không
 * dùng được, và gần như chắc chắn bị Finviz chặn. Nên thứ tự lọc không phải
 * chuyện gọn gàng, nó là chuyện tính năng có chạy nổi hay không:
 *
 *  Tầng 0 - SÁU REQUEST cho cả rổ. `quotes()` gộp lô 100 mã và đã trả sẵn
 *    `52WeekHigh`/`52WeekLow`, nên hai cổng "đã rớt khỏi đỉnh" và "chưa sát
 *    đáy" tính được MIỄN PHÍ, trước khi tốn bất cứ request nào theo từng mã.
 *    Đây là tầng cắt mạnh nhất và rẻ nhất - phần lớn rổ chết ở đây.
 *  Tầng 1 - một request nến mỗi mã sống sót, có cache theo ngày. Dựng vùng
 *    hỗ trợ và độ dốc SMA200, lọc tiếp bằng hai cổng đó.
 *  Tầng 2 - một lần cào Finviz mỗi mã còn lại. Cơ bản và định giá.
 *
 * Trả về NDJSON để bảng hiện dần từng dòng thay vì ngồi nhìn màn hình trắng,
 * cùng kiểu với /api/screen.
 *
 * KHÁC /api/screen một điểm, và nói ra để người sau không tưởng là bỏ sót:
 * lần quét này KHÔNG có bộ máy job chạy nền. Lý do là chi phí khác hẳn -
 * quét put mất 4-8 phút nên đóng tab giữa chừng là mất trắng, còn lần quét
 * này bị chặn trên bởi tầng 0 và mọi thứ đắt đều được cache theo ngày, nên
 * lần chạy thứ hai gần như tức thì. Cái duy nhất mất khi đóng tab sớm là
 * dòng P/E của hôm nay - nên nó được GHI NGAY sau tầng 2, trước khi phát
 * kết quả ra, chứ không để tới cuối.
 */

type Event =
  | { type: 'phase'; phase: string; total?: number }
  | { type: 'progress'; done: number; total: number }
  | { type: 'candidate'; row: LtCandidate }
  | { type: 'skip'; symbol: string; reason: string }
  | { type: 'error'; message: string }
  | { type: 'done'; scanned: number; kept: number; at: string };

type Constituent = { symbol: string; name: string; sector: string };

async function constituents(): Promise<Constituent[]> {
  const raw = await fs.readFile(path.resolve(process.cwd(), 'data/sp500.json'), 'utf8');
  return JSON.parse(raw);
}

/** Chạy song song có trần, cùng khuôn `pooled` của scan-job.ts. */
async function pooled<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await worker(items[i++]);
    })
  );
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });

  const universe = req.nextUrl.searchParams.get('universe') === 'watchlist'
    ? 'watchlist'
    : 'sp500';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Event) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));

      try {
        /* ---- danh sách mã ---- */
        let list: Constituent[];
        if (universe === 'watchlist') {
          const syms = await readWatchlist(user);
          list = syms.map((s) => ({ symbol: s, name: s, sector: '' }));
        } else {
          list = await constituents();
        }
        send({ type: 'phase', phase: 'quotes', total: list.length });

        /* ---- tầng 0: giá + đỉnh/đáy 52 tuần, gộp lô ---- */
        const q = await quotes(list.map((c) => c.symbol));
        const tier1: (Constituent & { price: number })[] = [];
        for (const c of list) {
          const row = q[c.symbol];
          const price = Number(row?.quote?.lastPrice ?? 0);
          const hi = Number(row?.quote?.['52WeekHigh'] ?? 0);
          const lo = Number(row?.quote?.['52WeekLow'] ?? 0);
          if (!price || !hi || !lo) {
            /* Thiếu giá thì KHÔNG thể xét - nói ra chứ không lặng lẽ bỏ, vì
               một mã biến mất khỏi bảng trông y hệt một mã bị loại đúng luật. */
            send({ type: 'skip', symbol: c.symbol, reason: 'no-quote' });
            continue;
          }
          const offHigh = ((hi - price) / hi) * 100;
          const aboveLow = ((price - lo) / lo) * 100;
          if (offHigh < MIN_OFF_HIGH_PCT) continue;       // chưa rớt thì không phải việc của tab này
          if (aboveLow < MIN_ABOVE_52W_LOW_PCT) continue; // sát đáy = dao đang rơi
          tier1.push({ ...c, price });
        }

        /* ---- tầng 1: nến, vùng hỗ trợ, xu hướng ---- */
        send({ type: 'phase', phase: 'support', total: tier1.length });
        const tier2: {
          c: Constituent & { price: number };
          support: ReturnType<typeof readSupport>;
          trend: ReturnType<typeof readTrend>;
        }[] = [];
        let done = 0;
        await pooled(tier1, 6, async (c) => {
          try {
            const candles = await historyCandles(c.symbol, 3);
            if (candles.length < 200) {
              send({ type: 'skip', symbol: c.symbol, reason: 'short-history' });
              return;
            }
            const trend = readTrend(candles, c.price);
            const support = readSupport(c.price, supportZones(pivotLows(candles)));
            const pre = gatesFor({ price: c.price, trend, support, fa: EMPTY_FA });
            const hardFail = pre.some(
              (g) => (g.key === 'trend' || g.key === 'nearSupport') && !g.passed
            );
            if (!hardFail) tier2.push({ c, support, trend });
          } catch (e: any) {
            /* Một mã hỏng không được làm chết cả lượt quét: nó là một dòng
               skip có LÝ DO THẬT, không phải một khoảng trống. */
            send({ type: 'skip', symbol: c.symbol, reason: String(e?.message ?? e).slice(0, 120) });
          } finally {
            send({ type: 'progress', done: ++done, total: tier1.length });
          }
        });

        /* ---- tầng 2: Finviz (đắt nhất, ít mã nhất) ---- */
        send({ type: 'phase', phase: 'fundamentals', total: tier2.length });
        const rows: LtCandidate[] = [];
        let done2 = 0;
        /* Song song 3 thôi: đây là trang web của người ta, không phải API có
           hạn mức công bố. Nhanh hơn nữa cũng chẳng để làm gì khi tầng này
           chỉ còn vài chục mã. */
        await pooled(tier2, 3, async ({ c, support, trend }) => {
          try {
            const fv = await finvizQuote(c.symbol);
            const { fa, missing } = parseFundamentals(fv.metrics);
            if (fa.pe !== null) await recordPe(c.symbol, fa.pe);
            const pe = await peContext(c.symbol, fa.pe);

            const input = { price: c.price, trend, support, fa };
            const gates = gatesFor(input);
            if (gates.some((g) => !g.passed)) return;

            const breakdown = scoreComponents(input, pe);
            rows.push({
              symbol: c.symbol,
              name: c.name,
              sector: c.sector || fv.profile?.sector || '',
              price: c.price,
              trend,
              nearestSupport: support.nearest,
              distancePct: support.distancePct,
              brokenSupport: support.broken,
              zoneCount: support.zones.length,
              fa,
              faMissing: missing,
              pe,
              targetUpsidePct:
                fa.targetPrice && c.price > 0
                  ? ((fa.targetPrice - c.price) / c.price) * 100
                  : null,
              gates,
              score: scoreOf(breakdown),
              scoreBreakdown: breakdown,
            });
          } catch (e: any) {
            send({ type: 'skip', symbol: c.symbol, reason: String(e?.message ?? e).slice(0, 120) });
          } finally {
            send({ type: 'progress', done: ++done2, total: tier2.length });
          }
        });

        /* Ghi kho P/E TRƯỚC khi phát kết quả: đóng tab lúc đang đọc bảng thì
           vẫn không mất dòng đọc của hôm nay. */
        await flushPe();

        rows.sort((a, b) => b.score - a.score);
        for (const row of rows) send({ type: 'candidate', row });
        send({
          type: 'done',
          scanned: list.length,
          kept: rows.length,
          at: new Date().toISOString(),
        });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        send({ type: 'error', message: msg.slice(0, 400) });
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

/* Tầng 1 chưa có dữ liệu Finviz, nên nó chỉ được phép xét hai cổng thuần kỹ
   thuật. Giá trị rỗng này làm bốn cổng còn lại ra `unknown` và ĐI QUA - đúng
   ý: chúng sẽ được xét thật ở tầng 2, chứ không bị loại oan ở đây. */
const EMPTY_FA = {
  eps: null, epsNextY: null, pe: null, forwardPe: null, peg: null, pb: null,
  roe: null, roic: null, profitMargin: null, debtEq: null, targetPrice: null,
  recom: null, marketCap: null,
};
