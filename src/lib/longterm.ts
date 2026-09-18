import { capPasses, type CapTier } from './marketcap';
import type { PeContext } from './pehistory';
import type { SecFundamentals } from './secfacts';
import type { SupportRead, SupportZone, TrendRead } from './support';

/**
 * Tab Long-term Investment: chấm một mã, từ dữ liệu ĐÃ LẤY SẴN.
 *
 * Cùng khuôn với `evaluate()` của screener.ts - module này không gọi mạng,
 * không đọc đĩa, nên chạy được bằng script Node độc lập. Việc lấy dữ liệu
 * nằm ở route.
 *
 * Câu hỏi của tab này: mã nào đang RỚT VỀ MỘT VÙNG HỖ TRỢ mà công ty vẫn
 * làm ăn có lãi và định giá chưa đắt. Ba vế đó cần ba nguồn khác nhau, và
 * vế nào thiếu dữ liệu thì phải NÓI RA chứ không được lặng lẽ tính là đạt.
 */

/* ---------------- đọc số của Finviz ---------------- */

/**
 * Finviz viết "-" cho ô trống, "15.20%" cho phần trăm, "1.23B" cho số lớn.
 *
 * `Number('-')` ra NaN (may), nhưng `Number('')` ra 0 - một ô TRỐNG sẽ thành
 * một số 0 trông như thật, và với P/E hay biên lợi nhuận thì số 0 đó đọc
 * thành "đang lỗ". Cùng cái bẫy `num()` trong gex.ts sinh ra để chặn.
 */
export function fvNum(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s === '-' || s === 'N/A') return null;
  const cleaned = s.replace(/[%,]/g, '').replace(/\s/g, '');
  const mult = /B$/i.test(cleaned) ? 1e9 : /M$/i.test(cleaned) ? 1e6 : /K$/i.test(cleaned) ? 1e3 : 1;
  const n = parseFloat(cleaned.replace(/[BMK]$/i, ''));
  return Number.isFinite(n) ? n * mult : null;
}

export type LtFundamentals = {
  eps: number | null;
  epsNextY: number | null;
  pe: number | null;
  forwardPe: number | null;
  peg: number | null;
  pb: number | null;
  roe: number | null;
  roic: number | null;
  profitMargin: number | null;
  debtEq: number | null;
  targetPrice: number | null;
  /** Thang khuyến nghị của Finviz: 1 = mua mạnh, 5 = bán mạnh. */
  recom: number | null;
  marketCap: number | null;
};

/** Tên ô Finviz cho từng trường, giữ ở một chỗ để không gõ lệch hai nơi. */
const FV_KEYS: Record<keyof LtFundamentals, string> = {
  eps: 'EPS (ttm)',
  epsNextY: 'EPS next Y',
  pe: 'P/E',
  forwardPe: 'Forward P/E',
  peg: 'PEG',
  pb: 'P/B',
  roe: 'ROE',
  roic: 'ROIC',
  profitMargin: 'Profit Margin',
  debtEq: 'Debt/Eq',
  targetPrice: 'Target Price',
  recom: 'Recom',
  marketCap: 'Market Cap',
};

/**
 * Trả về cả `missing` - tên THẬT của những ô Finviz không cho số.
 *
 * Đúng khuôn tự chẩn đoán của repo: Finviz là trang cào, đổi layout là mất ô
 * mà không có lỗi nào nổ ra. Một danh sách ô trống hiện trên màn hình phân
 * biệt được "Finviz đổi giao diện, cần sửa bộ cào" với "công ty này thật sự
 * không có chỉ số đó" - hai chuyện cần hai cách sửa ngược nhau.
 */
export function parseFundamentals(metrics: Record<string, string>): {
  fa: LtFundamentals;
  missing: string[];
} {
  const fa = {} as LtFundamentals;
  const missing: string[] = [];
  for (const [field, key] of Object.entries(FV_KEYS) as [keyof LtFundamentals, string][]) {
    const v = fvNum(metrics[key]);
    (fa[field] as number | null) = v;
    if (v === null) missing.push(key);
  }
  return { fa, missing };
}

/* ---------------- ngưỡng ---------------- */

/** Giá còn cách tâm vùng hỗ trợ bao nhiêu % thì coi là "đang tới hỗ trợ". */
export const NEAR_SUPPORT_PCT = 8;
/** Phải còn cao hơn đáy 52 tuần ít nhất ngần này - chốt chặn bắt dao rơi. */
export const MIN_ABOVE_52W_LOW_PCT = 5;
/** Phải đã rớt khỏi đỉnh 52 tuần ít nhất ngần này, nếu không thì có "rớt" đâu. */
export const MIN_OFF_HIGH_PCT = 10;
/** Trần P/E dự phóng. Cùn nhưng thành thật - xem chú thích ở `gatesFor`. */
export const MAX_FORWARD_PE = 30;
/** Số cổ phiếu tăng quá ngần này %/năm (CAGR 3 năm) là pha loãng NẶNG. */
export const MAX_DILUTION_PCT = 5;

