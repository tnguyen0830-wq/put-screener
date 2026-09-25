/**
 * Dữ liệu Unusual Whales cho MỘT mã ở tab Analyze — phần tóm tắt thuần.
 *
 * Chủ app hỏi: *"Có thể lấy thông tin bên UW data được không?"* — tức cho
 * phần Claude phân tích (cả "Đọc chỉ số" lẫn "Kịch bản giá") đọc thêm luồng
 * quyền chọn, dark pool và giao dịch của nghị sĩ.
 *
 * Tải dữ liệu nằm ở `uwcontext.ts` (Node, gọi UW). File này KHÔNG import
 * runtime nào (chỉ `import type`), để màn hình và route tóm tắt bằng CÙNG
 * một hàm — cùng lý do `outlook.ts` thuần.
 *
 * Ba điều dữ liệu này KHÔNG nói, và mọi chỗ in nó ra phải nói theo:
 *  - Phía ASK/BID của một alert quyền chọn nói lệnh khớp gần giá chào bán
 *    hay chào mua, KHÔNG nói ai lạc quan: một call khớp ở ask có thể là
 *    người ta đóng vị thế bán call (chú giải tab Live Flow nói y như vậy).
 *  - Phía mua/bán của dark pool là ƯỚC LƯỢNG từ giá khớp so với NBBO
 *    (`estimateSide`), không phải nhãn thật — UW không có nhãn đó.
 *  - Giao dịch nghị sĩ được công bố trễ (trung vị đo được ~116 ngày ở
 *    Thượng viện), nên đó là chuyện tháng trước, không phải hôm nay.
 */

import type { LiveRow } from './liveflow';
import type { DarkpoolPrint } from './darkpool';
import type { SymbolCongressTrades } from './congress';

/** Luồng quyền chọn: chỉ đọc alert trong 7 ngày gần nhất — alert tuần
 *  trước không nói gì về vị thế đang mở tuần này. */
export const FLOW_DAYS = 7;
/** Một strike phải chiếm ≥ 60% premium của một phía mới gọi là "call" hay
 *  "put"; dưới đó là `mixed`. Cùng ngưỡng `SIDE_SHARE` của Live Flow. */
const SHARE = 0.6;
/** Gom giá dark pool trong vòng 0,5% thành một mức — thị trường không
 *  khớp khối lớn ở đúng một con số. So với giá THẤP NHẤT của nhóm, không
 *  với phần tử liền trước (bài học `supportZones`: so liền trước thì một
 *  chuỗi giá cách đều trôi thành một vùng vô hạn). */
const DP_CLUSTER_PCT = 0.5;
const TOP = 3;

export type UwHalf<T> = { data: T; error: string | null };

/** Đúng hình dạng `/api/analyze/uw` trả về. */
export type UwContext = {
  configured: boolean;
  symbol: string;
  fetchedAt: string;
  flow: UwHalf<LiveRow[]> & {
    unparsed: number;
    sampleKeys: string[];
    /** Số trang đã hỏi, và true khi dừng ở trần trang mà CHƯA phủ đủ
     *  FLOW_DAYS ngày — ngày cũ nhất có thể thiếu, nói ra thay vì im. */
    pages?: number;
    capped?: boolean;
  };
  darkpool: UwHalf<DarkpoolPrint[]>;
  congress: UwHalf<SymbolCongressTrades | null>;
};

export type FlowStrike = {
  strike: number;
  premium: number;
  callPremium: number;
  putPremium: number;
  lean: 'call' | 'put' | 'mixed';
  alerts: number;
};

/** Premium một ngày New York. */
export type FlowDay = { day: string; call: number; put: number; alerts: number };
/** Nhóm kỳ hạn: tuần này / tháng này / quý / xa hơn. Premium dồn vào kỳ
 *  RẤT GẦN là đặt cược ngắn (hoặc phòng hộ sự kiện); dồn vào kỳ xa là vị
 *  thế dài hơi — hai chuyện đọc khác hẳn nhau. */
export type DteBucket = '0-7' | '8-30' | '31-90' | '90+' | '?';
export const DTE_BUCKETS: DteBucket[] = ['0-7', '8-30', '31-90', '90+', '?'];
export type FlowDte = { bucket: DteBucket; call: number; put: number; alerts: number };

