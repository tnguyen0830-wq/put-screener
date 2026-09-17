/**
 * Đọc XBRL `companyfacts` của SEC thành chuỗi số theo NĂM TÀI CHÍNH, rồi tính
 * những thứ Finviz (ảnh chụp ttm) không trả lời được: doanh thu / EPS / FCF
 * có tăng đều 3-5 năm không, và số cổ phiếu có đang phình ra không.
 *
 * Module này CỐ Ý thuần logic - không mạng, không đĩa - để test bằng script
 * Node độc lập với một fixture dựng đúng hình dạng thật.
 *
 * HÌNH DẠNG CHƯA ĐO ĐƯỢC TỪ SANDBOX (`data.sec.gov` bị chặn 403 CONNECT lúc
 * viết). Cấu trúc dưới đây là cấu trúc công bố và rất phổ biến:
 *
 *   { cik, entityName, facts: { "us-gaap": { Revenues: { units: { USD: [
 *       { start, end, val, accn, fy, fp, form, filed, frame? } ] } } },
 *     dei: { EntityCommonStockSharesOutstanding: { units: { shares: [...] } } } } }
 *
 * nhưng repo này đã bị đốt nhiều lần vì code theo tài liệu nhớ được, nên mọi
 * chỗ đọc đều dung thứ, và `secDiagnosis()` in ra KHOÁ THẬT khi không bóc
 * được gì - lần chạy đầu ở production sẽ nói chỗ nào đoán sai thay vì hiện
 * bốn dấu gạch ngang. `/api/secprobe` làm đúng việc đó theo khuôn uwprobe.
 *
 * BA BẪY ĐÃ BIẾT của companyfacts, và cách xử:
 *
 * 1. CÙNG MỘT KỲ XUẤT HIỆN NHIỀU LẦN. Báo cáo 10-K năm 2024 chứa cả số năm
 *    2023 và 2022 để so sánh, mỗi số mang `fy: 2024`. Nên KHÔNG được gom theo
 *    `fy` - gom theo `end` (ngày kết thúc kỳ), và trong mỗi nhóm giữ bản
 *    `filed` MỚI NHẤT: đó cũng chính là cách hấp thụ số đã điều chỉnh
 *    (restated) mà không cần biết nó bị điều chỉnh.
 *
 * 2. `fp: "FY"` KHÔNG ĐỦ ĐỂ NÓI "SỐ CẢ NĂM". Trong 10-K, cả số quý 4 lẫn số
 *    cả năm đều mang fp = FY. Thứ phân biệt là ĐỘ DÀI KỲ: start→end xấp xỉ
 *    một năm. Bỏ điều kiện này là cộng nhầm một quý thành một năm.
 *
 * 3. MỘT KHÁI NIỆM, NHIỀU THẺ. "Doanh thu" là `Revenues` ở công ty này,
 *    `RevenueFromContractWithCustomerExcludingAssessedTax` ở công ty kia
 *    (sau ASC 606), `SalesRevenueNet` ở báo cáo cũ. Mỗi chỉ tiêu có một
 *    THANG thẻ, thử theo thứ tự, và `tagsUsed` ghi lại thẻ nào thắng - đúng
 *    cách `TOKEN_VARIANTS` của tastytrade nhớ biến thể chạy được.
 */

export type SecPoint = {
  /** Ngày kết thúc kỳ, YYYY-MM-DD. Dùng làm khoá năm tài chính. */
  end: string;
  value: number;
  filed: string;
  form: string;
};

type RawFact = {
  start?: string;
  end?: string;
  val?: unknown;
  fy?: unknown;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
};

/* Biểu mẫu cả năm. 20-F/40-F là công ty nước ngoài niêm yết Mỹ. */
const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '10-KT', '20-F', '20-F/A', '40-F', '40-F/A']);

const DAY = 86_400_000;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;

/** Thang thẻ cho từng chỉ tiêu, thứ tự = khả năng gặp. */
export const TAGS = {
  revenue: [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
    'RevenuesNetOfInterestExpense',
  ],
  netIncome: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
  epsDiluted: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'],
  ocf: [
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  ],
  capex: [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsToAcquireProductiveAssets',
    'PaymentsForCapitalImprovements',
  ],
  shares: [
    'WeightedAverageNumberOfDilutedSharesOutstanding',
    'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
    'WeightedAverageNumberOfSharesOutstandingBasic',
  ],
} as const;

