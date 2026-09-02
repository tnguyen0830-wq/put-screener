import fs from 'node:fs/promises';
import path from 'node:path';
import { uwConfigured, uwGet, UwError } from './unusualwhales';
import { trackedSymbols } from './insiders';

/**
 * Nghị sĩ Quốc hội Mỹ đang mua/bán mã nào - qua Unusual Whales, không
 * phải tự đọc hồ sơ khai báo gốc (khác Form 4: SEC không có sẵn dữ liệu
 * này ở dạng dễ đọc, đây là lý do UW là nguồn tốt hơn ở đây).
 *
 * BẪY QUAN TRỌNG, xác nhận từ tài liệu API thật: endpoint
 * `/api/congress/congress-trader` mặc định tham số `name` = "Nancy
 * Pelosi" khi KHÔNG truyền - gọi nó để lấy "toàn Quốc hội" sẽ âm thầm
 * chỉ trả về của một người, y hệt kiểu lỗi `osiSymbol()` từng mặc định
 * `right: 'P'`. Endpoint dùng ở đây là `/api/congress/recent-trades`
 * (không có tham số `name`, không dính bẫy đó).
 *
 * Không gọi riêng từng mã: với rổ theo dõi ~500+ mã, một lượt gọi/mã sẽ
 * tốn cả trăm request cho một tín hiệu vốn hiếm (không phải ngày nào
 * cũng có nghị sĩ giao dịch). Thay vào đó kéo luồng CHUNG (không lọc
 * ticker), tự lọc lại còn mã đang theo dõi - vài request một lượt thay
 * vì hàng trăm.
 */

const STORE = path.resolve(process.env.CONGRESS_PATH || './.cache/congress.json');

/** Cùng ngưỡng với Form 4 - tín hiệu chỉ có nghĩa khi còn mới. */
export const LOOKBACK_DAYS = 90;

/** Trang tối đa duyệt mỗi lượt đồng bộ - chặn trần chi phí kể cả lần đầu
 *  chưa có gì trong kho (200 mục/trang x 15 trang = 3000 giao dịch gần
 *  nhất, đủ phủ nhiều tuần). */
const MAX_PAGES = 15;
const PAGE_SIZE = 200;

export type CongressTrade = {
  /** Khoá dựng thủ công: UW không trả id giao dịch riêng. */
  key: string;
  politicianId: string;
  name: string;
  chamber: string | null;
  ticker: string;
  /** self / spouse / undisclosed / joint... giữ nguyên chữ UW trả về. */
  issuer: string | null;
  txnType: string;
  /** Chuỗi khoảng tiền nguyên văn kiểu STOCK Act, ví dụ
   *  "$500,001 - $1,000,000" - KHÔNG parse thành số, luật chỉ cho khai
   *  khoảng chứ không phải số chính xác. */
  amounts: string | null;
  transactionDate: string;
  filedAtDate: string | null;
  notes: string | null;
};

type Stored = {
  /** Giao dịch đã lưu, khoá theo `key`. */
  trades: Record<string, CongressTrade>;
  lastSyncAt: number | null;
};

async function read(): Promise<Stored> {
  try {
    const j = JSON.parse(await fs.readFile(STORE, 'utf8'));
    if (j && typeof j === 'object' && j.trades) return j;
  } catch {
    /* chưa đồng bộ lần nào */
  }
  return { trades: {}, lastSyncAt: null };
}

async function write(s: Stored): Promise<void> {
  await fs.mkdir(path.dirname(STORE), { recursive: true });
  await fs.writeFile(STORE, JSON.stringify(s));
}

/** UW không trả id giao dịch, nên khoá được dựng từ các trường xác định
 *  một giao dịch cụ thể - đủ để không lưu trùng khi trang sau lặp lại
 *  giao dịch trang trước đã thấy. */
function tradeKey(raw: any): string {
  return [raw.politician_id, raw.ticker, raw.transaction_date, raw.txn_type, raw.amounts, raw.notes]
    .map((v) => String(v ?? ''))
    .join('|');
}

function parseTrade(raw: any): CongressTrade {
  return {
    key: tradeKey(raw),
    politicianId: String(raw.politician_id ?? ''),
    name: String(raw.name ?? ''),
    chamber: raw.member_type ?? null,
    ticker: String(raw.ticker ?? '').toUpperCase(),
    issuer: raw.issuer ?? null,
    txnType: String(raw.txn_type ?? ''),
    amounts: raw.amounts ?? null,
    transactionDate: String(raw.transaction_date ?? ''),
    filedAtDate: raw.filed_at_date ?? null,
    notes: raw.notes ?? null,
  };
}

