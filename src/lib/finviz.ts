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

import type { FinvizProfile } from './profile';

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
  '52W High', '52W Low', 'Earnings', 'Employees',
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
  /** Lĩnh vực / ngành / quốc gia và mô tả doanh nghiệp, cho khối hồ sơ công ty. */
  profile: FinvizProfile;
};

/**
 * Bóc phần hồ sơ công ty từ cùng trang quote.
 *
 * Lĩnh vực, ngành và quốc gia không đọc theo class CSS mà đọc theo tham số của
 * link screener — `f=sec_`, `f=ind_`, `f=geo_`. Đó là hợp đồng của chính bộ lọc
 * Finviz, đổi giao diện cũng không đổi, trong khi tên class thì đổi luôn.
 *
 * Mô tả thì ngược lại: phải bám vào layout, nên có kiểm tra độ dài trước khi
 * nhận — thà trống còn hơn đổ một mảnh HTML lạc lên màn hình.
 */
export function parseFinvizProfile(
  html: string,
  metrics: Record<string, string> = {}
): FinvizProfile {
  const found: Record<string, string> = {};
  // Dấu & trong href thường bị escape thành &amp;, nên ký tự ngay trước `f=`
  // có thể là ? hoặc & hoặc ; — cả ba đều tính, còn chữ khác thì không (tránh
  // khớp nhầm một tham số nào đó kết thúc bằng chữ f).
  const link = /href="[^"]*[?&;]f=(sec|ind|geo)_[^"]*"[^>]*>([^<]{1,60})</g;
  for (let m = link.exec(html); m; m = link.exec(html)) {
    const value = stripTags(m[2]);
    if (value && !found[m[1]]) found[m[1]] = value;
  }

  let description: string | null = null;
  const bi = html.search(/profile-bio/i);
  if (bi >= 0) {
    const chunk = html.slice(bi, bi + 8000);
    const end = chunk.indexOf('</div>');
    const text = stripTags(end > 0 ? chunk.slice(0, end) : chunk).replace(/^[^>]*>/, '').trim();
    if (text.length >= 100 && text.length <= 4000) description = text;
  }

  // Số nhân viên nằm trong chính bảng số liệu, không phải trong phần hồ sơ.
  const emp = parseInt((metrics['Employees'] ?? '').replace(/[^0-9]/g, ''), 10);

  return {
    sector: found.sec ?? null,
    industry: found.ind ?? null,
    country: found.geo ?? null,
    employees: Number.isFinite(emp) && emp > 0 ? emp : null,
    description,
  };
}

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

  return { metrics, ratings, profile: parseFinvizProfile(html, metrics) };
}
