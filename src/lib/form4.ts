/**
 * Đọc Form 4 (báo cáo giao dịch của người nội bộ) từ SEC.
 *
 * Không dùng thư viện XML nào: lược đồ của Form 4 cố định (schemaVersion
 * X0609), nông, và ở đây chỉ cần khoảng mười thẻ. Bù lại, mọi thứ trong
 * file này được đối chiếu với hai hồ sơ THẬT tải từ SEC chứ không đọc từ
 * tài liệu rồi đoán - các bẫy ghi trong chú thích đều là bẫy có thật.
 */

/** Mã giao dịch. Chỉ P mới là "tự bỏ tiền túi mua ngoài thị trường". */
export const CODE_OPEN_MARKET_BUY = 'P';

export type Form4Transaction = {
  date: string;
  /** P mua, S bán, M thực hiện quyền chọn, F nộp thuế bằng cổ phiếu, G tặng... */
  code: string;
  shares: number | null;
  pricePerShare: number | null;
  /** A = nhận thêm, D = giảm đi. */
  acquiredDisposed: 'A' | 'D' | null;
  sharesAfter: number | null;
  /** D = đứng tên trực tiếp, I = qua pháp nhân trung gian. */
  directOrIndirect: 'D' | 'I' | null;
};

export type Form4Owner = {
  name: string;
  cik: string;
  title: string;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
};

export type Form4 = {
  symbol: string;
  issuerName: string;
  issuerCik: string;
  periodOfReport: string;
  owners: Form4Owner[];
  /**
   * Giao dịch nằm trong kế hoạch 10b5-1 đăng ký trước.
   * Cờ này ở CẤP HỒ SƠ, không phải cấp từng giao dịch.
   */
  plan10b5One: boolean;
  transactions: Form4Transaction[];
};

/* ------------------------------------------------------------------ */
/* Vài mẩu đọc XML, cố tình giữ nhỏ                                     */
/* ------------------------------------------------------------------ */

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Nội dung bên trong thẻ đầu tiên tên `name`. null nếu không có thẻ. */
function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  if (m) return m[1];
  // Thẻ tự đóng <name/> nghĩa là CÓ thẻ nhưng rỗng.
  return new RegExp(`<${name}(?:\\s[^>]*)?/>`).test(xml) ? '' : null;
}

/** Mọi khối `<name>...</name>`, dùng khi một hồ sơ có nhiều giao dịch. */
function tagAll(xml: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g');
  for (let m = re.exec(xml); m; m = re.exec(xml)) out.push(m[1]);
  return out;
}

/**
 * SEC gói phần lớn số liệu thêm một lớp `<value>` nữa
 * (`<transactionShares><value>251136</value></transactionShares>`) nhưng
 * vài thẻ thì không (`<transactionCode>P</transactionCode>`). Đọc được cả
 * hai kiểu để khỏi phải nhớ thẻ nào thuộc kiểu nào.
 */
function text(xml: string, name: string): string {
  const inner = tag(xml, name);
  if (inner === null) return '';
  const wrapped = tag(inner, 'value');
  return decode((wrapped !== null ? wrapped : inner).trim());
}

function num(xml: string, name: string): number | null {
  const raw = text(xml, name).replace(/,/g, '');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Bẫy thật, không phải phòng xa: SEC ghi cờ đúng/sai bằng CẢ HAI kiểu.
 * Cùng một thẻ `<aff10b5One>` là `0` ở hồ sơ CTSO nhưng là `true` ở hồ sơ
 * NMM; `<isDirector>` cũng vậy. Viết `=== 'true'` là đọc sai một nửa số
 * hồ sơ, và đọc sai theo hướng nguy hiểm nhất: một giao dịch theo kế
 * hoạch định trước sẽ bị tính thành "sếp đang gom hàng".
 */
export function secBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'y' || v === 'yes';
}

/* ------------------------------------------------------------------ */

