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
