import fs from 'node:fs/promises';
import path from 'node:path';
import { uwConfigured, uwGet, UwError } from './unusualwhales';
import { trackedSymbols } from './insiders';
import { inMarketHours } from './alerts';

/**
 * Lệnh quyền chọn khối lượng lớn/bất thường, qua Unusual Whales
 * `flow-alerts` - UW tự lọc sẵn thành "đáng chú ý" (mỗi bản ghi có
 * `alert_rule` đặt tên hẳn hoi, ví dụ "RepeatedHits"), không phải mọi
 * lệnh quyền chọn thô. Vì đã được lọc sẵn nên không cần thêm ngưỡng lọc
 * riêng ở đây.
 *
 * Khác Congress trading ở chỗ GỌI THEO LÔ MÃ chứ không kéo luồng chung
 * rồi tự lọc: tham số `ticker_symbol` nhận danh sách mã cách nhau dấu
 * phẩy và lọc đúng thật - xác nhận bằng một lượt gọi thử thật
 * (`?ticker_symbol=AAPL,MSFT` chỉ trả về đúng hai mã đó). Với rổ theo
 * dõi ~500+ mã, gộp lô 50 mã/lần request rẻ hơn nhiều so với kéo cả
 * luồng thị trường rồi lọc phía app.
 *
 * Có `id` thật (UUID) trong mỗi bản ghi - không cần dựng khoá tổng hợp
 * như congress.ts phải làm (UW không trả id giao dịch cho Congress).
 *
 * Bỏ qua ngoài giờ giao dịch (trừ khi `force`, tức nút "Đồng bộ ngay"),
 * cùng lý do và cùng cách với darkpool.ts: quyền chọn chỉ khớp lệnh
 * trong giờ sàn mở cửa, tự động gọi lúc nửa đêm/cuối tuần không bỏ lỡ gì
 * mà chỉ tốn hạn mức. Chi phí ở đây vốn đã rẻ hơn hẳn dark pool nhờ gộp
 * lô 50 mã/request, nhưng vẫn nên chừa hạn mức - sự cố hết quota thật đã
 * xảy ra vì darkpool.ts (xem chú thích ở đó), không nên lặp lại kiểu sai
 * lầm "chắc còn thừa hạn mức" ở endpoint khác.
 */

const STORE = path.resolve(process.env.OPTIONFLOW_PATH || './.cache/optionflow.json');

/** Tín hiệu flow chỉ có nghĩa khi còn mới - ngắn hơn nhiều so với Form 4
 *  hay Congress (90 ngày): một lệnh bất thường từ tháng trước không còn
 *  liên quan gì tới quyết định bán put hôm nay. */
export const LOOKBACK_DAYS = 14;

const CHUNK_SIZE = 50;
const PAGE_SIZE = 200;
/** Chặn trần chi phí mỗi lô mã, đề phòng một lô có nhiều alert hơn dự
 *  kiến trong cửa sổ mặc định của UW (~60 ngày khi không truyền
 *  `newer_than`). */
const MAX_PAGES_PER_CHUNK = 3;

export type FlowAlert = {
  id: string;
  ticker: string;
  type: string;
  strike: number | null;
  expiry: string | null;
  optionChain: string | null;
  alertRule: string | null;
  hasSweep: boolean;
  hasFloor: boolean;
  hasMultileg: boolean;
  /** Tiền thật, KHÁC "amounts" của Congress - UW trả số premium chính
   *  xác (không phải khoảng do luật STOCK Act bắt buộc), nên parse
   *  thành số ở đây là đúng, không phải bịa ra độ chính xác không có. */
  totalPremium: number | null;
  volume: number | null;
  openInterest: number | null;
  tradeCount: number | null;
  underlyingPrice: number | null;
  createdAt: string;
};

type Stored = {
  alerts: Record<string, FlowAlert>;
  /** Watermark ISO, truyền lại làm `newer_than` lượt sau - tránh tải lại
   *  đúng những alert đã có. */
  lastSyncAt: string | null;
};

async function read(): Promise<Stored> {
  try {
    const j = JSON.parse(await fs.readFile(STORE, 'utf8'));
    if (j && typeof j === 'object' && j.alerts) return j;
  } catch {
    /* chưa đồng bộ lần nào */
  }
  return { alerts: {}, lastSyncAt: null };
}

