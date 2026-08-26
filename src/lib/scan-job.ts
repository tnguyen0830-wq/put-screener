import fs from 'node:fs/promises';
import path from 'node:path';
import { quotes, fullChain } from './schwab';
import {
  evaluate,
  flattenPuts,
  flattenCalls,
  termStructureAndSkew,
  realizedVol,
  changePct,
  sma,
  recordIv,
  recordSkew,
  flushSnapshots,
  flushSkewSnapshots,
  loadEarnings,
  windowFrom,
  windowTo,
  type UnderlyingContext,
} from './screener';
import { readWatchlist } from './watchlist';
import { saveScan } from './scan-store';
import { historyBars } from './history';
import { isOn, type Candidate, type Filters, type StreamEvent, type Universe } from './types';

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


/**
 * Một lần quét, chạy trên server, KHÔNG phụ thuộc trình duyệt còn mở hay không.
 *
 * Trước đây toàn bộ việc quét nằm trong thân của luồng NDJSON: đóng tab thì
 * trình duyệt ngắt kết nối, luồng bị huỷ, và lần quét chết ngay giữa chừng -
 * nên bước lưu ở cuối không bao giờ chạy tới. Muốn có kết quả thì phải ngồi
 * mở tab suốt 4-8 phút, tức là đúng cái bất tiện cần giải quyết.
 *
 * Giờ việc quét là một "công việc" sống trong tiến trình server. Luồng NDJSON
 * chỉ ĐỌC THEO công việc đó. Trình duyệt ngắt thì chỉ mỗi cái luồng dừng, còn
 * công việc chạy tiếp tới khi xong rồi tự lưu. Mở app lại lúc nào cũng bắt
 * được đúng tiến độ đang chạy.
 *
 * Chỉ một công việc tại một thời điểm: bấm quét trong lúc đang quét thì nối
 * vào lần đang chạy chứ không mở thêm lần thứ hai - Schwab có trần
 * 100 request/phút, chạy song song hai lần quét là tự bóp cổ mình.
 */

export type ScanJob = {
  universe: Universe;
  startedAt: number;
  status: 'running' | 'done' | 'error';
  /** Mọi sự kiện từ đầu lần quét. Nối vào giữa chừng thì phát lại từ đây. */
  events: StreamEvent[];
  rows: Candidate[];
};

let job: ScanJob | null = null;

export const currentScan = () => job;

/** Bắt đầu quét, hoặc trả về lần đang chạy nếu có. */
export function startScan(filters: Filters): ScanJob {
  if (job?.status === 'running') return job;

  const started = Date.now();
  const j: ScanJob = {
    universe: filters.universe,
    startedAt: started,
    status: 'running',
    events: [],
    rows: [],
  };
  job = j;

  // Ghi vào công việc thay vì đẩy thẳng ra luồng. Luồng nào đang xem sẽ tự
  // đọc mảng này; không có ai xem thì cũng chẳng sao.
  const send = (e: StreamEvent) => {
    j.events.push(e);
    if (e.type === 'candidate') j.rows.push(e.data);
  };

  // Cố ý không await: hàm này trả về ngay, công việc chạy tiếp phía sau.
  // App chạy như một tiến trình Node dài hạn trên Render nên promise trôi
  // như thế này thật sự chạy tới cùng.
  void (async () => {
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
      // capital budget can never produce a tradeable put. With the capital
      // criterion switched off there is no budget to compare against, so
      // every ticker goes on to the chain fetch - that is the slow path.
      const capOn = isOn(filters, 'capital');
      const drawdownOn = isOn(filters, 'drawdown');
      const survivors: (Constituent & { quote: any })[] = [];
      for (const c of list) {
        const row = q[c.symbol];
        const spot = row?.quote?.lastPrice;
        if (!spot) {
          send({ type: 'skip', symbol: c.symbol, reason: 'no quote' });
          continue;
        }
        if (capOn && spot * 100 > filters.maxCapital) {
          send({ type: 'skip', symbol: c.symbol, reason: 'quá vốn' });
          continue;
        }
        // Same trick as the capital budget: a stock still near its high can
        // never satisfy a drawdown floor, so drop it before paying for its
        // option chain. evaluate() re-checks; this only saves the fetch.
        if (drawdownOn) {
          const hi = row?.quote?.['52WeekHigh'] ?? 0;
          if (hi > 0 && ((hi - spot) / hi) * 100 < filters.minDrawdownPct) {
            send({ type: 'skip', symbol: c.symbol, reason: 'chưa rớt đủ' });
            continue;
          }
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
      // Gom lại để lưu khi quét xong. Server đã cầm sẵn từng ứng viên lúc
      // gửi đi, nên lưu ở đây rẻ hơn hẳn việc bắt trình duyệt gửi ngược
      // toàn bộ kết quả về.
      const collected: Candidate[] = [];

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
            chg20Pct: changePct(bars, 20),
          };

          if (filters.requireAboveSma200 && u.sma200 && u.spot <= u.sma200) {
            send({ type: 'skip', symbol: c.symbol, reason: 'dưới SMA200' });
            return;
          }

          // ALL, not PUT: term structure and put skew need call IV too,
          // and windowFrom/windowTo already widen the range to bracket
          // 20-65 DTE for them. Same one request as the old PUT-only
          // fetch, just a bigger payload.
          const chain = await fullChain(c.symbol, from, to);
          const contracts = flattenPuts(chain);
          const calls = flattenCalls(chain);

          // One IV reading per symbol per day builds the IV Rank history.
          const ref = contracts
            .filter((x) => x.volatility > 0 && Math.abs(x.delta ?? 0) > 0)
            .sort(
              (a, b) =>
                Math.abs(Math.abs(a.delta) - 0.3) -
                Math.abs(Math.abs(b.delta) - 0.3)
            )[0];
          if (ref) await recordIv(c.symbol, ref.volatility / 100);

          // Same idea for put skew: today's reading is recorded before
          // evaluate() reads the z-score, so the gate never blocks on
          // history that does not exist yet.
          const termSkew = termStructureAndSkew(contracts, calls, u.spot);
          if (termSkew.skew !== null) await recordSkew(c.symbol, termSkew.skew);

          const best = await evaluate(u, contracts, filters, earnings, termSkew);
          if (best) {
            found++;
            collected.push(best);
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
      await flushSkewSnapshots();

      // Lưu tự động, không có nút "Lưu": một lần quét tám phút mà phải nhớ
      // bấm lưu thì sớm muộn cũng có lần quên. Hỏng chỗ này không được
      // làm hỏng lần quét - kết quả đã stream xong về màn hình rồi.
      try {
        await saveScan({
          universe: filters.universe,
          at: Date.now(),
          scanned: survivors.length,
          ms: Date.now() - started,
          rows: collected,
        });
      } catch (e: any) {
        send({
          type: 'error',
          message: `Quét xong nhưng không lưu lại được: ${String(e?.message ?? e)}`,
        });
      }

      send({
        type: 'done',
        scanned: survivors.length,
        found,
        ms: Date.now() - started,
      });
      j.status = 'done';
    } catch (e: any) {
      // Phiên Schwab hết hạn cần một câu người đọc hiểu được, khác với lỗi
      // dữ liệu thường - một cái bấm "Kết nối lại" là xong, cái kia không.
      const raw = String(e?.message ?? e);
      send({
        type: 'error',
        message: raw.includes('REAUTH_REQUIRED')
          ? 'Phiên Schwab đã hết hạn. Bấm Kết nối lại.'
          : raw,
      });
      j.status = 'error';
    }
  })();

  return j;
}
