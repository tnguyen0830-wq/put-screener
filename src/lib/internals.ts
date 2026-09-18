import fs from 'node:fs/promises';
import path from 'node:path';
import { quotes, intradayHistory } from './schwab';
import { inMarketHours, tradingDay } from './alerts';
import { ttConfigured } from './tastytrade';
import { loadTtIvRanks } from './ttearnings';
import { trackedSymbols } from './insiders';
import { uwConfigured } from './unusualwhales';
import { uwMarketTide, uwTotalOptionsVolume } from './uwmarket';
import {
  diffOrNull,
  diffSeries,
  meanOf,
  numField,
  sectorChanges,
  sessionOpenAt,
  topCaps,
  upDownRatio,
  type SectorChange,
  type Series,
  type SeriesPoint,
} from './internals-pure';
import { sp500Rows } from './sp500rows';

export type { Series, SeriesPoint } from './internals-pure';

/**
 * Market internals - đo được ở #165 trước khi viết dòng nào ở đây
 * (`/api/internalsprobe`, giữ lại vì đã trả giá xứng đáng, đúng khuôn
 * `/api/uwprobe`). Kết quả đo chia ba nhóm rõ rệt, và cả ba đều load-bearing
 * cho thiết kế file này:
 *
 *   - BỐN chỉ báo Schwab quote được VÀ có nến phút trong ngày ($TICK, $UVOL,
 *     $DVOL, $VIX) - vẽ được ngay từ /pricehistory, làm mới mỗi lần gọi,
 *     không cần lưu gì.
 *   - BA chỉ báo Schwab quote được nhưng /pricehistory trả 0 nến ($TICKQ,
 *     $ADV, $DECL, $PCCE) - có SỐ HIỆN TẠI nhưng không có ĐƯỜNG. Muốn có
 *     đường thì app phải tự lấy mẫu định kỳ và tự lưu, đúng khuôn
 *     gexhistory.ts đã làm cho GEX khi các nguồn khác cũng không có lịch sử.
 *   - HAI chỉ báo không cách viết nào Schwab quote được (NASDAQ
 *     Advance-Decline, CBOE Total Put/Call) - không có đường vòng nào từ
 *     Schwab, nói thẳng "không có dữ liệu" trên màn hình thay vì âm thầm bỏ
 *     qua hay lấy một con số gần đúng giả làm con số thật.
 *
 * Sau khi chủ app xác nhận tài khoản tastytrade đã hoạt động (#130/#135),
 * thêm MỘT chỉ báo thứ tám: IV rank trung bình toàn rổ đang theo dõi, đọc
 * từ đúng kho `ttearnings.ts` đã đồng bộ sẵn mỗi 15 phút cho cổng earnings -
 * không tốn thêm request nào tới tastytrade, chỉ đọc thêm một trường từ dữ
 * liệu đã có. Đây là một chỉ báo TÂM LÝ THỊ TRƯỜNG qua biến động ngụ ý,
 * khác nhóm với bảy chỉ báo TICK/ADV-DECL/Put-Call ở trên (đo dòng lệnh),
 * nên đứng riêng trong bảng nhưng cùng một tab vì cùng trả lời câu hỏi
 * "thị trường đang ở trạng thái nào".
 */

const CHARTABLE: { key: string; label: string; symbol: string }[] = [
  { key: 'nyseTick', label: 'NYSE TICK', symbol: '$TICK' },
  { key: 'nyseUvol', label: 'NYSE Up Volume', symbol: '$UVOL' },
  { key: 'nyseDvol', label: 'NYSE Down Volume', symbol: '$DVOL' },
  { key: 'vix', label: 'VIX', symbol: '$VIX' },
];

/**
 * Bốn chuỗi vẽ được thẳng từ Schwab, cộng chuỗi thứ năm dựng ra (UVOL trừ
 * DVOL) - đúng ô đầu tiên trong ảnh mẫu tapchiphowall.
 *
 * Một mã lỗi vì lý do KHÁC session (mã lạ, mạng chập chờn) không được kéo
 * mất ba mã còn lại - bắt riêng và trả về đường rỗng cho đúng mã đó. Nhưng
 * REAUTH_REQUIRED thì NÉM TIẾP: phiên Schwab chết phải trả 401 thật, không
 * được đọc thành "bốn chỉ báo đều rỗng" - đúng luật `/api/gex`/`/api/rrg`
 * đã ghi ("session expiry never papered over").
 */
