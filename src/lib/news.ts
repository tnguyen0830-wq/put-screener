/**
 * Tin tức theo mã, lấy từ endpoint tìm kiếm của Yahoo Finance.
 *
 * Không cần API key và không cần crumb (khác với quoteSummary). Đổi lại, kết quả
 * là tìm kiếm toàn văn nên trả về cả những bài chỉ nhắc tới mã trong danh sách
 * liên quan — bản tin thị trường chung, bài so sánh cùng ngành. Hàm dưới lọc
 * theo `relatedTickers` rồi xếp bài viết riêng về mã lên trước.
 *
 * NGUỒN THỨ HAI là hồ sơ SEC (`secnews.ts`), và nó không cùng loại với tin
 * báo chí: báo chí là người ngoài VIẾT VỀ công ty, còn 8-K là chính công ty
 * BẮT BUỘC khai một sự kiện trọng yếu. Với câu hỏi "tại sao rớt" thì cái
 * thứ hai thường CHÍNH LÀ nguyên nhân.
 *
 * NGUỒN THỨ BA là Google News RSS (`gnews.ts`) - không phải một toà báo mà
 * là bộ gom tin của hàng trăm toà báo, miễn phí và không cần key. Nó có mặt
 * vì Yahoo một mình là MỘT điểm chết duy nhất, và vì Yahoo chỉ trả về bài
 * mà chính nó gắn `relatedTickers`, nên bài nào Yahoo không gắn mã là bài
 * app không bao giờ nhìn thấy.
 *
 * X/Twitter và Reddit KHÔNG có ở đây, và vì hai lý do khác nhau. X cần gói
 * API trả phí, không còn đường miễn phí nào sống. Reddit thì còn bậc miễn
 * phí nhưng cần đăng ký app lấy client id + secret, tức là một host CÓ KEY -
 * theo luật repo thì phải probe trước rồi mới viết code. Và quan trọng hơn:
 * Reddit là BÌNH LUẬN chứ không phải tin, người ta đoán lý do SAU khi giá đã
 * rớt; đổ thẳng vào prompt "tại sao rớt" là mời đúng cái bịa đặt mà prompt
 * đó sinh ra để chặn. Nếu làm thì phải là một tầng riêng, dán nhãn rõ là
 * bàn tán chưa kiểm chứng, cả trong prompt lẫn trên màn hình.
 *
 * BA nguồn HỎNG ĐỘC LẬP nhau. Yahoo chết không được làm mất hồ sơ SEC hay
 * Google News, và ngược lại - gộp mọi lỗi thành một "không lấy được tin" là
 * bỏ đi phần còn đọc được, và tệ hơn là nói với Claude rằng nó mù trong khi
 * thật ra nó vẫn thấy hai phần ba.
 */

import { gnewsSearch } from './gnews';
import { secFilingNews } from './secnews';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

