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
  /** `imageOf()` trên chính mục này. Google News RSS hay chỉ nhúng biểu
   *  tượng nhỏ của báo trong `<description>`, không phải ảnh bài viết thật
   *  - CHƯA ĐO được tỉ lệ, nên coi đây là "có thể có", không phải "luôn có
   *  ảnh đẹp". `null` khi không tìm được gì hợp lệ. */
  image: string | null;
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

/**
 * Ba hàm XML nhỏ được XUẤT ra để `newsfeed.ts` (tab Tin tức) dùng lại — một
 * bản chép thứ hai của cùng bộ giải mã là bản sẽ trôi lệch (cùng lý do
 * `ratelimit.ts` được tách ra).
 */
export function rssDecode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .trim();
}

export function rssTag(xml: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? rssDecode(m[1]) : '';
}
const decode = rssDecode;
const tagOf = rssTag;

/** Vài chục ký tự đầu, để lỗi nói ra được THỨ THẬT SỰ NHẬN ĐƯỢC. */
export function rssShape(xml: string): string {
  return xml.replace(/\s+/g, ' ').slice(0, 160);
}

/**
 * Ảnh minh hoạ của MỘT mục RSS/Atom, dung thứ - thử theo thứ tự phổ biến
 * nhất trước: `<media:thumbnail>`, `<media:content medium="image">`,
 * `<enclosure type="image/...">`, `<link rel="enclosure" type="image/...">`
 * (cách Atom viết cùng một ý - vài feed dùng thẻ này thay vì `<enclosure>`
 * kiểu RSS), `<itunes:image href="...">` (namespace podcast, một số báo tái
 * dùng cho ảnh đại diện bài viết), rồi `<img>` đầu tiên trong phần mô tả
 * (nhiều feed nhúng ảnh thẳng vào `<description>`/`<content:encoded>`).
 * KHÔNG đo được từ sandbox (mọi feed RSS đều 403 ở CONNECT - xem đầu
 * `newsfeed.ts`), nên đây là sáu cách đọc phổ biến chứ không phải hình dạng
 * đã xác nhận của một feed cụ thể; sai một cách thì vẫn còn năm cách kia,
 * và không cách nào khớp thì trả `null` - không có ảnh vẫn là một dòng tin
 * đọc được bình thường, một ảnh vỡ mới là thứ trông như app hỏng.
 *
 * **Nâng cấp 2026-09-19**: chủ app báo "nhiều tin không có hình" ở production
 * sau khi ảnh ĐÃ chạy cho một số tin - tức dây nối đúng, chỉ là cách đọc cũ
 * bỏ sót vài kiểu nhúng ảnh HỢP LỆ theo đúng chuẩn XML/Atom, không phải đoán
 * riêng cho một nguồn nào: (1) giá trị thuộc tính trong XML được phép bọc
 * NHÁY ĐƠN hoặc nháy kép, code cũ chỉ đọc nháy kép nên `url='...'` (một cách
 * viết hợp lệ, không hiếm ở feed tự sinh) bị bỏ qua hoàn toàn; (2) hai cách
 * nhúng ảnh mới ở trên (`link rel=enclosure`, `itunes:image`) chưa từng được
 * thử. Rộng hơn nhưng không đoán mò: cả ba đều là cú pháp RSS/Atom/podcast đã
 * có chuẩn, không phải suy đoán riêng cho CNBC hay Yahoo.
 */
