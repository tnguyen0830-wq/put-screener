import { dailyHistory } from '@/lib/schwab';
import {
  MIN_WEEKS,
  quadrantOf,
  rrgFromTrends,
  rsTrend,
  weeklyCloses,
  type Bar,
} from '@/lib/rrg';

/**
 * Biểu đồ luân chuyển dòng tiền giữa 11 ngành của S&P 500.
 *
 * Không nằm dưới /api/md/*, vốn bị MD_API_TOKEN chặn cho app điện thoại: trình
 * duyệt mở trang này không có token để gửi.
 */
export const dynamic = 'force-dynamic';

/** Quỹ SPDR đại diện cho từng ngành GICS, cộng chỉ số tham chiếu. */
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

/** Độ dài cái đuôi: 10 tuần, đủ thấy hướng xoay mà chưa thành mớ rối. */
const TAIL_WEEKS = 10;

/**
 * Ba năm nến ngày ~ 156 tuần: đủ cho EMA 30 tuần khởi động, cửa sổ chuẩn hoá 52
 * tuần, rồi vẫn còn dư cho cái đuôi.
 */
const YEARS = 3;

/* 12 request lịch sử giá cho một lần vẽ. Dữ liệu là theo tuần nên cache một giờ
   - mở lại tab hay đổi theme không phải quét lại từ đầu. */
const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; body: unknown } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return Response.json(cache.body);

  try {
    const symbols = [BENCHMARK, ...SECTORS.map((s) => s.symbol)];
    const histories = await Promise.all(
      symbols.map((s) =>
        dailyHistory(s, YEARS).catch(() => null)
      )
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
      return Response.json(
        { error: 'RRG_NO_BENCHMARK', weeks: bench.length, need: MIN_WEEKS },
        { status: 502 }
      );
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

    // Một ngành thiếu lịch sử thì rơi khỏi biểu đồ và được gọi tên, chứ không
    // được vẽ bằng dữ liệu chắp vá.
    const missing: string[] = [...stale];
    const points = SECTORS.map((s) => {
      if (stale.includes(s.symbol)) return null;
      const series = coords.get(s.key);
      const tail = (series ?? [])
        .filter((p): p is { ratio: number; momentum: number } => p !== null)
        .slice(-TAIL_WEEKS);

      if (tail.length < 2) {
        missing.push(s.symbol);
        return null;
      }
      const head = tail[tail.length - 1];
      return {
        key: s.key,
        symbol: s.symbol,
        quadrant: quadrantOf(head),
        ratio: head.ratio,
        momentum: head.momentum,
        // [RS-Ratio, RS-Momentum] theo thứ tự thời gian, cũ trước.
        tail: tail.map((p) => [p.ratio, p.momentum] as [number, number]),
      };
    }).filter(Boolean);

    if (!points.length) {
      return Response.json({ error: 'RRG_NO_DATA', missing }, { status: 502 });
    }

    const body = {
      benchmark: BENCHMARK,
      weeks: TAIL_WEEKS,
      from: new Date(benchTimes[benchTimes.length - TAIL_WEEKS] ?? benchTimes[0])
        .toISOString()
        .slice(0, 10),
      to: new Date(benchTimes[benchTimes.length - 1]).toISOString().slice(0, 10),
      points,
      missing,
    };
    cache = { at: Date.now(), body };
    return Response.json(body);
  } catch (e: any) {
    const msg = String(e.message ?? e);
    return Response.json(
      { error: msg },
      { status: msg.includes('REAUTH_REQUIRED') ? 401 : 500 }
    );
  }
}
