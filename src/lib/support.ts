/**
 * Vùng hỗ trợ và trạng thái xu hướng dài hạn, tính từ nến ngày.
 *
 * Module này CỐ Ý thuần logic - không đọc mạng, không đọc đĩa - để chạy được
 * bằng một script Node độc lập. Đây là phần lõi của tab Long-term Investment
 * và cũng là phần dễ sai một cách IM LẶNG nhất: một vùng hỗ trợ bịa ra trông
 * y hệt một vùng hỗ trợ thật, và cả hai đều vẽ được một đường ngang đẹp đẽ
 * lên biểu đồ.
 *
 * Ba quyết định định hình cả file, ghi ra đây vì sau này rất dễ "dọn" nhầm:
 *
 * 1. MỘT ĐÁY KHÔNG PHẢI LÀ HỖ TRỢ. Hỗ trợ là nơi giá đã quay đầu NHIỀU LẦN.
 *    `MIN_TOUCHES = 2` nên một đáy đơn độc không bao giờ được gọi là vùng -
 *    nó vẫn được trả về trong `pivots` để người đọc tự thấy, nhưng không
 *    được cấp danh hiệu. Đáy 52 tuần là mức riêng, không phải vùng.
 *
 * 2. `k` NẾN CUỐI KHÔNG BAO GIỜ THÀNH ĐÁY XOAY. Muốn biết một đáy là đáy thì
 *    phải có nến SAU nó xác nhận. Nên đáy của tuần này chưa được tính - đó là
 *    giới hạn thật của phép đo, không phải thiếu sót. Gọi nó là hỗ trợ ngay
 *    hôm nay là tự vẽ ra một mức chưa ai bảo vệ.
 *
 * 3. "ĐANG TỚI HỖ TRỢ" VÀ "ĐÃ THỦNG HỖ TRỢ" LÀ HAI TRẠNG THÁI KHÁC HẲN NHAU,
 *    và cách xử khác hẳn nhau (một cái là cơ hội mua, một cái là tín hiệu
 *    thoát). Trên biểu đồ chúng trông giống nhau: giá nằm cạnh một đường kẻ.
 *    `nearest` và `broken` là hai trường RIÊNG, không bao giờ gộp.
 */

export type Candle = {
  /** epoch ms */
  t: number;
  high: number;
  low: number;
  close: number;
};

export type SupportZone = {
  /** Tâm vùng: trung bình các đáy xoay tạo nên nó. */
  price: number;
  /** Biên dưới / biên trên của vùng, lấy từ chính các đáy đã gom. */
  low: number;
  high: number;
  /** Số đáy xoay đã gom vào vùng. Càng nhiều, vùng càng đáng tin. */
  touches: number;
  /** Ngày chạm đầu tiên và gần nhất (YYYY-MM-DD). */
  firstTouch: string;
  lastTouch: string;
};

export type Pivot = { t: number; low: number };

/* Một đáy xoay phải thấp hơn (hoặc bằng) mọi nến trong K nến hai bên. K = 5
   là khoảng một tuần giao dịch mỗi bên - đủ để loại nhiễu hằng ngày mà vẫn
   giữ được các đáy thật của một nhịp điều chỉnh. */
const K = 5;

/* Hai đáy cách nhau dưới 2.5% thì coi là cùng một vùng. Thị trường không
   quay đầu ở đúng một con số; nó quay đầu ở một KHOẢNG. Để 0% thì gần như
   không bao giờ có vùng nào đủ 2 lần chạm. */
const CLUSTER_TOL_PCT = 2.5;

/* Dưới 2 lần chạm thì không gọi là vùng - xem chú thích (1) ở đầu file. */
const MIN_TOUCHES = 2;

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Trung bình cộng n phần tử CUỐI. Trả null khi không đủ dữ liệu, không bao
 *  giờ trả một con số tính trên ít nến hơn yêu cầu. */
