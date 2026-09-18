/**
 * Google News RSS: nguồn tin BÁO CHÍ thứ hai cho câu hỏi "tại sao rớt".
 *
 * Vì sao thêm nguồn này chứ không phải nguồn khác: nó MIỄN PHÍ, KHÔNG CẦN
 * KEY, không cần đăng ký gì, và nó không phải một toà báo - nó là bộ gom
 * tin của hàng trăm toà báo (Reuters, Bloomberg, CNBC, Barron's, các báo
 * địa phương). Yahoo một mình là một điểm chết duy nhất, và Yahoo chỉ gắn
 * bài theo danh sách `relatedTickers` của chính nó nên bài nào Yahoo không
 * gắn mã là bài app không bao giờ thấy.
 *
 * KHÔNG ĐO ĐƯỢC TỪ SANDBOX, và điều đó không nói lên gì về production.
 * Đo 2026-09-18: `news.google.com` bị proxy từ chối 403 ở bước CONNECT -
 * nhưng `query1.finance.yahoo.com` (nguồn ĐANG CHẠY THẬT trong production
 * từ lâu) cũng bị từ chối y hệt. Tức "không đo được từ đây" đúng bằng tình
 * trạng của nguồn đã chạy tốt, chứ không phải một rủi ro mới. Theo đúng
 * khuôn CBOE (#109): viết code đọc DUNG THỨ, và khi bóc hụt thì IN RA thứ
 * thật sự nhận được thay vì trả về rỗng im lặng - #143 sau đó đo lại và
 * phỏng đoán hồi ấy đúng từng chi tiết.
 *
 * Khác biệt quan trọng so với Yahoo và SEC: **Google News KHÔNG gắn mã cho
 * bài viết**. Nó trả về kết quả của một câu tìm kiếm. Nên `tickerCount` ở
 * đây là `null` (CHƯA BIẾT) chứ không phải `1` - gán 1 là khẳng định bài
 * viết riêng về công ty này trong khi không ai kiểm chứng điều đó, đúng
 * kiểu biến "chưa biết" thành lời khẳng định mà repo này cấm.
 */

