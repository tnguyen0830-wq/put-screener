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
  /**
   * Đảng và bang. CHƯA XÁC NHẬN là UW có trả hai trường này ở
   * `/api/congress/recent-trades` (sandbox không có mạng) - nên đọc theo kiểu
   * dung thứ: có thì dùng, không có thì null và màn hình KHÔNG vẽ vòng màu
   * đảng. Đoán đảng của một nghị sĩ là bịa ra một sự thật chính trị, còn tệ
   * hơn để trống.
   */
  party: string | null;
  state: string | null;
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
    party: raw.party ?? null,
    state: raw.state ?? null,
    txnType: String(raw.txn_type ?? ''),
    amounts: raw.amounts ?? null,
    transactionDate: String(raw.transaction_date ?? ''),
    filedAtDate: raw.filed_at_date ?? null,
    notes: raw.notes ?? null,
  };
}

/**
 * Mua hay bán, hay không rõ.
 *
 * `other` là một phía THẬT, cùng bài học với `flowSide()` ở optionflow.ts
 * (#125): lúc chỉ in một chữ ra màn hình thì một giá trị lạ hiện thành
 * "mua" chỉ là lỗi trang trí, nhưng từ khi ĐẾM theo phía để vẽ thanh thì nó
 * thành một con số sai trông y như số đúng. UW viết đủ kiểu - "Purchase",
 * "Sale", "Sale (Partial)", "Exchange" - và họ thêm kiểu mới không báo.
 */
export type TradeSide = 'buy' | 'sell' | 'other';

export function tradeSide(txnType: string | null | undefined): TradeSide {
  const t = String(txnType ?? '').trim().toLowerCase();
  if (!t) return 'other';
  if (t.startsWith('purchase') || t.startsWith('buy')) return 'buy';
  if (t.startsWith('sale') || t.startsWith('sell')) return 'sell';
  return 'other';
}

/**
 * Số ngày từ lúc GIAO DỊCH tới lúc CÔNG BỐ.
 *
 * Đây là con số quan trọng nhất của cả tab này, và trước giờ không hiện ở
 * đâu cả. Giao diện nói "30-45 ngày" theo luật STOCK Act - nhưng đó là trần
 * pháp lý, không phải thực tế: lấy mẫu 250 bản ghi mới công bố cho trung vị
 * Thượng viện **116 ngày**, và **0/250** là giao dịch trong 7 ngày gần nhất
 * (ghi trong CLAUDE.md, mục khoảng trống chưa ai nhận).
 *
 * Không hiện nó ra thì tab này đọc như tín hiệu sống, trong khi nó là hồ sơ
 * lịch sử. Một bảng "ai đang mua" mà thật ra là "ai đã mua bốn tháng trước"
 * là thứ dẫn tới quyết định sai, chứ không phải thiếu thông tin.
 */