export type CongressRun = {
  at: number;
  pagesRead: number;
  /** Tổng giao dịch UW trả về, trước khi lọc theo mã đang theo dõi. */
  seen: number;
  /** Giao dịch mới lưu thêm (đã lọc theo mã đang theo dõi). */
  saved: number;
  error: string | null;
};

let lastRun: CongressRun | null = null;
export const getCongressLastRun = () => lastRun;

let inFlight = false;
export const congressSyncing = () => inFlight;

/**
 * Kéo luồng giao dịch Quốc hội gần đây, lọc lại còn mã đang theo dõi.
 *
 * Duyệt trang cho tới khi gặp TRANG TOÀN GIAO DỊCH ĐÃ THẤY (đủ để biết
 * đã bắt kịp lần đồng bộ trước) hoặc chạm MAX_PAGES. Giả định luồng của
 * UW sắp theo thời gian mới nhất trước - hợp lý với một endpoint tên
 * "recent-trades", và ghi rõ giả định này ở đây vì tài liệu không nói
 * thẳng ra.
 */
export async function syncCongress(): Promise<CongressRun> {
  if (inFlight) {
    return lastRun ?? { at: Date.now(), pagesRead: 0, seen: 0, saved: 0, error: null };
  }
  if (!uwConfigured()) {
    lastRun = { at: Date.now(), pagesRead: 0, seen: 0, saved: 0, error: 'UW_API_KEY chưa được cấu hình' };
    return lastRun;
  }

  inFlight = true;
  const at = Date.now();
  let pagesRead = 0;
  let seen = 0;
  let saved = 0;
  let error: string | null = null;

  try {
    const { symbols } = await trackedSymbols();
    const wanted = new Set(symbols.map((s) => s.toUpperCase()));
    const store = await read();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await uwGet<{ data?: any[] } | any[]>('/api/congress/recent-trades', {
        limit: PAGE_SIZE,
        page,
      });
      const rows: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      pagesRead = page;
      if (!rows.length) break;

      let allSeenAlready = true;
      for (const raw of rows) {
        seen++;
        const key = tradeKey(raw);
        if (!(key in store.trades)) allSeenAlready = false;
        // Chỉ giữ mã đang theo dõi - lọc PHÍA APP vì recent-trades không
        // có tham số ticker khi cần lấy nhiều mã một lượt.
        const ticker = String(raw.ticker ?? '').toUpperCase();
        if (ticker && wanted.has(ticker) && !(key in store.trades)) {
          store.trades[key] = parseTrade(raw);
          saved++;
        }
      }
      // Cả trang đều là giao dịch đã lưu từ lần trước -> đã bắt kịp,
      // không cần lật thêm trang cũ hơn.
      if (allSeenAlready) break;
    }

    store.lastSyncAt = at;
    await write(store);
  } catch (e: any) {
    error =
      e instanceof UwError && e.status
        ? `UW trả mã ${e.status}${e.body ? ` — ${e.body.slice(0, 150)}` : ''}`
        : String(e?.message ?? e);
  } finally {
    inFlight = false;
  }

  lastRun = { at, pagesRead, seen, saved, error };
  return lastRun;
}

export type SymbolCongressTrades = {
  symbol: string;
  trades: CongressTrade[];
  /** Số nghị sĩ khác nhau đã giao dịch, không phải số lượt - cùng triết
   *  lý với insiders.ts: một người giao dịch 5 lần vẫn là một người. */
  traderCount: number;
  lastTradeDate: string | null;
};

/** Đọc kết quả đã đồng bộ. Không chạm mạng. */
export async function readCongress(
  symbols: string[],
  opts: { now?: number } = {}
): Promise<SymbolCongressTrades[]> {
  const store = await read();
  const now = opts.now ?? Date.now();
  const cutoff = now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));

  const bySymbol = new Map<string, CongressTrade[]>();
  for (const t of Object.values(store.trades)) {
    if (!wanted.has(t.ticker)) continue;
    if (Date.parse(t.transactionDate + 'T00:00:00Z') < cutoff) continue;
    if (!bySymbol.has(t.ticker)) bySymbol.set(t.ticker, []);
    bySymbol.get(t.ticker)!.push(t);
  }

  return [...bySymbol.entries()].map(([symbol, trades]) => {
    trades.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    return {
      symbol,
      trades,
      traderCount: new Set(trades.map((t) => t.politicianId || t.name)).size,
      lastTradeDate: trades[0]?.transactionDate ?? null,
    };
  });
}

/** Chỉ dùng cho kiểm thử. */
export const __store = STORE;
