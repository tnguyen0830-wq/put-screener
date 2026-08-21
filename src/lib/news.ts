/**
 * Tin tức theo mã, lấy từ endpoint tìm kiếm của Yahoo Finance.
 *
 * Không cần API key và không cần crumb (khác với quoteSummary). Đổi lại, kết quả
 * là tìm kiếm toàn văn nên trả về cả những bài chỉ nhắc tới mã trong danh sách
 * liên quan — bản tin thị trường chung, bài so sánh cùng ngành. Hàm dưới lọc
 * theo `relatedTickers` rồi xếp bài viết riêng về mã lên trước.
 *
 * X/Twitter, StockTwits, Reddit đều đóng API công khai hoặc bắt trả phí, nên
 * không có nguồn mạng xã hội nào ở đây. Tin ở đây là tin báo chí tài chính.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

export type NewsItem = {
  title: string;
  publisher: string;
  link: string;
  published: string;
  /** Số mã mà bài viết gắn kèm. 1 nghĩa là bài viết riêng về mã này. */
  tickerCount: number;
  relatedTickers: string[];
};

// Schwab viết cổ phiếu nhiều lớp bằng gạch chéo (BRK/B); Yahoo dùng gạch ngang.
const toYahoo = (s: string) => s.replace('/', '-');

export async function symbolNews(symbol: string, limit = 8): Promise<NewsItem[]> {
  const y = toYahoo(symbol);
  const url =
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(y)}` +
    `&newsCount=20&quotesCount=0&enableFuzzyQuery=false`;

  const r = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' });
  if (!r.ok) throw new Error(`Yahoo news ${r.status}`);
  const raw = (await r.json())?.news ?? [];

  return raw
    .filter((n: any) => (n.relatedTickers ?? []).includes(y))
    .map((n: any) => ({
      title: n.title,
      publisher: n.publisher ?? '',
      link: n.link,
      published: new Date((n.providerPublishTime ?? 0) * 1000).toISOString(),
      tickerCount: (n.relatedTickers ?? []).length,
      relatedTickers: n.relatedTickers ?? [],
    }))
    .sort((a: NewsItem, b: NewsItem) => {
      // Bài gắn ít mã thì nhiều khả năng viết riêng về mã này -> ưu tiên.
      // Cùng mức tập trung thì bài mới hơn lên trước.
      const focus = a.tickerCount - b.tickerCount;
      return focus !== 0 ? focus : b.published.localeCompare(a.published);
    })
    .slice(0, limit);
}