export type FlowSummary = {
  alerts: number;
  callPremium: number;
  putPremium: number;
  /** Premium theo (loại × phía). `mixed`/`mid`/`unknown` gộp thành `other`. */
  callAsk: number;
  callBid: number;
  putAsk: number;
  putBid: number;
  otherSide: number;
  sweeps: number;
  /** Số alert có khối lượng hôm đó > open interest — gần như chắc là vị
   *  thế MỚI mở. */
  newPositions: number;
  multileg: number;
  top: LiveRow[];
  strikes: FlowStrike[];
  /** Theo ngày New York, cũ trước. */
  byDay: FlowDay[];
  byDte: FlowDte[];
  from: string | null;
  to: string | null;
};

/** Số alert lớn nhất đưa cho Claude (màn hình in đủ bảng). */
export const TOP_ALERTS = 12;

function nyDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '?';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t));
}

export function dteBucket(dte: number | null): DteBucket {
  if (dte === null || !Number.isFinite(dte)) return '?';
  if (dte <= 7) return '0-7';
  if (dte <= 30) return '8-30';
  if (dte <= 90) return '31-90';
  return '90+';
}

export type DpLevel = { price: number; premium: number; prints: number; size: number };

export type DarkpoolSummary = {
  prints: number;
  premium: number;
  buyVolume: number;
  sellVolume: number;
  /** Số lệnh không xếp được phía (thiếu NBBO hoặc khớp đúng điểm giữa). */
  unsided: number;
  levels: DpLevel[];
  top: DarkpoolPrint[];
  from: string | null;
  to: string | null;
};

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function summarizeFlow(rows: LiveRow[], now = Date.now()): FlowSummary {
  if (!Array.isArray(rows)) rows = [];
  rows = rows.filter((r) => r && typeof r === 'object');
  const cutoff = now - FLOW_DAYS * 86_400_000;
  const recent = rows.filter((r) => {
    const t = Date.parse(r.at);
    return Number.isFinite(t) && t >= cutoff;
  });
  const s: FlowSummary = {
    alerts: recent.length,
    callPremium: 0,
    putPremium: 0,
    callAsk: 0,
    callBid: 0,
    putAsk: 0,
    putBid: 0,
    otherSide: 0,
    sweeps: 0,
    newPositions: 0,
    multileg: 0,
    top: [],
    strikes: [],
    byDay: [],
    byDte: [],
    from: null,
    to: null,
  };
  const days = new Map<string, FlowDay>();
  const dtes = new Map<DteBucket, FlowDte>();
  const byStrike = new Map<number, FlowStrike>();
  for (const r of recent) {
    const p = fin(r.premium) ? r.premium : 0;
    if (r.type === 'call') s.callPremium += p;
    else if (r.type === 'put') s.putPremium += p;
    if (r.type === 'call' && r.side === 'ask') s.callAsk += p;
    else if (r.type === 'call' && r.side === 'bid') s.callBid += p;
    else if (r.type === 'put' && r.side === 'ask') s.putAsk += p;
    else if (r.type === 'put' && r.side === 'bid') s.putBid += p;
    else s.otherSide += p;
    if (r.sweep) s.sweeps++;
    if (r.multileg) s.multileg++;
    if (fin(r.volume) && fin(r.openInterest) && r.volume > r.openInterest) s.newPositions++;
    /* Chỉ call/put vào hai bảng này — loại lạ đã được cộng vào `otherSide`,
       và đổ nó vào cột call là đúng cái bẫy `flowSide()` #125. */
    if (r.type === 'call' || r.type === 'put') {
      const dk = nyDate(r.at);
      const dd = days.get(dk) ?? { day: dk, call: 0, put: 0, alerts: 0 };
      dd[r.type] += p;
      dd.alerts++;
      days.set(dk, dd);
      const bk = dteBucket(r.dte);
      const bb = dtes.get(bk) ?? { bucket: bk, call: 0, put: 0, alerts: 0 };
      bb[r.type] += p;
      bb.alerts++;
      dtes.set(bk, bb);
    }
    if (fin(r.strike) && p > 0 && (r.type === 'call' || r.type === 'put')) {
      const k = byStrike.get(r.strike) ?? {
        strike: r.strike, premium: 0, callPremium: 0, putPremium: 0, lean: 'mixed' as const, alerts: 0,
      };
      k.premium += p;
      if (r.type === 'call') k.callPremium += p;
      else k.putPremium += p;
      k.alerts++;
      byStrike.set(r.strike, k);
    }
  }
  s.strikes = [...byStrike.values()]
    .map((k) => ({
      ...k,
      lean: (k.callPremium / k.premium >= SHARE ? 'call' : k.putPremium / k.premium >= SHARE ? 'put' : 'mixed') as FlowStrike['lean'],
    }))
    .sort((a, b) => b.premium - a.premium)
    .slice(0, TOP);
  s.top = [...recent]
    .filter((r) => fin(r.premium))
    .sort((a, b) => (b.premium as number) - (a.premium as number))
    .slice(0, TOP_ALERTS);
  s.byDay = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  s.byDte = DTE_BUCKETS.map((b) => dtes.get(b)).filter((x): x is FlowDte => !!x);
  const times = recent.map((r) => r.at).sort();
  s.from = times[0] ?? null;
  s.to = times[times.length - 1] ?? null;
  return s;
}

