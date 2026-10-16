import type { Alert } from './alerts';
import { pivotLows, readSupport, supportZones, type Candle, type SupportZone } from './support';

/**
 * Tab Alerts — hai thứ, cả hai là phép ĐỌC GIÁ chứ không phải phép đoán:
 *
 *  1. Mã (vị thế đang nắm ∪ watchlist) ĐANG RỚT và đã tới sát một vùng hỗ
 *     trợ mà app tự tính (`support.ts` — cùng một phép tính với tab Đầu tư
 *     dài hạn, không có đường tính thứ hai để trôi lệch).
 *  2. Mức giá NGƯỜI DÙNG tự đặt cho một mã, báo khi giá chạm.
 *
 * File này THUẦN: không `node:fs`, không mạng, để test không cần gì. Phần
 * IO (đọc quote, nến, kho mức giá) nằm ở `pricewatch.ts`.
 *
 * Phạm vi của phần tự báo cố ý là `alertSymbols()` (vị thế ∪ watchlist),
 * KHÔNG phải cả rổ S&P 500 — cùng lý do với tầng báo chí: 500 mã là một hộp
 * thư bị tắt thông báo trong tuần đầu, và cũng là 500 lượt nến mỗi ngày.
 *
 * Ba luật "thà không nói còn hơn nói sai":
 *
 *  - "GẦN hỗ trợ" phải đi kèm "ĐANG RỚT". Một mã đứng yên cách hỗ trợ 2%
 *    suốt tháng không phải là chuyện đáng rung điện thoại; chủ app nói rõ
 *    "đang rớt gần tới support". Đang rớt = giá thấp hơn giá đóng cửa
 *    `FALL_SESSIONS` phiên trước.
 *  - "ĐÃ THỦNG" chỉ tính khi vừa thủng: `readSupport().broken` trả vùng
 *    thấp nhất mà giá đang nằm dưới — một vùng mất từ ba tháng trước vẫn
 *    thoả điều kiện đó mãi mãi. Chỉ gọi là thủng khi `FALL_SESSIONS` phiên
 *    trước giá còn ở trên biên dưới của vùng; cũ hơn thì là lịch sử.
 *  - Không có giá thì KHÔNG có trạng thái: `price` không hữu hạn → mọi mức
 *    ra `null` và hàng ghi `noQuote`, không phải "ok".
 */

/** Cách tâm vùng hỗ trợ không quá chừng này (% trên tâm) thì là "gần". */
export const NEAR_PCT = 3;
/** So với giá đóng cửa bao nhiêu phiên trước để gọi là "đang rớt". */
export const FALL_SESSIONS = 5;
/** Tối đa mức giá một người được đặt — để một vòng lặp lỗi không đẻ ra
 *  nghìn mức, và để bảng còn đọc được. */
export const MAX_LEVELS = 100;

export type SupportStatus = 'near' | 'broken' | 'ok' | 'nozone' | 'noquote';

