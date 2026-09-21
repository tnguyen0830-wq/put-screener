/**
 * Phần THUẦN của tab Daytrade — KHÔNG import gì, để biên dịch một file rồi
 * `require()` thẳng mà test (đúng lý do `internals-pure.ts` đã ghi: kéo theo
 * `./alerts` là kéo theo `./portfolio` và cả chùm alias `@/lib/...`).
 *
 * Bốn thứ chủ app đặt hàng, và cả bốn đều rút ra từ ĐÚNG MỘT request nến
 * trong ngày cho mỗi mã:
 *
 *   1. VWAP + độ lệch khỏi VWAP
 *   2. Mốc phiên trước (đỉnh/đáy/đóng cửa hôm qua) + khoảng gap
 *   3. Khoảng mở cửa 15/30 phút + cú phá vỡ
 *   4. Khối lượng tương đối so với cùng giờ những ngày trước
 *
 * Gộp cả bốn vào một request là quyết định thiết kế chính: Schwab
 * `/pricehistory?periodType=day&period=10&frequencyType=minute&frequency=5`
 * trả về CẢ phiên hôm nay LẪN mười phiên trước, nên mốc hôm qua và nền khối
 * lượng không tốn thêm lượt gọi nào. 10 mã = 10 request/phút, thoải mái dưới
 * trần 100/phút mà `RateLimiter` của `schwab.ts` giữ.
 */

/* ------------------------------------------------------------------ *
 * Kiểu dữ liệu
 * ------------------------------------------------------------------ */

export type IntraBar = {
  /** epoch ms, đúng như Schwab trả. */
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** `null` = Schwab KHÔNG trả khối lượng. Không bao giờ là 0 — số 0 đọc
   *  thành "không ai giao dịch phút đó", còn null đọc thành "không biết",
   *  và hai thứ đó dẫn tới hai kết luận ngược nhau về VWAP lẫn KL tương đối. */
  volume: number | null;
};

export type Session = {
  /** Ngày theo giờ New York, `YYYY-MM-DD`. */
  date: string;
  bars: IntraBar[];
};

export type PriorSession = {
  date: string;
  high: number;
  low: number;
  close: number;
};

export type OpeningRange = {
  /** 15 hoặc 30 — số phút của khoảng mở cửa. */
  minutes: number;
  high: number;
  low: number;
  /** Số nến đã dùng để dựng khoảng. */
  bars: number;
  /** `null` = chưa phá ra khỏi khoảng (hoặc chưa có nến nào sau khoảng). */
  broke: 'up' | 'down' | null;
  /** epoch ms của nến XÁC NHẬN cú phá, không phải nến chạm. */
  brokeAt: number | null;
};

export type RelVolume = {
  /** Khối lượng cộng dồn của hôm nay tới nến hiện tại. */
  today: number | null;
  /** Trung vị khối lượng cộng dồn TỚI CÙNG VỊ TRÍ NẾN của các phiên trước. */
  baseline: number | null;
  /** today / baseline. `null` khi chưa đủ phiên nền hoặc thiếu khối lượng. */
  ratio: number | null;
  /** Số phiên trước thực sự góp vào nền — in ra màn hình để "chưa đủ dữ
   *  liệu" không trông giống "khối lượng bình thường". */
  sessions: number;
};

export type DaytradeRow = {
  symbol: string;
  /** Giá đóng của nến gần nhất hôm nay. */
  last: number | null;
  vwap: number | null;
  /** (last − vwap) / vwap × 100. */
  vwapDiffPct: number | null;
  prior: PriorSession | null;
  /** (mở cửa hôm nay − đóng cửa hôm qua) / đóng cửa hôm qua × 100. */
  gapPct: number | null;
  openRange: OpeningRange | null;
  relVol: RelVolume;
  /** Nến của RIÊNG phiên hôm nay, để vẽ. */
  bars: IntraBar[];
  /** Ngày của phiên đang hiển thị (có thể là phiên gần nhất nếu sàn đóng). */
  sessionDate: string | null;
  /** Lý do THẬT khi một phép tính không ra số. Màn hình in nguyên văn —
   *  một ô trống không nói được vì sao nó trống. */
  notes: string[];
};

/* ------------------------------------------------------------------ *
 * Giờ New York
 * ------------------------------------------------------------------ */

