/**
 * Tầng thứ BA của cảnh báo thời gian thực: tiêu đề BÁO CHÍ.
 *
 * Chủ app đặt hàng thẳng ("thêm tiêu đề báo chí vô đi") sau khi #155 đã
 * chạy với hai tầng: hồ sơ 8-K và giá chạy mạnh.
 *
 * ============================================================
 * VÌ SAO NÓ LÀ MỘT TẦNG RIÊNG, KHÔNG TRỘN VÀO 8-K
 * ============================================================
 *
 * 8-K là chính công ty BỊ LUẬT BẮT BUỘC khai một sự kiện trọng yếu - nguồn
 * gốc. Tiêu đề báo là NGƯỜI NGOÀI viết về công ty: nhanh hơn (phóng viên
 * không phải chờ hết hạn nộp hồ sơ) nhưng yếu hơn hẳn về bằng chứng - có
 * thể là tin đồn, có thể là bài suy diễn, có thể là một bài "5 cổ phiếu
 * đáng chú ý" nhắc tên công ty đúng một lần. Gộp hai thứ đó vào một dòng
 * thông báo là làm loãng đúng cái tín hiệu đáng tin nhất, nên mỗi cảnh báo
 * báo chí mang nhãn `[Báo chí]` ngay ở đầu tiêu đề và thân nói rõ đây là
 * bên thứ ba viết, chưa kiểm chứng.
 *
 * ============================================================
 * BA CỔNG, VÀ LÝ DO CỦA TỪNG CÁI - vì mặc định của tin tức là ỒN
 * ============================================================
 *
 * Luật sẵn có của repo (alerts.ts): "một hộp thư kêu suốt là một hộp thư bị
 * bỏ qua, kể cả lúc nó nói chuyện thật". Tin tức là nguồn dễ vi phạm luật
 * đó nhất trong cả app - mỗi mã vốn hoá lớn có vài bài mỗi giờ. Nên:
 *
 *  1. **CHỈ bài riêng về một mã** (`tickerCount === 1`). Yahoo tự gắn
 *     `relatedTickers` cho mỗi bài, nên đây là số ĐO ĐƯỢC chứ không phải
 *     phỏng đoán. Bài gắn nhiều mã gần như luôn là bản tin thị trường hoặc
 *     bài so sánh cùng ngành - đúng thứ tiếng ồn cần chặn. Cố ý KHÔNG nới
 *     cổng này cho tin nặng: nếu chuyện thật sự nghiêm trọng thì tầng 8-K
 *     sẽ bắt được, và hai tầng che cho nhau chính là lý do có hai tầng.
 *
 *  2. **Danh sách TỪ KHOÁ CHO PHÉP**, không phải danh sách loại trừ - cùng
 *     khuôn `MATERIAL_ITEMS` của liveevents.ts. Tiêu đề không khớp từ khoá
 *     nào thì được ĐẾM chứ không gửi, nên "yên tĩnh" không bao giờ trông
 *     giống "hỏng".
 *
 *  3. **Trần số cảnh báo mỗi lượt** (`MAX_PRESS_ALERTS`), và mỗi mã nhiều
 *     nhất MỘT. Một ngày tin dữ thật sự thì 5 dòng là đúng, 40 dòng là một
 *     hộp thư bị tắt thông báo. Phần vượt trần được ĐẾM và hiện lên màn
 *     hình, không biến mất im lặng.
 *
 * ============================================================
 * VÌ SAO CHỈ YAHOO, KHÔNG PHẢI CẢ BA NGUỒN CỦA `news.ts`
 * ============================================================
 *
 * Nút "Tại sao rớt?" đọc ba nguồn (Yahoo, Google News, hồ sơ SEC). Ở đây
 * chỉ Yahoo, và mỗi nguồn bị loại vì một lý do khác nhau:
 *
 *  - **Hồ sơ SEC**: tầng 8-K đã đọc rồi, và đọc bằng MỘT feed chung cho cả
 *    thị trường. `secFilingNews()` thì hỏi `recentFilings` TỪNG MÃ, mà
 *    hàm đó KHÔNG cache - vài chục mã × 96 lượt/ngày là hàng nghìn request
 *    cho đúng thứ đã có.
 *  - **Google News**: nó KHÔNG gắn mã cho bài (`tickerCount: null`, xem
 *    gnews.ts), nên cổng số 1 ở trên không áp được. Một tiêu đề khớp từ
 *    khoá mà không ai xác nhận nó nói về công ty NÀY là một thông báo có
 *    thể báo về nhầm công ty - biến "chưa biết" thành một lời khẳng định
 *    đẩy thẳng vào điện thoại. Nó cũng đang trả 503 từ production.
 *
 * Yahoo thì đã CHẠY THẬT trong production từ lâu, và nó gắn mã - đúng hai
 * thứ tầng này cần.
 *
 * ============================================================
 * CHI PHÍ
 * ============================================================
 *
 * Yahoo tốn 1 request MỖI MÃ (không gộp lô được). Gọi ở đúng nhịp 15 phút
 * như các mục khác là đi lại vết xe Dark Pool đã đốt sạch hạn mức UW (xem
 * darkpool.ts). Nên nó chạy 1 trong 4 tick (~60 phút) - và **cửa sổ 90
 * phút khiến việc đó KHÔNG mất gì**: mọi bài trong cửa sổ đều được nhìn ít
 * nhất một lần.
 */