export type SupportWatchRow = {
  symbol: string;
  price: number | null;
  status: SupportStatus;
  /** Vùng đang nói tới: vùng gần nhất bên dưới (near/ok) hoặc vùng vừa thủng (broken). */
  zone: Pick<SupportZone, 'price' | 'low' | 'high' | 'touches' | 'lastTouch'> | null;
  /** Giá cao hơn tâm vùng bao nhiêu % (âm khi đã thủng). */
  distancePct: number | null;
  /** % thay đổi so với giá đóng cửa `FALL_SESSIONS` phiên trước. */
  chgPct: number | null;
  falling: boolean | null;
  zones: number;
  candles: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Giá đóng cửa của phiên cách đây `back` phiên (nến cuối là phiên gần nhất). */
function closeBack(candles: Candle[], back: number): number | null {
  const i = candles.length - 1 - back;
  if (i < 0) return null;
  const c = candles[i]?.close;
  return Number.isFinite(c) ? c : null;
}

/**
 * Đọc một mã so với các vùng hỗ trợ của chính nó.
 *
 * `candles` là nến NGÀY (3 năm, như tab Đầu tư dài hạn). Nến cuối có thể là
 * phiên hôm nay đang dở — với phép so "rớt so với 5 phiên trước" thì sai
 * lệch là nửa phiên, chấp nhận được và nói ra ở chú thích màn hình.
 */
export function watchSupport(symbol: string, price: number | null, candles: Candle[]): SupportWatchRow {
  const zones = supportZones(pivotLows(candles));
  const base: SupportWatchRow = {
    symbol,
    price: price !== null && Number.isFinite(price) ? price : null,
    status: 'noquote',
    zone: null,
    distancePct: null,
    chgPct: null,
    falling: null,
    zones: zones.length,
    candles: candles.length,
  };
  if (base.price === null) return base;
  const p = base.price;

  const ref = closeBack(candles, FALL_SESSIONS);
  const chgPct = ref !== null && ref > 0 ? round2(((p - ref) / ref) * 100) : null;
  const falling = chgPct === null ? null : chgPct < 0;
  base.chgPct = chgPct;
  base.falling = falling;

  if (!zones.length) return { ...base, status: 'nozone' };

  const read = readSupport(p, zones);
  const pick = (z: SupportZone) => ({
    price: z.price,
    low: z.low,
    high: z.high,
    touches: z.touches,
    lastTouch: z.lastTouch,
  });

  /* Thủng VỪA MỚI: 5 phiên trước còn trên biên dưới của vùng. */
  if (read.broken && ref !== null && ref >= read.broken.low) {
    const z = read.broken;
    return {
      ...base,
      status: 'broken',
      zone: pick(z),
      distancePct: z.price > 0 ? round2(((p - z.price) / z.price) * 100) : null,
    };
  }

  if (read.nearest) {
    const z = read.nearest;
    const d = read.distancePct !== null ? round2(read.distancePct) : null;
    const near = d !== null && d <= NEAR_PCT && falling === true;
    return { ...base, status: near ? 'near' : 'ok', zone: pick(z), distancePct: d };
  }

  /* Có vùng nhưng tất cả nằm TRÊN giá (đã mất từ lâu): không còn hỗ trợ nào
     bên dưới để nói tới. */
  return { ...base, status: 'nozone' };
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** Khoá chống lặp theo ngày + mã + vùng: cùng vùng chỉ báo một lần mỗi ngày
 *  giao dịch; sang vùng khác (rớt tiếp) là một chuyện mới. */
export const supportKey = (status: 'near' | 'broken', day: string, symbol: string, zonePrice: number) =>
  `support-${status}-${day}-${symbol}-${zonePrice.toFixed(2)}`;

export function supportAlertsFrom(rows: SupportWatchRow[], day: string): Alert[] {
  const out: Alert[] = [];
  for (const r of rows) {
    if (!r.zone || r.price === null) continue;
    if (r.status === 'near') {
      out.push({
        key: supportKey('near', day, r.symbol, r.zone.price),
        severity: 'warn',
        title: `${r.symbol} đang rớt gần hỗ trợ ${money(r.zone.price)}`,
        body:
          `Giá ${money(r.price)}, cao hơn tâm vùng ${r.distancePct?.toFixed(1)}% ` +
          `(vùng ${money(r.zone.low)}–${money(r.zone.high)}, ${r.zone.touches} lần chạm, gần nhất ${r.zone.lastTouch}). ` +
          `${FALL_SESSIONS} phiên: ${r.chgPct?.toFixed(1)}%. Vùng do app tự tính từ đáy xoay — không phải khuyến nghị mua.`,
      });
    } else if (r.status === 'broken') {
      out.push({
        key: supportKey('broken', day, r.symbol, r.zone.price),
        severity: 'urgent',
        title: `${r.symbol} vừa thủng hỗ trợ ${money(r.zone.price)}`,
        body:
          `Giá ${money(r.price)} đã rơi dưới biên dưới ${money(r.zone.low)} của vùng ` +
          `(${r.zone.touches} lần chạm, gần nhất ${r.zone.lastTouch}) trong ${FALL_SESSIONS} phiên qua. ` +
          `${FALL_SESSIONS} phiên: ${r.chgPct?.toFixed(1)}%.`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  Mức giá người dùng đặt
 * ------------------------------------------------------------------ */

export type LevelDirection = 'below' | 'above';

export type PriceLevel = {
  id: string;
  symbol: string;
  price: number;
  /** Báo khi giá RỚT xuống tới mức (below) hay LÊN tới mức (above). Suy từ
   *  giá lúc đặt: mức dưới giá thì chờ rớt, trên giá thì chờ lên. */
  direction: LevelDirection;
  note: string;
  createdAt: string;
  /** Lần "lên đạn" gần nhất — tạo mới hoặc bấm Đặt lại. Nằm trong khoá
   *  chống lặp để một mức đặt lại rồi chạm lần hai trong cùng ngày vẫn báo. */
  armedAt: string;
  hitAt: string | null;
  hitPrice: number | null;
};

const SYMBOL_RE = /^[A-Z][A-Z0-9./$-]{0,9}$/;

export type LevelInput = { symbol?: unknown; price?: unknown; note?: unknown };

/**
 * Kiểm đầu vào từ client. Không tin gì: mã viết hoa + chuẩn hoá, giá phải
 * là số dương hữu hạn, ghi chú cắt 80 ký tự.
 */
export function parseLevelInput(
  input: LevelInput,
  last: number | null,
  now = new Date()
): { ok: true; level: PriceLevel } | { ok: false; error: string } {
  const symbol = String(input.symbol ?? '').trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return { ok: false, error: 'BAD_SYMBOL' };
  const price = typeof input.price === 'number' ? input.price : Number(input.price);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'BAD_PRICE' };
  const note = String(input.note ?? '').trim().slice(0, 80);
  const direction: LevelDirection =
    last !== null && Number.isFinite(last) && price > last ? 'above' : 'below';
  const iso = now.toISOString();
  const id = `${symbol}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    ok: true,
    level: { id, symbol, price: round2(price), direction, note, createdAt: iso, armedAt: iso, hitAt: null, hitPrice: null },
  };
}

/** Đã chạm chưa. Thiếu giá → false (không có số thì không có cảnh báo). */
export function levelHit(level: PriceLevel, last: number | null): boolean {
  if (last === null || !Number.isFinite(last)) return false;
  return level.direction === 'below' ? last <= level.price : last >= level.price;
}

export const levelKey = (level: PriceLevel) => `level-${level.id}-${level.armedAt}`;

export function levelAlert(level: PriceLevel, last: number): Alert {
  const dir = level.direction === 'below' ? 'rớt xuống' : 'lên tới';
  return {
    key: levelKey(level),
    severity: 'warn',
    title: `${level.symbol} ${dir} ${money(level.price)} như bạn đặt`,
    body:
      `Giá hiện ${money(last)}, mức bạn đặt ${money(level.price)}` +
      (level.note ? ` — ${level.note}` : '') +
      `. Mức này sẽ không báo lại cho tới khi bạn bấm Đặt lại hoặc xoá.`,
  };
}

/**
 * Quét mọi mức chưa chạm với bảng giá vừa lấy. Trả về danh sách ĐÃ SỬA
 * (mức chạm được ghi `hitAt`/`hitPrice`) và cảnh báo cho từng mức vừa chạm.
 * Thuần: không ghi đĩa — người gọi ghi.
 */
export function checkLevels(
  levels: PriceLevel[],
  last: Record<string, number | null>,
  now = new Date()
): { levels: PriceLevel[]; hit: { level: PriceLevel; alert: Alert }[] } {
  const hit: { level: PriceLevel; alert: Alert }[] = [];
  const next = levels.map((lv) => {
    if (lv.hitAt) return lv;
    const p = last[lv.symbol] ?? null;
    if (!levelHit(lv, p)) return lv;
    const updated: PriceLevel = { ...lv, hitAt: now.toISOString(), hitPrice: round2(p as number) };
    hit.push({ level: updated, alert: levelAlert(updated, p as number) });
    return updated;
  });
  return { levels: next, hit };
}

/** Thứ tự bảng: near → broken → ok (gần nhất trước) → nozone → noquote. */
const ORDER: Record<SupportStatus, number> = { near: 0, broken: 1, ok: 2, nozone: 3, noquote: 4 };
export function sortRows(rows: SupportWatchRow[]): SupportWatchRow[] {
  return [...rows].sort((a, b) => {
    const d = ORDER[a.status] - ORDER[b.status];
    if (d) return d;
    const da = a.distancePct ?? Infinity;
    const db = b.distancePct ?? Infinity;
    if (da !== db) return da - db;
    return a.symbol.localeCompare(b.symbol);
  });
}