export type GnewsItem = {
  title: string;
  publisher: string;
  link: string;
  /** ISO. Bài không có ngày đọc được thì bị loại (xem `parseGnewsRss`). */
  published: string;
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

/** Bài cũ hơn mốc này không giải thích được cú rớt hiện tại. */
export const MAX_AGE_DAYS = 45;

/**
 * Hậu tố pháp nhân bị cắt khỏi tên công ty trước khi tìm.
 *
 * Tên trong rổ ghi kiểu "Nike, Inc." hay "Apple Inc." Để nguyên trong dấu
 * nháy kép là ép Google khớp đúng chuỗi đó, mà tiêu đề báo gần như không
 * bao giờ viết đầy đủ như vậy - tức tự bóp số bài về gần 0.
 */
const SUFFIX =
  /[\s,]+(?:incorporated|inc|corporation|corp|company|co|limited|ltd|plc|holdings|holding|group|sa|nv|ag|the)\.?$/i;

export function cleanCompanyName(name: string): string {
  let s = (name ?? '').trim();
  // "Alphabet Inc. Class C" / "Berkshire Hathaway Inc. Class B"
  s = s.replace(/\s+class\s+[a-z]$/i, '').trim();
  // Cắt lặp: "Nike, Inc." -> "Nike"; "Vornado Realty Trust Inc" -> hết Inc.
  for (let i = 0; i < 3; i++) {
    const next = s.replace(SUFFIX, '').trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * Câu tìm kiếm.
 *
 * Dùng TÊN CÔNG TY khi có, vì mã cổ phiếu là một cái bẫy thật: ALL, ON, IT,
 * KEY, CAR, GOOD, NOW đều vừa là mã vừa là từ tiếng Anh thông dụng, nên tìm
 * theo mã trần sẽ ra một trang tin rác trông y như tin thật. Chữ "stock"
 * ghim kết quả về phía tin tài chính. Không có tên thì lùi về mã, đặt trong
 * nháy kép để Google khớp nguyên chữ.
 */
export function gnewsQuery(symbol: string, name?: string | null): string {
  const n = cleanCompanyName(name ?? '');
  // Tên trùng chính mã (rổ nhiều khi chỉ có mã) thì không có thêm thông tin.
  const useName = n.length >= 2 && n.toUpperCase() !== symbol.toUpperCase();
  return useName ? `"${n}" stock` : `"${symbol.replace('/', '-')}" stock`;
}

export function gnewsUrl(symbol: string, name?: string | null): string {
  const q = encodeURIComponent(gnewsQuery(symbol, name));
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US%3Aen`;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .trim();
}

function tagOf(xml: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? decode(m[1]) : '';
}

/** Vài chục ký tự đầu, để lỗi nói ra được THỨ THẬT SỰ NHẬN ĐƯỢC. */
function shapeOf(xml: string): string {
  return xml.replace(/\s+/g, ' ').slice(0, 160);
}

/**
 * Bóc RSS.
 *
 * Tách riêng khỏi phần gọi mạng để test được mà không cần Internet - cùng
 * lý do `cboeToChain()` và `parseForm4()` là hàm thuần.
 *
 * Hai nhánh hỏng cố ý KHÁC NHAU, vì hai cách sửa khác nhau:
 *  - có `<channel>` mà không có `<item>` = feed thật, không có bài -> `[]`.
 *  - không có `<channel>` = Google trả về thứ khác (trang chặn, trang đồng
 *    ý cookie, HTML lỗi) -> NÉM kèm 160 ký tự đầu. Trả rỗng ở đây là biến
 *    "bị chặn" thành "không có tin gì xấu", tức một kết luận sai.
 */
export function parseGnewsRss(xml: string, now = Date.now()): GnewsItem[] {
  const blocks = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  if (!blocks.length) {
    if (!/<channel[\s>]/i.test(xml)) {
      throw new Error(`Google News: not an RSS feed (${shapeOf(xml)})`);
    }
    return [];
  }

  const cutoff = now - MAX_AGE_DAYS * 86_400_000;
  const out: GnewsItem[] = [];

  for (const b of blocks) {
    const link = tagOf(b, 'link');
    if (!link) continue;

    /* Ngày không đọc được thì BỎ, không phải để trống: một tiêu đề không
       gắn được vào thời gian thì không trả lời được câu "vì sao rớt tuần
       này" - nó chỉ làm loãng danh sách. */
    const t = Date.parse(tagOf(b, 'pubDate'));
    if (!Number.isFinite(t) || t < cutoff) continue;

    /* Google viết tiêu đề là "Tiêu đề thật - Tên báo" và để tên báo trong
       <source>. Cắt đúng cái đuôi đó chứ không cắt ở dấu gạch NGANG cuối
       cùng bất kỳ - rất nhiều tiêu đề có sẵn dấu gạch giữa câu. */
    const source = tagOf(b, 'source');
    let title = tagOf(b, 'title');
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim();
    }
    if (!title) continue;

    out.push({ title, publisher: source, link, published: new Date(t).toISOString() });
  }

  return out.sort((a, b) => b.published.localeCompare(a.published));
}

export async function gnewsSearch(
  symbol: string,
  name?: string | null,
  limit = 8
): Promise<GnewsItem[]> {
  const r = await fetch(gnewsUrl(symbol, name), {
    headers: { 'User-Agent': UA },
    cache: 'no-store',
  });
  /* ĐỌC BODY CẢ KHI HỎNG. Bản #149 ném ngay ở đây và vứt body đi, nên
     phép đo đầu tiên ở production chỉ nói được "Google News 503" - đúng
     con số, sai chỗ cần biết. Một cái 503 của Google có ít nhất hai nghĩa
     dẫn tới hai cách sửa NGƯỢC nhau: Google đang sập tạm (thử lại là xong)
     hay Google chặn dải IP của trung tâm dữ liệu (thử lại vô ích suốt
     đời, phải đổi cách hoàn toàn) - và chính BODY là thứ nói ra, vì trang
     chặn của Google viết thẳng "unusual traffic from your computer
     network". Đúng bài học #130: một mã lỗi không nói được lỗi của AI.
     Trạng thái đứng TRƯỚC, trích body đứng SAU, vì chuỗi này bị cắt ở 200
     ký tự khi lên prompt và màn hình - bài học #102 về thứ tự trường. */
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(
      `Google News ${r.status}${body ? ` - ${shapeOf(body)}` : ' (thân rỗng)'}`
    );
  }
  return parseGnewsRss(await r.text()).slice(0, limit);
}
