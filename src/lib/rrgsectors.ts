import { dailyHistory } from './schwab';
import {
  MIN_WEEKS,
  directionOf,
  quadrantOf,
  rrgFromTrends,
  rsTrend,
  weeklyCloses,
  type Bar,
  type Direction,
  type Quadrant,
  type RrgPoint,
} from './rrg';

/**
 * Vòng xoay dòng tiền 11 ngành, tính MỘT LẦN và dùng chung.
 *
 * Phần tính này vốn nằm nguyên trong `/api/rrg/route.ts`. Nó được bóc ra khi
 * tab Đầu tư dài hạn cần cùng con số để lọc: hai đường tính song song là hai
 * con số có thể cãi nhau, và bài học #96/#99 của repo này là chúng SẼ cãi
 * nhau - biểu đồ nói ngành Y tế "đang hồi" còn bộ lọc lại loại mã Y tế, không
 * ai biết bên nào đúng. Route giờ chỉ còn là lớp vỏ HTTP.
 *
 * Toạ độ RRG là vị trí SO VỚI 10 ngành còn lại trong cùng tuần (xem `crossZ`
 * của rrg.ts), nên không có cách nào tính cho riêng một mã: bỏ mặt bằng chung
 * đi thì hai trục mất luôn định nghĩa. Vì vậy thứ tab Đầu tư dài hạn lọc được
 * là góc phần tư của NGÀNH mã đó, chứ không phải của chính mã đó - và màn
 * hình phải nói ra điều ấy, nếu không cái nhãn "đang hồi" sẽ bị đọc thành một
 * nhận định về chính công ty.
 */

const BENCHMARK = 'SPY';

const SECTORS: { key: string; symbol: string }[] = [
  { key: 'tech', symbol: 'XLK' },
  { key: 'fin', symbol: 'XLF' },
  { key: 'health', symbol: 'XLV' },
  { key: 'discretionary', symbol: 'XLY' },
  { key: 'staples', symbol: 'XLP' },
  { key: 'energy', symbol: 'XLE' },
  { key: 'industrial', symbol: 'XLI' },
  { key: 'material', symbol: 'XLB' },
  { key: 'realestate', symbol: 'XLRE' },
  { key: 'utility', symbol: 'XLU' },
  { key: 'comm', symbol: 'XLC' },
];

/**
 * Tên ngành GICS (cách `data/sp500.json` và Finviz-qua-route viết) → khoá
 * ngành của RRG.
 *
 * Bảng này LOAD-BEARING và phải tra khớp CHÍNH XÁC: đoán gần đúng thì một mã
 * Y tế có thể bị chấm bằng vòng xoay của ngành khác, và một nhãn sai trông y
 * hệt một nhãn đúng. Không khớp thì trả `null` - "chưa biết", đi qua kèm cờ -
 * chứ tuyệt đối không rơi về một ngành mặc định nào.
 *
 * Cả 11 tên đã được ĐO từ chính `data/sp500.json` (503 dòng, đúng 11 giá trị
 * riêng biệt), không phải chép từ trí nhớ.
 */
const GICS_TO_KEY: Record<string, string> = {
  'Information Technology': 'tech',
  Financials: 'fin',
  'Health Care': 'health',
  'Consumer Discretionary': 'discretionary',
  'Consumer Staples': 'staples',
  Energy: 'energy',
  Industrials: 'industrial',
  Materials: 'material',
  'Real Estate': 'realestate',
  Utilities: 'utility',
  'Communication Services': 'comm',
};

/**
 * ETF SPDR của một ngành GICS (`XLK` cho "Information Technology"...), dựng
 * từ CHÍNH hai bảng trên — không phải bảng thứ ba có thể trôi lệch. Tên lạ
 * trả `null`, không rơi về ngành mặc định (cùng lý do `GICS_TO_KEY`).
 */
export function sectorEtfForGics(gics: string | null | undefined): string | null {
  const key = gics ? GICS_TO_KEY[gics] : undefined;
  return key ? SECTORS.find((x) => x.key === key)?.symbol ?? null : null;
}