export function parseForm4(xml: string): Form4 {
  const issuer = tag(xml, 'issuer') ?? '';
  const owners: Form4Owner[] = tagAll(xml, 'reportingOwner').map((o) => {
    const rel = tag(o, 'reportingOwnerRelationship') ?? '';
    return {
      name: text(o, 'rptOwnerName'),
      cik: text(o, 'rptOwnerCik'),
      title: text(rel, 'officerTitle'),
      isDirector: secBool(text(rel, 'isDirector')),
      isOfficer: secBool(text(rel, 'isOfficer')),
      isTenPercentOwner: secBool(text(rel, 'isTenPercentOwner')),
    };
  });

  // Chỉ đọc bảng cổ phiếu thường. Bảng phái sinh là quyền chọn của chính
  // sếp - một chuyện khác hẳn, và mã P ở đó không mang nghĩa "mua ngoài
  // thị trường".
  const table = tag(xml, 'nonDerivativeTable') ?? '';
  const transactions = tagAll(table, 'nonDerivativeTransaction').map((tx) => {
    const coding = tag(tx, 'transactionCoding') ?? '';
    const amounts = tag(tx, 'transactionAmounts') ?? '';
    const post = tag(tx, 'postTransactionAmounts') ?? '';
    const nature = tag(tx, 'ownershipNature') ?? '';
    const ad = text(amounts, 'transactionAcquiredDisposedCode').toUpperCase();
    const di = text(nature, 'directOrIndirectOwnership').toUpperCase();
    return {
      date: text(tx, 'transactionDate'),
      code: text(coding, 'transactionCode').toUpperCase(),
      shares: num(amounts, 'transactionShares'),
      pricePerShare: num(amounts, 'transactionPricePerShare'),
      acquiredDisposed: ad === 'A' || ad === 'D' ? (ad as 'A' | 'D') : null,
      sharesAfter: num(post, 'sharesOwnedFollowingTransaction'),
      directOrIndirect: di === 'D' || di === 'I' ? (di as 'D' | 'I') : null,
    };
  });

  return {
    symbol: text(issuer, 'issuerTradingSymbol').toUpperCase(),
    issuerName: text(issuer, 'issuerName'),
    issuerCik: text(issuer, 'issuerCik'),
    periodOfReport: text(xml, 'periodOfReport'),
    owners,
    plan10b5One: secBool(text(xml, 'aff10b5One')),
    transactions,
  };
}

/**
 * Những giao dịch thật sự đáng coi là tín hiệu.
 *
 * Mã P và nhận thêm cổ phiếu (A), và hồ sơ KHÔNG nằm trong kế hoạch
 * 10b5-1. Kế hoạch 10b5-1 được đăng ký từ nhiều tháng trước và chạy tự
 * động, nên nó không nói lên điều gì về việc sếp nghĩ gì hôm nay - hồ sơ
 * NMM trong bộ mẫu có cả ba giao dịch đều mã P nhưng đều theo kế hoạch,
 * đúng kiểu sẽ bị đếm nhầm nếu chỉ lọc theo mã.
 */
export function openMarketBuys(f: Form4): Form4Transaction[] {
  if (f.plan10b5One) return [];
  return f.transactions.filter(
    (t) => t.code === CODE_OPEN_MARKET_BUY && t.acquiredDisposed === 'A'
  );
}

/** Tổng tiền sếp bỏ ra trong một hồ sơ. null nếu SEC không ghi giá. */
export function buyValue(f: Form4): number | null {
  const buys = openMarketBuys(f);
  if (!buys.length) return null;
  let total = 0;
  for (const b of buys) {
    if (b.shares === null || b.pricePerShare === null) return null;
    total += b.shares * b.pricePerShare;
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* Ghép đường dẫn tới file XML gốc                                      */
/* ------------------------------------------------------------------ */

/**
 * `primaryDocument` của một Form 4 KHÔNG trỏ tới XML gốc.
 *
 * SEC ghi `"xslF345X06/form4.xml"` - tiền tố `xslF345X06/` là bản đã qua
 * bộ tô màu của SEC, tức là HTML, không phải XML. File gốc nằm cùng thư
 * mục nhưng bỏ tiền tố đi. Tên file thì không cố định: hồ sơ Apple là
 * `form4.xml`, hồ sơ CTSO là `tm2618008-1_4seq1.xml`, nên phải cắt tiền
 * tố chứ không được ghi cứng tên file.
 */
export function stripXslPrefix(primaryDocument: string): string {
  return primaryDocument.replace(/^xsl[^/]*\//i, '');
}

/**
 * Đường dẫn tới file XML gốc trong kho lưu trữ.
 *
 * Hai chỗ khác quy ước với data.sec.gov, và khác ngược nhau:
 *  - CIK ở đây KHÔNG đệm số 0 (1175151), trong khi data.sec.gov đòi đệm
 *    đủ 10 chữ số (CIK0001175151).
 *  - Số hiệu hồ sơ ở đây BỎ dấu gạch (000110465926074164), trong khi
 *    JSON trả về có gạch (0001104659-26-074164).
 */
export function archiveXmlUrl(
  cik: string | number,
  accessionNumber: string,
  primaryDocument: string
): string {
  const bare = String(cik).replace(/\D/g, '').replace(/^0+/, '');
  const acc = accessionNumber.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${bare}/${acc}/${stripXslPrefix(
    primaryDocument
  )}`;
}
