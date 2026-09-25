/**
 * Ngày earnings kế tiếp của MỘT mã, kèm NGUỒN và TRẠNG THÁI — cho tab Analyze.
 *
 * Chủ app: *"Tại sao analysis hay các tab đều không có ngày ER của stock?"*.
 * Màn hình cũ in một ngày trơ hoặc một dấu `—`, và dấu `—` gộp bốn chuyện
 * khác hẳn nhau: chưa nguồn nào biết gì / đã hỏi và mã này không có earnings
 * (ETF) / chỉ biết lần báo cáo đã qua / nguồn đang hỏng. File này tách chúng
 * ra, vì bốn chuyện đó cần bốn phản ứng khác nhau.
 *
 * Ba nguồn, xếp theo độ tin:
 *  1. tastytrade `/market-metrics` — có cờ ước tính/đã xác nhận.
 *  2. `data/earnings.json` — lịch tay (Yahoo → Nasdaq), chỉ phủ watchlist.
 *  3. Finviz ô "Earnings" — ĐƯỜNG LÙI CUỐI. Nó viết kiểu "Oct 29 AMC",
 *     KHÔNG có năm, nên năm do app suy ra và màn hình nói thẳng như vậy.
 *     Finviz còn giữ ngày báo cáo ĐÃ QUA cho tới khi công ty công bố ngày
 *     mới, nên một ngày suy ra nằm phía sau hôm nay là "lần gần nhất" chứ
 *     không bao giờ được đọc thành "kỳ tới". Định dạng CHƯA ĐO từ sandbox
 *     (finviz.com bị chặn) — đọc dung thứ, bóc hụt thì trả null và giữ
 *     nguyên chuỗi gốc để màn hình in ra.
 *
 * Không import gì: chạy độc lập được cho kiểm thử.
 */

export type EarningsSource = 'tastytrade' | 'file' | 'finviz';

export type EarningsInfo = {
  date: string | null;
  source: EarningsSource | null;
  /** tastytrade tự đánh dấu. null = nguồn không nói (lịch tay, Finviz). */
  estimated: boolean | null;
  /** BMO = trước giờ mở cửa, AMC = sau giờ đóng cửa (chỉ Finviz nói). */
  timing: 'BMO' | 'AMC' | null;
  /** Năm do app suy ra (Finviz không in năm). */
  yearInferred: boolean;
  status: 'known' | 'none' | 'past' | 'unknown';
  /** Lần báo cáo gần nhất đã biết, dùng khi status = 'past'. */
  lastDate: string | null;
  /** Vì sao chưa biết — mã ngắn, màn hình dịch. */
  reasons: string[];
  /** tastytrade trả lỗi gì (nguyên văn, đã cắt). */
  ttError: string | null;
  /** Chuỗi Finviz nguyên văn khi có. */
  finvizRaw: string | null;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * "Oct 29 AMC" / "Jan 30 BMO" / "Oct 29" / "Oct 29/a" -> ngày ISO.
 *
 * Năm: lấy trong ba ứng viên (năm trước, năm nay, năm sau) cái GẦN hôm nay
 * nhất. Earnings là chuyện hằng quý, nên ngày Finviz in luôn nằm trong vài
 * tháng quanh hôm nay: "Feb 3" đọc vào cuối tháng 9 là tháng 2 năm sau, còn
 * "Jul 29" là tháng 7 vừa qua (tức lần đã báo cáo, không phải kỳ tới).
 */
export function parseFinvizEarnings(
  raw: unknown,
  today: string
): { date: string; timing: 'BMO' | 'AMC' | null } | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\b(.*)$/);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  const day = Number(m[2]);
  if (!mon || !(day >= 1 && day <= 31)) return null;
  const rest = m[3].toUpperCase();
  const timing = /\bAMC\b|\/A\b/.test(rest) ? 'AMC' : /\bBMO\b|\/B\b/.test(rest) ? 'BMO' : null;
  if (!DATE_RE.test(today)) return null;
  const t0 = Date.parse(`${today}T00:00:00Z`);
  const y0 = Number(today.slice(0, 4));
  let best: { date: string; gap: number } | null = null;
  for (const y of [y0 - 1, y0, y0 + 1]) {
    const date = iso(y, mon, day);
    const t = Date.parse(`${date}T00:00:00Z`);
    // 31/2 và các ngày không có thật: Date.parse lăn sang tháng sau, loại.
    if (!Number.isFinite(t) || new Date(t).getUTCDate() !== day) continue;
    const gap = Math.abs(t - t0);
    if (!best || gap < best.gap) best = { date, gap };
  }
  return best ? { date: best.date, timing } : null;
}

