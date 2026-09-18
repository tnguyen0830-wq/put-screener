/**
 * Cảnh báo thời gian thực cho mã đang nắm và mã trong watchlist.
 *
 * Trả lời câu hỏi mà toàn bộ cảnh báo cũ không trả lời được: "có chuyện gì
 * ĐANG xảy ra với mã của tôi ngay lúc này". Cảnh báo cũ đều tính từ giá,
 * greek và ngày tháng - không cái nào đọc sự kiện doanh nghiệp.
 *
 * Nguồn CHÍNH là hồ sơ 8-K của SEC, không phải mạng xã hội. Lý do: 8-K là
 * chính công ty BẮT BUỘC khai một sự kiện trọng yếu - nó là NGUỒN GỐC,
 * không phải bài viết về nguồn gốc. Miễn phí, không cần key.
 *
 * BA TẦNG, xếp theo độ mạnh của bằng chứng:
 *   1. hồ sơ 8-K (file này) - công ty tự khai, bắt buộc theo luật
 *   2. giá chạy ≥7% (`moveAlertsFrom`) - con số của chính thị trường
 *   3. tiêu đề báo chí (`pressalerts.ts`) - bên thứ ba viết, chưa kiểm
 *      chứng; nhanh hơn 8-K nhưng yếu hơn hẳn, nên mang nhãn riêng và đi
 *      qua ba cổng lọc (xem đầu file đó)
 *
 * Ba tầng HỎNG ĐỘC LẬP nhau: SEC chết không được làm mất cảnh báo giá, và
 * báo chí chết không được làm mất cả hai cái kia.
 *
 * ============================================================
 * ĐO 2026-09-18 (`www.sec.gov`, bốn lượt gọi thật) - không đoán
 * ============================================================
 *
 * `browse-edgar?action=getcurrent&type=8-K&output=atom` trả về 8-K MỚI NHẤT
 * của TOÀN THỊ TRƯỜNG trong MỘT request - đúng khuôn "một feed chung, lọc
 * trong app" mà tab Quốc hội đã dùng, và rẻ hơn hẳn việc hỏi `recentFilings`
 * từng mã một (`recentFilings` KHÔNG cache, nên mỗi mã là một request mỗi
 * lượt - với vài chục mã, mỗi 15 phút, là hàng nghìn request/ngày).
 *
 *   count=100  -> 100 dòng, 72 KB, ổn định qua nhiều lượt
 *   count=400  -> vẫn chỉ 100 dòng, tức 100 là TRẦN
 *   100 dòng phủ 17 giờ 30 phút; 20 dòng mới nhất phủ 1 giờ 9 phút
 *   CIK bóc được 100/100; mã mục có mặt 100/100
 *
 * Hai thứ feed này cho mà `filings.recent` KHÔNG có, và cả hai đều
 * load-bearing:
 *
 *  1. **Dấu thời gian tới từng PHÚT** (`<updated>2026-09-18T09:47:31-04:00`).
 *     `filings.recent` chỉ có NGÀY. Không có phút thì không thể biết hồ sơ
 *     này vừa nộp hay nộp từ sáng - tức không làm được cảnh báo thời gian
 *     thực, và tệ hơn là không chặn được lỗi báo-lại ở dưới.
 *  2. **Tên mục do chính SEC viết** (`Item 5.02: Departure of Directors...`),
 *     nên KHÔNG phải tra bảng `EIGHT_K_ITEMS` của ta. Dùng chữ của SEC là
 *     đúng hơn: bảng của ta có thể cũ đi khi SEC thêm mục, còn feed thì
 *     không bao giờ.
 *
 * **Một lượt trả 0 dòng KHÔNG phải là "không có hồ sơ nào".** Đo được thật:
 * một lượt gọi trả rỗng rồi lượt sau trả đủ 100. Nên `parseEdgarCurrent`
 * NÉM khi không thấy `<feed`, và chỉ trả mảng rỗng khi feed thật sự rỗng -
 * hai nhánh khác nhau vì hai cách sửa khác nhau, đúng khuôn gnews.ts.
 */

import type { Alert, Severity } from './alerts';

