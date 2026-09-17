/**
 * Đọc XBRL `companyfacts` của SEC thành chuỗi số theo NĂM TÀI CHÍNH, rồi tính
 * những thứ Finviz (ảnh chụp ttm) không trả lời được: doanh thu / EPS / FCF
 * có tăng đều 3-5 năm không, và số cổ phiếu có đang phình ra không.
 *
 * Module này CỐ Ý thuần logic - không mạng, không đĩa - để test bằng script
 * Node độc lập với một fixture dựng đúng hình dạng thật.
 *
 * HÌNH DẠNG ĐÃ ĐO Ở PRODUCTION (2026-09-17, AAPL qua /api/secprobe) - khớp
 * cấu trúc dưới, và một fact thật mang đúng các khoá
 * `start|end|val|accn|fy|fp|form|filed|frame` (`fy` là SỐ, `frame` kiểu
 * "CY2018" cho cả năm và "CY2018Q3" cho quý). Hai lỗi thật lộ ra ở lần đo
 * đó được ghi tại `pickSeries()` và `splitBreaks()`:
 *
 *   { cik, entityName, facts: { "us-gaap": { Revenues: { units: { USD: [
 *       { start, end, val, accn, fy, fp, form, filed, frame? } ] } } },
 *     dei: { EntityCommonStockSharesOutstanding: { units: { shares: [...] } } } } }
 *
 * Mọi chỗ đọc vẫn dung thứ, và `secDiagnosis()` in ra KHOÁ THẬT khi không
 * bóc được gì - công ty IFRS hay một thẻ lạ sẽ tự nói ra thay vì hiện bốn
 * dấu gạch ngang. `/api/secprobe` giữ lại để đo mã khác.
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
 *    một năm. Bỏ điều kiện này là cộng nhầm một quý thành một năm. ĐÃ XÁC
 *    NHẬN THẬT: AAPL 10-K FY2018 có fact `start 2018-07-01, end 2018-09-29,
 *    fp FY, frame CY2018Q3` nằm cạnh fact cả năm `frame CY2018`.
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

/**
 * Thử cả thang thẻ, trả về chuỗi có ngày kết thúc MỚI NHẤT (hoà thì dài hơn).
 *
 * ĐO ĐƯỢC Ở PRODUCTION (2026-09-17, AAPL), và đây là lỗi thật của bản đầu:
 * bản đầu lấy thẻ ĐẦU TIÊN có dữ liệu. Với Apple, `Revenues` có dữ liệu -
 * nhưng chỉ tới FY2018, vì khi ASC 606 có hiệu lực Apple chuyển sang
 * `RevenueFromContractWithCustomerExcludingAssessedTax` và thẻ cũ ngừng
 * được cập nhật. Kết quả: năm tài chính "gần nhất" là 2018, CAGR 3 năm
 * null, biên FCF null - trong khi thẻ mới nằm ngay bên cạnh với đủ 2018-2025.
 * Thứ tự trong thang giờ chỉ còn là thứ tự phá hoà; thứ quyết định là
 * dữ liệu nào MỚI.
 *
 * Cố ý KHÔNG ghép hai thẻ thành một chuỗi dài: `Revenues` và
 * `RevenuesNetOfInterestExpense` là hai định nghĩa khác nhau ở ngân hàng,
 * nối chúng lại là vẽ một đường tăng trưởng qua một chỗ đổi định nghĩa.
 */
export function pickSeries(
  taxonomy: Record<string, { units?: Record<string, RawFact[]> }> | undefined,
  tags: readonly string[],
  duration = true
): { series: SecPoint[]; tag: string | null } {
  if (!taxonomy || typeof taxonomy !== 'object') return { series: [], tag: null };
  let best: { series: SecPoint[]; tag: string | null } = { series: [], tag: null };
  for (const tag of tags) {
    const s = annualSeries(taxonomy[tag]?.units, duration);
    if (!s.length) continue;
    const bestEnd = best.series.length ? best.series[best.series.length - 1].end : '';
    const thisEnd = s[s.length - 1].end;
    if (thisEnd > bestEnd || (thisEnd === bestEnd && s.length > best.series.length)) {
      best = { series: s, tag };
    }
  }
  return best;
}