export type SecMetric = keyof typeof TAGS;

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * Chuỗi số CẢ NĂM của một thẻ, mỗi năm một điểm, cũ → mới.
 *
 * `duration = true` cho dòng chảy (doanh thu, dòng tiền, EPS, số cổ phiếu
 * bình quân): đòi start→end ≈ 1 năm (bẫy 2). `duration = false` cho số dư
 * tại thời điểm (nếu sau này thêm tiền mặt / nợ).
 */
export function annualSeries(
  units: Record<string, RawFact[]> | undefined,
  duration = true
): SecPoint[] {
  if (!units || typeof units !== 'object') return [];
  // Lấy đơn vị đầu tiên có dữ liệu (USD / shares / USD-per-shares) - một thẻ
  // hầu như chỉ có một đơn vị, nhưng đọc theo tên đơn vị cứng thì vỡ ngay
  // khi SEC viết "USD/shares" thay vì "USD-per-shares".
  const list = Object.values(units).find((v) => Array.isArray(v) && v.length) as RawFact[] | undefined;
  if (!list) return [];

  const byEnd = new Map<string, SecPoint>();
  for (const f of list) {
    if (!f || typeof f !== 'object') continue;
    if (!f.end || !f.filed || !f.form) continue;
    if (!ANNUAL_FORMS.has(f.form)) continue;
    if (f.fp !== 'FY') continue;
    const value = num(f.val);
    if (value === null) continue;
    if (duration) {
      if (!f.start) continue;
      const d = days(f.start, f.end);
      if (!(d >= 340 && d <= 380)) continue; // bẫy 2: loại số quý mang fp=FY
    }
    const prev = byEnd.get(f.end);
    if (!prev || f.filed > prev.filed) {
      byEnd.set(f.end, { end: f.end, value, filed: f.filed, form: f.form }); // bẫy 1
    }
  }
  return [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end));
}

/** Thử thang thẻ theo thứ tự, trả về chuỗi đầu tiên có dữ liệu và tên thẻ thắng. */
export function pickSeries(
  taxonomy: Record<string, { units?: Record<string, RawFact[]> }> | undefined,
  tags: readonly string[],
  duration = true
): { series: SecPoint[]; tag: string | null } {
  if (!taxonomy || typeof taxonomy !== 'object') return { series: [], tag: null };
  for (const tag of tags) {
    const s = annualSeries(taxonomy[tag]?.units, duration);
    if (s.length) return { series: s, tag };
  }
  return { series: [], tag: null };
}

/**
 * Tốc độ tăng trưởng kép qua ~k năm, tính từ HAI ĐIỂM THẬT cách nhau đúng
 * khoảng đó - không nội suy, không giả định năm nào cũng có số.
 *
 * Trả null khi: thiếu điểm, hoặc điểm đầu ≤ 0 (CAGR từ số âm/0 không có nghĩa
 * - một công ty đi từ lỗ 1 tỷ lên lãi 1 tỷ không phải "tăng trưởng -200%").
 * `years` là KHOẢNG THẬT giữa hai ngày kết thúc, không phải k, để một công ty
 * thiếu một năm báo cáo không bị tính sai.
 */
export function cagr(series: SecPoint[], k: number): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const targetEnd = Date.parse(last.end) - k * 365.25 * DAY;
  let first: SecPoint | null = null;
  let bestGap = Infinity;
  for (const p of series) {
    const gap = Math.abs(Date.parse(p.end) - targetEnd);
    if (gap < bestGap) {
      bestGap = gap;
      first = p;
    }
  }
  // Điểm đầu phải cách điểm cuối gần đúng k năm (±120 ngày). Nếu chuỗi chỉ
  // có 2 năm mà hỏi CAGR 5 năm thì trả null chứ không lấy đại 2 năm.
  if (!first || first === last || bestGap > 120 * DAY) return null;
  if (first.value <= 0 || last.value <= 0) return null;
  const years = days(first.end, last.end) / 365.25;
  if (years <= 0) return null;
  return (Math.pow(last.value / first.value, 1 / years) - 1) * 100;
}