/* ---------- diễn biến flow qua các ngày ---------- */

/**
 * Chủ app: *"Claude trong tab analysis có coi và kết luận flow đang diễn
 * biến ra sao không?"* — Claude đã THẤY bảng theo ngày, nhưng tự so từng
 * ngày là để Claude làm số học, mà luật repo là code tính, Claude diễn
 * giải. Nên xu hướng được tính ở đây, cho cả màn hình lẫn prompt.
 *
 * Ba cái bẫy, mỗi cái sẽ sinh ra một "xu hướng" không có thật:
 *  - NGÀY DỞ DANG. Cửa sổ 7 ngày bắt đầu giữa một phiên (now − 7 ngày), và
 *    hôm nay còn đang giao dịch thì tổng hôm nay là tổng MỘT PHẦN. So nửa
 *    sau (có hôm nay dở) với nửa trước là "flow đang nguội" giả. Nên chỉ
 *    ngày có TRỌN phiên 09:30–16:00 New York nằm trong cửa sổ mới vào phép
 *    so; ngày dở được in riêng, không bị giấu.
 *  - NGÀY KHÔNG CÓ ALERT. Một ngày thứ Hai–Sáu không có alert là số 0 THẬT
 *    (mã ít giao dịch) chứ không phải thiếu dữ liệu, nên nó vẫn vào phép so;
 *    ngày lễ thì app không biết — màn hình nói ra.
 *  - QUÁ ÍT DỮ LIỆU. Hai alert một bên không phải xu hướng. Dưới ngưỡng thì
 *    trả `reason`, KHÔNG trả nhãn — một nhãn "đang tăng" dựng trên 2 alert
 *    trông y hệt nhãn dựng trên 200.
 */

/** Nửa sau ≥ 1,5× nửa trước (premium mỗi ngày) mới gọi là "tăng"; ≤ 1/1,5
 *  là "giảm". Dưới đó là dao động thường ngày của flow. */
export const TREND_RATIO = 1.5;
/** Tỉ trọng (call, kỳ ngắn, vị thế mới) phải dịch ≥ 15 điểm % mới gọi là
 *  dịch chuyển. */
export const TREND_SHIFT = 0.15;
/** Mỗi nửa cần ít nhất chừng này alert call/put. */
export const TREND_MIN_ALERTS = 3;
/** Một ngày ≥ 3× trung vị các ngày trọn phiên còn lại là ngày đột biến. */
export const SPIKE_RATIO = 3;

export type TrendDay = { day: string; call: number; put: number; alerts: number; premium: number };
export type TrendHalf = {
  days: string[];
  alerts: number;
  premium: number;
  perDay: number;
  /** call / (call + put) theo premium. */
  callShare: number | null;
  /** Premium kỳ 0–7 ngày / premium có DTE biết được. */
  shortShare: number | null;
  /** Số alert KL > OI / số alert. */
  newShare: number | null;
  /** Call khớp ở ask / call khớp ở ask+bid; put tương tự. Không có nhãn —
   *  ask ≠ lạc quan, nên chỉ đưa số. */
  callAskShare: number | null;
  putAskShare: number | null;
};
export type Shift<A extends string, B extends string> = A | B | 'steady' | null;
export type FlowTrend = {
  /** Ngày thứ Hai–Sáu có trọn phiên trong cửa sổ, cũ trước, kể cả ngày 0 alert. */
  days: TrendDay[];
  /** Ngày dở dang: có alert trong tổng nhưng không vào phép so. */
  excluded: (TrendDay & { reason: 'partial-start' | 'in-session' | 'weekend' })[];
  early: TrendHalf | null;
  late: TrendHalf | null;
  /** Số ngày lẻ thì ngày giữa đứng ngoài hai nửa. */
  middle: string | null;
  reason: null | 'too-few-days' | 'too-few-alerts';
  verdict: null | {
    intensity: 'rising' | 'falling' | 'steady';
    mix: Shift<'toward-calls', 'toward-puts'>;
    tenor: Shift<'shorter', 'longer'>;
    newPos: Shift<'more', 'fewer'>;
  };
  /** Ngày trọn phiên nhiều premium nhất, và gấp mấy lần trung vị các ngày
   *  còn lại (null khi trung vị là 0 hoặc chỉ có một ngày). */
  peak: { day: string; premium: number; ratio: number | null; spike: boolean } | null;
};

