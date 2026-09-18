import { archiveXmlUrl } from './form4';
import { ciksFor, recentFilings, type Filing } from './sec';

/**
 * Hồ sơ SEC đọc như TIN TỨC, cho câu hỏi "tại sao mã này rớt".
 *
 * Vì sao nguồn này đáng thêm vào: tin báo chí là người ngoài VIẾT VỀ công
 * ty, còn 8-K là chính công ty BẮT BUỘC phải khai một sự kiện trọng yếu -
 * kết quả kinh doanh, CEO nghỉ, phải phát hành thêm cổ phiếu, hoặc nặng
 * nhất là báo cáo tài chính cũ không còn đáng tin. Đó thường chính là cú
 * rớt, chứ không phải bài viết về cú rớt. Miễn phí, không cần key, và
 * `sec.ts` đã có sẵn client chạy thật trong production từ hồi Form 4.
 *
 * ĐÃ ĐO chứ không đoán (2026-09-18, AAPL, `data.sec.gov` trả 200 từ sandbox):
 * `filings.recent` có 16 mảng song song, trong đó có **`items`** - và với
 * 8-K nó mang đúng mã mục thật: "2.02,9.01", "5.02", "5.07,9.01". Đó là thứ
 * biến một dòng "8-K" vô nghĩa thành "công bố kết quả kinh doanh" hay "thay
 * người điều hành". `primaryDocDescription` cũng có nhưng với 8-K chỉ ghi
 * lại "8-K", nên không dùng được.
 */

/**
 * Mã mục 8-K → nghĩa, theo đúng biểu mẫu SEC công bố.
 *
 * Mã LẠ được in NGUYÊN VĂN chứ không bỏ đi và tuyệt đối không đoán: SEC có
 * thêm mục mới, và một cái nhãn sai trông y hệt một cái nhãn đúng - cùng lý
 * do `ruleLabel()` của Options Flow in tên thật của UW khi gặp giá trị lạ.
 */
export const EIGHT_K_ITEMS: Record<string, string> = {
  '1.01': 'entry into a material definitive agreement',
  '1.02': 'termination of a material definitive agreement',
  '1.03': 'bankruptcy or receivership',
  '1.05': 'material cybersecurity incident',
  '2.01': 'completed an acquisition or disposition of assets',
  '2.02': 'results of operations and financial condition (earnings release)',
  '2.03': 'created a direct financial obligation',
  '2.04': 'triggering event accelerating a financial obligation',
  '2.05': 'costs associated with exit or disposal activities',
  '2.06': 'material impairment',
  '3.01': 'notice of delisting or failure to satisfy a listing rule',
  '3.02': 'unregistered sale of equity securities',
  '3.03': 'material modification to rights of security holders',
  '4.01': "change of the registrant's certifying accountant",
  '4.02': 'NON-RELIANCE on previously issued financial statements (restatement)',
  '5.01': 'change in control of the registrant',
  '5.02': 'departure or appointment of directors or principal officers',
  '5.03': 'amendment to articles or bylaws, or change in fiscal year',
  '5.07': 'submission of matters to a shareholder vote',
  '7.01': 'Regulation FD disclosure',
  '8.01': 'other events',
  /* Có nghĩa rõ ràng, và `BOILERPLATE` ngay dưới đã gọi đúng tên nó - nên
     in "app chưa biết nghĩa" khi nó ĐỨNG MỘT MÌNH là app nói dối về chính
     bảng tra của nó. Vẫn bị bỏ khi có mục khác đi kèm. */
  '9.01': 'financial statements and exhibits (procedural attachment)',
};

/**
 * Mục 9.01 là "báo cáo tài chính và phụ lục" - thủ tục đính kèm, gần như
 * luôn đi kèm mục khác. Giữ nó cạnh "2.02" chỉ làm loãng dòng tiêu đề, nên
 * nó bị bỏ KHI CÒN mục khác, và chỉ hiện khi nó đứng một mình.
 */
const BOILERPLATE = new Set(['9.01']);

/**
 * Loại hồ sơ được coi là tin.
 *
 * Form 4 cố ý KHÔNG có mặt, vì hai lý do: tab Insider Trade đã đọc Form 4
 * kỹ hơn hẳn (chỉ mã P, loại 10b5-1), và về số lượng nó sẽ nhấn chìm mọi
 * thứ khác - đo trên AAPL: 591 Form 4 trên tổng 1001 dòng, so với 103 8-K.
 * Nhét nó vào đây là biến mục tin tức thành nhật ký giấy tờ nội bộ.
 */