export type NewsItem = {
  title: string;
  publisher: string;
  link: string;
  published: string;
  /**
   * Số mã mà bài viết gắn kèm. 1 nghĩa là bài viết riêng về mã này.
   *
   * `null` = CHƯA BIẾT, không phải 0 và không phải 1: Google News trả về kết
   * quả của một câu tìm kiếm và không gắn mã cho bài nào cả. Ghi 1 ở đó là
   * khẳng định bài viết riêng về công ty này trong khi không ai kiểm chứng.
   */
  tickerCount: number | null;
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

/**
 * Tin Yahoo cho một mã.
 *
 * XUẤT RA ngoài (trước đây là hàm riêng tư) vì tầng cảnh báo báo chí
 * (`pressalerts.ts`) cần ĐÚNG nguồn này và chỉ nguồn này: nó là nguồn duy
 * nhất trong ba nguồn vừa đã chạy thật ở production, vừa gắn `relatedTickers`
 * cho từng bài - mà cổng "chỉ bài riêng về một mã" của tầng đó dựa hẳn vào
 * con số ấy. Chép lại thành bản thứ hai là để hai bản trôi lệch, đúng bài
 * học #96/#99/#147.
 */
export async function yahooNews(symbol: string): Promise<NewsItem[]> {
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
  const focus = focusOf(a) - focusOf(b);
  return focus !== 0 ? focus : b.published.localeCompare(a.published);
}

/**
 * Bài CHƯA BIẾT gắn mấy mã nằm ở 1.5: dưới một bài đã xác nhận là riêng về
 * mã này (1), trên một bản tin thị trường đã xác nhận nhắc nhiều mã (>= 2).
 * Đó là đúng chỗ của một phép chưa đo: không được ưu tiên như thứ đã kiểm,
 * cũng không bị dìm xuống như thứ đã biết là loãng.
 */
const UNKNOWN_FOCUS = 1.5;
const focusOf = (n: NewsItem) => n.tickerCount ?? UNKNOWN_FOCUS;

/**
 * Khoá gộp trùng: Yahoo và Google News gom tin từ cùng một toà báo nên một
 * bài dễ về hai lần dưới hai đường link khác nhau. Không gộp thì hạn mức 8
 * bài bị chính bản sao ăn hết, và Claude đọc một tin lặp lại thành hai
 * nguồn độc lập cùng xác nhận - tức một bằng chứng mạnh hơn sự thật.
 */
const dedupKey = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);

/**
 * Tin của một mã từ MỌI nguồn, kèm việc nguồn nào hỏng.
 *
 * Không ném lỗi khi một nguồn chết: nơi gọi cần biết "Yahoo hỏng nhưng SEC
 * trả lời" chứ không phải một lỗi duy nhất nuốt hết. Chỉ khi KHÔNG nguồn
 * nào trả lời thì `items` rỗng và `failed` có đủ lý do thật.
 */
export async function symbolNewsAll(
  symbol: string,
  limit = 8,
  /**
   * Tên công ty, nếu nơi gọi đã có sẵn. Google News tìm theo chữ nên tên
   * công ty cho kết quả tốt hơn hẳn mã: ALL, ON, IT, KEY, CAR, NOW vừa là
   * mã vừa là từ tiếng Anh thông dụng. Không có tên thì vẫn chạy, chỉ là
   * câu tìm hẹp hơn (xem `gnewsQuery`).
   */
  name?: string | null
): Promise<NewsResult> {
  const sources: { name: string; run: () => Promise<NewsItem[]> }[] = [
    { name: 'Yahoo Finance', run: () => yahooNews(symbol) },
    {
      name: 'Google News',
      run: async () =>
        (await gnewsSearch(symbol, name)).map((g) => ({
          ...g,
          /* Google không gắn mã cho bài: CHƯA BIẾT, không phải 1. */
          tickerCount: null,
          relatedTickers: [],
        })),
    },
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

  /* Gộp trùng SAU khi xếp, nên bản SỐNG SÓT là bản xếp cao hơn: bài đã xác
     nhận riêng về mã này thắng bản sao chưa biết gắn mã, và cùng hạng thì
     bản mới hơn thắng. Gộp trước khi xếp là để may rủi quyết định. */
  const seen = new Set<string>();
  const merged = items.sort(sortNews).filter((n) => {
    const k = dedupKey(n.title);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { items: merged.slice(0, limit), ok, failed };
}

/**
 * Giữ nguyên chữ ký cũ cho nơi gọi chỉ cần danh sách bài.
 *
 * Ném lỗi CHỈ KHI mọi nguồn đều hỏng - nếu không thì một nguồn chết sẽ giả
 * dạng thành "không lấy được tin" trong khi nguồn kia vẫn có bài.
 */
export async function symbolNews(
  symbol: string,
  limit = 8,
  name?: string | null
): Promise<NewsItem[]> {
  const r = await symbolNewsAll(symbol, limit, name);
  if (!r.ok.length && r.failed.length) {
    throw new Error(r.failed.map((f) => `${f.source}: ${f.error}`).join(' | '));
  }
  return r.items;
}