import type { Alert, Severity } from './alerts';
import { FRESH_MS } from './liveevents';

export type PressHeadline = {
  symbol: string;
  title: string;
  publisher: string;
  link: string;
  /** ISO. Yahoo cho tới GIÂY (`providerPublishTime`), nên cửa sổ phút chạy được. */
  published: string;
  /** Số mã Yahoo gắn cho bài. `null` = nguồn không gắn mã (xem cổng 1). */
  tickerCount: number | null;
};

/** Nhiều nhất bao nhiêu mã được hỏi tin trong một lượt. */
export const MAX_PRESS_SYMBOLS = 60;

/** Trần cảnh báo báo chí mỗi lượt chạy. */
export const MAX_PRESS_ALERTS = 5;

/** Mấy request Yahoo chạy song song cùng lúc. */
export const PRESS_CONCURRENCY = 5;

/**
 * Từ khoá `urgent` được dẫn ra từ CHÍNH bốn mục 8-K khẩn, chứ không tự
 * nghĩ: đây là cùng những sự kiện ấy, chỉ được báo chí kể sớm hơn.
 *
 *   1.03 phá sản · 4.02 báo cáo tài chính cũ hết đáng tin
 *   1.05 sự cố an ninh mạng · 3.01 huỷ niêm yết
 *
 * Thêm đúng một thứ không có mã mục tương ứng: NGỪNG GIAO DỊCH - đó là tín
 * hiệu khẩn cấp của chính sàn, và nó luôn tới trước mọi hồ sơ.
 */
export const PRESS_URGENT: string[] = [
  'bankrupt', 'bankruptcy', 'chapter 11', 'chapter 7', 'insolvency', 'receivership',
  'restate', 'restatement', 'non reliance', 'accounting error',
  'material weakness', 'accounting fraud',
  'data breach', 'cyberattack', 'cyber attack', 'ransomware', 'hacked', 'hacker',
  'delist',
  'trading halt', 'halt trading',
];

/**
 * Từ khoá `warn`: những chuyện mà một người đang NẮM vị thế phải đọc.
 *
 * Ghi ở dạng GỐC ("recall", "step down") chứ không phải dạng chia
 * ("recalls", "steps down"): `hit()` tự cho phép đuôi s/es/ed/ing trên từng
 * từ, xem chú thích ở đó. Bộ test bắt đúng lỗi này - "Acme recalls 2 million
 * units" từng không khớp `recall`, tức danh sách từ khoá âm thầm bỏ sót
 * phần lớn tiêu đề tiếng Anh thật, vì tiêu đề gần như luôn viết ở thì hiện
 * tại số ít.
 *
 * Ba nhóm cố ý KHÔNG có mặt, mỗi nhóm một lý do:
 *  - `plunge`/`soar`/`tumble`: đó là MÔ TẢ cú chạy giá mà tầng thứ hai đã
 *    báo bằng con số thật. Cho vào đây là rung điện thoại hai lần cho cùng
 *    một chuyện.
 *  - `upgrade`/`downgrade`: nhà phân tích đổi khuyến nghị gần như mỗi ngày
 *    và hiếm khi làm giá chạy tới mức đáng đánh thức ai.
 *  - `earnings`/`revenue` trần: có trong vô số tiêu đề thủ tục ("xem trước
 *    earnings", "3 cổ phiếu cần theo dõi"). Chỉ giữ những cách diễn đạt
 *    mang một SỰ KIỆN, như cắt dự báo.
 */