function isMaterial(form: string): boolean {
  const f = form.toUpperCase();
  if (f === '8-K' || f === '8-K/A') return true;
  if (f === '10-Q' || f === '10-K' || f === '10-Q/A' || f === '10-K/A') return true;
  // Phát hành thêm cổ phiếu: một nguyên nhân rớt giá rất thật, và là thứ
  // duy nhất trong danh sách này báo trước chuyện pha loãng.
  if (f.startsWith('424B') || f === 'S-1' || f === 'S-3' || f === 'S-3ASR') return true;
  // Cổ đông hoạt động mua gom.
  if (f.startsWith('SC 13D')) return true;
  return false;
}

/**
 * Nghĩa của LOẠI hồ sơ, cho những loại không có mã mục.
 *
 * Không có bảng này thì một dòng chỉ ghi "SEC filing: 424B5" - đúng nhưng vô
 * dụng, trong khi đó chính là thông báo bán thêm cổ phiếu, một nguyên nhân
 * rớt giá rất thật. Loại lạ vẫn in nguyên mã loại chứ không đoán.
 */
const FORM_MEANING: Record<string, string> = {
  '10-Q': 'quarterly report',
  '10-K': 'annual report',
  'S-1': 'registration of new securities to be sold',
  'S-3': 'shelf registration (allows selling shares later)',
  'S-3ASR': 'automatic shelf registration (allows selling shares later)',
};

/**
 * 424B* = bản cáo bạch cuối theo Rule 424(b).
 *
 * **Bản #149 GHI SAI ở đây, và chính Claude ở production bắt được** khi trả
 * lời chủ app: "nhãn pha loãng này do công cụ tự suy ra, không được kiểm
 * chứng; các bản 424B thường cũng được dùng cho phát hành nợ." Nó đúng.
 * Câu cũ viết thẳng "a share offering has been priced (dilution)" - tức
 * KHẲNG ĐỊNH một sự thật tài chính mà hồ sơ không hề nói.
 *
 * **ĐO 2026-09-18, không đoán** (`data.sec.gov`, ba nhà phát hành):
 *
 * | Nhà phát hành | tổng dòng | 424B* | tỷ lệ | mô tả tài liệu |
 * |---|---|---|---|---|
 * | Bank of America | 11.416 | 10.626 | **93%** | PRICING/PRODUCT SUPPLEMENT |
 * | Morgan Stanley  | 19.909 | 16.716 | **84%** | "PRICING SUPPLEMENT NO. 18.867" |
 * | NVIDIA          |  1.001 |      4 |  0,4% | chỉ ghi "424B5" |
 *
 * Morgan Stanley đánh số tới **phiếu 18.867** - đó là một chương trình
 * phát hành trái phiếu trung hạn, không phải 18.867 đợt bán cổ phiếu. Nhãn
 * cũ sẽ gọi TỪNG cái trong số đó là pha loãng cổ đông.
 *
 * Nên: không khẳng định nữa. Nói đúng thứ BIẾT được - đã có một đợt chào
 * bán chốt giá - và nói thẳng rằng bảng kê hồ sơ KHÔNG cho biết đó là cổ
 * phiếu hay trái phiếu. Cùng luật với mã mục 8-K lạ ở ngay dưới: in ra và
 * thú nhận không biết, tuyệt đối không đoán.
 */
const prospectus = (form: string, desc: string) => {
  if (!form.toUpperCase().startsWith('424B')) return null;
  const d = (desc ?? '').toUpperCase();
  // Chữ ký đo được của một lượt rút vốn từ chương trình trái phiếu.
  if (/PRICING SUPPLEMENT|PRODUCT SUPPLEMENT/.test(d))
    return (
      `${form} pricing supplement - a takedown from a debt/note programme, ` +
      'NOT a share issue; this is routine funding, not news about the business'
    );
  return (
    `${form} prospectus - a securities offering has been priced. ` +
    'The SEC filing index does NOT say whether this is equity (dilution) or ' +
    'debt, so do not call it dilution without checking the document itself'
  );
};

