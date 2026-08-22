import { NextRequest, NextResponse } from 'next/server';
import { quotes, dailyHistory, putChain } from '@/lib/schwab';
import { loadEarnings } from '@/lib/screener';
import { normalizeSymbol } from '@/lib/watchlist';
import { symbolNews } from '@/lib/news';
import { finvizQuote } from '@/lib/finviz';
import { fmpCompanyProfile, mergeProfile } from '@/lib/profile';
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
} from '@/lib/indicators';

export const dynamic = 'force-dynamic';

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Ba request Schwab cho mỗi lần phân tích: /quotes, /pricehistory, /chains.
 * Chỉ chạy khi người dùng bấm, nên không đụng tới hạn mức của lần quét rổ.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbol');
  if (!raw)
    return NextResponse.json({ error: 'Thiếu tham số symbol' }, { status: 400 });
  const symbol = normalizeSymbol(raw);

  try {
    const [q, hist, chain, earnings, news, finviz, fmpProfile] = await Promise.all([
      quotes([symbol]),
      dailyHistory(symbol, 2),
      // Cửa sổ 20–60 ngày: đủ để lấy IV của kỳ đáo hạn gần nhất đáng quan tâm
      // mà không kéo về cả chuỗi LEAPS.
      putChain(symbol, addDays(20), addDays(60)).catch(() => null),
      loadEarnings(),
      // Tin tức là phần phụ: hỏng thì phần còn lại vẫn trả về đủ.
      symbolNews(symbol).catch(() => []),
      // Finviz là đọc HTML, dễ hỏng khi họ đổi giao diện: hỏng thì bỏ qua.
      finvizQuote(symbol).catch(() => null),
      // Hồ sơ công ty: tự nuốt lỗi, lý do trả về trong `note`.
      fmpCompanyProfile(symbol),
    ]);

    const row = q[symbol];
    if (!row?.quote)
      return NextResponse.json(
        { error: `Schwab không có dữ liệu cho ${symbol}` },
        { status: 404 }
      );

    const candles: Candle[] = (hist?.candles ?? []).map((c: any) => ({
      datetime: c.datetime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    const closes = candles.map((c) => c.close);
    if (closes.length < 30)
      return NextResponse.json(
        { error: `Không đủ lịch sử giá cho ${symbol}` },
        { status: 404 }
      );

    const spot: number = row.quote.lastPrice;
    const sma20 = mean(closes, 20);
    const sma50 = mean(closes, 50);
    const sma200 = mean(closes, 200);
    const hv20 = realizedVol(closes, 20);
    const hv60 = realizedVol(closes, 60);
    const bb = bollinger(closes, 20, 2);
    const m = macd(closes);
    const a = atr(candles, 14);

    // IV tham chiếu: hợp đồng put có |delta| gần 0.30 nhất — cùng vùng delta mà
    // screener nhắm tới, nên IV/HV ở đây so sánh được với cột trong bảng kết quả.
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

    const today = new Date().toISOString().slice(0, 10);
    const nextEarnings = (earnings[symbol] || []).find((d) => d >= today) ?? null;

    const low52: number = row.quote['52WeekLow'] ?? 0;
    const high52: number = row.quote['52WeekHigh'] ?? 0;

    return NextResponse.json({
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
        // 0 = đáy 52 tuần, 1 = đỉnh 52 tuần
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
        // > 1: biến động 20 phiên đang cao hơn nền 60 phiên
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
        nextEarnings,
      },

      news,
      finviz,
      // Công ty này làm gì — Schwab không có dòng nào về chuyện đó, nên ghép từ
      // FMP và Finviz. null nghĩa là cả hai nguồn đều không nói gì.
      profile: mergeProfile(fmpProfile, finviz?.profile ?? null),

      meta: {
        bars: candles.length,
        firstBar: new Date(candles[0].datetime).toISOString().slice(0, 10),
        lastBar: new Date(candles[candles.length - 1].datetime)
          .toISOString()
          .slice(0, 10),
        optionable: row.reference?.optionable ?? null,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    const reauth = String(e.message).includes('REAUTH_REQUIRED');
    return NextResponse.json(
      { error: reauth ? 'Phiên Schwab hết hạn. Bấm Kết nối lại.' : e.message },
      { status: reauth ? 401 : 500 }
    );
  }
}