async function write(s: Stored): Promise<void> {
  await fs.mkdir(path.dirname(STORE), { recursive: true });
  await fs.writeFile(STORE, JSON.stringify(s));
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseAlert(raw: any): FlowAlert {
  return {
    id: String(raw.id ?? ''),
    ticker: String(raw.ticker ?? '').toUpperCase(),
    type: String(raw.type ?? ''),
    strike: num(raw.strike),
    expiry: raw.expiry ?? null,
    optionChain: raw.option_chain ?? null,
    alertRule: raw.alert_rule ?? null,
    hasSweep: !!raw.has_sweep,
    hasFloor: !!raw.has_floor,
    hasMultileg: !!raw.has_multileg,
    totalPremium: num(raw.total_premium),
    volume: num(raw.volume),
    openInterest: num(raw.open_interest),
    tradeCount: num(raw.trade_count),
    underlyingPrice: num(raw.underlying_price),
    createdAt: String(raw.created_at ?? ''),
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type OptionFlowRun = {
  at: number;
  chunks: number;
  seen: number;
  saved: number;
  error: string | null;
  skipped: 'market-closed' | null;
};

let lastRun: OptionFlowRun | null = null;
export const getOptionFlowLastRun = () => lastRun;

let inFlight = false;
export const optionFlowSyncing = () => inFlight;

/** `force: true` bỏ qua giờ giao dịch - dùng cho nút "Đồng bộ ngay". */
export async function syncOptionFlow(force = false): Promise<OptionFlowRun> {
  if (inFlight) {
    return lastRun ?? { at: Date.now(), chunks: 0, seen: 0, saved: 0, error: null, skipped: null };
  }
  if (!uwConfigured()) {
    lastRun = {
      at: Date.now(),
      chunks: 0,
      seen: 0,
      saved: 0,
      error: 'UW_API_KEY chưa được cấu hình',
      skipped: null,
    };
    return lastRun;
  }
  if (!force && !inMarketHours()) {
    lastRun = { at: Date.now(), chunks: 0, seen: 0, saved: 0, error: null, skipped: 'market-closed' };
    return lastRun;
  }

  inFlight = true;
  const at = Date.now();
  let chunksRead = 0;
  let seen = 0;
  let saved = 0;
  let error: string | null = null;

  try {
    const { symbols } = await trackedSymbols();
    const store = await read();
    const watermark = store.lastSyncAt ?? undefined;

    for (const group of chunk(symbols, CHUNK_SIZE)) {
      chunksRead++;
      let olderThan: string | undefined;
      for (let page = 0; page < MAX_PAGES_PER_CHUNK; page++) {
        const res = await uwGet<{ data?: any[] } | any[]>('/api/option-trades/flow-alerts', {
          ticker_symbol: group.join(','),
          limit: PAGE_SIZE,
          newer_than: watermark,
          older_than: olderThan,
        });
        const rows: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        if (!rows.length) break;

        for (const raw of rows) {
          seen++;
          const a = parseAlert(raw);
          if (a.id && !(a.id in store.alerts)) {
            store.alerts[a.id] = a;
            saved++;
          }
        }
        // Trang chưa đầy -> đã hết dữ liệu cho lô mã này.
        if (rows.length < PAGE_SIZE) break;
        // Còn nhiều hơn - lùi mốc older_than về bản ghi cũ nhất vừa thấy.
        const oldest = rows[rows.length - 1]?.created_at;
        if (!oldest || oldest === olderThan) break;
        olderThan = oldest;
      }
      await write(store);
    }

    store.lastSyncAt = new Date(at).toISOString();
    await write(store);
  } catch (e: any) {
    error =
      e instanceof UwError && e.status
        ? `UW trả mã ${e.status}${e.body ? ` — ${e.body.slice(0, 150)}` : ''}`
        : String(e?.message ?? e);
  } finally {
    inFlight = false;
  }

  lastRun = { at, chunks: chunksRead, seen, saved, error, skipped: null };
  return lastRun;
}

export type SymbolFlowAlerts = {
  symbol: string;
  alerts: FlowAlert[];
  sweepCount: number;
  lastAlertAt: string | null;
};

export async function readOptionFlow(symbols: string[]): Promise<SymbolFlowAlerts[]> {
  const store = await read();
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));

  const bySymbol = new Map<string, FlowAlert[]>();
  for (const a of Object.values(store.alerts)) {
    if (!wanted.has(a.ticker)) continue;
    if (Date.parse(a.createdAt) < cutoff) continue;
    if (!bySymbol.has(a.ticker)) bySymbol.set(a.ticker, []);
    bySymbol.get(a.ticker)!.push(a);
  }

  return [...bySymbol.entries()].map(([symbol, alerts]) => {
    alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      symbol,
      alerts,
      sweepCount: alerts.filter((a) => a.hasSweep).length,
      lastAlertAt: alerts[0]?.createdAt ?? null,
    };
  });
}

/** Chỉ dùng cho kiểm thử. */
export const __store = STORE;