export function sma(values: number[], n: number): number | null {
  if (n <= 0 || values.length < n) return null;
  const slice = values.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

/**
 * Các đáy xoay đã được nến hai bên xác nhận.
 *
 * K nến cuối bị bỏ qua một cách CÓ CHỦ Ý (chú thích 2 ở đầu file).
 *
 * HAI VẾ SO SÁNH CỐ Ý KHÔNG ĐỐI XỨNG, và đây là chỗ sửa một lỗi thật:
 * bên trái đòi CAO HƠN HẲN, bên phải chỉ đòi KHÔNG THẤP HƠN. Dùng cùng một
 * phép so sánh lỏng cho cả hai bên thì một đoạn giá NẰM NGANG (nhiều nến có
 * low bằng nhau) biến MỌI nến trong đoạn thành đáy xoay - một mảng 21 nến
 * phẳng sinh ra 8 "đáy". Chúng gom lại thành một vùng ghi "đã chạm 8 lần",
 * trong khi thực tế giá chỉ đi ngang đúng một lần và chưa hề bảo vệ mức đó
 * lần nào. Mà `touches` chính là con số cả tab dựa vào để nói một vùng có
 * đáng tin hay không, nên thổi phồng nó là hỏng đúng chỗ quan trọng nhất.
 * Cách bất đối xứng này giữ lại ĐÚNG MỘT đáy cho mỗi đoạn bằng nhau - nến
 * đầu tiên của đoạn - và vẫn nhận ra đáy đôi thật (hai đáy cách nhau xa hơn
 * K nến vẫn được đếm riêng, rồi `supportZones` mới gom chúng theo giá).
 */
export function pivotLows(candles: Candle[], k = K): Pivot[] {
  const out: Pivot[] = [];
  for (let i = k; i < candles.length - k; i++) {
    const low = candles[i].low;
    let isPivot = true;
    for (let j = i - k; j < i; j++) {
      if (candles[j].low <= low) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) {
      for (let j = i + 1; j <= i + k; j++) {
        if (candles[j].low < low) {
          isPivot = false;
          break;
        }
      }
    }
    if (isPivot) out.push({ t: candles[i].t, low });
  }
  return out;
}

/**
 * Gom các đáy xoay thành vùng hỗ trợ.
 *
 * Gom theo giá (đã sắp xếp) chứ không theo thời gian: hai đáy cách nhau ba
 * năm nhưng cùng một mức giá VẪN là cùng một vùng - đó chính là điều làm nên
 * một mức hỗ trợ dài hạn, và gom theo thời gian sẽ đánh rơi đúng trường hợp
 * đáng giá nhất.
 */
export function supportZones(
  pivots: Pivot[],
  tolPct = CLUSTER_TOL_PCT,
  minTouches = MIN_TOUCHES
): SupportZone[] {
  if (!pivots.length) return [];
  const sorted = [...pivots].sort((a, b) => a.low - b.low);

  const groups: Pivot[][] = [];
  let current: Pivot[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const base = current[0].low;
    // So với đáy THẤP NHẤT của nhóm, không phải với phần tử liền trước:
    // so với phần tử liền trước thì một chuỗi đáy cách đều nhau 2% sẽ trôi
    // thành một "vùng" trải dài vô hạn.
    if (base > 0 && ((sorted[i].low - base) / base) * 100 <= tolPct) {
      current.push(sorted[i]);
    } else {
      groups.push(current);
      current = [sorted[i]];
    }
  }
  groups.push(current);

  return groups
    .filter((g) => g.length >= minTouches)
    .map((g) => {
      const lows = g.map((p) => p.low);
      const times = g.map((p) => p.t).sort((a, b) => a - b);
      return {
        price: lows.reduce((a, b) => a + b, 0) / lows.length,
        low: Math.min(...lows),
        high: Math.max(...lows),
        touches: g.length,
        firstTouch: iso(times[0]),
        lastTouch: iso(times[times.length - 1]),
      };
    })
    .sort((a, b) => b.price - a.price);
}

export type SupportRead = {
  zones: SupportZone[];
  /** Vùng gần nhất mà giá đang ở TRÊN (tâm vùng <= giá). */
  nearest: SupportZone | null;
  /** Giá đang cao hơn tâm vùng gần nhất bao nhiêu %. 0 = đang ở ngay hỗ trợ. */
  distancePct: number | null;
  /** Vùng mà giá đã rơi xuống DƯỚI biên dưới - đã thủng, không phải đang tới. */
  broken: SupportZone | null;
};

/**
 * Đọc vị trí của giá so với các vùng.
 *
 * `nearest` chỉ nhận vùng NẰM DƯỚI giá. Một vùng nằm trên giá không phải là
 * hỗ trợ nữa - nó là kháng cự, và trả nó về dưới tên "hỗ trợ gần nhất" là
 * nói ngược hẳn ý nghĩa.
 */
export function readSupport(price: number, zones: SupportZone[]): SupportRead {
  const below = zones.filter((z) => z.price <= price);
  const nearest = below.length ? below[0] : null; // zones đã sắp giảm dần
  const distancePct =
    nearest && nearest.price > 0
      ? ((price - nearest.price) / nearest.price) * 100
      : null;

  // Vùng bị thủng: giá nằm dưới biên dưới của nó. Lấy vùng THẤP NHẤT trong
  // số đó, tức là mức vừa mới mất - các vùng cao hơn đã mất từ lâu và không
  // nói được gì về hôm nay.
  const brokenList = zones.filter((z) => price < z.low);
  const broken = brokenList.length ? brokenList[brokenList.length - 1] : null;

  return { zones, nearest, distancePct, broken };
}

export type TrendRead = {
  sma50: number | null;
  sma200: number | null;
  /** % thay đổi của SMA200 so với chính nó ~21 phiên trước. Dương = dốc lên. */
  sma200SlopePct: number | null;
  /** null khi thiếu SMA200 - KHÔNG phải false. */
  aboveSma200: boolean | null;
  high52w: number | null;
  low52w: number | null;
  /** Giá đã rớt bao nhiêu % từ đỉnh 52 tuần (số dương = đã rớt). */
  offHighPct: number | null;
  /** Giá còn cao hơn đáy 52 tuần bao nhiêu %. */
  aboveLowPct: number | null;
};

/* Độ dốc đo trên ~1 tháng giao dịch. Ngắn hơn thì nhiễu, dài hơn thì phản
   ứng quá chậm với một xu hướng vừa đảo chiều. */
const SLOPE_LOOKBACK = 21;
const YEAR_SESSIONS = 252;

export function readTrend(candles: Candle[], price: number): TrendRead {
  const closes = candles.map((c) => c.close);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);

  // SMA200 của 21 phiên trước = SMA200 tính trên chuỗi đã cắt bỏ 21 nến cuối.
  const sma200Prev =
    closes.length >= 200 + SLOPE_LOOKBACK
      ? sma(closes.slice(0, closes.length - SLOPE_LOOKBACK), 200)
      : null;
  const sma200SlopePct =
    sma200 !== null && sma200Prev !== null && sma200Prev > 0
      ? ((sma200 - sma200Prev) / sma200Prev) * 100
      : null;

  const window = candles.slice(-YEAR_SESSIONS);
  const high52w = window.length ? Math.max(...window.map((c) => c.high)) : null;
  const low52w = window.length ? Math.min(...window.map((c) => c.low)) : null;

  return {
    sma50,
    sma200,
    sma200SlopePct,
    aboveSma200: sma200 === null ? null : price > sma200,
    high52w,
    low52w,
    offHighPct: high52w && high52w > 0 ? ((high52w - price) / high52w) * 100 : null,
    aboveLowPct: low52w && low52w > 0 ? ((price - low52w) / low52w) * 100 : null,
  };
}