export type LtGate = {
  key: string;
  label: string;
  passed: boolean;
  /** true = CHƯA CÓ DỮ LIỆU để xét, không phải "đã xét và đạt". */
  unknown?: boolean;
};

/** Cổng do người dùng bật/tắt. Xem chú thích trong `gatesFor`. */
export type LtGateOptions = {
  /** Đòi giá nằm TRÊN SMA200. Tắt (mặc định của hàm) = chỉ xét độ dốc. */
  requireAboveSma200?: boolean;
  /** Bậc vốn hoá được chọn. Rỗng (mặc định) = không lọc theo vốn hoá. */
  caps?: readonly CapTier[];
};

export type LtInput = {
  price: number;
  trend: TrendRead;
  support: SupportRead;
  fa: LtFundamentals;
  /** null = chưa hỏi SEC hoặc SEC không có gì cho mã này (ETF, công ty
   *  nước ngoài dùng IFRS). Ba cổng SEC ra `unknown` khi null. */
  sec?: SecFundamentals | null;
  /** Vốn hoá từ Schwab (giá × số cổ phiếu), tính ở tầng 0. null = chưa biết. */
  marketCap?: number | null;
};

/**
 * Năm cổng cứng.
 *
 * Luật chung của repo được giữ nguyên ở đây: THIẾU DỮ LIỆU THÌ ĐI QUA, nhưng
 * mang cờ `unknown` và màn hình vẽ `?` chứ không vẽ ✓ (đúng cách #131 đã
 * giải cho cổng earnings của Screener). Cho trượt khi thiếu dữ liệu sẽ loại
 * hàng loạt mã chỉ vì một lần cào Finviz hụt, và trái luật "thiếu dữ liệu
 * không phải bằng chứng có vấn đề". Nhưng vẽ ✓ cho thứ chưa ai xét thì là
 * nói dối - nên có cờ.
 *
 * Cổng `value` CỐ Ý không dùng giá mục tiêu của giới phân tích. Giá mục tiêu
 * gần như luôn nằm trên giá hiện tại, nên lấy nó làm cổng cứng là giao quyền
 * lọc cho sự lạc quan nghề nghiệp của người khác. Nó vẫn được HIỆN và vẫn
 * được tính điểm, chỉ là không được quyền loại/giữ một mã.
 *
 * Và trần P/E dự phóng là một cây thước CÙN - ngân hàng với phần mềm không
 * cùng thang. Nó chỉ để chặn mấy trường hợp đắt lố; phần tinh tế do phân vị
 * P/E so với CHÍNH mã đó gánh (cột riêng, và một phần điểm số).
 */