export type TtInput = {
  configured: boolean;
  /** Bản ghi có kết luận: có ngày, hoặc visible=false (không có earnings). */
  record: { date: string | null; estimated: boolean; visible: boolean } | null;
  undecided: boolean;
  missing: boolean;
  error: string | null;
};

export function resolveNextEarnings(args: {
  today: string;
  tt: TtInput;
  fileDates: string[] | undefined;
  finvizRaw: string | null | undefined;
  /** Schwab `lastEarningsDate`, chỉ để nói "lần gần nhất". */
  schwabLast?: string | null;
}): EarningsInfo {
  const { today, tt } = args;
  const fileDates = (args.fileDates ?? []).filter((d) => typeof d === 'string' && DATE_RE.test(d)).sort();
  const finvizRaw = typeof args.finvizRaw === 'string' && args.finvizRaw.trim() ? args.finvizRaw.trim() : null;
  const fv = parseFinvizEarnings(finvizRaw, today);

  const out: EarningsInfo = {
    date: null,
    source: null,
    estimated: null,
    timing: null,
    yearInferred: false,
    status: 'unknown',
    lastDate: null,
    reasons: [],
    ttError: tt.error,
    finvizRaw,
  };

  const ttDate = tt.record?.date && tt.record.date >= today ? tt.record.date : null;
  const fileNext = fileDates.find((d) => d >= today) ?? null;

  // Ngày sớm nhất còn ở phía trước trong hai nguồn có năm thật. Trùng nhau
  // thì ghi tastytrade vì nó mang theo cờ ước tính/đã xác nhận.
  if (ttDate && (!fileNext || ttDate <= fileNext)) {
    Object.assign(out, { date: ttDate, source: 'tastytrade', estimated: tt.record!.estimated, status: 'known' });
  } else if (fileNext) {
    Object.assign(out, { date: fileNext, source: 'file', status: 'known' });
  } else if (fv && fv.date >= today) {
    Object.assign(out, { date: fv.date, source: 'finviz', timing: fv.timing, yearInferred: true, status: 'known' });
  }
  if (out.status === 'known') {
    // Finviz nói giờ (BMO/AMC) cho cùng ngày thì vẫn đáng in kèm.
    if (fv && fv.date === out.date && !out.timing) out.timing = fv.timing;
    return out;
  }

  // tastytrade nói THẲNG mã này không có earnings (ETF, quỹ) và không nguồn
  // nào khác có ngày: đó là một câu trả lời, không phải chỗ trống.
  if (tt.record && tt.record.visible === false) {
    out.status = 'none';
    return out;
  }

  const past = [
    ...fileDates.filter((d) => d < today),
    ...(tt.record?.date && tt.record.date < today ? [tt.record.date] : []),
    ...(fv && fv.date < today ? [fv.date] : []),
    ...(args.schwabLast && DATE_RE.test(String(args.schwabLast).slice(0, 10)) ? [String(args.schwabLast).slice(0, 10)] : []),
  ].sort();
  if (past.length) out.lastDate = past[past.length - 1];

  if (!tt.configured) out.reasons.push('tt-off');
  else if (tt.error) out.reasons.push('tt-error');
  else if (tt.missing) out.reasons.push('tt-missing');
  else if (tt.undecided) out.reasons.push('tt-undecided');
  if (!fileDates.length) out.reasons.push('not-in-file');
  if (!finvizRaw) out.reasons.push('no-finviz');
  else if (!fv) out.reasons.push('finviz-unparsed');

  out.status = out.lastDate && (fv || fileDates.length || tt.record) ? 'past' : 'unknown';
  return out;
}