type ChartableRaw = (typeof CHARTABLE)[number] & { points: SeriesPoint[] };

async function fetchChartable(c: (typeof CHARTABLE)[number]): Promise<ChartableRaw> {
  try {
    const hist = await intradayHistory(c.symbol, 5);
    const candles: any[] = Array.isArray(hist?.candles) ? hist.candles : [];
    const points: SeriesPoint[] = candles
      .filter((cd) => typeof cd?.close === 'number' && typeof cd?.datetime === 'number')
      .map((cd) => ({ t: cd.datetime, v: cd.close }));
    return { ...c, points };
  } catch (e: any) {
    if (String(e?.message ?? e).includes('REAUTH_REQUIRED')) throw e;
    return { ...c, points: [] as SeriesPoint[] };
  }
}

function toSeries(r: ChartableRaw): Series {
  return {
    key: r.key,
    label: r.label,
    points: r.points,
    current: r.points.length ? r.points[r.points.length - 1].v : null,
    source: 'schwab',
    asOf: r.points.length ? r.points[r.points.length - 1].t : null,
  };
}

async function chartableSeries(): Promise<Series[]> {
  /* Con số đầu thẻ đọc từ `/quotes` `lastPrice` - ĐÚNG trường thanh ticker
     (`/api/tape`) đang in trên cùng màn hình - chứ không phải giá đóng của
     nến 5 phút cuối. Chủ app đo được hai con số "chưa khớp" khi thẻ lấy
     nến (#176): nến cuối có thể cũ tới 5 phút trong phiên, và sau giờ thì
     giá đóng nến cuối lệch vài xu so với lần in cuối của chỉ số. Một màn
     hình, một con số cho một thứ - nên cùng nguồn, cùng trường; nến chỉ vẽ
     ĐƯỜNG. MỘT request quotes cho cả bốn mã. Quote hỏng (không phải hết
     phiên) thì rơi về giá đóng nến và NÓI RA qua `currentSource`. */
  const [raw, q] = await Promise.all([
    Promise.all(CHARTABLE.map(fetchChartable)),
    quotes(CHARTABLE.map((c) => c.symbol)).catch((e) => {
      if (String(e?.message ?? e).includes('REAUTH_REQUIRED')) throw e;
      return {} as Record<string, any>;
    }),
  ]);

  const out: Series[] = raw.map((r) => {
    const s = toSeries(r);
    const quote = q?.[r.symbol]?.quote;
    const last = quote?.lastPrice;
    if (typeof last !== 'number') return { ...s, currentSource: 'candle' as const };
    const qt = [quote?.quoteTime, quote?.tradeTime].find((v) => typeof v === 'number') as
      | number
      | undefined;
    return { ...s, current: last, asOf: qt ?? s.asOf, currentSource: 'quote' as const };
  });

  const uvol = out.find((r) => r.key === 'nyseUvol');
  const dvol = out.find((r) => r.key === 'nyseDvol');
  if (uvol && dvol && uvol.points.length && dvol.points.length) {
    const points = diffSeries(uvol.points, dvol.points);
    // Hiệu số của hai giá cuối (cùng trường quote) - cùng luật như trên; cả
    // hai cùng rơi về nến thì hiệu số cũng là của nến, và nói ra như thế.
    const fromQuote = uvol.currentSource === 'quote' && dvol.currentSource === 'quote';
    const current = fromQuote
      ? diffOrNull(uvol.current, dvol.current)
      : points[points.length - 1].v;
    out.push({
      key: 'uvolDvolDiff',
      label: 'NYSE UVOL − DVOL',
      points,
      current,
      source: 'schwab',
      asOf: fromQuote ? uvol.asOf : points[points.length - 1].t,
      currentSource: fromQuote ? 'quote' : 'candle',
    });
  }

  return out;
}