export const PRESS_WARN: string[] = [
  // dự báo / triển vọng
  'cut guidance', 'slash guidance', 'lower guidance', 'guidance cut',
  'withdraw guidance', 'profit warning', 'warn on', 'cut outlook',
  'lower outlook', 'cut forecast', 'miss estimates',
  // pháp lý / điều tra
  'lawsuit', 'sue', 'investigation', 'investigate', 'probe', 'subpoena',
  'fraud', 'antitrust', 'settlement', 'sec charge', 'class action',
  // lãnh đạo
  'step down', 'resign', 'resignation', 'oust', 'new ceo', 'name ceo',
  'cfo departure', 'ceo departure',
  // mua bán sáp nhập
  'acquire', 'acquisition', 'merger', 'takeover', 'buyout', 'merge with',
  // sản phẩm / vận hành
  /* `fda delay` và `warning letter` đứng RIÊNG chứ không nhờ `fda approval`
     nới lỏng: "FDA delays approval" có từ chèn 6 chữ cái, vượt trần 4 của
     `GAP`. Thêm một từ khoá tường minh là đúng hơn nới `GAP` - nới một lần
     cho một tiêu đề thì cả danh sách thành lưới bắt bừa. */
  'recall', 'fda approval', 'fda reject', 'fda delay', 'warning letter',
  'complete response letter',
  'phase 3', 'clinical trial', 'layoff', 'job cut', 'plant closure',
  // vốn / cổ đông
  'dividend cut', 'cut dividend', 'suspend dividend', 'buyback',
  'stock offering', 'share offering', 'short seller', 'short report',
];

/**
 * So khớp theo BIÊN TỪ, và cho phép đuôi chia của tiếng Anh trên TỪNG từ.
 *
 * Hai nửa, mỗi nửa chặn một lỗi thật:
 *  - Biên từ (`\b`) để "probe" không khớp trong "problem" và "restate"
 *    không khớp trong "restaurant". Không có nó thì danh sách từ khoá sẽ
 *    báo về những chuyện chẳng liên quan gì.
 *  - Đuôi `s|es|ed|d|ing` vì tiêu đề tiếng Anh gần như luôn chia động từ:
 *    "Acme recalls...", "CEO steps down", "Regulator probes...". Bộ test
 *    bắt được đúng chỗ này - thiếu nó thì `recall` không khớp "recalls",
 *    tức cổng lọc im lặng bỏ qua phần lớn tiêu đề THẬT.
 *
 * Đuôi áp cho MỌI từ trong cụm, không chỉ từ cuối: ở "steps down" thì chính
 * từ ĐẦU mới là từ được chia.
 */
const RX: Map<string, RegExp> = new Map();

/**
 * Mọi dạng chia của MỘT từ.
 *
 * Ba luật chính tả tiếng Anh, và cả ba đều bị bộ test bắt chứ không phải
 * nghĩ ra cho đủ:
 *  1. đuôi thẳng: recall -> recalls / recalled / recalling
 *  2. rụng `e` câm: probe -> **probing** (không phải "probeing"), acquire ->
 *     acquiring, sue -> suing, name -> naming
 *  3. gấp đôi phụ âm cuối ở từ ngắn: cut -> **cutting**, step -> stepping
 *
 * Bỏ luật 2 thì "Regulator probing Acme deal" không khớp `probe` - tức đúng
 * cái tiêu đề đáng báo nhất lại lọt qua, im lặng.
 */