const UA = 'put-screener alerts (contact via app owner)';

export const EDGAR_CURRENT_URL =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K' +
  '&company=&dateb=&owner=include&count=100&output=atom';

export type EdgarItem = { code: string; label: string };

export type EdgarEntry = {
  /** CIK đã bỏ số 0 đầu, để so khớp được với `ciksFor()`. */
  cik: string;
  company: string;
  accession: string;
  /** ISO, có PHÚT - thứ `filings.recent` không có. */
  filedAt: string;
  items: EdgarItem[];
  link: string;
};

/**
 * Mã mục 8-K nào đáng làm phiền điện thoại.
 *
 * Chủ app chọn mức YÊN TĨNH, và luật sẵn có của repo đứng về phía đó: "một
 * hộp thư kêu suốt là một hộp thư bị bỏ qua, kể cả lúc nó nói chuyện thật"
 * (alerts.ts). Nên đây là danh sách CHO PHÉP, không phải danh sách loại trừ.
 *
 * Bốn mục `urgent` là bốn mục mà đọc xong phải làm gì đó ngay. 4.02 đặc biệt
 * đáng sợ và hay bị xem nhẹ: nó nghĩa là công ty vừa nói báo cáo tài chính
 * CŨ không còn đáng tin nữa.
 */
export const MATERIAL_ITEMS: Record<string, Severity> = {
  '1.03': 'urgent', // phá sản hoặc bị quản lý tài sản
  '4.02': 'urgent', // báo cáo tài chính cũ KHÔNG còn đáng tin
  '1.05': 'urgent', // sự cố an ninh mạng trọng yếu
  '3.01': 'urgent', // thông báo huỷ niêm yết
  '1.01': 'warn',
  '1.02': 'warn',
  '2.01': 'warn',
  '2.02': 'warn', // công bố kết quả kinh doanh
  '2.03': 'warn',
  '2.04': 'warn',
  '2.05': 'warn',
  '2.06': 'warn', // ghi giảm tài sản trọng yếu
  '3.02': 'warn',
  '3.03': 'warn',
  '4.01': 'warn', // đổi kiểm toán viên
  '5.01': 'warn',
  '5.02': 'warn', // lãnh đạo nghỉ hoặc được bổ nhiệm
};

/**
 * Mục KHÔNG báo, và cố ý im lặng: 5.03 (sửa điều lệ), 5.07 (kết quả bỏ
 * phiếu cổ đông), 7.01 (công bố Regulation FD), 8.01 (sự kiện khác), 9.01
 * (phụ lục). Bốn cái đầu là thủ tục; 7.01 và 8.01 là hai cái sọt rác rộng
 * nhất của biểu mẫu 8-K và là nguồn ồn lớn nhất nếu cho qua.
 *
 * Mã LẠ cũng không báo - nhưng KHÔNG im lặng: `eventScan()` đếm chúng vào
 * `unknownItems` để chúng hiện ra thành một CON SỐ chứ không thành một lỗ
 * hổng, đúng luật "chưa biết không được trông giống không có gì".
 */

/** Mức nặng nhất trong các mục của một hồ sơ; null = không mục nào đáng báo. */
export function materialityOf(items: EdgarItem[]): Severity | null {
  let out: Severity | null = null;
  for (const it of items) {
    const sev = MATERIAL_ITEMS[it.code];
    if (sev === 'urgent') return 'urgent';
    if (sev === 'warn') out = 'warn';
  }
  return out;
}

/**
 * Giải mã thực thể RỒI GỠ THẺ - thứ tự này load-bearing, và đo trên feed
 * thật mới thấy.
 *
 * SEC gói `<summary>` bằng HTML đã escape: `&lt;b&gt;AccNo:&lt;/b&gt; …` và
 * ngăn cách các mục bằng `&lt;br&gt;`. Giải mã xong thì những thứ đó thành
 * thẻ THẬT nằm giữa văn bản, nên nếu không gỡ:
 *  - `AccNo:` bị `</b>` chen vào giữa nên không bóc được số hồ sơ;
 *  - và tệ hơn: các mục bị `<br>` chen vào nên regex chỉ bóc được mục CUỐI
 *    CÙNG. Đo được: 100 dòng cho đúng 100 mã mục, tức MỌI hồ sơ nhiều mục
 *    đều mất hết chỉ còn một. Một 8-K "2.02, 9.01" (công bố kết quả kinh
 *    doanh) sẽ bóc thành mỗi 9.01 -> không trọng yếu -> KHÔNG BÁO. Tức lỗi
 *    này giết đúng cảnh báo quan trọng nhất, và giết lặng lẽ.
 */