/* ------------------------------------------------------------------ *
 *  Ba chỉ báo tự lấy mẫu.
 * ------------------------------------------------------------------ */

const SAMPLED_SYMBOLS = ['$TICKQ', '$ADV', '$DECL', '$PCCE'];

type StoredPoint = {
  t: number;
  tickNasdaq: number | null;
  advDeclNyse: number | null;
  pccEquity: number | null;
  avgIvRank: number | null;
  /** Put/Call toàn thị trường từ UW - endpoint chỉ trả ảnh chụp luỹ kế của
   *  hôm nay (1 dòng), nên muốn có đường thì phải tự lấy mẫu như ba cái trên. */
  pccTotal: number | null;
};
type Store = { date: string; points: StoredPoint[] };

/* .cache/ chứ không /var/data: đúng khuôn ttearnings.json/pehistory.json -
   mất khi redeploy chỉ làm đường của NGÀY ĐÓ ngắn lại từ điểm deploy, tự
   đầy lại từ mẫu kế tiếp, không cần thêm biến môi trường hay bước tay nào
   trên Render. */
const STORE_FILE = () =>
  path.resolve(process.env.INTERNALS_PATH || './.cache/internals-history.json');

async function readStore(): Promise<Store> {
  try {
    const raw = JSON.parse(await fs.readFile(STORE_FILE(), 'utf8'));
    if (raw && typeof raw.date === 'string' && Array.isArray(raw.points)) return raw;
    return { date: tradingDay(), points: [] };
  } catch {
    return { date: tradingDay(), points: [] };
  }
}

