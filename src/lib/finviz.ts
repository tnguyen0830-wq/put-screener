/**
 * Đọc trang quote của Finviz.
 *
 * Finviz có những thứ Schwab hoàn toàn không có: giá mục tiêu đồng thuận, lịch
 * sử nâng/hạ bậc của các nhà phân tích, short float, P/E dự phóng, hiệu suất
 * theo nhiều khung thời gian. Với người bán put thì giá mục tiêu và chiều nâng
 * hạ gần đây là hai thứ đáng giá nhất — chúng cho biết giá đang ở đâu so với
 * mức thị trường cho là hợp lý.
 *
 * robots.txt của Finviz chặn /export, /chart, /image, /screener?* nhưng không
 * chặn trang quote. Chỉ gọi khi người dùng bấm phân tích một mã, không quét
 * hàng loạt.
 *
 * Đây là đọc HTML, không phải API có hợp đồng ổn định: Finviz đổi giao diện là
 * hỏng. Mọi trường đều có thể null và route gọi hàm này phải chịu được điều đó.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&nbsp;': ' ',
  '&rarr;': '→',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

const stripTags = (s: string) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|nbsp|rarr|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();

/** Các ô Schwab không có, hoặc có nhưng khác cách tính. */
const WANTED = [
  'Market Cap', 'Income', 'Sales', 'Book/sh',
  'P/E', 'Forward P/E', 'PEG', 'P/S', 'P/B', 'EV/EBITDA',
  'EPS (ttm)', 'EPS next Y', 'EPS next 5Y', 'EPS this Y',
  'Dividend TTM', 'Dividend Est.', 'Payout',
  'ROA', 'ROE', 'ROIC', 'Gross Margin', 'Oper. Margin', 'Profit Margin',
  'Debt/Eq', 'Current Ratio', 'Quick Ratio',
  'Target Price', 'Recom', 'Beta', 'ATR (14)', 'RSI (14)', 'Volatility',
  'Short Float', 'Short Ratio', 'Short Interest',
  'Rel Volume', 'Avg Volume', 'Inst Own', 'Insider Own',
  'Perf Month', 'Perf Quarter', 'Perf Year', 'Perf YTD',
  '52W High', '52W Low', 'Earnings',
] as const;

export type FinvizRating = {
  date: string;
  action: string;
  analyst: string;
  rating: string;
  target: string;
};

export type FinvizData = {
  metrics: Record<string, string>;
  ratings: FinvizRating[];
};

export async function finvizQuote(symbol: string): Promise<FinvizData> {
  // Finviz dùng gạch ngang cho cổ phiếu nhiều lớp: BRK/B -> BRK-B.
  const t = symbol.replace('/', '-');
  const r = await fetch(`https://finviz.com/quote.ashx?t=${encodeURIComponent(t)}`, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Finviz ${r.status}`);
  const html = await r.text();

  /* Bảng số liệu là các cặp <div class="snapshot-td-label">Nhãn</div> rồi tới
     <div class="snapshot-td-content">Giá trị</div>. Cắt theo nhãn rồi lấy khối
     nội dung ngay sau nó. */
  const metrics: Record<string, string> = {};
  const want = new Set<string>(WANTED as readonly string[]);
  for (const chunk of html.split('snapshot-td-label">').slice(1)) {
    // Vài nhãn bọc trong thẻ <a> (Target Price, Recom, Short Float) nên phải
    // bóc thẻ trước khi so khớp.
    const label = stripTags(chunk.slice(0, chunk.indexOf('</div>')));
    if (!want.has(label)) continue;
    const ci = chunk.indexOf('snapshot-td-content');
    if (ci < 0) continue;
    const value = stripTags(chunk.slice(ci, chunk.indexOf('</td>', ci)))
      .replace(/^[^>]*>/, '')
      .trim();
    if (value) metrics[label] = value;
  }

  /* Bảng nâng/hạ bậc: mỗi <tr> có 5 ô — ngày, hành động, nhà phân tích,
     đổi khuyến nghị, đổi giá mục tiêu. */
  const ratings: FinvizRating[] = [];
  const ri = html.indexOf('js-table-ratings');
  if (ri >= 0) {
    const table = html.slice(ri, html.indexOf('</table>', ri));
    for (const row of table.split('<tr').slice(1)) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
        stripTags(m[1])
      );
      if (cells.length < 4 || /^date$/i.test(cells[0])) continue;
      ratings.push({
        date: cells[0],
        action: cells[1],
        analyst: cells[2],
        rating: cells[3] ?? '',
        target: cells[4] ?? '',
      });
      if (ratings.length >= 8) break;
    }
  }

  return { metrics, ratings };
}
