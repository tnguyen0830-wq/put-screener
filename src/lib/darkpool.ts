import fs from 'node:fs/promises';
import path from 'node:path';
import { uwConfigured, uwGet, UwError } from './unusualwhales';
import { trackedSymbols } from './insiders';

/**
 * Lệnh in ngoài sàn (dark pool) khối lượng lớn, qua Unusual Whales.
 *
 * Khác Options Flow: `/api/darkpool/recent` KHÔNG có tham số lọc theo
 * mã (xác nhận từ tài liệu thật), chỉ `/api/darkpool/{ticker}` mới có -
 * nên phải gọi RIÊNG TỪNG MÃ, không gộp lô được như Options Flow. Với
 * rổ ~500+ mã tốn nhiều request hơn (nhưng vẫn dưới xa hạn mức
 * 30.000/ngày) - đổi lấy việc không bỏ sót mã nào giữa hai lần đồng bộ.
 * Kéo luồng chung `/recent` rồi tự lọc từng có cân nhắc, nhưng khối
 * lượng in dark pool TOÀN THỊ TRƯỜNG đủ lớn để cửa sổ "gần đây" có thể
 * trôi qua hết trước lần đồng bộ kế tiếp (15 phút) - gọi riêng từng mã
 * mới chắc chắn không bỏ sót.
 *
 * Số lượng in dark pool cho MỘT mã cũng có thể rất nhiều trong ngày -
 * chỉ giữ lại lệnh có premium đủ lớn (MIN_PREMIUM), giống cách chọn
 * "block trade" đáng chú ý trên thị trường thay vì lưu mọi lệnh nhỏ lẻ.
 * Lọc CẢ HAI phía: truyền `min_premium` cho UW (nếu endpoint này cũng
 * nhận tham số đó như /recent - chưa xác nhận riêng) VÀ lọc lại phía
 * app bằng field `premium` đã có sẵn trong response - đúng dù UW có
 * nhận tham số đó hay lặng lẽ bỏ qua.
 */

const STORE = path.resolve(process.env.DARKPOOL_PATH || './.cache/darkpool.json');

/** Ngắn như Options Flow - một lệnh in tuần trước không còn ý nghĩa gì
 *  cho quyết định hôm nay. */
export const LOOKBACK_DAYS = 14;

/** Ngưỡng "đáng chú ý": khớp cỡ giao dịch tổ chức, không phải lẻ tẻ. */
export const MIN_PREMIUM = 1_000_000;

const PAGE_SIZE = 200;

export type DarkpoolPrint = {
  /** UW không có "id" cho dark pool (khác flow-alerts), nhưng có
   *  tracking_id - số nguyên lớn, đủ để làm khoá thật, không cần dựng
   *  khoá tổng hợp như congress.ts. */
  trackingId: string;
  ticker: string;
  size: number | null;
  price: number | null;
  premium: number | null;
  executedAt: string;
  marketCenter: string | null;
  extendedHours: boolean;
};

type Stored = {
  prints: Record<string, DarkpoolPrint>;
  /** mã -> lần đồng bộ gần nhất thành công (ISO). Đồng bộ RIÊNG TỪNG MÃ
   *  nên mỗi mã có watermark của mã đó, không dùng chung một mốc. */
  watermarks: Record<string, string>;
};

async function read(): Promise<Stored> {
  try {
    const j = JSON.parse(await fs.readFile(STORE, 'utf8'));
    if (j && typeof j === 'object' && j.prints) return j;
  } catch {
    /* chưa đồng bộ lần nào */
  }
  return { prints: {}, watermarks: {} };
}