export function gatesFor(input: LtInput, opts?: LtGateOptions): LtGate[] {
  const { price, trend, support, fa, sec } = input;

  const slope = trend.sma200SlopePct;
  const nearest = support.nearest;
  const dist = support.distancePct;
  const profitKnown = fa.eps !== null && fa.profitMargin !== null;

  return [
    {
      key: 'trend',
      label: 'Xu hướng dài hạn còn hướng lên (SMA200 dốc lên)',
      passed: slope === null ? true : slope > 0,
      unknown: slope === null,
    },
    /* Cổng DO NGƯỜI DÙNG BẬT, nên nó chỉ có mặt khi được bật - khác hẳn tám
       cổng còn lại vốn luôn được xét.

       Vì sao không đóng cứng: tab này đi tìm mã ĐANG RỚT, mà mã rớt đủ sâu
       để đáng nhìn thì phần lớn đã thủng SMA200 rồi - đó chính là lý do
       #137 chỉ xét ĐỘ DỐC của SMA200 chứ không xét giá so với SMA200. Đóng
       cứng là bảng trống gần như quanh năm, và một bảng trống không nói
       được vì sao nó trống.

       Vì sao không để nó thành một dòng ✗ khi tắt: một cổng in dấu ✗ mà
       không loại ai là dạy người đọc bỏ qua dấu ✗. Lúc tắt, việc giá nằm
       dưới SMA200 VẪN hiện - ở cột Xu hướng, chữ "Dưới SMA200" - nên thông
       tin không mất đi đâu cả, chỉ là nó không còn quyền loại mã. */
    ...(opts?.requireAboveSma200
      ? [
          {
            key: 'aboveSma200',
            label: 'Giá còn nằm trên SMA200',
            /* Thiếu SMA200 (chưa đủ 200 phiên) thì ĐI QUA kèm cờ, đúng luật
               chung của repo: thiếu dữ liệu không phải bằng chứng có vấn đề. */
            passed: trend.aboveSma200 === null ? true : trend.aboveSma200,
            unknown: trend.aboveSma200 === null,
          } as LtGate,
        ]
      : []),
    /* Cổng thứ hai do người dùng bật, cùng khuôn: chỉ có mặt khi có chọn.
       Vốn hoá đọc từ SCHWAB (giá × số cổ phiếu, tính ở tầng 0), KHÔNG phải
       ô `fa.marketCap` của Finviz ngay bên dưới - Finviz là số cào theo
       ngày còn cái này là số sống, và quan trọng hơn: nó có mặt ở tầng 0
       nên lọc được trước khi tốn bất cứ request nào theo từng mã. */
    ...(opts?.caps?.length
      ? [
          {
            key: 'marketCap',
            label: `Vốn hoá thuộc nhóm đã chọn (${opts.caps.join(', ')})`,
            ...capPasses(input.marketCap, opts.caps),
          } as LtGate,
        ]
      : []),
    {
      key: 'nearSupport',
      label: `Đang ở trong ${NEAR_SUPPORT_PCT}% phía trên một vùng hỗ trợ`,
      passed: nearest !== null && dist !== null && dist <= NEAR_SUPPORT_PCT,
      unknown: support.zones.length === 0,
    },
    {
      key: 'pullback',
      label: `Đã rớt ít nhất ${MIN_OFF_HIGH_PCT}% từ đỉnh 52 tuần`,
      passed: trend.offHighPct === null ? true : trend.offHighPct >= MIN_OFF_HIGH_PCT,
      unknown: trend.offHighPct === null,
    },
    {
      key: 'notFallingKnife',
      label: `Còn cao hơn đáy 52 tuần ít nhất ${MIN_ABOVE_52W_LOW_PCT}%`,
      passed:
        trend.aboveLowPct === null ? true : trend.aboveLowPct >= MIN_ABOVE_52W_LOW_PCT,
      unknown: trend.aboveLowPct === null,
    },
    {
      key: 'profitable',
      label: 'Công ty đang có lãi (EPS > 0 và biên lợi nhuận > 0)',
      passed: !profitKnown ? true : fa.eps! > 0 && fa.profitMargin! > 0,
      unknown: !profitKnown,
    },
    {
      key: 'value',
      label: `P/E dự phóng ≤ ${MAX_FORWARD_PE}`,
      passed: fa.forwardPe === null ? true : fa.forwardPe > 0 && fa.forwardPe <= MAX_FORWARD_PE,
      unknown: fa.forwardPe === null,
    },
    /* Ba cổng từ SEC 10-K - thứ Finviz (ảnh chụp ttm) không trả lời được.
       Cả ba đọc CHUỖI NHIỀU NĂM, nên "chưa biết" ở đây nghĩa là SEC không có
       đủ năm (công ty mới niêm yết, IFRS, ETF) - và vẫn đi qua với cờ, đúng
       luật chung. */
    {
      key: 'revenueTrend',
      label: 'Doanh thu không co lại (CAGR 3 năm ≥ 0, theo 10-K)',
      passed: sec?.revenueCagr3 == null ? true : sec.revenueCagr3 >= 0,
      unknown: sec?.revenueCagr3 == null,
    },
    {
      key: 'fcfPositive',
      label: 'Dòng tiền tự do dương năm gần nhất (OCF − CapEx, theo 10-K)',
      passed: sec?.fcfLatest == null ? true : sec.fcfLatest > 0,
      unknown: sec?.fcfLatest == null,
    },
    {
      /* Đây là ý hay nhất trong tài liệu chủ app đưa: EPS tăng mà số cổ phiếu
         cũng tăng mạnh thì EPS "tăng" đó là của ai? Mua lại ra CAGR ÂM và
         đi qua thoải mái. */
      key: 'dilution',
      label: `Không pha loãng nặng (số cổ phiếu tăng ≤ ${MAX_DILUTION_PCT}%/năm, 3 năm)`,
      passed: sec?.sharesCagr3 == null ? true : sec.sharesCagr3 <= MAX_DILUTION_PCT,
      unknown: sec?.sharesCagr3 == null,
    },
  ];
}

/* ---------------- điểm số ---------------- */

export type LtScoreParts = {
  support: number;
  quality: number;
  value: number;
  trend: number;
  /** Tăng trưởng nhiều năm theo 10-K: doanh thu, EPS, FCF, và pha loạng. */
  growth: number;
};

/* Tổng 100. Đây là quyết định sản phẩm, không phải công thức suy ra được -
   cùng tinh thần với bảng trọng số của Screener trong README.
   Bản đầu (#137) là 30/30/25/15 không có growth; nối SEC vào thì tăng trưởng
   nhiều năm là thứ ĐÁNG ĐIỂM nhất cho tiền dài hạn, nên nó lấy 15 và bốn
   phần kia mỗi phần nhường một ít. */