export type RrgSectorPoint = {
  key: string;
  symbol: string;
  quadrant: Quadrant;
  ratio: number;
  momentum: number;
  /** Hướng di chuyển gần nhất (8 phương la bàn), từ hai điểm cuối của đuôi. */
  direction: Direction;
  /** [RS-Ratio, RS-Momentum] theo thứ tự thời gian, cũ trước. */
  tail: [number, number][];
};

export type RrgSectors = {
  benchmark: string;
  weeks: number;
  from: string;
  to: string;
  points: RrgSectorPoint[];
  missing: string[];
};

/** Độ dài cái đuôi mặc định: 10 tuần, đủ thấy hướng xoay mà chưa thành mớ rối. */
const DEFAULT_TAIL_WEEKS = 10;

/** Ba lựa chọn cố định cộng "tất cả" - đúng bốn nút của tapchiphowall.com. */
export type WeeksParam = 5 | 10 | 20 | 'all';
export const WEEKS_OPTIONS: WeeksParam[] = [5, 10, 20, 'all'];

/**
 * Ba năm nến ngày ~ 156 tuần: đủ cho EMA 30 tuần khởi động, cửa sổ chuẩn hoá
 * 52 tuần, rồi vẫn còn dư cho cái đuôi - kể cả đuôi dài nhất (20 tuần) hay
 * "tất cả".
 */
const YEARS = 3;

/**
 * Toạ độ THÔ của cả rổ - trước khi cắt theo độ dài đuôi người dùng chọn.
 *
 * Tách khỏi phần cắt đuôi vì việc tốn Schwab request (12 lịch sử giá) và việc
 * chọn xem bao nhiêu tuần là hai việc khác nhau: đổi nút 5/10/20/Tất cả tuần
 * không được kéo theo một lượt gọi Schwab mới, nếu không bấm qua lại bốn nút
 * đó tốn y hệt bốn lần quét. Một cache DUY NHẤT cho phần thô, cắt đuôi tính
 * lại mỗi lần (rẻ, thuần bộ nhớ) - nên bốn độ dài đuôi luôn nhất quán với
 * nhau, không có đường tính song song nào có thể trôi lệch (bài học #96/#99).
 */
type RrgRaw = {
  benchTimes: number[];
  coords: Map<string, ({ ratio: number; momentum: number } | null)[]>;
  /** Ngành có lịch sử nhưng tuần cuối bị đứng lại (niêm yết ETF khác biệt). */
  stale: string[];
};

/* 12 request lịch sử giá cho một lần tính. Dữ liệu là theo TUẦN nên cache một
   giờ là thừa chặt chẽ - và cache nằm ở đây, dùng chung, nên tab Heatmap mở
   biểu đồ rồi tab Đầu tư dài hạn quét ngay sau đó KHÔNG tốn thêm request nào. */
const TTL_MS = 60 * 60 * 1000;
let rawCache: { at: number; body: RrgRaw } | null = null;

export class RrgError extends Error {
  constructor(message: string, readonly detail?: Record<string, unknown>) {
    super(message);
  }
}

async function computeRaw(): Promise<RrgRaw> {
  if (rawCache && Date.now() - rawCache.at < TTL_MS) return rawCache.body;

  const symbols = [BENCHMARK, ...SECTORS.map((s) => s.symbol)];
  const histories = await Promise.all(
    symbols.map((s) => dailyHistory(s, YEARS).catch(() => null))
  );

  const weekly = new Map<string, number[]>();
  const times = new Map<string, number[]>();
  symbols.forEach((symbol, i) => {
    const bars: Bar[] = (histories[i]?.candles ?? []).map((c: any) => ({
      datetime: c.datetime,
      close: c.close,
    }));
    const w = weeklyCloses(bars);
    weekly.set(symbol, w.map((x) => x.close));
    times.set(symbol, w.map((x) => x.t));
  });

  const bench = weekly.get(BENCHMARK) ?? [];
  if (bench.length < MIN_WEEKS) {
    throw new RrgError('RRG_NO_BENCHMARK', { weeks: bench.length, need: MIN_WEEKS });
  }

  // Toạ độ của một ngành là vị trí của nó so với 10 ngành còn lại trong cùng
  // tuần, nên cả rổ phải được tính chung một lượt.
  const benchTimes = times.get(BENCHMARK) ?? [];
  const lastBenchWeek = benchTimes[benchTimes.length - 1] ?? 0;

  const stale: string[] = [];
  const trends = new Map<string, (number | null)[]>();
  for (const s of SECTORS) {
    const series = weekly.get(s.symbol) ?? [];
    const stamps = times.get(s.symbol) ?? [];
    // Cắt cả hai chuỗi về cùng số tuần cuối: hai quỹ có thể lệch nhau vài
    // tuần đầu do ngày niêm yết khác nhau.
    const n = Math.min(series.length, bench.length);
    if (n < MIN_WEEKS) continue;
    // Mặt bằng chung chỉ có nghĩa khi mọi ngành cùng dừng ở một tuần. Ngành
    // nào dữ liệu đứng lại từ tuần trước thì để ra ngoài và gọi tên, chứ
    // không kéo nó vào so với tuần này.
    if (Math.abs(lastBenchWeek - (stamps[stamps.length - 1] ?? 0)) > 7 * 86_400_000) {
      stale.push(s.symbol);
      continue;
    }
    trends.set(s.key, rsTrend(series.slice(-n), bench.slice(-n)));
  }

  const coords = rrgFromTrends(trends);

  const body: RrgRaw = { benchTimes, coords, stale };
  rawCache = { at: Date.now(), body };
  return body;
}