export type SecFundamentals = {
  entityName: string | null;
  revenue: SecPoint[];
  netIncome: SecPoint[];
  epsDiluted: SecPoint[];
  ocf: SecPoint[];
  capex: SecPoint[];
  shares: SecPoint[];
  /** FCF = OCF − CapEx, ghép theo cùng ngày kết thúc kỳ. */
  fcf: SecPoint[];
  revenueCagr3: number | null;
  revenueCagr5: number | null;
  epsCagr3: number | null;
  epsCagr5: number | null;
  fcfCagr3: number | null;
  /** % thay đổi kép của số cổ phiếu/năm. DƯƠNG = pha loãng, ÂM = mua lại. */
  sharesCagr3: number | null;
  fcfLatest: number | null;
  /** FCF / doanh thu của năm gần nhất, %. */
  fcfMarginLatest: number | null;
  /** Ngày kết thúc năm tài chính gần nhất có doanh thu, và ngày nộp. */
  latestFy: string | null;
  latestFiled: string | null;
  /** Thẻ XBRL thắng cho từng chỉ tiêu - null = không thẻ nào có dữ liệu cả năm. */
  tagsUsed: Record<SecMetric, string | null>;
};

export function secFundamentals(raw: any): SecFundamentals {
  const gaap = raw?.facts?.['us-gaap'];
  const pick = (m: SecMetric) => pickSeries(gaap, TAGS[m]);

  const revenue = pick('revenue');
  const netIncome = pick('netIncome');
  const eps = pick('epsDiluted');
  const ocf = pick('ocf');
  const capex = pick('capex');
  const shares = pick('shares');

  const capexByEnd = new Map(capex.series.map((p) => [p.end, p.value]));
  const fcf: SecPoint[] = ocf.series
    .filter((p) => capexByEnd.has(p.end))
    .map((p) => ({ ...p, value: p.value - (capexByEnd.get(p.end) as number) }));

  const lastRev = revenue.series[revenue.series.length - 1] ?? null;
  const lastFcf = fcf[fcf.length - 1] ?? null;
  const fcfMargin =
    lastFcf && lastRev && lastFcf.end === lastRev.end && lastRev.value > 0
      ? (lastFcf.value / lastRev.value) * 100
      : null;

  return {
    entityName: typeof raw?.entityName === 'string' ? raw.entityName : null,
    revenue: revenue.series,
    netIncome: netIncome.series,
    epsDiluted: eps.series,
    ocf: ocf.series,
    capex: capex.series,
    shares: shares.series,
    fcf,
    revenueCagr3: cagr(revenue.series, 3),
    revenueCagr5: cagr(revenue.series, 5),
    epsCagr3: cagr(eps.series, 3),
    epsCagr5: cagr(eps.series, 5),
    fcfCagr3: cagr(fcf, 3),
    sharesCagr3: cagr(shares.series, 3),
    fcfLatest: lastFcf?.value ?? null,
    fcfMarginLatest: fcfMargin,
    latestFy: lastRev?.end ?? null,
    latestFiled: lastRev?.filed ?? null,
    tagsUsed: {
      revenue: revenue.tag,
      netIncome: netIncome.tag,
      epsDiluted: eps.tag,
      ocf: ocf.tag,
      capex: capex.tag,
      shares: shares.tag,
    },
  };
}

/**
 * Khi không bóc được doanh thu: in HÌNH DẠNG THẬT của payload, không in
 * payload (companyfacts của một công ty lớn là hàng chục MB).
 */
export function secDiagnosis(raw: any): string {
  const top = raw && typeof raw === 'object' ? Object.keys(raw).slice(0, 12) : [typeof raw];
  const taxonomies = raw?.facts && typeof raw.facts === 'object' ? Object.keys(raw.facts) : [];
  const gaap = raw?.facts?.['us-gaap'];
  const gaapCount = gaap && typeof gaap === 'object' ? Object.keys(gaap).length : 0;
  const revenueTagsPresent = gaap
    ? TAGS.revenue.filter((t) => t in gaap)
    : [];
  const sampleTag = revenueTagsPresent[0] ?? (gaap ? Object.keys(gaap)[0] : null);
  const sampleUnits = sampleTag ? Object.keys(gaap[sampleTag]?.units ?? {}) : [];
  const sampleFact = sampleTag
    ? (Object.values(gaap[sampleTag]?.units ?? {})[0] as any[] | undefined)?.[0]
    : null;
  const sampleKeys = sampleFact && typeof sampleFact === 'object' ? Object.keys(sampleFact) : [];
  return [
    `top: ${top.join(',')}`,
    `taxonomies: ${taxonomies.join(',') || 'none'}`,
    `us-gaap tags: ${gaapCount}`,
    `revenue tags present: ${revenueTagsPresent.join(',') || 'none'}`,
    `sample tag: ${sampleTag ?? 'none'} units=${sampleUnits.join('|') || 'none'} factKeys=${sampleKeys.join('|') || 'none'}`,
  ].join(' · ');
}
