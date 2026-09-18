/**
 * Chỉ số kỹ thuật + IV tham chiếu cho một mã, tính từ Schwab.
 *
 * Bóc ra khỏi `/api/analyze` thành một hàm dùng chung, vì #96/#99/#147 đã
 * dạy đúng bài học này nhiều lần: MỘT phép tính, dùng chung — hai đường
 * tính song song sẽ trôi lệch, và ở đây trôi lệch đặc biệt dễ thấy vì cùng
 * một mã có thể được đọc từ CẢ HAI nơi trong cùng một phiên (tab Analyze
 * và nút "Tại sao rớt?" của tab Đầu tư dài hạn) - hai con số RSI khác nhau
 * cho cùng một mã ngay trong cùng một câu hỏi là thứ người dùng phát hiện
 * trước lập trình viên.
 *
 * Cố ý KHÔNG gồm earnings/tin tức/Finviz/hồ sơ công ty: đó là phần riêng
 * của từng nơi gọi (`/api/analyze` cần cả bốn; nút "Tại sao rớt?" đã có
 * tin tức riêng từ `news.ts` và Finviz riêng từ chính lượt quét Long-term
 * `row.fa` - gọi lại Finviz ở đây là tốn thêm một lần cào HTML mà kết quả
 * có thể LỆCH với con số đã hiện trên bảng, đúng bẫy "hai nguồn cùng một
 * sự thật" mà repo này luôn tránh).
 */

import { quotes, dailyHistory, putChain } from './schwab';
import {
  atr,
  bollinger,
  ema,
  macd,
  mean,
  realizedVol,
  rsi,
  streakAbove,
  type Candle,
} from './indicators';

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export type TechnicalSnapshot = {
  symbol: string;
  name: string;
  exchange: string;
  assetSubType: string | null;
  price: {
    spot: number;
    change: number | null;
    changePct: number | null;
    bid: number | null;
    ask: number | null;
    volume: number | null;
    low52: number;
    high52: number;
    pos52: number | null;
  };
  technical: {
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    vsSma20: number | null;
    vsSma50: number | null;
    vsSma200: number | null;
    sma200Streak: number | null;
    ema20: number | null;
    rsi14: number | null;
    macd: ReturnType<typeof macd>;
    atr14: number | null;
    atrPct: number | null;
    bollinger: ReturnType<typeof bollinger>;
    hv20: number | null;
    hv60: number | null;
    volRatio: number | null;
  };
  options: {
    iv: number | null;
    ivHv: number | null;
    refDelta: number | null;
    refStrike: number | null;
    refExpiration: string | null;
  };
  /**
   * Chỉ các trường Schwab trả sẵn trong `quotes()` - không có `nextEarnings`,
   * vì trường đó cần hợp `earnings.json` + lịch tastytrade (`loadEarnings()`)
   * mà không phải nơi gọi nào cũng cần trả về đúng dạng đó.
   */
  fundamental: {
    eps: number | null;
    peRatio: number | null;
    divAmount: number | null;
    divYield: number | null;
    divExDate: string | null;
    sharesOutstanding: number | null;
    marketCap: number | null;
    avgVolume10d: number | null;
    avgVolume1y: number | null;
    lastEarnings: string | null;
  };
  meta: {
    bars: number;
    firstBar: string;
    lastBar: string;
    optionable: boolean | null;
    fetchedAt: string;
  };
};

/**
 * Ba request Schwab song song: /quotes, /pricehistory, /chains.
 *
 * Ném lỗi khi thiếu dữ liệu hoặc phiên hết hạn (`REAUTH_REQUIRED` truyền
 * nguyên qua) - nơi gọi tự quyết định cách xuống hạng, đúng khuôn `news.ts`
 * (`symbolNewsAll` không ném khi một nguồn chết, nhưng hàm đơn lẻ này THÌ
 * ném, vì nó là MỘT nguồn duy nhất, không phải một tổ hợp nhiều nguồn).
 */