const W = { support: 25, quality: 25, value: 20, trend: 15, growth: 15 };

/**
 * Chuẩn hoá về 0..1, và THIẾU DỮ LIỆU RA 0.5 CHỨ KHÔNG RA 0.
 *
 * Cho 0 khi thiếu dữ liệu là dựng một bộ lọc NGẦM: mọi mã Finviz cào hụt sẽ
 * chìm xuống đáy bảng và không ai biết vì sao. Điểm trung tính giữ chúng ở
 * đúng chỗ "chưa biết", còn việc cảnh báo là của cờ `unknown` trên cổng.
 */
function band(v: number | null, good: number, bad: number): number {
  if (v === null || !Number.isFinite(v)) return 0.5;
  if (good === bad) return 0.5;
  const t = (v - bad) / (good - bad);
  return Math.max(0, Math.min(1, t));
}

export function scoreComponents(input: LtInput, pe: PeContext | null): LtScoreParts {
  const { trend, support, fa } = input;

  // Càng sát hỗ trợ càng tốt: 0% = đủ điểm, NEAR_SUPPORT_PCT = hết điểm.
  const proximity =
    support.distancePct === null ? 0.5 : band(support.distancePct, 0, NEAR_SUPPORT_PCT);
  // Vùng được chạm nhiều lần thì đáng tin hơn; 4 lần trở lên coi là đầy.
  const strength = support.nearest ? band(support.nearest.touches, 4, 1) : 0.5;

  const quality =
    (band(fa.roe, 25, 0) + band(fa.roic, 15, 0) + band(fa.profitMargin, 20, 0) +
      band(fa.debtEq, 0, 2)) / 4;

  /* Ba vế định giá, đúng như chủ app chốt: bội số tuyệt đối, PEG, và phân vị
     so với chính lịch sử của mã. Vế thứ ba trả 0.5 cho tới khi kho đủ dữ
     liệu - tức là nó KHÔNG kéo điểm lên hay xuống trong mấy tuần đầu, thay
     vì giả vờ có ý kiến. */
  const ownHistory = pe?.percentile === null || !pe ? 0.5 : band(pe.percentile, 0, 100);
  const value = (band(fa.forwardPe, 8, MAX_FORWARD_PE) + band(fa.peg, 0.5, 3) + ownHistory) / 3;

  const trendScore =
    (band(trend.sma200SlopePct, 15, 0) + band(trend.aboveLowPct, 40, MIN_ABOVE_52W_LOW_PCT)) / 2;

  /* Không có SEC thì cả bốn vế ra 0.5 -> growth = 7.5, trung tính. Doanh thu
     +15%/năm là đầy điểm; EPS +20%; FCF margin 20%; pha loãng: mua lại -3%/năm
     là đầy, +5%/năm là hết điểm (trùng ngưỡng cổng). */
  const sec = input.sec ?? null;
  const growth =
    (band(sec?.revenueCagr3 ?? null, 15, 0) +
      band(sec?.epsCagr3 ?? null, 20, 0) +
      band(sec?.fcfMarginLatest ?? null, 20, 0) +
      band(sec?.sharesCagr3 ?? null, -3, MAX_DILUTION_PCT)) / 4;

  return {
    support: (proximity * 0.7 + strength * 0.3) * W.support,
    quality: quality * W.quality,
    value: value * W.value,
    trend: trendScore * W.trend,
    growth: growth * W.growth,
  };
}

export const scoreOf = (p: LtScoreParts) =>
  p.support + p.quality + p.value + p.trend + p.growth;

export type LtCandidate = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  trend: TrendRead;
  nearestSupport: SupportZone | null;
  distancePct: number | null;
  /** Vùng đã bị thủng - trạng thái KHÁC HẲN "đang tới hỗ trợ", không gộp. */
  brokenSupport: SupportZone | null;
  zoneCount: number;
  fa: LtFundamentals;
  /** Tên thật các ô Finviz không trả số. */
  faMissing: string[];
  pe: PeContext | null;
  targetUpsidePct: number | null;
  /** Vốn hoá Schwab (giá × số cổ phiếu). null = Schwab không trả số cổ phiếu. */
  marketCap: number | null;
  /** Số liệu 10-K từ SEC. null kèm `secReason` nói vì sao. */
  sec: SecFundamentals | null;
  /** 'no-cik' (ETF / không có trong danh bạ SEC) · 'no-data' (có CIK nhưng
   *  không bóc được doanh thu cả năm - kèm secDiagnosis) · lỗi mạng thật. */
  secReason: string | null;
  gates: LtGate[];
  score: number;
  scoreBreakdown: LtScoreParts;
};
