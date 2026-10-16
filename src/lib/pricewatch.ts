import fs from 'node:fs/promises';
import path from 'node:path';
import type { Alert } from './alerts';
import { inMarketHours } from './alerts';
import { OWNER } from './users';
import { mapWithLimit } from './maplimit';
import {
  MAX_LEVELS,
  checkLevels,
  parseLevelInput,
  sortRows,
  supportAlertsFrom,
  watchSupport,
  type LevelInput,
  type PriceLevel,
  type SupportWatchRow,
} from './pricealerts';

/**
 * Phần IO của tab Alerts: đọc quote + nến, ghi ảnh chụp và kho mức giá.
 *
 * HAI FILE cạnh `SCAN_PATH` (không biến env mới — lối `lt-store.ts` né bẫy
 * `USERS_PATH`):
 *  - `price-levels.json`   — mức giá người dùng đặt, theo NGƯỜI.
 *  - `support-watch.json`  — ảnh chụp lượt kiểm gần nhất (bảng "gần hỗ trợ"
 *    cho MỌI mã trong phạm vi + báo cáo), để tab mở ra là có số ngay chứ
 *    không phải chờ 15 phút tới tick kế, và để một lượt kiểm hỏng VẪN nói ra
 *    vì sao (bảng trống trông y hệt "không mã nào gần hỗ trợ").
 *
 * Đọc-sửa-ghi từng lượt, tmp-rồi-đổi-tên; không giữ gì trong RAM giữa các
 * route (#193: mỗi route là một bundle, trạng thái module không dùng chung).
 */

const DIR = () => path.dirname(process.env.SCAN_PATH || './.cache/last-scan.json');
const LEVELS_FILE = () => path.join(DIR(), 'price-levels.json');
const WATCH_FILE = () => path.join(DIR(), 'support-watch.json');

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

type LevelStore = Record<string, PriceLevel[]>;

export async function readLevels(user: string): Promise<PriceLevel[]> {
  const store = await readJson<LevelStore>(LEVELS_FILE(), {});
  const mine = store[user];
  return Array.isArray(mine) ? mine : [];
}

async function updateLevels(fn: (store: LevelStore) => LevelStore | null): Promise<LevelStore> {
  const store = await readJson<LevelStore>(LEVELS_FILE(), {});
  const next = fn(store);
  if (next) await writeJson(LEVELS_FILE(), next);
  return next ?? store;
}

export type AddResult = { ok: true; level: PriceLevel } | { ok: false; error: string };

/**
 * Thêm một mức. `last` là giá hiện tại nếu lấy được — chỉ để suy hướng
 * (dưới giá → chờ rớt, trên giá → chờ lên); không lấy được thì mặc định
 * "chờ rớt", đúng câu chủ app đặt hàng.
 */
export async function addLevel(user: string, input: LevelInput, last: number | null): Promise<AddResult> {
  const parsed = parseLevelInput(input, last);
  if (!parsed.ok) return parsed;
  let error: string | null = null;
  await updateLevels((store) => {
    const mine = Array.isArray(store[user]) ? store[user] : [];
    if (mine.length >= MAX_LEVELS) {
      error = 'TOO_MANY';
      return null;
    }
    return { ...store, [user]: [...mine, parsed.level] };
  });
  if (error) return { ok: false, error };
  return parsed;
}

export async function removeLevel(user: string, id: string): Promise<boolean> {
  let removed = false;
  await updateLevels((store) => {
    const mine = Array.isArray(store[user]) ? store[user] : [];
    const next = mine.filter((l) => l.id !== id);
    removed = next.length !== mine.length;
    return removed ? { ...store, [user]: next } : null;
  });
  return removed;
}

/** Đặt lại: xoá dấu đã chạm và lên đạn lại (khoá chống lặp đổi theo `armedAt`). */
export async function rearmLevel(user: string, id: string, now = new Date()): Promise<PriceLevel | null> {
  let out: PriceLevel | null = null;
  await updateLevels((store) => {
    const mine = Array.isArray(store[user]) ? store[user] : [];
    const next = mine.map((l) => {
      if (l.id !== id) return l;
      out = { ...l, hitAt: null, hitPrice: null, armedAt: now.toISOString() };
      return out;
    });
    return out ? { ...store, [user]: next } : null;
  });
  return out;
}

export type PriceReport = {
  at: number;
  marketOpen: boolean;
  /** Lượt này có kiểm không. Ngoài giờ thì không: giá không đổi, chỉ lặp lại. */
  ran: boolean;
  symbols: number;
  /** Mã được quote. Thiếu so với `symbols` nghĩa là Schwab không trả mã đó. */
  quoted: number;
  quoteError: string | null;
  heldError: string | null;
  /** Mã không lấy được nến, kèm lý do thật. */
  candleErrors: string[];
  near: number;
  broken: number;
  levels: number;
  levelsHit: number;
};