/**
 * Toạ độ RRG đã cắt theo độ dài đuôi người dùng chọn.
 *
 * `weeksParam` mặc định 10 - giữ nguyên hành vi cũ cho nơi gọi không truyền gì
 * (tab Đầu tư dài hạn lọc theo góc phần tư HIỆN TẠI, độ dài đuôi không ảnh
 * hưởng tới điểm đó nên nó không cần quan tâm tham số này).
 */
export async function rrgSectors(weeksParam: WeeksParam = DEFAULT_TAIL_WEEKS): Promise<RrgSectors> {
  const raw = await computeRaw();
  const { benchTimes, coords, stale } = raw;

  // Một ngành thiếu lịch sử thì rơi khỏi biểu đồ và được gọi tên, chứ không
  // được vẽ bằng dữ liệu chắp vá.
  const missing: string[] = [...stale];
  const tailN = weeksParam === 'all' ? Infinity : weeksParam;
  let longestTail = 0;
  const points = SECTORS.map((s) => {
    if (stale.includes(s.symbol)) return null;
    const series = coords.get(s.key);
    const tail = (series ?? [])
      .filter((p): p is RrgPoint => p !== null)
      .slice(-tailN);

    if (tail.length < 2) {
      missing.push(s.symbol);
      return null;
    }
    longestTail = Math.max(longestTail, tail.length);
    const head = tail[tail.length - 1];
    const prev = tail[tail.length - 2];
    return {
      key: s.key,
      symbol: s.symbol,
      quadrant: quadrantOf(head),
      direction: directionOf(prev, head),
      ratio: head.ratio,
      momentum: head.momentum,
      tail: tail.map((p) => [p.ratio, p.momentum] as [number, number]),
    };
  }).filter(Boolean) as RrgSectorPoint[];

  if (!points.length) throw new RrgError('RRG_NO_DATA', { missing });

  return {
    benchmark: BENCHMARK,
    weeks: longestTail,
    from: new Date(benchTimes[Math.max(0, benchTimes.length - longestTail)] ?? benchTimes[0])
      .toISOString()
      .slice(0, 10),
    to: new Date(benchTimes[benchTimes.length - 1]).toISOString().slice(0, 10),
    points,
    missing,
  };
}

/**
 * Góc phần tư theo TÊN NGÀNH GICS, để tra thẳng từ `data/sp500.json`.
 *
 * Ngành không tra được (tên lạ, hoặc ngành rơi khỏi biểu đồ vì thiếu lịch sử)
 * đơn giản là không có mặt trong Map - nơi gọi đọc ra `undefined` và xử thành
 * "chưa biết", chứ không được đoán.
 */
export function quadrantBySector(r: RrgSectors): Map<string, Quadrant> {
  const byKey = new Map(r.points.map((p) => [p.key, p.quadrant]));
  const out = new Map<string, Quadrant>();
  for (const [gics, key] of Object.entries(GICS_TO_KEY)) {
    const q = byKey.get(key);
    if (q) out.set(gics, q);
  }
  return out;
}
