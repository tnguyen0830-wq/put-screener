import fs from 'node:fs/promises';
import path from 'node:path';
import { quotes } from './schwab';

/**
 * Rổ S&P 500 kèm báo giá Schwab - bóc ra từ `/api/heatmap` để tab Bề rộng
 * TT (bảng ngành + top vốn hoá, #177) dùng CHUNG một lượt gọi và một cache
 * với bản đồ nhiệt, thay vì mỗi nơi tự gọi 6 request Schwab cho cùng 503
 * mã. Hai đường tính song song là hai con số có thể cãi nhau trên cùng một
 * màn hình (#96/#99/#147).
 *
 * Vốn hoá = giá × số cổ phiếu lưu hành, đều từ Schwab và real-time; biến
 * động 1 ngày là `netPercentChange` của chính Schwab.
 */
export type Constituent = { symbol: string; name: string; sector: string; industry?: string };

export type Sp500Row = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  price: number;
  change1d: number;
};

/* 503 báo giá = 6 request Schwab. Cache ngắn để đổi khung thời gian hoặc mở
   lại tab không phải quét lại từ đầu. */
let cache: { at: number; rows: Sp500Row[] } | null = null;
const TTL_MS = 60_000;

export async function sp500Rows(): Promise<{ rows: Sp500Row[]; at: number }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;

  const raw = await fs.readFile(path.resolve(process.cwd(), 'data/sp500.json'), 'utf8');
  const list: Constituent[] = JSON.parse(raw);
  const q = await quotes(list.map((c) => c.symbol.replace('.', '/')));

  const rows = list
    .map((c) => {
      const row = q[c.symbol.replace('.', '/')];
      const px = row?.quote?.lastPrice;
      const sh = row?.fundamental?.sharesOutstanding;
      if (!px || !sh) return null;
      return {
        symbol: c.symbol,
        name: c.name,
        sector: c.sector,
        // Ngành con GICS lấy từ danh sách rổ; thiếu thì lùi về ngành lớn.
        industry: c.industry || c.sector,
        marketCap: px * sh,
        price: px,
        change1d: row.quote.netPercentChange ?? 0,
      } as Sp500Row;
    })
    .filter((r): r is Sp500Row => !!r);

  cache = { at: Date.now(), rows };
  return cache;
}