/**
 * Ngày kết thúc kỳ mà số cổ phiếu NHẢY so với năm liền trước - dấu hiệu
 * chia tách (hoặc gộp) cổ phiếu.
 *
 * ĐO ĐƯỢC Ở PRODUCTION (AAPL): số cổ phiếu 2017 = 5.25 tỷ, 2018 = 20.0 tỷ.
 * Không phải Apple phát hành gấp bốn: năm 2018 được 10-K FY2020 (nộp SAU
 * split 4:1 tháng 8/2020) báo cáo lại đã điều chỉnh, còn 2017 thì bản cuối
 * cùng nhắc tới nó là 10-K FY2019, TRƯỚC split. Mỗi 10-K chỉ mang ba năm so
 * sánh, nên điều chỉnh split chỉ với ngược được ba năm - xa hơn là số cũ
 * chưa điều chỉnh. Cùng vết gãy ở 2011→2012 (split 7:1 năm 2014).
 *
 * Hệ quả nếu không chặn: một công ty split 2 năm trước sẽ có CAGR 3 năm
 * "pha loãng +300%" và bị cổng LOẠI OAN, còn EPS đọc thành rớt 75%. Nên
 * mọi CAGR của chỉ tiêu TÍNH TRÊN MỖI CỔ PHIẾU (số cổ phiếu, EPS) bị vô
 * hiệu khi khoảng tính có vết gãy - và màn hình nói vì sao. Doanh thu và
 * FCF là tổng, không bị ảnh hưởng.
 *
 * Ngưỡng ×1.8 / ÷1.8: phát hành thêm 80% cổ phiếu trong MỘT năm gần như
 * không xảy ra ngoài chia tách; ngưỡng thấp hơn sẽ bắt nhầm một đợt phát
 * hành lớn thật (mà đó chính là pha loãng cần bắt).
 */
export function splitBreaks(shares: SecPoint[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < shares.length; i++) {
    const a = shares[i - 1].value;
    const b = shares[i].value;
    if (a > 0 && b > 0 && (b / a >= 1.8 || a / b >= 1.8)) out.push(shares[i].end);
  }
  return out;
}

/** `cagr()` nhưng trả null nếu khoảng (first, last] chứa một vết gãy split. */
export function cagrAcrossBreaks(series: SecPoint[], k: number, breaks: string[]): number | null {
  const v = cagr(series, k);
  if (v === null || !breaks.length) return v;
  const last = series[series.length - 1];
  // Tìm lại điểm đầu đúng như cagr() đã chọn.
  const targetEnd = Date.parse(last.end) - k * 365.25 * DAY;
  let first = series[0];
  let bestGap = Infinity;
  for (const p of series) {
    const gap = Math.abs(Date.parse(p.end) - targetEnd);
    if (gap < bestGap) { bestGap = gap; first = p; }
  }
  return breaks.some((b) => b > first.end && b <= last.end) ? null : v;
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
  /** Năm số cổ phiếu nhảy ≥1.8× so với năm trước - chia tách chưa điều chỉnh
   *  đồng nhất. CAGR của EPS và số cổ phiếu bị vô hiệu khi vắt qua đây. */
  splitBreaks: string[];
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

  const breaks = splitBreaks(shares.series);

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
    epsCagr3: cagrAcrossBreaks(eps.series, 3, breaks),
    epsCagr5: cagrAcrossBreaks(eps.series, 5, breaks),
    fcfCagr3: cagr(fcf, 3),
    sharesCagr3: cagrAcrossBreaks(shares.series, 3, breaks),
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
    splitBreaks: breaks,
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
