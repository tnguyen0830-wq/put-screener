import fs from 'node:fs/promises';
import path from 'node:path';
import { quotes } from './schwab';
import { historyBars } from './history';
import { sectorEtfForGics } from './rrgsectors';
import { nyDate, readMoves, type CloseBar, type MoveRead, type SeriesIn } from './moveread';

/**
 * Nạp dữ liệu cho `readMoves()`: SPY và ETF ngành của mã đang mở ở tab
 * Analyze. Chi phí nhỏ và có trần: MỘT request `/quotes` cho cả hai mã chuẩn
 * (giá sống + giờ báo giá), cộng nến ngày của chúng qua `historyBars()` — đã
 * cache theo ngày và dùng chung với Screener/My Portfolio, nên từ lần thứ hai
 * trong ngày là 0 request.
 *
 * Mỗi mã chuẩn hỏng ĐỘC LẬP và được ghi vào `errors`: SPY chết không được làm
 * mất phép so với ngành, và ngược lại. Không bao giờ ném — đây là phần thêm
 * của trang Analyze, không phải phần chính.
 */

const MARKET = 'SPY';

type BasketRow = { symbol: string; name: string; sector: string };
let basket: Map<string, BasketRow> | null = null;

/**
 * Dòng của mã trong rổ S&P 500 (`data/sp500.json`): tên công ty sạch (cho
 * Google News tìm theo TÊN — ALL, ON, IT, NOW vừa là mã vừa là từ thông dụng)
 * và ngành GICS (cho ETF ngành). Mã ngoài rổ trả `null` — ngành "chưa biết",
 * không đoán.
 */
export async function basketEntry(symbol: string): Promise<BasketRow | null> {
  if (!basket) {
    try {
      const raw = await fs.readFile(path.resolve(process.cwd(), 'data/sp500.json'), 'utf8');
      const list: BasketRow[] = JSON.parse(raw);
      basket = new Map(list.map((r) => [r.symbol, r]));
    } catch {
      basket = new Map();
    }
  }
  return basket.get(symbol) ?? null;
}

const errText = (e: any) => String(e?.message ?? e).slice(0, 200);

export async function loadMoves(input: {
  symbol: string;
  spot: number | null;
  recent: CloseBar[];
  hv20: number | null;
  gicsSector: string | null;
}): Promise<MoveRead> {
  const etf = sectorEtfForGics(input.gicsSector);
  const syms = etf ? [MARKET, etf] : [MARKET];
  const errors: { source: string; error: string }[] = [];

  const [qs, ...hist] = await Promise.allSettled([
    quotes(syms),
    ...syms.map((s) => historyBars(s)),
  ]);

  let sessionDate = nyDate(Date.now());
  const series = (sym: string, i: number): SeriesIn | null => {
    const q = qs.status === 'fulfilled' ? (qs.value as any)?.[sym]?.quote : null;
    const h = hist[i];
    if (qs.status === 'rejected') {
      errors.push({ source: `${sym} quote`, error: errText(qs.reason) });
      return null;
    }
    if (h.status === 'rejected') {
      errors.push({ source: `${sym} daily bars`, error: errText(h.reason) });
      return null;
    }
    const last = q?.lastPrice;
    if (typeof last !== 'number') {
      errors.push({ source: `${sym} quote`, error: 'no lastPrice in the quote' });
      return null;
    }
    return { symbol: sym, spot: last, bars: h.value };
  };

  /* Ngày của PHIÊN đang so lấy từ giờ báo giá SPY, không phải đồng hồ: thứ
     Bảy thì báo giá là của thứ Sáu, và "phiên gần nhất" phải là thứ Sáu so
     với thứ Năm — không phải thứ Bảy so với thứ Sáu (tức 0%). */
  if (qs.status === 'fulfilled') {
    const q = (qs.value as any)?.[MARKET]?.quote;
    const t = [q?.tradeTime, q?.quoteTime].find((v) => typeof v === 'number' && v > 0);
    if (typeof t === 'number') sessionDate = nyDate(t);
  }

  const market = series(MARKET, 0);
  const sector = etf ? series(etf, 1) : null;

  return readMoves({
    stock: { symbol: input.symbol, spot: input.spot, bars: input.recent },
    market,
    sector,
    marketSymbol: MARKET,
    sectorEtf: etf,
    sectorName: input.gicsSector,
    hv20: input.hv20,
    sessionDate,
    errors,
  });
}
