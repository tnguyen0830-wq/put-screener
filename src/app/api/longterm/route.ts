import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { quotes } from '@/lib/schwab';
import { requireUser } from '@/lib/userstore';
import { readWatchlist } from '@/lib/watchlist';
import { historyCandles } from '@/lib/history';
import { finvizQuote } from '@/lib/finviz';
import { ciksFor, companyFacts } from '@/lib/sec';
import { secDiagnosis, secFundamentals, type SecFundamentals } from '@/lib/secfacts';
import { peContext, recordPe, flushPe } from '@/lib/pehistory';
import { saveLtScan } from '@/lib/lt-store';
import { capPasses, marketCapOf, parseCaps } from '@/lib/marketcap';
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
 *  Tầng 2 - một lần cào Finviz + một file `companyfacts` của SEC mỗi mã còn
 *    lại, gọi song song. Finviz cho bội số và giá mục tiêu (ảnh chụp ttm);
 *    SEC cho chuỗi 10-K nhiều năm - doanh thu/EPS/FCF có tăng không, số cổ
 *    phiếu có phình không. SEC cache 7 ngày nên chỉ lần đầu là tốn.
 *
 * Trả về NDJSON để bảng hiện dần từng dòng thay vì ngồi nhìn màn hình trắng,
 * cùng kiểu với /api/screen.
 *
 * KHÁC /api/screen một điểm, và nói ra để người sau không tưởng là bỏ sót:
 * lần quét này KHÔNG có bộ máy job chạy nền. Đóng tab GIỮA CHỪNG vẫn mất
 * lượt quét, và đó là đánh đổi có ý thức: quét put mất 4-8 phút nên đáng
 * một bộ máy job, còn lượt này bị chặn trên bởi tầng 0 và mọi thứ đắt đều
 * cache theo ngày nên chạy lại rẻ hơn hẳn.
 *
 * Nhưng kết quả ĐÃ QUÉT XONG thì được LƯU (`lt-store.ts`), và #137 bỏ sót
 * đúng chỗ đó: cache theo ngày chỉ làm rẻ phần mạng, người dùng vẫn phải
 * bấm quét lại và ngồi nhìn ba tầng chạy hết. Ghi kho P/E và lưu kết quả
 * đều nằm TRƯỚC khi phát dòng nào ra: tới đây mọi thứ đắt đã xong, nên
 * client ngắt giữa lúc đang đọc bảng cũng không làm mất lượt quét.
 */