const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    // Gỡ thẻ SAU khi giải mã (xem chú thích trên) - thay bằng khoảng trắng
    // chứ không xoá trắng, nếu không hai mục liền nhau sẽ dính làm một.
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const shapeOf = (s: string) => s.replace(/\s+/g, ' ').slice(0, 160);

/**
 * Bóc feed Atom. Hàm THUẦN - test được không cần mạng, cùng lý do
 * `parseGnewsRss` và `parseForm4` là hàm thuần.
 */
export function parseEdgarCurrent(xml: string): EdgarEntry[] {
  const blocks = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  if (!blocks.length) {
    /* Không có `<feed` = SEC trả về thứ khác (trang lỗi, trang chặn). Phải
       NÉM kèm chữ thật, vì "bị chặn" và "không có 8-K nào" dẫn tới hai hành
       động ngược nhau. */
    if (!/<feed[\s>]/i.test(xml)) {
      throw new Error(`EDGAR: not an Atom feed (${shapeOf(xml)})`);
    }
    return [];
  }

  const out: EdgarEntry[] = [];
  for (const b of blocks) {
    const title = decode((/<title>([\s\S]*?)<\/title>/i.exec(b) ?? ['', ''])[1]);
    // "8-K - STEEL DYNAMICS INC (0001022671) (Filer)" - ĐO được: 100/100 dòng.
    const cikM = /\((\d{7,10})\)/.exec(title);
    if (!cikM) continue;

    const upd = (/<updated>([\s\S]*?)<\/updated>/i.exec(b) ?? ['', ''])[1].trim();
    const t = Date.parse(upd);
    // Không có thời gian thì bỏ: cả tính năng này dựa vào "vừa mới nộp".
    if (!Number.isFinite(t)) continue;

    const summary = decode((/<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(b) ?? ['', ''])[1]);
    const items: EdgarItem[] = [
      ...summary.matchAll(/Item\s+(\d+\.\d+):\s*([\s\S]*?)(?=\s*Item\s+\d+\.\d+:|$)/g),
    ].map((m) => ({ code: m[1], label: m[2].trim().replace(/[.\s]+$/, '') }));

    const accM = /AccNo:\s*([\d-]+)/i.exec(summary);
    const link = (/<link[^>]*href="([^"]+)"/i.exec(b) ?? ['', ''])[1];

    out.push({
      // Bỏ số 0 đầu để so khớp được với cách `ciksFor()` trả về.
      cik: String(Number(cikM[1])),
      // Tiêu đề thật: "8-K - STEEL DYNAMICS INC (0001022671) (Filer)".
      // Phải gỡ LẶP các cụm ngoặc ở đuôi, không chỉ một - bỏ một lần thì
      // còn lại mã CIK dính trong tên công ty.
      company: title
        .replace(/^8-K(\/A)?\s*-\s*/, '')
        .replace(/(\s*\([^)]*\))+\s*$/, '')
        .trim(),
      accession: accM ? accM[1] : link || title,
      filedAt: new Date(t).toISOString(),
      items,
      link,
    });
  }
  return out.sort((a, b) => b.filedAt.localeCompare(a.filedAt));
}

export async function fetchCurrent8K(): Promise<EdgarEntry[]> {
  const r = await fetch(EDGAR_CURRENT_URL, {
    headers: { 'User-Agent': UA },
    cache: 'no-store',
  });
  if (!r.ok) {
    // Đọc body CẢ KHI hỏng - bài học #153: một mã lỗi trần không nói được
    // lỗi của ai.
    const body = await r.text().catch(() => '');
    throw new Error(`EDGAR ${r.status}${body ? ` - ${shapeOf(body)}` : ' (thân rỗng)'}`);
  }
  return parseEdgarCurrent(await r.text());
}