function nyClock(t: number): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(t));
  const g = (k: string) => parts.find((p) => p.type === k)?.value ?? '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) };
}

const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;

function addDay(d: string): string {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
const weekday = (d: string) => {
  const w = new Date(`${d}T12:00:00Z`).getUTCDay();
  return w >= 1 && w <= 5;
};
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

function half(rows: LiveRow[], days: string[]): TrendHalf {
  const h: TrendHalf = {
    days, alerts: 0, premium: 0, perDay: 0, callShare: null, shortShare: null, newShare: null, callAskShare: null, putAskShare: null,
  };
  let call = 0, put = 0, shortP = 0, knownDte = 0, fresh = 0, cAsk = 0, cBid = 0, pAsk = 0, pBid = 0;
  for (const r of rows) {
    if (r.type !== 'call' && r.type !== 'put') continue;
    const p = fin(r.premium) ? r.premium : 0;
    h.alerts++;
    if (r.type === 'call') call += p;
    else put += p;
    const b = dteBucket(r.dte);
    if (b !== '?') {
      knownDte += p;
      if (b === '0-7') shortP += p;
    }
    if (fin(r.volume) && fin(r.openInterest) && r.volume > r.openInterest) fresh++;
    if (r.type === 'call' && r.side === 'ask') cAsk += p;
    if (r.type === 'call' && r.side === 'bid') cBid += p;
    if (r.type === 'put' && r.side === 'ask') pAsk += p;
    if (r.type === 'put' && r.side === 'bid') pBid += p;
  }
  h.premium = call + put;
  h.perDay = days.length ? h.premium / days.length : 0;
  h.callShare = ratio(call, call + put);
  h.shortShare = ratio(shortP, knownDte);
  h.newShare = ratio(fresh, h.alerts);
  h.callAskShare = ratio(cAsk, cAsk + cBid);
  h.putAskShare = ratio(pAsk, pAsk + pBid);
  return h;
}

function shift<A extends string, B extends string>(a: number | null, b: number | null, up: A, down: B): Shift<A, B> {
  if (a === null || b === null) return null;
  if (b - a >= TREND_SHIFT) return up;
  if (a - b >= TREND_SHIFT) return down;
  return 'steady';
}

export function flowTrend(rows: LiveRow[], now = Date.now()): FlowTrend {
  if (!Array.isArray(rows)) rows = [];
  const cutoff = now - FLOW_DAYS * 86_400_000;
  const recent = rows.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    const t = Date.parse(r.at);
    return Number.isFinite(t) && t >= cutoff && t <= now && (r.type === 'call' || r.type === 'put');
  });
  const start = nyClock(cutoff);
  const end = nyClock(now);
  const byDay = new Map<string, LiveRow[]>();
  for (const r of recent) {
    const d = nyClock(Date.parse(r.at)).date;
    const list = byDay.get(d) ?? [];
    list.push(r);
    byDay.set(d, list);
  }
  const tally = (d: string): TrendDay => {
    const list = byDay.get(d) ?? [];
    let call = 0, put = 0;
    for (const r of list) {
      const p = fin(r.premium) ? r.premium : 0;
      if (r.type === 'call') call += p;
      else put += p;
    }
    return { day: d, call, put, alerts: list.length, premium: call + put };
  };

  const out: FlowTrend = { days: [], excluded: [], early: null, late: null, middle: null, reason: null, verdict: null, peak: null };
  for (let d = start.date; d <= end.date; d = addDay(d)) {
    const startCut = d === start.date && start.minutes > OPEN_MIN;
    const endCut = d === end.date && end.minutes < CLOSE_MIN;
    if (startCut || endCut) {
      const t = tally(d);
      if (t.alerts) out.excluded.push({ ...t, reason: startCut ? 'partial-start' : 'in-session' });
      continue;
    }
    if (!weekday(d)) {
      /* Alert cuối tuần (hiếm) không vào phép so — thêm một "ngày" vào một
         nửa là kéo lệch premium mỗi ngày — nhưng cũng không mất im lặng. */
      const t = tally(d);
      if (t.alerts) out.excluded.push({ ...t, reason: 'weekend' });
      continue;
    }
    out.days.push(tally(d));
  }

  const full = out.days;
  if (full.length) {
    const top = full.reduce((a, b) => (b.premium > a.premium ? b : a));
    const others = full.filter((x) => x !== top).map((x) => x.premium).sort((a, b) => a - b);
    const med = others.length
      ? others.length % 2
        ? others[(others.length - 1) / 2]
        : (others[others.length / 2 - 1] + others[others.length / 2]) / 2
      : null;
    const r = med !== null && med > 0 ? top.premium / med : null;
    out.peak = top.premium > 0 ? { day: top.day, premium: top.premium, ratio: r, spike: r !== null && r >= SPIKE_RATIO } : null;
  }

  if (full.length < 2) {
    out.reason = 'too-few-days';
    return out;
  }
  const n = Math.floor(full.length / 2);
  const earlyDays = full.slice(0, n).map((x) => x.day);
  const lateDays = full.slice(full.length - n).map((x) => x.day);
  out.middle = full.length % 2 ? full[n].day : null;
  const pick = (ds: string[]) => ds.flatMap((d) => byDay.get(d) ?? []);
  out.early = half(pick(earlyDays), earlyDays);
  out.late = half(pick(lateDays), lateDays);
  if (out.early.alerts < TREND_MIN_ALERTS || out.late.alerts < TREND_MIN_ALERTS) {
    out.reason = 'too-few-alerts';
    return out;
  }
  const e = out.early.perDay;
  const l = out.late.perDay;
  const intensity: 'rising' | 'falling' | 'steady' =
    e <= 0 ? (l > 0 ? 'rising' : 'steady') : l / e >= TREND_RATIO ? 'rising' : l / e <= 1 / TREND_RATIO ? 'falling' : 'steady';
  out.verdict = {
    intensity,
    mix: shift(out.early.callShare, out.late.callShare, 'toward-calls', 'toward-puts'),
    tenor: shift(out.early.shortShare, out.late.shortShare, 'shorter', 'longer'),
    newPos: shift(out.early.newShare, out.late.newShare, 'more', 'fewer'),
  };
  return out;
}