function formsOf(w: string): string {
  const alts = [`${w}(?:s|es|ed|d|ing)?`];
  // e câm: probe -> probing
  if (w.endsWith('e') && w.length > 2) alts.unshift(`${w.slice(0, -1)}ing`);
  // phụ âm-nguyên âm-phụ âm ngắn: cut -> cutting
  if (/^[a-z]{2,4}$/.test(w) && /[^aeiou][aeiou][^aeiouwxy]$/.test(w)) {
    alts.unshift(`${w}${w[w.length - 1]}(?:ing|ed)`);
  }
  return `(?:${alts.join('|')})`;
}

/**
 * Chỗ nối giữa hai từ trong một CỤM khoá.
 *
 * Tiêu đề thật hay chèn từ đệm vào giữa: "Acme cuts **its** dividend",
 * "FDA delays approval". Đòi hai từ dính liền nhau là bỏ sót đúng những
 * tiêu đề ấy - bộ test bắt được bằng một tiêu đề hoàn toàn bình thường.
 *
 * Nhưng chỉ cho chèn TỪ NGẮN (≤4 chữ cái) và nhiều nhất HAI từ, chứ không
 * phải từ bất kỳ: "cut its dividend" khớp, còn "cut costs to fund dividend"
 * thì KHÔNG, và "new products ceo says" cũng không. Nới rộng hơn là biến
 * một danh sách từ khoá có chủ đích thành một cái lưới bắt bừa - mà một
 * cảnh báo sai trông y hệt một cảnh báo đúng.
 */
const GAP = '(?:\\s+[a-z0-9]{1,4}){0,2}\\s+';

function rxOf(word: string): RegExp {
  let r = RX.get(word);
  if (!r) {
    const parts = word
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map(formsOf);
    r = new RegExp(`\\b${parts.join(GAP)}\\b`);
    RX.set(word, r);
  }
  return r;
}

function hit(title: string, words: string[]): string | null {
  const t = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const w of words) if (rxOf(w).test(t)) return w;
  return null;
}

/** Mức nặng của một tiêu đề; null = không khớp từ khoá nào -> KHÔNG báo. */
export function pressSeverity(title: string): { severity: Severity; word: string } | null {
  const u = hit(title, PRESS_URGENT);
  if (u) return { severity: 'urgent', word: u };
  const w = hit(title, PRESS_WARN);
  return w ? { severity: 'warn', word: w } : null;
}

/**
 * Khoá chống lặp.
 *
 * Theo TIÊU ĐỀ đã chuẩn hoá chứ không theo link: cùng một bài về từ hai
 * lượt quét khác nhau có thể mang hai URL khác nhau (Yahoo đổi tham số
 * theo dõi), và hai URL khác nhau nghĩa là gửi hai lần cùng một tin.
 *
 * Không gắn NGÀY vào khoá, cố ý - và cửa sổ 90 phút là thứ khiến điều đó
 * an toàn, đúng lập luận của `FRESH_MS` bên liveevents.ts: `prune()` xoá
 * khoá của ngày cũ, nên một khoá có ngày sẽ sống dậy lúc nửa đêm và báo
 * lại; quá 90 phút thì không có bài nào được báo nữa nên chuyện đó bất khả.
 */
export const pressKey = (symbol: string, title: string) =>
  `press-${symbol}-${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70)}`;

export type PressScan = {
  alerts: Alert[];
  /** Bài mới, riêng một mã, nhưng không khớp từ khoá nào - đếm, không gửi. */
  routine: number;
  /** Bài mới nhưng gắn NHIỀU mã (bản tin thị trường) - đếm, không gửi. */
  broad: number;
  /** Cảnh báo bị cắt vì chạm trần mỗi lượt - đếm, không biến mất im lặng. */
  overflow: number;
};

/**
 * Dựng cảnh báo báo chí. Hàm THUẦN - không mạng, không đĩa, test được
 * không cần Internet (cùng lý do `parseEdgarCurrent` và `parseGnewsRss`
 * là hàm thuần).
 */