async function write(s: Stored): Promise<void> {
  await fs.mkdir(path.dirname(STORE), { recursive: true });
  await fs.writeFile(STORE, JSON.stringify(s));
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function parsePrint(raw: any): DarkpoolPrint {
  return {
    trackingId: String(raw.tracking_id ?? ''),
    ticker: String(raw.ticker ?? '').toUpperCase(),
    size: num(raw.size),
    price: num(raw.price),
    premium: num(raw.premium),
    executedAt: String(raw.executed_at ?? ''),
    marketCenter: raw.market_center ?? null,
    extendedHours: raw.ext_hour_sold_codes === 'extended_hours_trade',
  };
}

export type DarkpoolRun = {
  at: number;
  symbolsChecked: number;
  seen: number;
  saved: number;
  errors: string[];
};

let lastRun: DarkpoolRun | null = null;
export const getDarkpoolLastRun = () => lastRun;

let inFlight = false;
export const darkpoolSyncing = () => inFlight;

export async function syncDarkpool(): Promise<DarkpoolRun> {
  if (inFlight) {
    return lastRun ?? { at: Date.now(), symbolsChecked: 0, seen: 0, saved: 0, errors: [] };
  }
  if (!uwConfigured()) {
    lastRun = {
      at: Date.now(),
      symbolsChecked: 0,
      seen: 0,
      saved: 0,
      errors: ['UW_API_KEY chưa được cấu hình'],
    };
    return lastRun;
  }

  inFlight = true;
  const at = Date.now();
  let symbolsChecked = 0;
  let seen = 0;
  let saved = 0;
  const errors: string[] = [];

  try {
    const { symbols } = await trackedSymbols();
    const store = await read();

    for (const symbol of symbols) {
      symbolsChecked++;
      try {
        const res = await uwGet<{ data?: any[] } | any[]>(`/api/darkpool/${symbol}`, {
          limit: PAGE_SIZE,
          min_premium: MIN_PREMIUM,
          newer_than: store.watermarks[symbol],
        });
        const rows: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        for (const raw of rows) {
          seen++;
          if (raw.canceled) continue; // lệnh đã bị huỷ - không phải in thật
          const p = parsePrint(raw);
          // Lọc lại phía app phòng khi UW bỏ qua min_premium ở endpoint này.
          if ((p.premium ?? 0) < MIN_PREMIUM) continue;
          if (p.trackingId && !(p.trackingId in store.prints)) {
            store.prints[p.trackingId] = p;
            saved++;
          }
        }
        store.watermarks[symbol] = new Date(at).toISOString();
      } catch (e: any) {
        const msg =
          e instanceof UwError && e.status
            ? `UW trả mã ${e.status}${e.body ? ` — ${e.body.slice(0, 120)}` : ''}`
            : String(e?.message ?? e);
        errors.push(`${symbol}: ${msg}`);
        // KHÔNG cập nhật watermark của mã lỗi - lần sau thử lại từ đầu
        // cửa sổ thay vì bỏ sót phần chưa lấy được.
      }
      await write(store);
    }
  } finally {
    inFlight = false;
  }

  lastRun = { at, symbolsChecked, seen, saved, errors };
  return lastRun;
}

export type SymbolDarkpoolPrints = {
  symbol: string;
  prints: DarkpoolPrint[];
  totalPremium: number;
  lastPrintAt: string | null;
};

export async function readDarkpool(symbols: string[]): Promise<SymbolDarkpoolPrints[]> {
  const store = await read();
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));

  const bySymbol = new Map<string, DarkpoolPrint[]>();
  for (const p of Object.values(store.prints)) {
    if (!wanted.has(p.ticker)) continue;
    if (Date.parse(p.executedAt) < cutoff) continue;
    if (!bySymbol.has(p.ticker)) bySymbol.set(p.ticker, []);
    bySymbol.get(p.ticker)!.push(p);
  }

  return [...bySymbol.entries()].map(([symbol, prints]) => {
    prints.sort((a, b) => b.executedAt.localeCompare(a.executedAt));
    return {
      symbol,
      prints,
      totalPremium: prints.reduce((n, p) => n + (p.premium ?? 0), 0),
      lastPrintAt: prints[0]?.executedAt ?? null,
    };
  });
}

/** Chỉ dùng cho kiểm thử. */
export const __store = STORE;