export function summarizeDarkpool(prints: DarkpoolPrint[]): DarkpoolSummary {
  if (!Array.isArray(prints)) prints = [];
  const ok = prints.filter((p) => p && typeof p === 'object').filter((p) => fin(p.price) && (p.price as number) > 0);
  const s: DarkpoolSummary = {
    prints: ok.length,
    premium: 0,
    buyVolume: 0,
    sellVolume: 0,
    unsided: 0,
    levels: [],
    top: [],
    from: null,
    to: null,
  };
  for (const p of ok) {
    s.premium += fin(p.premium) ? p.premium : 0;
    if (p.sideEstimate === 'buy') s.buyVolume += p.size ?? 0;
    else if (p.sideEstimate === 'sell') s.sellVolume += p.size ?? 0;
    else s.unsided++;
  }
  const sorted = [...ok].sort((a, b) => (a.price as number) - (b.price as number));
  const groups: DarkpoolPrint[][] = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    if (g && (((p.price as number) - (g[0].price as number)) / (g[0].price as number)) * 100 <= DP_CLUSTER_PCT) g.push(p);
    else groups.push([p]);
  }
  s.levels = groups
    .map((g) => {
      const prem = g.reduce((n, p) => n + (fin(p.premium) ? p.premium : 0), 0);
      const size = g.reduce((n, p) => n + (p.size ?? 0), 0);
      /* Trọng số theo SỐ CỔ PHIẾU: đó là giá trung bình thật của khối đã
         khớp. Không có size thì rơi về trung bình cộng giá. */
      const price =
        size > 0
          ? g.reduce((n, p) => n + (p.price as number) * (p.size ?? 0), 0) / size
          : g.reduce((n, p) => n + (p.price as number), 0) / g.length;
      return { price, premium: prem, prints: g.length, size };
    })
    .sort((a, b) => b.premium - a.premium)
    .slice(0, TOP);
  s.top = [...ok]
    .sort((a, b) => (b.premium ?? 0) - (a.premium ?? 0))
    .slice(0, 5);
  const times = ok.map((p) => p.executedAt).filter(Boolean).sort();
  s.from = times[0] ?? null;
  s.to = times[times.length - 1] ?? null;
  return s;
}