/**
 * Chỉ báo hồ sơ nộp trong khoảng này.
 *
 * KHÔNG phải để tiết kiệm - đây là thứ chặn một lỗi báo-lại có thật. Chống
 * lặp của repo khoá theo NGÀY GIAO DỊCH và `prune()` xoá khoá của ngày cũ,
 * nên một 8-K nộp tối thứ Sáu sẽ được coi là "chưa gửi" khi sang ngày mới
 * và báo lại lần nữa. Cửa sổ theo PHÚT làm điều đó bất khả: quá 90 phút là
 * không bao giờ báo, nên ngày có đổi cũng không hồi sinh được nó.
 *
 * 90 phút, không phải 15: một lượt chạy hụt (deploy, lỗi mạng) không được
 * làm mất hẳn sự kiện. Đo được 100 dòng phủ 17,5 giờ nên cửa sổ này thừa
 * biên an toàn.
 */
export const FRESH_MS = 90 * 60_000;

/** Giá chạy bao nhiêu thì đáng báo. Đủ hiếm để không thành tiếng ồn. */
export const MOVE_WARN_PCT = 7;
export const MOVE_URGENT_PCT = 12;

export type EventScan = {
  alerts: Alert[];
  /** Số hồ sơ mới của mã đang theo dõi bị bỏ vì mục không nằm trong danh sách. */
  skippedRoutine: number;
  /** Mã mục SEC trả về mà bảng này chưa biết - hiện thành SỐ, không im lặng. */
  unknownItems: string[];
  /**
   * `true` khi dòng CŨ NHẤT của feed vẫn còn nằm trong cửa sổ 90 phút - tức
   * feed có thể KHÔNG phủ hết cửa sổ và ta có thể đã bỏ sót. Đo được hiện
   * tại là 17,5 giờ nên việc này gần như không xảy ra, nhưng "gần như" và
   * "im lặng bỏ sót" là hai chuyện khác nhau.
   */
  windowShort: boolean;
};

/**
 * Dựng cảnh báo 8-K. Hàm THUẦN: không mạng, không đĩa.
 *
 * `cikToSymbol` là bảng tra NGƯỢC (CIK -> mã), vì feed là của toàn thị
 * trường còn ta chỉ quan tâm vài chục mã.
 */
export function eventAlertsFrom(
  entries: EdgarEntry[],
  cikToSymbol: Record<string, string>,
  now = Date.now()
): EventScan {
  const cutoff = now - FRESH_MS;
  const alerts: Alert[] = [];
  const unknown = new Set<string>();
  let skippedRoutine = 0;
  let oldest = Infinity;

  for (const e of entries) {
    const t = Date.parse(e.filedAt);
    if (Number.isFinite(t)) oldest = Math.min(oldest, t);
    if (!(t >= cutoff)) continue;

    const symbol = cikToSymbol[e.cik];
    if (!symbol) continue; // không phải mã của ta - phần lớn feed là vậy

    for (const it of e.items) if (!(it.code in MATERIAL_ITEMS)) unknown.add(it.code);

    const sev = materialityOf(e.items);
    if (!sev) {
      skippedRoutine++;
      continue;
    }

    // Chỉ in những mục ĐÁNG báo, bằng chữ của chính SEC.
    const named = e.items
      .filter((it) => it.code in MATERIAL_ITEMS)
      .map((it) => `${it.code} ${it.label}`)
      .join('; ');
    const hhmm = new Date(t).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    alerts.push({
      // Khoá theo số hồ sơ: duy nhất và vĩnh viễn, nên không bao giờ gửi đôi.
      key: `8k-${e.accession}`,
      severity: sev,
      title: `${symbol}: hồ sơ 8-K vừa nộp`,
      body:
        `${named}. Nộp lúc ${hhmm} giờ New York. ` +
        'Đây là công ty tự khai theo luật, không phải tin báo chí. ' +
        (e.link ? e.link : ''),
    });
  }

  return {
    alerts,
    skippedRoutine,
    unknownItems: [...unknown].sort(),
    windowShort: entries.length > 0 && oldest > cutoff,
  };
}