export type SupportSnapshot = {
  rows: SupportWatchRow[];
  report: PriceReport;
};

export async function readSnapshot(): Promise<SupportSnapshot | null> {
  return readJson<SupportSnapshot | null>(WATCH_FILE(), null);
}

/** Đọc số từ quote Schwab — nhận cả chuỗi số, từ chối rỗng (bẫy `gex.ts`). */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Số lượt nến bay cùng lúc. Nến cache theo ngày nên chỉ lượt đầu mỗi ngày
 *  mới ra mạng; 4 để một watchlist vài chục mã xong trong vài giây mà vẫn
 *  dưới hẳn RateLimiter 100/phút dùng chung với Screener. */
const CANDLE_CONCURRENCY = 4;

/**
 * Một lượt kiểm: quote mọi mã (một request gộp lô), nến ngày cho mã trong
 * phạm vi tự báo, ghi ảnh chụp, đánh dấu mức đã chạm, trả cảnh báo.
 *
 * Cảnh báo mức giá chỉ trả về cho CHỦ APP: Telegram/web push là kênh của
 * chủ app, mức của người nhà vẫn được đánh dấu chạm (họ thấy trong tab)
 * nhưng không rung điện thoại chủ app vì một mức không phải của mình.
 *
 * `force` (nút Kiểm tra ngay / Gửi thử) bỏ qua cổng giờ giao dịch.
 */
export async function runPriceAlerts(force = false): Promise<{ alerts: Alert[]; report: PriceReport }> {
  const at = Date.now();
  const marketOpen = force || inMarketHours();
  const report: PriceReport = {
    at,
    marketOpen,
    ran: false,
    symbols: 0,
    quoted: 0,
    quoteError: null,
    heldError: null,
    candleErrors: [],
    near: 0,
    broken: 0,
    levels: 0,
    levelsHit: 0,
  };
  if (!marketOpen) {
    /* Giữ bảng cũ, chỉ cập nhật báo cáo để màn hình nói "ngoài giờ". */
    const prev = await readSnapshot();
    if (prev) await writeJson(WATCH_FILE(), { rows: prev.rows, report: { ...report, levels: prev.report.levels } }).catch(() => {});
    return { alerts: [], report };
  }
  report.ran = true;

  const { alertSymbols } = await import('./liveevents');
  const { symbols: scope, heldError } = await alertSymbols();
  report.heldError = heldError;

  const store = await readJson<LevelStore>(LEVELS_FILE(), {});
  const levelSymbols = new Set<string>();
  for (const list of Object.values(store)) for (const l of list ?? []) if (!l.hitAt) levelSymbols.add(l.symbol);
  report.levels = Object.values(store).reduce((n, l) => n + (l?.length ?? 0), 0);

  const all = [...new Set([...scope, ...levelSymbols])];
  report.symbols = scope.length;

  const last: Record<string, number | null> = {};
  if (all.length) {
    try {
      const { quotes } = await import('./schwab');
      const q = await quotes(all);
      for (const s of all) last[s] = num(q?.[s]?.quote?.lastPrice);
      report.quoted = all.filter((s) => last[s] !== null).length;
    } catch (e: any) {
      report.quoteError = String(e?.message ?? e).slice(0, 300);
    }
  }

  /* Nến chỉ cho phạm vi tự báo; mức người dùng đặt không cần nến. */
  const { historyCandles } = await import('./history');
  const settled = await mapWithLimit(scope, CANDLE_CONCURRENCY, (s) => historyCandles(s, 3));
  const rows: SupportWatchRow[] = [];
  scope.forEach((s, i) => {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      rows.push(watchSupport(s, last[s] ?? null, r.value));
    } else {
      report.candleErrors.push(`${s}: ${String(r.reason?.message ?? r.reason).slice(0, 120)}`);
      rows.push(watchSupport(s, last[s] ?? null, []));
    }
  });
  const sorted = sortRows(rows);
  report.near = sorted.filter((r) => r.status === 'near').length;
  report.broken = sorted.filter((r) => r.status === 'broken').length;

  const { tradingDay } = await import('./alerts');
  const alerts: Alert[] = report.quoteError ? [] : supportAlertsFrom(sorted, tradingDay());

  /* Mức giá: quét mọi người, ghi dấu chạm, chỉ gửi của chủ app. */
  if (!report.quoteError) {
    const now = new Date();
    let changed = false;
    const next: LevelStore = {};
    for (const [user, list] of Object.entries(store)) {
      const res = checkLevels(list ?? [], last, now);
      next[user] = res.levels;
      if (res.hit.length) {
        changed = true;
        report.levelsHit += res.hit.length;
        if (user === OWNER) alerts.push(...res.hit.map((h) => h.alert));
      }
    }
    if (changed) await writeJson(LEVELS_FILE(), next);
  }

  await writeJson(WATCH_FILE(), { rows: sorted, report } satisfies SupportSnapshot).catch(() => {});
  return { alerts, report };
}