/* ---------- bản chữ cho prompt ---------- */

const money = (x: number) =>
  x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : `$${Math.round(x / 1e3)}K`;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : 'n/a');

const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);

/** Phần "diễn biến" của prompt — nhãn do code đặt, Claude chỉ đọc. */
export function trendFacts(tr: FlowTrend): string[] {
  const out = ['  Trend across the week (computed in code; complete New York sessions only, Mon-Fri, holidays not detected):'];
  if (tr.days.length) {
    out.push(`    Complete sessions: ${tr.days.map((d) => `${d.day} ${money(d.premium)} (${d.alerts} alerts)`).join('; ')}.`);
  }
  for (const x of tr.excluded) {
    const why = x.reason === 'in-session' ? 'today, session not finished' : x.reason === 'weekend' ? 'weekend' : 'only part of the session is inside the 7-day window';
    out.push(`    Not compared: ${x.day} ${money(x.premium)} (${x.alerts} alerts) - ${why}.`);
  }
  if (tr.peak) {
    out.push(
      `    Busiest complete session: ${tr.peak.day} ${money(tr.peak.premium)}${tr.peak.ratio !== null ? `, ${tr.peak.ratio.toFixed(1)}x the median of the other sessions${tr.peak.spike ? ' (a spike)' : ''}` : ''}.`
    );
  }
  if (tr.reason === 'too-few-days') {
    out.push('    NO TREND: fewer than two complete sessions in the window. Do not describe a trend.');
    return out;
  }
  const e = tr.early as TrendHalf;
  const l = tr.late as TrendHalf;
  const line = (name: string, h: TrendHalf) =>
    `    ${name} (${h.days.join(', ')}): ${h.alerts} alerts, ${money(h.perDay)} premium per session, call share ${pct(h.callShare)}, 0-7 day expiry share ${pct(h.shortShare)}, new-position share ${pct(h.newShare)}, calls filled at ask ${pct(h.callAskShare)}, puts filled at ask ${pct(h.putAskShare)}.`;
  out.push(line('Earlier half', e), line('Later half', l));
  if (tr.middle) out.push(`    ${tr.middle} is the middle session and sits in neither half.`);
  if (tr.reason === 'too-few-alerts' || !tr.verdict) {
    out.push(`    NO TREND LABEL: a half has fewer than ${TREND_MIN_ALERTS} alerts, too few to call a direction. Say the flow is too thin to read a trend.`);
    return out;
  }
  const v = tr.verdict;
  const lbl = (x: string | null) => (x === null ? 'not measurable' : x.replace(/-/g, ' '));
  out.push(
    `    Labels (thresholds: premium ${TREND_RATIO}x per session, shares ${Math.round(TREND_SHIFT * 100)} points): activity ${v.intensity}; call/put mix ${lbl(v.mix)}; expiry ${lbl(v.tenor)}; new positions ${lbl(v.newPos)}.`
  );
  return out;
}