/**
 * Ngày giao dịch theo giờ New York. CỐ Ý chép lại phép tính của
 * `tradingDay()` trong `alerts.ts` thay vì import: `alerts.ts` kéo theo
 * `portfolio.ts` và cả chùm alias, phá vỡ cách test một-file mà repo này
 * dùng (`internals-pure.ts` ghi đúng lý do đó ở đầu file). Đây là bốn dòng
 * `Intl` không có trạng thái, không có ngưỡng nào để trôi lệch — khác hẳn
 * một bảng ngưỡng hay một phép chấm điểm, nơi bản chép thứ hai là bản sẽ
 * nói khác bản gốc.
 */
export function nyDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

/** Số phút kể từ nửa đêm New York. Dùng để cắt phiên chính thức. */
export function nyMinutes(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get('hour') % 24) * 60 + get('minute');
}

/* ------------------------------------------------------------------ *
 * Đọc nến Schwab một cách dung thứ
 * ------------------------------------------------------------------ */

/** `Number.isFinite('100')` là FALSE — nên một ngày Schwab đổi kiểu trường
 *  sang chuỗi là cả bảng câm lặng. Cùng bẫy `num()` trong `gex.ts` đã bị
 *  bỏng một lần (#97). */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null; // Number('') === 0 — chuỗi rỗng KHÔNG phải số 0
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseCandles(payload: any): IntraBar[] {
  const out: IntraBar[] = [];
  for (const c of payload?.candles ?? []) {
    const t = num(c?.datetime);
    const open = num(c?.open);
    const high = num(c?.high);
    const low = num(c?.low);
    const close = num(c?.close);
    // Thiếu bất kỳ giá nào thì BỎ nến: một nến có close mà không có high là
    // thứ mọi phép tính dưới đây đọc sai chứ không phải đọc thiếu.
    if (t === null || open === null || high === null || low === null || close === null) continue;
    out.push({ t, open, high, low, close, volume: num(c?.volume) });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/* ------------------------------------------------------------------ *
 * Cắt phiên
 * ------------------------------------------------------------------ */

const SESSION_OPEN_MIN = 9 * 60 + 30; // 09:30 New York
const SESSION_CLOSE_MIN = 16 * 60; // 16:00 New York

/**
 * Gom nến thành từng phiên theo ngày New York, và CHỈ giữ nến trong phiên
 * chính thức 09:30–16:00.
 *
 * Vì sao phải cắt dù request đã đặt `needExtendedHoursData=false`: tham số
 * đó là lời hứa của Schwab, không phải phép đo của ta, và một nến tiền
 * phiên lọt vào sẽ làm hỏng CẢ BA thứ cùng lúc — VWAP lệch (VWAP theo quy
 * ước bắt đầu lại lúc mở cửa), khoảng mở cửa lấy nhầm nến, và khối lượng
 * tương đối so lệch vị trí nến. Cắt ở đây là rẻ và không đảo ngược được
 * điều gì nếu Schwab vốn đã đúng.
 */
export function groupSessions(bars: IntraBar[]): Session[] {
  const byDate = new Map<string, IntraBar[]>();
  for (const b of bars) {
    const m = nyMinutes(b.t);
    if (m < SESSION_OPEN_MIN || m >= SESSION_CLOSE_MIN) continue;
    const d = nyDate(b.t);
    const arr = byDate.get(d);
    if (arr) arr.push(b);
    else byDate.set(d, [b]);
  }
  return [...byDate.entries()]
    .map(([date, bs]) => ({ date, bars: bs }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* ------------------------------------------------------------------ *
 * 1. VWAP
 * ------------------------------------------------------------------ */

/**
 * VWAP cộng dồn trong phiên, giá điển hình = (H+L+C)/3.
 *
 * NÓI THẲNG GIỚI HẠN, và màn hình lặp lại câu này: VWAP thật tính trên
 * TỪNG GIAO DỊCH. Đây tính trên nến 5 phút, nên là XẤP XỈ — sát trong phiên
 * thanh khoản tốt, lệch khi giá chạy mạnh trong một nến. Schwab
 * `/pricehistory` không cho dữ liệu từng giao dịch (đúng câu `learn/flow.ts`
 * đã ghi khi giải thích vì sao app không có footprint), nên xấp xỉ này là
 * thứ tốt nhất lấy được từ nguồn hiện có.
 *
 * Một nến thiếu khối lượng làm HỎNG phép cộng dồn từ điểm đó trở đi (không
 * biết trọng số), nên trả `null` cho mọi điểm sau đó thay vì lặng lẽ coi
 * như khối lượng 0 — coi là 0 sẽ ra một đường VWAP trông hoàn toàn bình
 * thường mà sai.
 */
export function vwapSeries(bars: IntraBar[]): (number | null)[] {
  const out: (number | null)[] = [];
  let pv = 0;
  let vol = 0;
  let broken = false;
  for (const b of bars) {
    if (b.volume === null) broken = true;
    if (broken) {
      out.push(null);
      continue;
    }
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical * b.volume!;
    vol += b.volume!;
    out.push(vol > 0 ? pv / vol : null);
  }
  return out;
}

export function lastVwap(bars: IntraBar[]): number | null {
  const s = vwapSeries(bars);
  for (let i = s.length - 1; i >= 0; i--) if (s[i] !== null) return s[i];
  return null;
}

/* ------------------------------------------------------------------ *
 * 2. Mốc phiên trước + gap
 * ------------------------------------------------------------------ */

export function priorLevels(session: Session): PriorSession {
  let high = -Infinity;
  let low = Infinity;
  for (const b of session.bars) {
    if (b.high > high) high = b.high;
    if (b.low < low) low = b.low;
  }
  return {
    date: session.date,
    high,
    low,
    close: session.bars[session.bars.length - 1].close,
  };
}

export function gapPct(todayOpen: number, priorClose: number): number | null {
  if (!(priorClose > 0)) return null;
  return ((todayOpen - priorClose) / priorClose) * 100;
}

/* ------------------------------------------------------------------ *
 * 3. Khoảng mở cửa + cú phá vỡ
 * ------------------------------------------------------------------ */

/**
 * Khoảng mở cửa = đỉnh/đáy của `minutes` phút đầu phiên.
 *
 * HAI luật, cả hai đều là "thà không nói còn hơn nói sai":
 *
 * - **Chưa đủ nến thì trả `null`**, không dựng khoảng từ một phần. Lúc
 *   9:40 mà in "khoảng mở cửa 30 phút" từ hai nến là in một con số sẽ ĐỔI
 *   trong hai mươi phút nữa, trong khi nó trông y hệt con số cuối cùng.
 * - **Phá vỡ tính trên giá ĐÓNG của nến, không phải râu nến.** Một cái râu
 *   xuyên qua rồi rút về không phải cú phá — đúng quy ước `confirmed` mà
 *   `patterns.ts` đã đặt cho cả app, nên hai tab không nói hai điều khác
 *   nhau về cùng chữ "phá vỡ".
 */
export function openingRange(
  bars: IntraBar[],
  minutes: number,
  barMinutes: number
): OpeningRange | null {
  const need = Math.round(minutes / barMinutes);
  if (need < 1 || bars.length < need) return null;
  let high = -Infinity;
  let low = Infinity;
  for (let i = 0; i < need; i++) {
    if (bars[i].high > high) high = bars[i].high;
    if (bars[i].low < low) low = bars[i].low;
  }
  let broke: 'up' | 'down' | null = null;
  let brokeAt: number | null = null;
  for (let i = need; i < bars.length; i++) {
    if (bars[i].close > high) {
      broke = 'up';
      brokeAt = bars[i].t;
      break;
    }
    if (bars[i].close < low) {
      broke = 'down';
      brokeAt = bars[i].t;
      break;
    }
  }
  return { minutes, high, low, bars: need, broke, brokeAt };
}

/* ------------------------------------------------------------------ *
 * 4. Khối lượng tương đối
 * ------------------------------------------------------------------ */

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Ít hơn ngần này phiên nền thì KHÔNG ra tỉ lệ. Hai phiên là một trung vị
 *  vô nghĩa; một ngày lễ hay một phiên nửa buổi sẽ tự mình quyết định con
 *  số. Cùng lý lẽ `MIN_TOUCHES` của `support.ts` và ngưỡng warm-up của IV
 *  rank: một phép thống kê trên vài mẫu là một con số sai trông như đúng. */
export const RELVOL_MIN_SESSIONS = 3;

/**
 * So khối lượng cộng dồn của hôm nay với TRUNG VỊ khối lượng cộng dồn của
 * các phiên trước TỚI CÙNG VỊ TRÍ NẾN.
 *
 * Ba quyết định:
 *
 * - **Cộng dồn tới cùng vị trí nến**, không so tổng cả ngày: lúc 10 giờ
 *   sáng mà so với tổng cả phiên hôm qua thì mã nào cũng đọc ra "khối lượng
 *   thấp", tức con số vô dụng đúng lúc cần nó nhất.
 * - **Trung vị, không trung bình**: một ngày earnings trong mười phiên sẽ
 *   kéo lệch trung bình chứ không kéo lệch trung vị — cùng lý do
 *   `medianLag()` của tab Quốc hội dùng trung vị.
 * - **Phiên nền thiếu khối lượng thì BỊ LOẠI khỏi nền**, không tính là 0.
 */
export function relativeVolume(today: IntraBar[], prior: Session[]): RelVolume {
  const idx = today.length - 1;
  if (idx < 0) return { today: null, baseline: null, ratio: null, sessions: 0 };

  let sum = 0;
  let ok = true;
  for (const b of today) {
    if (b.volume === null) {
      ok = false;
      break;
    }
    sum += b.volume;
  }
  const todayVol = ok ? sum : null;

  const baselines: number[] = [];
  for (const s of prior) {
    if (s.bars.length <= idx) continue; // phiên ngắn hơn: không so được cùng vị trí
    let acc = 0;
    let good = true;
    for (let i = 0; i <= idx; i++) {
      const v = s.bars[i].volume;
      if (v === null) {
        good = false;
        break;
      }
      acc += v;
    }
    if (good) baselines.push(acc);
  }

  const baseline = baselines.length >= RELVOL_MIN_SESSIONS ? median(baselines) : null;
  const ratio =
    todayVol !== null && baseline !== null && baseline > 0 ? todayVol / baseline : null;
  return { today: todayVol, baseline, ratio, sessions: baselines.length };
}

/* ------------------------------------------------------------------ *
 * Ghép thành một dòng
 * ------------------------------------------------------------------ */

export type BuildOpts = {
  /** Số phút mỗi nến — phải khớp `frequency` đã gửi cho Schwab. */
  barMinutes: number;
  /** 15 hoặc 30. */
  openRangeMinutes: number;
};

export function buildRow(symbol: string, payload: any, opts: BuildOpts): DaytradeRow {
  const notes: string[] = [];
  const bars = parseCandles(payload);
  const sessions = groupSessions(bars);

  const empty: DaytradeRow = {
    symbol,
    last: null,
    vwap: null,
    vwapDiffPct: null,
    prior: null,
    gapPct: null,
    openRange: null,
    relVol: { today: null, baseline: null, ratio: null, sessions: 0 },
    bars: [],
    sessionDate: null,
    notes,
  };

  if (!sessions.length) {
    // PHÂN BIỆT hai chuyện khác hẳn nhau: Schwab không trả nến nào, và
    // Schwab trả nến nhưng không nến nào rơi vào phiên chính thức (mã chỉ
    // số lạ, hay mã mới niêm yết). Hai thứ này sửa theo hai cách khác nhau.
    notes.push(bars.length ? 'NO_REGULAR_SESSION_BARS' : 'NO_CANDLES');
    return empty;
  }

  const cur = sessions[sessions.length - 1];
  const prior = sessions.length >= 2 ? priorLevels(sessions[sessions.length - 2]) : null;
  if (!prior) notes.push('NO_PRIOR_SESSION');

  const vwap = lastVwap(cur.bars);
  if (vwap === null) notes.push('NO_VOLUME_FOR_VWAP');

  const last = cur.bars[cur.bars.length - 1].close;
  const or = openingRange(cur.bars, opts.openRangeMinutes, opts.barMinutes);
  if (!or) notes.push('OPEN_RANGE_INCOMPLETE');

  const relVol = relativeVolume(cur.bars, sessions.slice(0, -1));
  if (relVol.ratio === null) {
    notes.push(relVol.today === null ? 'NO_VOLUME_FOR_RELVOL' : 'RELVOL_WARMING_UP');
  }

  return {
    symbol,
    last,
    vwap,
    vwapDiffPct: vwap !== null && vwap > 0 ? ((last - vwap) / vwap) * 100 : null,
    prior,
    gapPct: prior ? gapPct(cur.bars[0].open, prior.close) : null,
    openRange: or,
    relVol,
    bars: cur.bars,
    sessionDate: cur.date,
    notes,
  };
}
