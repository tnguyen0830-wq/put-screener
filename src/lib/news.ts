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
 * (Tìm kiếm trên X cần gói API trả phí của X - không có đường miễn phí nào
 * còn sống; nếu có key thì làm theo khuôn probe-trước như `/api/ttprobe`.)
 *
 * NGUỒN THỨ HAI là hồ sơ SEC (`secnews.ts`), và nó không cùng loại với tin
 * báo chí: báo chí là người ngoài VIẾT VỀ công ty, còn 8-K là chính công ty
 * BẮT BUỘC khai một sự kiện trọng yếu. Với câu hỏi "tại sao rớt" thì cái
 * thứ hai thường CHÍNH LÀ nguyên nhân.
 *
 * Hai nguồn HỎNG ĐỘC LẬP nhau. Yahoo chết không được làm mất hồ sơ SEC, và
 * ngược lại - gộp hai lỗi thành một "không lấy được tin" là bỏ đi nửa số
 * thông tin còn đọc được, và tệ hơn là nói với Claude rằng nó mù trong khi
 * thật ra nó vẫn thấy một nửa.
 */

import { secFilingNews } from './secnews';

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

/** Nguồn nào trả lời được, nguồn nào hỏng vì sao. */
export type NewsResult = {
  items: NewsItem[];
  /** Nguồn đã trả lời (kể cả trả về 0 bài). */
  ok: string[];
  failed: { source: string; error: string }[];
};

async function yahooNews(symbol: string): Promise<NewsItem[]> {
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
    .sort(sortNews);
}

/**
 * Bài gắn ít mã thì nhiều khả năng viết riêng về mã này -> ưu tiên. Cùng
 * mức tập trung thì bài mới hơn lên trước.
 *
 * Hồ sơ SEC luôn mang `tickerCount: 1` nên nó vào đúng nhóm trên cùng và
 * cạnh tranh bằng NGÀY với tin riêng về mã - đó là điều đúng: một 8-K hai
 * tháng trước không được đứng trên tiêu đề hôm nay, còn một bản tin thị
 * trường chung thì vẫn nằm dưới cả hai.
 */
function sortNews(a: NewsItem, b: NewsItem): number {
  const focus = a.tickerCount - b.tickerCount;
  return focus !== 0 ? focus : b.published.localeCompare(a.published);
}

/**
 * Tin của một mã từ MỌI nguồn, kèm việc nguồn nào hỏng.
 *
 * Không ném lỗi khi một nguồn chết: nơi gọi cần biết "Yahoo hỏng nhưng SEC
 * trả lời" chứ không phải một lỗi duy nhất nuốt hết. Chỉ khi KHÔNG nguồn
 * nào trả lời thì `items` rỗng và `failed` có đủ lý do thật.
 */
export async function symbolNewsAll(symbol: string, limit = 8): Promise<NewsResult> {
  const sources: { name: string; run: () => Promise<NewsItem[]> }[] = [
    { name: 'Yahoo Finance', run: () => yahooNews(symbol) },
    {
      name: 'SEC EDGAR filings',
      run: async () =>
        (await secFilingNews(symbol)).map((f) => ({
          title: f.title,
          publisher: f.publisher,
          link: f.link,
          published: f.published,
          /* Hồ sơ SEC theo định nghĩa là của đúng một công ty, nên nó luôn
             thuộc nhóm "riêng về mã này" khi xếp thứ tự. */
          tickerCount: 1,
          relatedTickers: [symbol],
        })),
    },
  ];

  const settled = await Promise.allSettled(sources.map((s) => s.run()));
  const items: NewsItem[] = [];
  const ok: string[] = [];
  const failed: { source: string; error: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      ok.push(sources[i].name);
      items.push(...r.value);
    } else {
      failed.push({
        source: sources[i].name,
        error: String(r.reason?.message ?? r.reason).slice(0, 200),
      });
    }
  });

  return { items: items.sort(sortNews).slice(0, limit), ok, failed };
}

/**
 * Giữ nguyên chữ ký cũ cho nơi gọi chỉ cần danh sách bài.
 *
 * Ném lỗi CHỈ KHI mọi nguồn đều hỏng - nếu không thì một nguồn chết sẽ giả
 * dạng thành "không lấy được tin" trong khi nguồn kia vẫn có bài.
 */
export async function symbolNews(symbol: string, limit = 8): Promise<NewsItem[]> {
  const r = await symbolNewsAll(symbol, limit);
  if (!r.ok.length && r.failed.length) {
    throw new Error(r.failed.map((f) => `${f.source}: ${f.error}`).join(' | '));
  }
  return r.items;
}