export function uwFacts(ctx: UwContext | null | undefined, now = Date.now()): string {
  const out = ['UNUSUAL WHALES (third-party flow data, read the caveats)'];
  if (!ctx) {
    out.push('NOT AVAILABLE - the page did not load it. Say the flow picture could not be read; do not infer it.');
    return out.join('\n');
  }
  if (!ctx.configured) {
    out.push('NOT CONFIGURED on this server (no UW_API_KEY). There is no flow, dark-pool or Congress data; do not mention them as if they were empty.');
    return out.join('\n');
  }

  const flow = ctx.flow ?? { data: [], error: 'not sent', unparsed: 0, sampleKeys: [] };
  const dp = ctx.darkpool ?? { data: [], error: 'not sent' };
  const cg = ctx.congress ?? { data: null, error: 'not sent' };
  const clip = (e: unknown) => String(e).slice(0, 300);

  out.push('', `Options flow alerts (UW-filtered alerts, not every trade; last ${FLOW_DAYS} days):`);
  if (flow.error) {
    out.push(`  NOT AVAILABLE - ${clip(flow.error)}`);
  } else {
    const f = summarizeFlow(flow.data, now);
    if (!f.alerts) {
      out.push(`  none in the last ${FLOW_DAYS} days (UW answered; it is a real zero).`);
    } else {
      out.push(
        `  ${f.alerts} alerts ${day(f.from)} to ${day(f.to)}. Call premium ${money(f.callPremium)}, put premium ${money(f.putPremium)}.`,
        `  By fill side: calls at ask ${money(f.callAsk)} / at bid ${money(f.callBid)}; puts at ask ${money(f.putAsk)} / at bid ${money(f.putBid)}; mixed or unknown side ${money(f.otherSide)}.`,
        `  Sweeps ${f.sweeps}, multi-leg ${f.multileg}, volume above open interest (likely new positions) ${f.newPositions}.`,
        `  Largest strikes by premium: ${f.strikes.map((k) => `${k.strike} (${money(k.premium)}, ${k.lean})`).join(', ') || 'n/a'}.`,
        `  By day (New York, oldest first): ${f.byDay.map((d) => `${d.day} call ${money(d.call)} / put ${money(d.put)}`).join('; ') || 'n/a'}.`,
        `  By days to expiry: ${f.byDte.map((b) => `${b.bucket}d call ${money(b.call)} / put ${money(b.put)}`).join('; ') || 'n/a'}.`,
        ...trendFacts(flowTrend(flow.data, now)),
        `  Largest alerts (top ${TOP_ALERTS} by premium):`
      );
      for (const r of f.top) {
        out.push(
          `    ${day(r.at)} ${r.type} ${r.strike ?? '?'} exp ${r.expiry ?? '?'}${r.dte !== null ? ` (${r.dte}d)` : ''}: ${fin(r.premium) ? money(r.premium) : 'n/a'}, side ${r.side}${r.sweep ? ', sweep' : ''}${r.multileg ? ', multi-leg' : ''}${fin(r.volume) && fin(r.openInterest) ? `, vol/OI ${(r.volume / Math.max(1, r.openInterest)).toFixed(1)}` : ''}`
        );
      }
    }
    if (flow.capped) {
      out.push(`  The fetch stopped at its page limit before covering all ${FLOW_DAYS} days, so the oldest days may be missing.`);
    }
    if (fin(flow.unparsed) && flow.unparsed > 0) {
      out.push(`  ${flow.unparsed} records could not be parsed and are excluded.`);
    }
  }

  out.push('', 'Dark pool prints of at least $1M (last 14 days):');
  if (dp.error) {
    out.push(`  NOT AVAILABLE - ${clip(dp.error)}`);
  } else {
    const d = summarizeDarkpool(dp.data);
    if (!d.prints) {
      out.push('  none (UW answered; it is a real zero).');
    } else {
      out.push(
        `  ${d.prints} prints ${day(d.from)} to ${day(d.to)}, total ${money(d.premium)}.`,
        `  Estimated side by shares (fill vs NBBO midpoint, an estimate, not a label): buy ${d.buyVolume.toLocaleString('en-US')}, sell ${d.sellVolume.toLocaleString('en-US')}, unsided prints ${d.unsided}.`,
        `  Price levels with the most dark-pool money: ${d.levels.map((l) => `${l.price.toFixed(2)} (${money(l.premium)}, ${l.prints} prints)`).join(', ')}.`
      );
    }
  }

  out.push('', 'Congress trades (last 90 days, from the app\'s synced store):');
  if (cg.error) {
    out.push(`  NOT AVAILABLE - ${clip(cg.error)}`);
  } else if (!cg.data || !Array.isArray(cg.data.trades)) {
    out.push('  none on record. The store only covers S&P 500, watchlist and portfolio symbols, so for other symbols this means "not tracked", not "nobody traded".');
  } else {
    const c = cg.data;
    out.push(
      `  ${c.trades.length} trades by ${c.traderCount} member(s): buys ${c.buys}, sells ${c.sells}, other ${c.others}; last trade ${c.lastTradeDate ?? 'n/a'}; median disclosure lag ${c.medianLagDays ?? 'n/a'} days.`
    );
  }

  out.push(
    '',
    'Caveats: an alert filled at the ask is not proof of bullishness (a call at the ask can close a short call); dark-pool side is an estimate; Congress trades are disclosed weeks to months late. Flow is one input beside the technical and gamma picture, not a verdict.'
  );
  return out.join('\n');
}