async function writeStore(s: Store) {
  await fs.mkdir(path.dirname(STORE_FILE()), { recursive: true });
  const tmp = `${STORE_FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s));
  await fs.rename(tmp, STORE_FILE());
}

/**
 * Lấy một mẫu và lưu lại. Đi nhờ bộ đếm giờ 15 phút DUY NHẤT của
 * alert-runner.ts (xem chú thích ở đó) - không phải bộ đếm giờ thứ hai.
 *
 * Tự gác cổng giờ giao dịch NGAY TRONG hàm, đúng khuôn syncDarkpool(): lấy
 * mẫu ngoài giờ vừa vô nghĩa (không ai giao dịch, số không đổi) vừa tốn một
 * request Schwab mỗi 15 phút suốt 24 giờ. MỘT lượt /quotes cho cả bốn mã
 * (Schwab gộp lô sẵn), không phải bốn request riêng.
 */
export async function sampleInternals(now = new Date()): Promise<void> {
  if (!inMarketHours(now)) return;

  const q = await quotes(SAMPLED_SYMBOLS);
  const tickNasdaq = numField(q, '$TICKQ');
  const adv = numField(q, '$ADV');
  const decl = numField(q, '$DECL');
  const pccEquity = numField(q, '$PCCE');
  const advDeclNyse = diffOrNull(adv, decl);

  /* Hai nguồn phụ, hỏng ĐỘC LẬP với nhau và với Schwab: UW chết không được
     làm mất mẫu TICK/ADV-DECL vừa lấy được, và ngược lại. Một lượt lấy mẫu
     thiếu một trường là một khoảng trống trên đúng đường đó - chấp nhận
     được; mất cả lượt thì không. */
  const [ivSettled, pccSettled] = await Promise.allSettled([
    averageIvRank(),
    uwConfigured() ? uwTotalOptionsVolume() : Promise.resolve(null),
  ]);
  const avgIvRank = ivSettled.status === 'fulfilled' ? ivSettled.value : null;
  const pccTotal = pccSettled.status === 'fulfilled' ? pccSettled.value?.putCallRatio ?? null : null;

  const day = tradingDay(now);
  let store = await readStore();
  if (store.date !== day) store = { date: day, points: [] };
  store.points.push({ t: now.getTime(), tickNasdaq, advDeclNyse, pccEquity, avgIvRank, pccTotal });
  await writeStore(store);
}

/**
 * IV rank trung bình toàn rổ đang theo dõi - đọc kho `ttearnings.ts` ĐÃ
 * đồng bộ sẵn (đi nhờ chính bộ đếm giờ này qua `syncEarningsCalendar()`),
 * KHÔNG gọi thêm tastytrade lần nào ở đây. `null` khi tastytrade chưa cấu
 * hình (tự tắt, đúng khuôn UW/Telegram/web push - #130/#135 xác nhận có
 * cấu hình rồi, nhưng vẫn tự kiểm để không vỡ khi ai đó gỡ biến môi
 * trường) hoặc rổ theo dõi rỗng.
 */
async function averageIvRank(): Promise<number | null> {
  if (!ttConfigured()) return null;
  const { symbols } = await trackedSymbols();
  if (!symbols.length) return null;
  const ranks = await loadTtIvRanks();
  const values = symbols.map((s) => ranks[s.toUpperCase()] ?? null);
  return meanOf(values);
}

function sampledSeries(store: Store): Series[] {
  const build = (
    key: string,
    label: string,
    field: 'tickNasdaq' | 'advDeclNyse' | 'pccEquity' | 'avgIvRank' | 'pccTotal'
  ): Series => {
    // typeof, không phải !== null: điểm cũ lưu trước khi trường này tồn tại
    // (ví dụ avgIvRank) đọc ra `undefined`, và `undefined !== null` là true -
    // lọt qua bộ lọc rồi vẽ một điểm NaN nếu chỉ kiểm null.
    const points = store.points
      .filter((p) => typeof p[field] === 'number')
      .map((p) => ({ t: p.t, v: p[field] as number }));
    return {
      key,
      label,
      points,
      current: points.length ? points[points.length - 1].v : null,
      source: 'sampled',
      asOf: points.length ? points[points.length - 1].t : null,
    };
  };

  return [
    build('nasdaqTick', 'NASDAQ TICK', 'tickNasdaq'),
    build('advDeclNyse', 'NYSE ADV − DECL', 'advDeclNyse'),
    build('pccEquity', 'Put/Call Ratio (Equity)', 'pccEquity'),
    build('pccTotal', 'Put/Call Ratio (Total, UW)', 'pccTotal'),
    build('avgIvRank', 'IV Rank trung bình (tastytrade)', 'avgIvRank'),
  ];
}

/**
 * Hai chỉ báo #165 đo được là KHÔNG mã nào Schwab quote - liệt kê ra chứ
 * không âm thầm bỏ, để màn hình nói thẳng "không có" thay vì để người đọc
 * tưởng app quên vẽ.
 */
export type Unavailable = { key: string; label: string };
/**
 * Chỉ còn MỘT. Put/Call Total từng nằm đây, cho tới khi
 * `/api/breadthprobe` đo được UW có nó (và con số khớp 0,73 với ảnh mẫu
 * TradingView cùng phiên). NASDAQ Advance-Decline thì cả ba nguồn có key
 * đều không có: Schwab không quote mã nào, UW không bán bề rộng cổ phiếu
 * (`breadthFields` rỗng ở cả 5 endpoint thị trường), tastytrade/dxFeed
 * không trả dữ liệu cho cách viết nào đã thử.
 */
const UNAVAILABLE: Unavailable[] = [
  { key: 'nasdaqAdvDecl', label: 'NASDAQ Advance − Decline' },
];

/**
 * Market tide lấy RIÊNG chứ không đi cùng nhóm tự lấy mẫu: một lượt gọi đã
 * trả cả chuỗi trong ngày (đo được 81 điểm từ 09:30 New York), nên nó
 * thuộc nhóm "làm mới mỗi lần mở trang" như nến Schwab.
 *
 * LUÔN trả về một chuỗi, kể cả khi rỗng - bản đầu `return []` khi UW hỏng,
 * nên thẻ BIẾN MẤT khỏi lưới và "UW chết" trông y hệt "tính năng này không
 * tồn tại". Rỗng kèm `note` thì thẻ vẫn đứng đó và nói ra lý do.
 */
async function marketTideSeries(): Promise<Series[]> {
  const base = {
    key: 'marketTide',
    label: 'Net call − put premium (UW)',
    source: 'uw' as const,
  };
  const empty = (note: string): Series[] => [
    { ...base, points: [], current: null, asOf: null, note },
  ];

  if (!uwConfigured()) return empty('UW_API_KEY chưa được cấu hình');

  try {
    const points = await uwMarketTide();
    if (!points.length) return empty('UW trả lời nhưng không có điểm nào cho phiên này');
    return [
      {
        ...base,
        points,
        current: points[points.length - 1].v,
        asOf: points[points.length - 1].t,
      },
    ];
  } catch (e: any) {
    // Lời thật của UW, cắt ngắn: 401 (key hết hạn) và 404 (đổi endpoint)
    // cần hai cách sửa khác nhau, gộp thành "lỗi" là mất chỗ đó.
    return empty(String(e?.message ?? e).slice(0, 160));
  }
}

export type InternalsTables = {
  /** Biến động 1 ngày theo ngành, trọng số vốn hoá, từ rổ S&P 500. */
  sectors: SectorChange[];
  /** 14 mã vốn hoá lớn nhất RỔ S&P 500 (không phải NASDAQ 100 - app không
   *  có danh sách thành phần đó, và nhãn màn hình nói đúng rổ). */
  topCaps: { symbol: string; change: number }[];
  /** Vì sao hai bảng rỗng, khi rỗng. */
  note?: string;
};

export type Internals = {
  series: Series[];
  unavailable: Unavailable[];
  /** Sàn đang trong phiên 09:30–16:00 New York không (ngày lễ không xét). */
  marketOpen: boolean;
  /** Tỉ lệ khối lượng tăng/giảm NYSE (UVOL:DVOL), quy ước "-2.94:1" của
   *  trang mẫu. NASDAQ KHÔNG có: `$UVOLQ`/`$DVOLQ` chưa được đo ở Schwab
   *  (#165 chỉ đo bốn mã), nên không bịa một badge thứ hai. */
  nyseUpDown: number | null;
  tables: InternalsTables;
};

async function breadthTables(): Promise<InternalsTables> {
  try {
    const { rows } = await sp500Rows();
    return { sectors: sectorChanges(rows), topCaps: topCaps(rows, 14) };
  } catch (e: any) {
    if (String(e?.message ?? e).includes('REAUTH_REQUIRED')) throw e;
    return { sectors: [], topCaps: [], note: String(e?.message ?? e).slice(0, 160) };
  }
}

export async function marketInternals(now = new Date()): Promise<Internals> {
  /* Bốn nguồn, hỏng độc lập: Schwab hết phiên không được che mất market tide
     của UW, và UW chết không được làm mất nến Schwab; bảng ngành (6 request
     báo giá, cache 60s chung với bản đồ nhiệt) hỏng cũng không kéo bốn nến
     theo. Riêng REAUTH_REQUIRED của Schwab vẫn phải nổi lên thành 401 thật
     (xem chartableSeries), nên nhánh đó KHÔNG bị nuốt ở đây. */
  const [chartSettled, store, tideSettled, tables] = await Promise.all([
    chartableSeries().catch((e) => {
      if (String(e?.message ?? e).includes('REAUTH_REQUIRED')) throw e;
      return [] as Series[];
    }),
    readStore(),
    // marketTideSeries tự bắt lỗi thành một chuỗi rỗng KÈM lý do, nên
    // .catch ở đây chỉ là lưới an toàn cuối cùng.
    marketTideSeries().catch(() => [] as Series[]),
    breadthTables(),
  ]);

  const uvol = chartSettled.find((s) => s.key === 'nyseUvol');
  const dvol = chartSettled.find((s) => s.key === 'nyseDvol');

  return {
    series: [...chartSettled, ...sampledSeries(store), ...tideSettled],
    unavailable: UNAVAILABLE,
    marketOpen: sessionOpenAt(now),
    nyseUpDown: upDownRatio(uvol?.current ?? null, dvol?.current ?? null),
    tables,
  };
}