export function pressAlertsFrom(items: PressHeadline[], now = Date.now()): PressScan {
  const cutoff = now - FRESH_MS;
  let routine = 0;
  let broad = 0;

  type Cand = { a: Alert; at: number; urgent: boolean };
  const cands: Cand[] = [];
  const perSymbol = new Set<string>();

  /* Mới nhất trước, để cổng "mỗi mã một bài" giữ lại bài MỚI NHẤT chứ
     không phải bài tình cờ đứng đầu mảng. */
  const sorted = [...items].sort((a, b) => b.published.localeCompare(a.published));

  for (const it of sorted) {
    const t = Date.parse(it.published);
    if (!Number.isFinite(t) || t < cutoff) continue;

    /* Cổng 1: chỉ bài riêng về MỘT mã. `null` (nguồn không gắn mã) cũng bị
       loại - chưa biết thì không được đẩy vào điện thoại như thể đã biết. */
    if (it.tickerCount !== 1) {
      broad++;
      continue;
    }

    const sev = pressSeverity(it.title);
    if (!sev) {
      routine++;
      continue;
    }

    if (perSymbol.has(it.symbol)) continue;
    perSymbol.add(it.symbol);

    const when = new Date(t).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    cands.push({
      at: t,
      urgent: sev.severity === 'urgent',
      a: {
        key: pressKey(it.symbol, it.title),
        severity: sev.severity,
        title: `[Báo chí] ${it.symbol}: ${it.title}`,
        body:
          `${it.publisher || 'không rõ toà báo'}, ${when} giờ New York. ` +
          'Đây là BÊN THỨ BA viết về công ty, chưa kiểm chứng — không phải ' +
          'công ty tự khai như hồ sơ 8-K. ' +
          (it.link ? it.link : ''),
      },
    });
  }

  /* Nặng trước, rồi mới tới mới nhất: nếu phải cắt thì cắt cái nhẹ. */
  cands.sort((x, y) => (x.urgent === y.urgent ? y.at - x.at : x.urgent ? -1 : 1));

  return {
    alerts: cands.slice(0, MAX_PRESS_ALERTS).map((c) => c.a),
    routine,
    broad,
    overflow: Math.max(0, cands.length - MAX_PRESS_ALERTS),
  };
}

/* ------------------------------------------------------------------ *
 *  Phần có IO.
 * ------------------------------------------------------------------ */

export type PressFetch = { items: PressHeadline[]; errors: string[]; asked: number };

/** Chạy `run` trên `list` với tối đa `n` việc song song. */
async function pool<T, R>(list: T[], n: number, run: (t: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(list.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, list.length) }, async () => {
    for (;;) {
      const k = i++;
      if (k >= list.length) return;
      out[k] = await Promise.allSettled([run(list[k])]).then((r) => r[0]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Lấy tiêu đề Yahoo cho từng mã.
 *
 * Một mã hỏng KHÔNG được làm hỏng cả lượt: `allSettled` theo từng mã, lỗi
 * gom vào `errors` (cắt bớt, vì 60 mã cùng hỏng thì 60 dòng lỗi giống hệt
 * nhau không nói thêm được gì so với 3 dòng cộng một con số).
 */
export async function fetchPressHeadlines(symbols: string[]): Promise<PressFetch> {
  const { yahooNews } = await import('./news');
  const ask = symbols.slice(0, MAX_PRESS_SYMBOLS);

  const settled = await pool(ask, PRESS_CONCURRENCY, (s) => yahooNews(s));

  const items: PressHeadline[] = [];
  const errors: string[] = [];
  settled.forEach((r, k) => {
    if (r.status === 'fulfilled') {
      for (const n of r.value) {
        items.push({
          symbol: ask[k],
          title: n.title,
          publisher: n.publisher,
          link: n.link,
          published: n.published,
          tickerCount: n.tickerCount,
        });
      }
    } else if (errors.length < 3) {
      errors.push(`${ask[k]}: ${String(r.reason?.message ?? r.reason).slice(0, 80)}`);
    }
  });

  const failed = settled.filter((r) => r.status === 'rejected').length;
  if (failed > errors.length) errors.push(`… và ${failed - errors.length} mã nữa`);

  return { items, errors, asked: ask.length };
}