type Event =
  | { type: 'phase'; phase: string; total?: number }
  | { type: 'progress'; done: number; total: number }
  | { type: 'candidate'; row: LtCandidate }
  | { type: 'skip'; symbol: string; reason: string }
  | { type: 'error'; message: string }
  | { type: 'done'; scanned: number; kept: number; at: string; belowSma200: number; capDropped: number };

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
  /* Ô tích của người dùng, không phải cổng cứng - xem chú thích trong
     `gatesFor`. Mặc định TẮT ở phía server: một request thiếu tham số phải
     cho ra bảng rộng hơn chứ không phải bảng bị lọc thêm mà không ai yêu cầu. */
  const requireAboveSma200 = req.nextUrl.searchParams.get('aboveSma200') === '1';
  /* Bậc vốn hoá đã chọn. Rỗng = không lọc, và mặc định phải là rỗng vì một
     request thiếu tham số không được âm thầm loại mã. */
  const caps = parseCaps(req.nextUrl.searchParams.get('caps'));

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
        const tier1: (Constituent & { price: number; marketCap: number | null })[] = [];
        let capDropped = 0;
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
          /* Vốn hoá đi kèm CHÍNH lượt `quotes()` này (`sharesOutstanding`),
             nên lọc ở đây không tốn thêm request nào - và cắt ở tầng 0 là
             cắt trước cả nến lẫn Finviz lẫn SEC. Mã Schwab không trả số cổ
             phiếu thì ĐI QUA kèm cờ, `capPasses` lo phần đó. */
          const marketCap = marketCapOf(row);
          if (!capPasses(marketCap, caps).passed) { capDropped++; continue; }
          tier1.push({ ...c, price, marketCap });
        }

        /* ---- tầng 1: nến, vùng hỗ trợ, xu hướng ---- */
        send({ type: 'phase', phase: 'support', total: tier1.length });
        const tier2: {
          c: Constituent & { price: number; marketCap: number | null };
          support: ReturnType<typeof readSupport>;
          trend: ReturnType<typeof readTrend>;
        }[] = [];
        let done = 0;
        let belowSma200 = 0;
        await pooled(tier1, 6, async (c) => {
          try {
            const candles = await historyCandles(c.symbol, 3);
            if (candles.length < 200) {
              send({ type: 'skip', symbol: c.symbol, reason: 'short-history' });
              return;
            }
            const trend = readTrend(candles, c.price);
            const support = readSupport(c.price, supportZones(pivotLows(candles)));
            const pre = gatesFor(
              { price: c.price, trend, support, fa: EMPTY_FA, marketCap: c.marketCap },
              { requireAboveSma200, caps }
            );
            const failed = pre.filter((g) => TIER1_KEYS.has(g.key) && !g.passed);
            /* Đếm mã rụng CHỈ vì cổng SMA200, để bảng trống nói được vì sao
               nó trống. Không có con số này thì "bật ô tích nên không còn mã
               nào" trông y hệt "thị trường không có mã nào đạt" - hai thứ cần
               hai hành động khác hẳn nhau. Đúng một cổng hỏng mới tính, vì
               con số phải trả lời được câu "bỏ tích thì mã này xét tiếp chứ?". */
            if (failed.length === 1 && failed[0].key === 'aboveSma200') belowSma200++;
            if (failed.length === 0) tier2.push({ c, support, trend });
          } catch (e: any) {
            /* Một mã hỏng không được làm chết cả lượt quét: nó là một dòng
               skip có LÝ DO THẬT, không phải một khoảng trống. */
            send({ type: 'skip', symbol: c.symbol, reason: String(e?.message ?? e).slice(0, 120) });
          } finally {
            send({ type: 'progress', done: ++done, total: tier1.length });
          }
        });

        /* ---- tầng 2: Finviz + SEC (đắt nhất, ít mã nhất) ---- */
        send({ type: 'phase', phase: 'fundamentals', total: tier2.length });
        const rows: LtCandidate[] = [];
        let done2 = 0;

        /* Một lần tra danh bạ CIK cho cả tầng (danh bạ cache 1 ngày). Mã
           không có CIK - ETF, hoặc chưa có trong file SEC - được NÓI RA là
           `no-cik`, không lặng lẽ thành "SEC không có gì". */
        let ciks: Record<string, string> = {};
        let cikMissing = new Set<string>();
        try {
          const r = await ciksFor(tier2.map((t) => t.c.symbol));
          ciks = r.found;
          cikMissing = new Set(r.missing);
        } catch (e: any) {
          /* Danh bạ hỏng thì cả tầng chạy không có SEC, với lý do thật trên
             từng dòng - không phải chết cả lượt quét. */
          for (const t of tier2) cikMissing.add(t.c.symbol);
          send({ type: 'skip', symbol: '*', reason: `cik-map: ${String(e?.message ?? e).slice(0, 100)}` });
        }

        /* Số 10-K của một mã. Trả về cả LÝ DO khi không có, vì "SEC không
           trả lời" và "SEC trả lời mà không có doanh thu cả năm" cần hai
           cách sửa khác nhau (mạng vs thang thẻ), và cả hai khác "ETF". */
        const secFor = async (symbol: string): Promise<{ sec: SecFundamentals | null; reason: string | null }> => {
          if (cikMissing.has(symbol) || !ciks[symbol]) return { sec: null, reason: 'no-cik' };
          try {
            const raw = await companyFacts(ciks[symbol]);
            const f = secFundamentals(raw);
            if (!f.revenue.length) return { sec: null, reason: `no-data: ${secDiagnosis(raw)}`.slice(0, 400) };
            return { sec: f, reason: null };
          } catch (e: any) {
            return { sec: null, reason: String(e?.message ?? e).slice(0, 200) };
          }
        };
        /* Song song 3 thôi: đây là trang web của người ta, không phải API có
           hạn mức công bố. Nhanh hơn nữa cũng chẳng để làm gì khi tầng này
           chỉ còn vài chục mã. */
        await pooled(tier2, 3, async ({ c, support, trend }) => {
          try {
            /* Finviz và SEC là hai host khác nhau - chạy song song, và một
               bên hỏng không kéo bên kia: SEC hỏng thì ba cổng SEC ra `?`,
               Finviz hỏng thì ném lỗi như trước (không có Finviz thì không
               có định giá, mã không xét được). */
            const [fv, secRes] = await Promise.all([finvizQuote(c.symbol), secFor(c.symbol)]);
            const { fa, missing } = parseFundamentals(fv.metrics);
            if (fa.pe !== null) await recordPe(c.symbol, fa.pe);
            const pe = await peContext(c.symbol, fa.pe);

            const input = {
              price: c.price, trend, support, fa, sec: secRes.sec, marketCap: c.marketCap,
            };
            const gates = gatesFor(input, { requireAboveSma200, caps });
            if (gates.some((g) => !g.passed)) return;

            const breakdown = scoreComponents(input, pe);
            rows.push({
              symbol: c.symbol,
              name: c.name,
              sector: c.sector || fv.profile?.sector || '',
              price: c.price,
              marketCap: c.marketCap,
              trend,
              nearestSupport: support.nearest,
              distancePct: support.distancePct,
              brokenSupport: support.broken,
              zoneCount: support.zones.length,
              fa,
              faMissing: missing,
              pe,
              sec: secRes.sec,
              secReason: secRes.reason,
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
        const at = new Date().toISOString();

        /* Lưu cũng TRƯỚC khi phát, cùng một lý do: từ đây trở đi mọi việc
           đắt đã làm xong, nên một client ngắt kết nối không được phép làm
           mất lượt quét vừa chạy. Lưu hỏng thì nói ra thành một dòng skip
           chứ không ném - mất chỗ lưu không đáng làm hỏng bảng đang có. */
        try {
          await saveLtScan(
            {
              universe,
              at,
              scanned: list.length,
              kept: rows.length,
              aboveSma200: requireAboveSma200,
              belowSma200,
              caps,
              capDropped,
              rows,
            },
            user
          );
        } catch (e: any) {
          send({ type: 'skip', symbol: '*', reason: `save: ${String(e?.message ?? e).slice(0, 100)}` });
        }

        for (const row of rows) send({ type: 'candidate', row });
        send({ type: 'done', scanned: list.length, kept: rows.length, at, belowSma200, capDropped });
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

/* Những cổng tầng 1 được phép xét - thuần kỹ thuật, tính từ nến ngày, nên
   chúng lọc được TRƯỚC khi tốn một lần cào Finviz hay một file SEC. Cổng
   SMA200 có tên ở đây vì đó chính là chỗ nó đáng giá nhất: nó cắt mạnh, và
   cắt ở tầng rẻ. */
const TIER1_KEYS = new Set(['trend', 'nearSupport', 'aboveSma200']);

/* Tầng 1 chưa có dữ liệu Finviz, nên nó chỉ được phép xét các cổng thuần kỹ
   thuật. Giá trị rỗng này làm bốn cổng còn lại ra `unknown` và ĐI QUA - đúng
   ý: chúng sẽ được xét thật ở tầng 2, chứ không bị loại oan ở đây. */
const EMPTY_FA = {
  eps: null, epsNextY: null, pe: null, forwardPe: null, peg: null, pb: null,
  roe: null, roic: null, profitMargin: null, debtEq: null, targetPrice: null,
  recom: null, marketCap: null,
};