export function imageOf(block: string): string | null {
  // Một điểm kiểm DUY NHẤT cho mọi nhánh - `url="/relative/path"` hay
  // `url="data:..."` phải bị loại giống hệt nhau, không phải chỉ nhánh
  // cuối cùng viết tay kiểm còn ba nhánh trên quên.
  const asHttpUrl = (raw: string | undefined): string | null => {
    if (!raw) return null;
    const u = rssDecode(raw);
    return /^https?:\/\//i.test(u) ? u : null;
  };
  // XML cho phép giá trị thuộc tính bọc nháy đơn HOẶC nháy kép - một điểm
  // đọc DUY NHẤT cho cả hai, để không nhánh nào (cũ hay mới) quên nháy đơn.
  const attrVal = (attrs: string, name: string): string | undefined => {
    const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs);
    return m ? m[1] ?? m[2] : undefined;
  };
  const attrUrl = (attrs: string, name = 'url') => asHttpUrl(attrVal(attrs, name));

  const thumb = /<media:thumbnail\b([^>]*)\/?>/i.exec(block);
  if (thumb) {
    const u = attrUrl(thumb[1]);
    if (u) return u;
  }

  for (const m of block.matchAll(/<media:content\b([^>]*)\/?>/gi)) {
    const attrs = m[1];
    const medium = attrVal(attrs, 'medium');
    const type = attrVal(attrs, 'type');
    if ((medium && medium !== 'image') || (type && !/^image\//i.test(type))) continue;
    const u = attrUrl(attrs);
    if (u) return u;
  }

  const enclosure = /<enclosure\b([^>]*)\/?>/i.exec(block);
  if (enclosure) {
    const type = attrVal(enclosure[1], 'type');
    if (!type || /^image\//i.test(type)) {
      const u = attrUrl(enclosure[1]);
      if (u) return u;
    }
  }

  // Atom: `<link rel="enclosure" type="image/..." href="...">` - cùng ý
  // nghĩa với `<enclosure>` của RSS, khác cú pháp. `rel` khác "enclosure"
  // (ví dụ "alternate", "self") bị bỏ qua - đó là link bài viết, không phải
  // ảnh.
  for (const m of block.matchAll(/<link\b([^>]*)\/?>/gi)) {
    const attrs = m[1];
    if (attrVal(attrs, 'rel')?.toLowerCase() !== 'enclosure') continue;
    const type = attrVal(attrs, 'type');
    if (type && !/^image\//i.test(type)) continue;
    const u = attrUrl(attrs, 'href');
    if (u) return u;
  }

  const itunesImg = /<itunes:image\b([^>]*)\/?>/i.exec(block);
  if (itunesImg) {
    const u = attrUrl(itunesImg[1], 'href');
    if (u) return u;
  }

  for (const tag of ['content:encoded', 'description', 'summary']) {
    const body = rssTag(block, tag);
    const img = /<img\b([^>]*)\/?>/i.exec(body);
    const u = img ? attrUrl(img[1], 'src') : null;
    if (u) return u;
  }

  return null;
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
      throw new Error(`Google News: not an RSS feed (${rssShape(xml)})`);
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

    out.push({ title, publisher: source, link, published: new Date(t).toISOString(), image: imageOf(b) });
  }

  return out.sort((a, b) => b.published.localeCompare(a.published));
}

/* ------------------------------------------------------------------ *
 *  503 của Google: PHÂN LOẠI, không đoán.
 * ------------------------------------------------------------------ */

/**
 * Một cái 503 của Google có HAI nghĩa dẫn tới hai cách sửa NGƯỢC nhau:
 * Google sập tạm (thử lại là xong) hay Google chặn dải IP trung tâm dữ
 * liệu (thử lại vô ích vĩnh viễn, phải đổi nguồn). #153 đã cho lỗi mang
 * theo BODY để trả lời câu đó - nhưng vẫn bắt người đọc tự nhìn body rồi
 * tự kết luận. Hàm này đọc hộ, vì trang chặn của Google tự xưng tên bằng
 * những chữ rất đặc trưng.
 *
 * Đây là PHÉP ĐO trên thứ nhận được, không phải phỏng đoán: không khớp chữ
 * nào thì trả `unavailable`, tức vẫn coi là hỏng tạm và vẫn thử lại.
 */
export type GnewsFailure = 'blocked' | 'unavailable';

const BLOCK_SIGNS = [
  'unusual traffic',
  'automated queries',
  'our systems have detected',
  '/sorry/index',
  'recaptcha',
  'captcha',
];

export function classifyGnewsBody(body: string): GnewsFailure {
  const b = (body ?? '').toLowerCase();
  return BLOCK_SIGNS.some((w) => b.includes(w)) ? 'blocked' : 'unavailable';
}

/**
 * Đo được là BỊ CHẶN thì nghỉ hẳn một lúc.
 *
 * Không phải để tiết kiệm request - mà vì một nguồn đã bị chặn sẽ hỏng y
 * hệt ở MỌI lượt gọi tiếp theo, nên để nguyên là in ra cùng một dòng lỗi
 * trong `failed` mãi mãi, và một dòng lỗi lặp vô hạn là một dòng lỗi bị bỏ
 * qua. 6 tiếng chứ không vĩnh viễn, cố ý: nếu hoá ra Google chỉ chặn tạm
 * theo nhịp thì app tự hồi phục mà không cần ai deploy lại.
 *
 * Trạng thái này nằm trong RAM: deploy lại là quên - đúng ý, vì deploy có
 * thể đổi cả IP thoát.
 */
export const BLOCK_COOLDOWN_MS = 6 * 60 * 60_000;

let blockedUntil = 0;

/** Chỉ để test đặt lại; không nơi nào trong app gọi. */
export function _resetGnewsBlock() {
  blockedUntil = 0;
}

export const gnewsBlockedUntil = () => blockedUntil;

/**
 * Gọi MỘT URL của Google News RSS, dùng chung cho tìm theo mã (`gnewsSearch`)
 * và tìm theo CHỦ ĐỀ (`gnewsTopic`, tab Tin tức). Tách ra để cả hai đi qua
 * cùng một cửa: cùng thời gian nghỉ khi bị chặn, cùng cách đọc body lỗi —
 * hai bản chép của đoạn "đọc body rồi phân loại" là hai bản sẽ trôi lệch, và
 * bản trôi là bản đang giữ một cái 503 câm.
 */
export async function gnewsFetch(url: string, label = 'Google News'): Promise<GnewsItem[]> {
  /* Đang trong thời gian nghỉ vì ĐÃ ĐO được là bị chặn: ném ngay, và nói
     rõ đây là quyết định của app chứ không phải câu trả lời của Google -
     hai chuyện đó cần hai cách sửa khác nhau. */
  if (Date.now() < blockedUntil) {
    const mins = Math.ceil((blockedUntil - Date.now()) / 60_000);
    throw new Error(
      `${label} blocked - app tạm ngừng hỏi thêm ${mins} phút nữa. ` +
        'Lần gọi gần nhất nhận đúng trang chặn của Google (chặn dải IP trung ' +
        'tâm dữ liệu), nên thử lại ngay cũng chỉ nhận lại đúng trang đó.'
    );
  }

  const r = await fetch(url, {
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
    const kind = classifyGnewsBody(body);
    if (kind === 'blocked') blockedUntil = Date.now() + BLOCK_COOLDOWN_MS;
    /* Thứ tự trường: trạng thái, rồi KẾT LUẬN, rồi mới tới trích body -
       chuỗi này bị cắt ở 200 ký tự khi lên prompt và màn hình, nên thứ
       đáng giá nhất phải đứng trước (#102). */
    throw new Error(
      `${label} ${r.status} ${kind}` +
        (kind === 'blocked' ? ' (trang chặn của Google, không phải sập tạm)' : '') +
        (body ? ` - ${rssShape(body)}` : ' (thân rỗng)')
    );
  }
  return parseGnewsRss(await r.text());
}

export async function gnewsSearch(
  symbol: string,
  name?: string | null,
  limit = 8
): Promise<GnewsItem[]> {
  return (await gnewsFetch(gnewsUrl(symbol, name))).slice(0, limit);
}

/**
 * Tìm theo CHỦ ĐỀ, cho tab Tin tức: `q` là một câu tìm kiếm tự do
 * ("stock market OR Wall Street"), không phải mã. Cùng cửa `gnewsFetch`,
 * nên bị chặn một lần là cả hai đường cùng nghỉ — đúng, vì Google chặn
 * theo IP thoát chứ không theo câu hỏi.
 */
export function gnewsTopicUrl(q: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US%3Aen`;
}

export async function gnewsTopic(q: string, limit = 40): Promise<GnewsItem[]> {
  return (await gnewsFetch(gnewsTopicUrl(q), 'Google News (chủ đề)')).slice(0, limit);
}