export async function technicalSnapshot(symbol: string): Promise<TechnicalSnapshot> {
  const [q, hist, chain] = await Promise.all([
    quotes([symbol]),
    dailyHistory(symbol, 2),
    // Cửa sổ 20-60 ngày: đủ để lấy IV của kỳ đáo hạn gần nhất đáng quan tâm
    // mà không kéo về cả chuỗi LEAPS.
    putChain(symbol, addDays(20), addDays(60)).catch(() => null),
  ]);

  const row = q[symbol];
  if (!row?.quote) throw new Error(`Schwab không có dữ liệu cho ${symbol}`);

  const candles: Candle[] = (hist?.candles ?? []).map((c: any) => ({
    datetime: c.datetime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
  const closes = candles.map((c) => c.close);
  if (closes.length < 30) throw new Error(`Không đủ lịch sử giá cho ${symbol}`);

  const spot: number = row.quote.lastPrice;
  const sma20 = mean(closes, 20);
  const sma50 = mean(closes, 50);
  const sma200 = mean(closes, 200);
  const hv20 = realizedVol(closes, 20);
  const hv60 = realizedVol(closes, 60);
  const bb = bollinger(closes, 20, 2);
  const m = macd(closes);
  const a = atr(candles, 14);

  // IV tham chiếu: hợp đồng put có |delta| gần 0.30 nhất - cùng vùng delta
  // mà screener nhắm tới, nên IV/HV so sánh được với cột trong bảng kết quả.
  const puts: any[] = Object.values(chain?.putExpDateMap ?? {}).flatMap((exp: any) =>
    Object.values(exp).flat()
  );
  const ref = puts
    .filter((c: any) => c.volatility > 0 && Math.abs(c.delta ?? 0) > 0)
    .sort(
      (x: any, y: any) =>
        Math.abs(Math.abs(x.delta) - 0.3) - Math.abs(Math.abs(y.delta) - 0.3)
    )[0];
  const iv = ref ? ref.volatility / 100 : null;

  const low52: number = row.quote['52WeekLow'] ?? 0;
  const high52: number = row.quote['52WeekHigh'] ?? 0;

  return {
    symbol,
    name: row.reference?.description ?? symbol,
    exchange: row.reference?.exchangeName ?? row.reference?.exchange ?? '',
    assetSubType: row.assetSubType ?? null,

    price: {
      spot,
      change: row.quote.netChange ?? null,
      changePct: row.quote.netPercentChange ?? null,
      bid: row.quote.bidPrice ?? null,
      ask: row.quote.askPrice ?? null,
      volume: row.quote.totalVolume ?? null,
      low52,
      high52,
      pos52: high52 > low52 ? (spot - low52) / (high52 - low52) : null,
    },

    technical: {
      sma20,
      sma50,
      sma200,
      vsSma20: sma20 ? (spot - sma20) / sma20 : null,
      vsSma50: sma50 ? (spot - sma50) / sma50 : null,
      vsSma200: sma200 ? (spot - sma200) / sma200 : null,
      sma200Streak: sma200 ? streakAbove(closes, sma200) : null,
      ema20: ema(closes, 20),
      rsi14: rsi(closes, 14),
      macd: m,
      atr14: a,
      atrPct: a ? a / spot : null,
      bollinger: bb,
      hv20,
      hv60,
      volRatio: hv20 && hv60 ? hv20 / hv60 : null,
    },

    options: {
      iv,
      ivHv: iv && hv20 ? iv / hv20 : null,
      refDelta: ref?.delta ?? null,
      refStrike: ref?.strikePrice ?? null,
      refExpiration: ref?.expirationDate?.slice(0, 10) ?? null,
    },

    fundamental: {
      eps: row.fundamental?.eps ?? null,
      peRatio: row.fundamental?.peRatio ?? null,
      divAmount: row.fundamental?.divAmount ?? null,
      divYield: row.fundamental?.divYield ?? null,
      divExDate: row.fundamental?.divExDate?.slice(0, 10) ?? null,
      sharesOutstanding: row.fundamental?.sharesOutstanding ?? null,
      marketCap: row.fundamental?.sharesOutstanding
        ? row.fundamental.sharesOutstanding * spot
        : null,
      avgVolume10d: row.fundamental?.avg10DaysVolume ?? null,
      avgVolume1y: row.fundamental?.avg1YearVolume ?? null,
      lastEarnings: row.fundamental?.lastEarningsDate?.slice(0, 10) ?? null,
    },

    meta: {
      bars: candles.length,
      firstBar: new Date(candles[0].datetime).toISOString().slice(0, 10),
      lastBar: new Date(candles[candles.length - 1].datetime)
        .toISOString()
        .slice(0, 10),
      optionable: row.reference?.optionable ?? null,
      fetchedAt: new Date().toISOString(),
    },
  };
}