/**
 * Trần số bản cáo bạch giữ lại.
 *
 * Đây CHÍNH LÀ cái bẫy Form 4 mà #148 đã tránh được rồi lại dẫm phải ở cửa
 * bên cạnh: Form 4 bị loại vì chiếm 591/1001 dòng của AAPL (59%), trong khi
 * 424B chiếm **93% của Bank of America và 84% của Morgan Stanley** - tệ hơn
 * hẳn. Không có trần này thì với mọi mã ngân hàng, mục tin tức là một bức
 * tường phiếu chào giá và MỌI 8-K thật đều bị đẩy ra khỏi 4 chỗ.
 */
const MAX_PROSPECTUS = 1;

const activist = (form: string) =>
  form.toUpperCase().startsWith('SC 13D')
    ? 'an investor disclosed a 5%+ activist stake'
    : null;

/** Dòng tiêu đề cho một hồ sơ: loại + nghĩa của các mục, không có thì chỉ loại. */
export function describeFiling(f: Filing): string {
  const codes = (f.items ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const kept = codes.length > 1 ? codes.filter((c) => !BOILERPLATE.has(c)) : codes;
  if (!kept.length) {
    /* `/A` là bản sửa đổi của chính loại đó; tra nghĩa theo loại gốc rồi
       nói rõ đây là bản sửa, chứ không để nó rơi xuống nhánh "không rõ". */
    const base = f.form.replace(/\/A$/i, '');
    const meaning =
      FORM_MEANING[base.toUpperCase()] ??
      prospectus(base, f.primaryDocDescription ?? '') ??
      activist(base);
    const amended = base !== f.form ? ' (amended)' : '';
    return meaning
      ? `SEC ${f.form}: ${meaning}${amended}`
      : `SEC filing: ${f.form}`;
  }
  const parts = kept.map((c) =>
    EIGHT_K_ITEMS[c] ? `Item ${c} ${EIGHT_K_ITEMS[c]}` : `Item ${c} (meaning not in this app's table)`
  );
  return `SEC ${f.form}: ${parts.join('; ')}`;
}

export type SecNewsItem = {
  title: string;
  publisher: string;
  link: string;
  published: string;
  form: string;
  items: string;
};

/**
 * Hồ sơ trọng yếu trong `days` ngày gần nhất.
 *
 * `limit` cố ý NHỎ: mục tin tức có chỗ hữu hạn, và bốn hồ sơ gần nhất đã đủ
 * để trả lời "công ty có tự khai chuyện gì không". Để nó lớn là đẩy tin báo
 * chí ra khỏi danh sách bằng giấy tờ.
 */
export async function secFilingNews(
  symbol: string,
  days = 120,
  limit = 4,
  now = Date.now()
): Promise<SecNewsItem[]> {
  const { found } = await ciksFor([symbol]);
  const cik = found[symbol];
  /* Không có CIK là chuyện BÌNH THƯỜNG ở đây (ETF, mã nước ngoài), không
     phải lỗi - trả mảng rỗng để nguồn này im lặng rút lui thay vì làm hỏng
     cả mục tin tức. Khác hẳn tab Đầu tư dài hạn, nơi `no-cik` phải nói ra. */
  if (!cik) return [];

  const filings = await recentFilings(cik);
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  return filings
    .filter((f) => {
      if (!isMaterial(f.form)) return false;
      const t = Date.parse(f.filingDate);
      return Number.isFinite(t) && t >= cutoff;
    })
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))
    /* Chặn lụt TRƯỚC khi cắt `limit`, nếu không thì với một ngân hàng cả 4
       chỗ đều là phiếu chào giá và không 8-K nào lọt vào. Giữ bản MỚI NHẤT
       vì mảng đã xếp giảm dần theo ngày. */
    .filter(
      (() => {
        let seen = 0;
        return (f: Filing) =>
          !f.form.toUpperCase().startsWith('424B') || ++seen <= MAX_PROSPECTUS;
      })()
    )
    .slice(0, limit)
    .map((f) => ({
      title: describeFiling(f),
      publisher: 'SEC EDGAR (the company itself)',
      link: archiveXmlUrl(cik, f.accessionNumber, f.primaryDocument),
      /* Ngày NỘP, không phải `reportDate`: thị trường phản ứng lúc hồ sơ
         xuất hiện, còn reportDate có thể là kỳ báo cáo đã qua từ lâu. */
      published: new Date(f.filingDate).toISOString(),
      form: f.form,
      items: f.items ?? '',
    }));
}
