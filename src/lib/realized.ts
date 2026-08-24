/**
 * Lời/lỗ đã chốt trong năm, đọc từ báo cáo "Realized Gain/Loss - Lot Details"
 * do chính Schwab xuất ra.
 *
 * Bản trước dựng lại con số này từ endpoint giao dịch: tự ghép lệnh bán với
 * lô mua theo FIFO rồi trừ ra. Cách đó sai ngay từ giả định - giá vốn thật
 * của Schwab đã điều chỉnh theo lô thuế và wash sale, thứ không suy ra được
 * từ danh sách giao dịch thô. Báo cáo này thì có sẵn cột Gain/Loss ($) cho
 * từng lô, do Schwab tự tính, nên không còn gì để đoán.
 *
 * Đổi lại, đây là ảnh chụp tại một thời điểm chứ không phải dữ liệu sống:
 * ngày xuất báo cáo được đọc ra và hiện lên màn hình, để con số không bao giờ
 * lặng lẽ cũ đi mà trông vẫn như mới.
 */

export type RealizedAccount = { name: string; total: number; lots: number };

export type RealizedResult = {
  year: number;
  /** Ngày xuất báo cáo, dạng YYYY-MM-DD. Hiện lên màn hình. */
  asOf: string;
  /** Khoảng thời gian báo cáo bao phủ, nguyên văn dạng MM/DD/YYYY. */
  from: string;
  to: string;
  accounts: RealizedAccount[];
  bySymbol: Record<string, number>;
  total: number;
  lots: number;
};

/**
 * Tách một dòng CSV có dấu ngoặc kép.
 *
 * Không dùng thư viện: mọi ô trong báo cáo Schwab đều được bọc ngoặc kép, và
 * quy tắc duy nhất cần xử lý là hai dấu ngoặc liền nhau nghĩa là một dấu
 * ngoặc thật bên trong ô.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Đọc một ô tiền: "$1,629.06" -> 1629.06, "-$93.37" -> -93.37, "" -> 0.
 */
export function parseMoney(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  const neg = t.startsWith('-') || (t.startsWith('(') && t.endsWith(')'));
  const digits = t.replace(/[^0-9.]/g, '');
  if (!digits) return 0;
  const v = Number(digits);
  if (!Number.isFinite(v)) return 0;
  return neg ? -v : v;
}

/**
 * Mã cơ sở của một dòng.
 *
 *     "SLV"                       -> SLV
 *     "MSTR 08/14/2026 118.00 C"  -> MSTR
 *
 * Gom quyền chọn về mã cơ sở để bảng tách theo mã trả lời đúng câu hỏi thật:
 * cả năm kiếm/mất bao nhiêu trên từng cái tên, chứ không phải trên từng hợp
 * đồng riêng lẻ.
 */
export function underlyingOf(symbol: string): string {
  return (symbol.trim().split(/\s+/)[0] || '?').toUpperCase();
}

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/**
 * Bóc thông tin từ dòng tiêu đề đầu báo cáo, ví dụ:
 *
 *   Realized Gain/Loss - Lot Details for Designated_Bene_Joint as of
 *   Mon Aug 24  11:03:58 EDT 2026 from 01/01/2026 to 08/24/2026
 */
export function parseHeader(line: string): {
  account: string;
  asOf: string;
  from: string;
  to: string;
} {
  const account = /for\s+(\S+)\s+as of/.exec(line)?.[1] ?? 'Schwab';
  const d = /as of\s+\w{3}\s+(\w{3})\s+(\d{1,2})\s+[\d:]+\s+\w+\s+(\d{4})/.exec(line);
  const asOf = d ? `${d[3]}-${MONTHS[d[1]] ?? '01'}-${d[2].padStart(2, '0')}` : '';
  const range = /from\s+(\d{2}\/\d{2}\/\d{4})\s+to\s+(\d{2}\/\d{2}\/\d{4})/.exec(line);
  return { account, asOf, from: range?.[1] ?? '', to: range?.[2] ?? '' };
}

/**
 * Gộp nhiều báo cáo (mỗi tài khoản một file) thành một kết quả duy nhất -
 * theo lựa chọn gộp chung hai tài khoản, giống bảng vị thế.
 *
 * Ngày `asOf` lấy ngày cũ NHẤT trong các báo cáo: nếu hai file xuất lệch
 * ngày, con số chung chỉ đáng tin tới ngày cũ hơn, nói ngày mới hơn là nói
 * quá.
 */
export function realizedFromCsv(files: string[]): RealizedResult {
  const bySymbol: Record<string, number> = {};
  const accounts: RealizedAccount[] = [];
  let total = 0;
  let lots = 0;
  let asOf = '';
  let from = '';
  let to = '';

  for (const text of files) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) continue;

    const head = parseHeader(lines[0]);
    if (!asOf || (head.asOf && head.asOf < asOf)) asOf = head.asOf;
    if (!from) from = head.from;
    if (!to) to = head.to;

    const cols = parseCsvLine(lines[1]);
    const iSym = cols.indexOf('Symbol');
    const iGl = cols.indexOf('Gain/Loss ($)');
    // Thiếu cột thì bỏ cả file, chứ không đoán vị trí cột theo thứ tự - một
    // báo cáo đọc sai cột còn tệ hơn một báo cáo không đọc được.
    if (iSym < 0 || iGl < 0) continue;

    let acctTotal = 0;
    let acctLots = 0;
    for (const line of lines.slice(2)) {
      const r = parseCsvLine(line);
      if (r.length <= iGl) continue;
      const sym = r[iSym].trim();
      if (!sym) continue;
      const gl = parseMoney(r[iGl]);
      const under = underlyingOf(sym);
      bySymbol[under] = (bySymbol[under] ?? 0) + gl;
      acctTotal += gl;
      acctLots += 1;
    }
    accounts.push({ name: head.account, total: acctTotal, lots: acctLots });
    total += acctTotal;
    lots += acctLots;
  }

  return {
    year: Number(asOf.slice(0, 4)) || new Date().getUTCFullYear(),
    asOf,
    from,
    to,
    accounts,
    bySymbol,
    total,
    lots,
  };
}