/**
 * Cảnh báo giá chạy mạnh. Hàm THUẦN.
 *
 * Hai bậc khoá RIÊNG (`move7-` / `move12-`) chứ không một: chống lặp chỉ cho
 * mỗi khoá một lần một ngày, nên nếu dùng chung khoá thì mã rớt 7% rồi rớt
 * tiếp thành 15% sẽ chỉ báo đúng lần 7% - mà vượt sang bậc nặng hơn là
 * thông tin MỚI, đáng báo thêm một lần.
 */
export function moveAlertsFrom(
  quotes: Record<string, any>,
  symbols: string[],
  day: string
): Alert[] {
  const out: Alert[] = [];
  for (const symbol of symbols) {
    const raw = quotes[symbol]?.quote?.netPercentChange;
    const pct = typeof raw === 'number' ? raw : Number(raw);
    // Thiếu dữ liệu thì IM LẶNG đi qua - không có số thì không có cảnh báo,
    // và một cảnh báo bịa còn tệ hơn một cảnh báo thiếu.
    if (!Number.isFinite(pct)) continue;

    const abs = Math.abs(pct);
    const tier = abs >= MOVE_URGENT_PCT ? MOVE_URGENT_PCT : abs >= MOVE_WARN_PCT ? MOVE_WARN_PCT : 0;
    if (!tier) continue;

    const dir = pct < 0 ? 'giảm' : 'tăng';
    out.push({
      key: `move${tier}-${day}-${symbol}`,
      severity: tier === MOVE_URGENT_PCT ? 'urgent' : 'warn',
      title: `${symbol} ${dir} ${abs.toFixed(1)}% hôm nay`,
      body:
        `Giá đang ${dir} ${abs.toFixed(1)}% so với đóng cửa hôm trước` +
        `, vượt ngưỡng ${tier}%. Kiểm tra xem có hồ sơ hay tin gì đi kèm không.`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  Phần có IO. Mọi thứ trên đây là hàm thuần và test được không cần mạng.
 * ------------------------------------------------------------------ */

export type EventReport = {
  symbols: number;
  /** Không đọc được danh mục thì NÓI RA - khác hẳn "không nắm mã nào". */
  heldError: string | null;
  /** Mã trong danh sách theo dõi mà SEC không có CIK (ETF là bình thường). */
  noCik: string[];
  secError: string | null;
  quoteError: string | null;
  skippedRoutine: number;
  unknownItems: string[];
  windowShort: boolean;
  /**
   * Tầng tiêu đề báo chí. `pressRan: false` nghĩa là LƯỢT NÀY không hỏi
   * tin (nó chạy ~60 phút một lần, xem alert-runner.ts) - phải tách khỏi
   * "đã hỏi và không có gì", vì nếu không thì mấy con số 0 bên dưới đọc
   * thành "báo chí im lặng" trong khi thật ra chưa ai hỏi. Đúng luật
   * "chưa biết không được trông giống không có gì".
   */
  pressRan: boolean;
  /** Số mã đã hỏi tin. */
  pressChecked: number;
  /** Số mã bị bỏ vì vượt trần mã mỗi lượt. */
  pressSkipped: number;
  /** Bài mới, riêng một mã, nhưng không khớp từ khoá - đếm, không gửi. */
  pressRoutine: number;
  /** Bài mới nhưng gắn nhiều mã (bản tin thị trường) - đếm, không gửi. */
  pressBroad: number;
  /** Cảnh báo báo chí bị cắt vì chạm trần mỗi lượt. */
  pressOverflow: number;
  pressErrors: string[];
  /**
   * Tầng X (thứ tư). KHÔNG giống `pressRan`: X không giãn nhịp theo tick -
   * xnews.ts gộp cả watchlist vào vài LÔ (`cashtagBatches`, $A OR $B OR $C
   * trong một request), khác hẳn Yahoo bắt hỏi từng mã, nên chi phí mỗi
   * lượt đã rẻ sẵn và `since_id` (xalerts.ts) mới là thứ giữ chi phí xuống
   * theo thời gian, không phải giãn nhịp. `xConfigured: false` (chưa đặt
   * X_BEARER_TOKEN) phải tách khỏi "đã hỏi và không có gì" - hai chuyện
   * khác nhau, đúng luật "chưa biết không được trông giống không có gì".
   */
  xConfigured: boolean;
  xChecked: number;
  xBatches: number;
  xRoutine: number;
  xOverflow: number;
  xErrors: string[];
};

/**
 * Mã cần theo dõi: vị thế ĐANG NẮM hợp với watchlist.
 *
 * Cố ý KHÔNG dùng `trackedSymbols()` của insiders.ts dù nó gần giống: nó
 * gộp thêm cả rổ S&P 500 (~500 mã). Với Form 4 thì đúng, vì cache dùng
 * chung cho mọi tab; với cảnh báo đẩy về điện thoại thì sai hẳn - chủ app
 * chọn "vị thế nắm + watchlist", và 500 mã sẽ biến hộp thư thành thứ bị
 * tắt thông báo trong tuần đầu tiên.
 */
export async function alertSymbols(): Promise<{ symbols: string[]; heldError: string | null }> {
  const { allWatchlistSymbols } = await import('./watchlist');
  const list = await allWatchlistSymbols().catch(() => [] as string[]);

  let heldError: string | null = null;
  let held: string[] = [];
  try {
    const { loadPortfolio } = await import('./portfolio');
    const pf = await loadPortfolio();
    held = (pf.rows ?? []).map((r: any) => r.symbol).filter(Boolean);
  } catch (e: any) {
    heldError = String(e?.message ?? e).slice(0, 200);
  }

  const all = new Set<string>();
  for (const s of [...held, ...list]) if (s) all.add(String(s).trim().toUpperCase());
  return { symbols: [...all], heldError };
}

/**
 * Lấy dữ liệu thật rồi dựng cảnh báo sự kiện.
 *
 * `marketOpen` chỉ quyết định phần GIÁ: `netPercentChange` là mức thay đổi
 * trong phiên, ngoài giờ nó đứng yên ở con số đóng cửa nên báo lại là báo
 * một chuyện cũ. Phần 8-K thì CHẠY BẤT KỂ GIỜ - và đó là cả lý do tính năng
 * này tồn tại: 8-K phần lớn nộp SAU khi sàn đóng, nên gắn nó vào cổng giờ
 * giao dịch là bỏ lỡ đúng thứ cần bắt. Ba chỗ khác trong repo (Form 4, lịch
 * earnings, Quốc hội) đã đứng ngoài `runOnce()` vì đúng lý do này.
 *
 * Mỗi nguồn hỏng RIÊNG: SEC chết không được làm mất cảnh báo giá, và ngược
 * lại - cùng khuôn `symbolNewsAll()`.
 */
export async function collectEventAlerts(
  marketOpen: boolean,
  day: string,
  now = Date.now(),
  /**
   * Lượt này có hỏi tin báo chí không. Yahoo tốn 1 request MỖI MÃ nên nó
   * chạy giãn ra (~60 phút), quyết định ở alert-runner.ts nơi bộ đếm tick
   * đã sẵn có - đúng khuôn syncDarkpool(). Cửa sổ 90 phút khiến nhịp giãn
   * này không làm mất bài nào.
   */
  pressDue = false
): Promise<{ alerts: Alert[]; report: EventReport }> {
  const { symbols, heldError } = await alertSymbols();

  const report: EventReport = {
    symbols: symbols.length,
    heldError,
    noCik: [],
    secError: null,
    quoteError: null,
    skippedRoutine: 0,
    unknownItems: [],
    windowShort: false,
    pressRan: false,
    pressChecked: 0,
    pressSkipped: 0,
    pressRoutine: 0,
    pressBroad: 0,
    pressOverflow: 0,
    pressErrors: [],
    xConfigured: false,
    xChecked: 0,
    xBatches: 0,
    xRoutine: 0,
    xOverflow: 0,
    xErrors: [],
  };
  if (!symbols.length) return { alerts: [], report };

  const [secSettled, quoteSettled, pressSettled, xSettled] = await Promise.allSettled([
    (async () => {
      const { ciksFor } = await import('./sec');
      const { found, missing } = await ciksFor(symbols);
      const cikToSymbol: Record<string, string> = {};
      for (const [sym, cik] of Object.entries(found)) cikToSymbol[String(Number(cik))] = sym;
      return { cikToSymbol, missing, entries: await fetchCurrent8K() };
    })(),
    marketOpen
      ? (async () => {
          const { quotes } = await import('./schwab');
          return quotes(symbols);
        })()
      : Promise.resolve(null),
    /* Tầng BA: tiêu đề báo chí. Chạy BẤT KỂ GIỜ, cùng lý do với 8-K - tin
       quan trọng nhất trong ngày (kết quả kinh doanh, lãnh đạo từ chức)
       phần lớn ra SAU khi sàn đóng. Nạp động để không tạo vòng import:
       pressalerts.ts đọc FRESH_MS từ chính file này. */
    pressDue
      ? (async () => {
          const { fetchPressHeadlines, pressAlertsFrom } = await import('./pressalerts');
          const got = await fetchPressHeadlines(symbols);
          return { got, scan: pressAlertsFrom(got.items, now) };
        })()
      : Promise.resolve(null),
    /* Tầng BỐN: X. Chạy BẤT KỂ GIỜ và BẤT KỂ TICK - đúng lý do X đáng tiền
       hơn báo chí (#155/#159): nhanh hơn, và chỉ nhanh khi hỏi mỗi lượt.
       Nạp động cùng lý do với pressalerts.ts: tránh vòng import. */
    (async () => {
      const { collectXAlerts } = await import('./xalerts');
      return collectXAlerts(symbols, {}, now);
    })(),
  ]);

  const alerts: Alert[] = [];

  if (secSettled.status === 'fulfilled') {
    const { cikToSymbol, missing, entries } = secSettled.value;
    report.noCik = missing;
    const scan = eventAlertsFrom(entries, cikToSymbol, now);
    alerts.push(...scan.alerts);
    report.skippedRoutine = scan.skippedRoutine;
    report.unknownItems = scan.unknownItems;
    report.windowShort = scan.windowShort;
  } else {
    report.secError = String(secSettled.reason?.message ?? secSettled.reason).slice(0, 200);
  }

  if (quoteSettled.status === 'fulfilled') {
    if (quoteSettled.value) alerts.push(...moveAlertsFrom(quoteSettled.value, symbols, day));
  } else {
    report.quoteError = String(quoteSettled.reason?.message ?? quoteSettled.reason).slice(0, 200);
  }

  if (pressSettled.status === 'fulfilled') {
    if (pressSettled.value) {
      const { got, scan } = pressSettled.value;
      report.pressRan = true;
      report.pressChecked = got.asked;
      report.pressSkipped = Math.max(0, symbols.length - got.asked);
      report.pressErrors = got.errors;
      report.pressRoutine = scan.routine;
      report.pressBroad = scan.broad;
      report.pressOverflow = scan.overflow;
      alerts.push(...scan.alerts);
    }
  } else {
    /* Cả tầng báo chí ném (chứ không phải vài mã lẻ hỏng) vẫn phải NÓI RA,
       không được lẫn vào `pressRan: false` - hai chuyện khác nhau. */
    report.pressRan = true;
    report.pressErrors = [String(pressSettled.reason?.message ?? pressSettled.reason).slice(0, 200)];
  }

  if (xSettled.status === 'fulfilled') {
    const { xConfigured } = await import('./xnews');
    const { alerts: xAlerts, report: xr } = xSettled.value;
    report.xConfigured = xConfigured();
    report.xChecked = xr.checked;
    report.xBatches = xr.batches;
    report.xRoutine = xr.routine;
    report.xOverflow = xr.overflow;
    report.xErrors = xr.errors;
    alerts.push(...xAlerts);
  } else {
    const { xConfigured } = await import('./xnews');
    report.xConfigured = xConfigured();
    report.xErrors = [String(xSettled.reason?.message ?? xSettled.reason).slice(0, 200)];
  }

  return { alerts, report };
}