export function disclosureLagDays(t: {
  transactionDate: string;
  filedAtDate: string | null;
}): number | null {
  if (!t.filedAtDate || !t.transactionDate) return null;
  const from = Date.parse(`${t.transactionDate}T00:00:00Z`);
  const to = Date.parse(`${t.filedAtDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const days = Math.round((to - from) / 86_400_000);
  // Âm nghĩa là dữ liệu mâu thuẫn (công bố trước khi giao dịch) - trả null
  // chứ đừng in ra một con số vô lý trông như thật.
  return days >= 0 ? days : null;
}

/** Trung vị, không phải trung bình: một bản ghi trễ 3 năm kéo lệch trung
 *  bình, còn trung vị vẫn nói đúng "thường thì trễ bao lâu". */
export function medianLag(trades: CongressTrade[]): number | null {
  const xs = trades.map(disclosureLagDays).filter((d): d is number => d !== null).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

/**
 * Mã ảnh chân dung của nghị sĩ, theo chuẩn Bioguide ID.
 *
 * Ảnh lấy từ kho công khai `unitedstates/images` (ảnh thuộc phạm vi công
 * cộng của chính phủ Mỹ, không khoá, không theo dõi). Nó cần Bioguide ID -
 * và `politician_id` của UW CÓ THỂ là cái đó, chưa xác nhận được vì sandbox
 * không có mạng.
 *
 * Nên KHÔNG đoán: Bioguide ID có dạng rất riêng (một chữ cái + 6 chữ số, ví
 * dụ `P000197`). Chỉ khi id khớp đúng dạng đó mới dựng đường dẫn ảnh; không
 * khớp thì trả null và màn hình vẽ chữ cái đầu tên. Phép kiểm dạng CHÍNH LÀ
 * phép đo - không có ảnh vỡ, không có đường dẫn bịa.
 */
const BIOGUIDE_RE = /^[A-Z]\d{6}$/;

export function politicianPhoto(politicianId: string): string | null {
  const id = String(politicianId ?? '').trim().toUpperCase();
  if (!BIOGUIDE_RE.test(id)) return null;
  return `https://unitedstates.github.io/images/congress/225x275/${id}.jpg`;
}

export type CongressRun = {
  at: number;
  pagesRead: number;
  /** Tổng giao dịch UW trả về, trước khi lọc theo mã đang theo dõi. */
  seen: number;
  /** Giao dịch mới lưu thêm (đã lọc theo mã đang theo dõi). */
  saved: number;
  error: string | null;
  /**
   * HÌNH DẠNG THẬT của một bản ghi UW, đo tại lần đồng bộ này.
   *
   * Cùng khuôn `/api/uwprobe` và `/api/ttprobe`: sandbox không có mạng nên
   * mọi thứ viết ở đây đều là đoán từ tài liệu, và repo này đã bị đốt vì
   * chuyện đó nhiều lần. Hai câu hỏi đang không trả lời được từ màn hình -
   * "vì sao không có ảnh" và "vì sao không có đảng" - đều chỉ cần đúng một
   * lần đo: UW gọi các trường là gì, và `politician_id` trông ra sao.
   *
   * CHỈ tên khoá và MỘT mã định danh, không phải cả bản ghi: khoá và một id
   * công khai thì không lộ gì, còn đổ nguyên payload lên màn hình là chuyện
   * khác hẳn.
   */
  sampleKeys: string[] | null;
  samplePoliticianId: string | null;
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
    return (
      lastRun ?? {
        at: Date.now(), pagesRead: 0, seen: 0, saved: 0, error: null,
        sampleKeys: null, samplePoliticianId: null,
      }
    );
  }
  if (!uwConfigured()) {
    lastRun = {
      at: Date.now(), pagesRead: 0, seen: 0, saved: 0,
      error: 'UW_API_KEY chưa được cấu hình', sampleKeys: null, samplePoliticianId: null,
    };
    return lastRun;
  }

  inFlight = true;
  const at = Date.now();
  let pagesRead = 0;
  let seen = 0;
  let saved = 0;
  let error: string | null = null;
  let sampleKeys: string[] | null = null;
  let samplePoliticianId: string | null = null;

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
        if (!sampleKeys && raw && typeof raw === 'object') {
          sampleKeys = Object.keys(raw).sort();
          samplePoliticianId = raw.politician_id == null ? null : String(raw.politician_id);
        }
        const key = tradeKey(raw);
        const isNew = !(key in store.trades);
        if (isNew) allSeenAlready = false;
        // Chỉ giữ mã đang theo dõi - lọc PHÍA APP vì recent-trades không
        // có tham số ticker khi cần lấy nhiều mã một lượt.
        const ticker = String(raw.ticker ?? '').toUpperCase();
        if (ticker && wanted.has(ticker)) {
          /* GHI ĐÈ, không phải "chỉ ghi khi chưa có". Bản ghi cũ trên đĩa
             được phân tích bởi phiên bản code CŨ, nên nó thiếu đúng những
             trường mới thêm (`party`, `state`) - và vì khoá đã tồn tại, cách
             cũ sẽ bỏ qua nó mãi mãi. Hậu quả nhìn thấy được: thêm code đọc
             đảng xong, màn hình vẫn trống suốt 90 ngày cho tới khi bản ghi
             cũ hết hạn, và trông y như "UW không trả trường đó".
             `saved` vẫn chỉ đếm bản ghi MỚI, và `allSeenAlready` đã tính
             xong ở trên, nên cách dừng trang không đổi. */
          store.trades[key] = parseTrade(raw);
          if (isNew) saved++;
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

  lastRun = { at, pagesRead, seen, saved, error, sampleKeys, samplePoliticianId };
  return lastRun;
}

export type SymbolCongressTrades = {
  symbol: string;
  trades: CongressTrade[];
  /** Số nghị sĩ khác nhau đã giao dịch, không phải số lượt - cùng triết
   *  lý với insiders.ts: một người giao dịch 5 lần vẫn là một người. */
  traderCount: number;
  lastTradeDate: string | null;
  /** Số lượt MUA / BÁN / không rõ. `others` là một phía thật, không gộp
   *  lén vào mua - xem `tradeSide()`. */
  buys: number;
  sells: number;
  others: number;
  /** Trung vị số ngày từ giao dịch tới công bố cho riêng mã này.
   *  null = không bản ghi nào có ngày công bố. */
  medianLagDays: number | null;
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

    let buys = 0;
    let sells = 0;
    let others = 0;
    for (const t of trades) {
      const side = tradeSide(t.txnType);
      if (side === 'buy') buys++;
      else if (side === 'sell') sells++;
      else others++;
    }

    return {
      symbol,
      trades,
      traderCount: new Set(trades.map((t) => t.politicianId || t.name)).size,
      lastTradeDate: trades[0]?.transactionDate ?? null,
      buys,
      sells,
      /* Khác 0 nghĩa là UW gửi kiểu giao dịch lạ. Nói ra, đừng cộng lén vào
         "mua" rồi vẽ một cái thanh sai trông như đúng. */
      others,
      /** Thường thì mã này bị công bố trễ bao lâu. null = không tính được. */
      medianLagDays: medianLag(trades),
    };
  });
}

/** Chỉ dùng cho kiểm thử. */
export const __store = STORE;
