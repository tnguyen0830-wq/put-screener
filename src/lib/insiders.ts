import fs from 'node:fs/promises';
import path from 'node:path';
import { ciksFor, recentFilings, form4sSince, getText, SecError, type Filing } from './sec';
import { archiveXmlUrl, openMarketBuys, parseForm4, type Form4 } from './form4';

/**
 * Người nội bộ có đang tự bỏ tiền mua cổ phiếu công ty mình không.
 *
 * Chỉ theo dõi những mã app này đã quan tâm sẵn (watchlist + đang giữ),
 * không quét cả sàn: một lần đồng bộ tốn 1 request/mã cho danh sách hồ
 * sơ, cộng 1 request cho mỗi Form 4 CHƯA từng đọc.
 *
 * Ba tầng nhớ, theo mức độ thay đổi của từng thứ:
 *   - Danh bạ mã -> CIK: gần như không đổi. Nằm ở lib/sec.ts, một ngày.
 *   - Danh sách hồ sơ của một công ty: đổi khi có người nộp. Một ngày.
 *   - Bản thân một Form 4: KHÔNG BAO GIỜ đổi. Tải đúng một lần, giữ mãi.
 *
 * Tầng thứ ba là lý do việc này rẻ dần theo thời gian: sau vài tuần, mỗi
 * ngày chỉ còn phải tải vài hồ sơ mới.
 */

const STORE = path.resolve(process.env.INSIDER_PATH || './.cache/insiders.json');

/** Tín hiệu người nội bộ chỉ có nghĩa khi còn mới. */
export const LOOKBACK_DAYS = 90;
/** Từ bao nhiêu người mua trở lên thì gọi là "cả nhóm cùng mua". */
export const CLUSTER_MIN_BUYERS = 2;

export type InsiderBuy = {
  accessionNumber: string;
  filingDate: string;
  ownerName: string;
  ownerCik: string;
  title: string;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  shares: number;
  /** null khi SEC không ghi giá - có xảy ra, và không được đoán bừa. */
  value: number | null;
  url: string;
};

export type SymbolInsiders = {
  symbol: string;
  buys: InsiderBuy[];
  /** Số người KHÁC NHAU đã mua trong kỳ. Quan trọng hơn số lượt mua. */
  buyerCount: number;
  /** Tổng tiền bỏ ra, null nếu có hồ sơ thiếu giá. */
  totalValue: number | null;
  clusterBuy: boolean;
  /** Ngày mua gần nhất, để biết tín hiệu còn mới hay đã nguội. */
  lastBuyDate: string | null;
  /** Lần cuối hỏi SEC về mã này THÀNH CÔNG. */
  checkedAt: number | null;
  /**
   * Lần làm mới gần nhất thất bại vì sao. Đứng độc lập với `checkedAt`:
   * số liệu cũ vẫn hiện được, kèm lời thú nhận là nó đã cũ - giống cách
   * volwatch giữ lại số đo cuối cùng thay vì xoá trắng.
   */
  lastError: string | null;
  /**
   * Vì sao mã này không có dữ liệu. null nghĩa là ĐÃ hỏi và SEC trả lời
   * là không có ai mua - khác hẳn với chưa hỏi được. Đây là chỗ dễ đọc
   * nhầm nhất trong cả tính năng: một bảng trống trông y hệt nhau ở hai
   * trường hợp trái ngược.
   *
   * Trả về MÃ chứ không phải câu chữ, để màn hình tự dịch. Câu tiếng Việt
   * cứng trong này từng lọt thẳng ra giao diện tiếng Anh.
   */
  unavailable: 'never-checked' | 'no-filer' | 'fetch-failed' | null;
};

type Stored = {
  /** Form 4 đã đọc, khoá theo số hiệu hồ sơ. Không bao giờ đọc lại. */
  filings: Record<string, StoredFiling>;
  /** Lần cuối hỏi SEC về từng mã, và hỏi có ra gì không. */
  symbols: Record<
    string,
    {
      /** Chỉ đặt khi hỏi ĐƯỢC. Thiếu nó nghĩa là chưa từng có dữ liệu. */
      checkedAt?: number;
      /** Câu trả lời dứt khoát: mã này vốn không có hồ sơ nào (ETF, quỹ). */
      noFiler?: true;
      /** Lần thử gần nhất hỏng vì sao. Khác hẳn `error` ở trên. */
      lastError?: string;
    }
  >;
};

type StoredFiling = {
  symbol: string;
  filingDate: string;
  url: string;
  plan10b5One: boolean;
  owners: Form4['owners'];
  buys: { shares: number; price: number | null }[];
};

async function read(): Promise<Stored> {
  try {
    const j = JSON.parse(await fs.readFile(STORE, 'utf8'));
    if (j && typeof j === 'object' && j.filings && j.symbols) return j;
  } catch {
    /* chưa đồng bộ lần nào */
  }
  return { filings: {}, symbols: {} };
}

async function write(s: Stored): Promise<void> {
  await fs.mkdir(path.dirname(STORE), { recursive: true });
  await fs.writeFile(STORE, JSON.stringify(s));
}

/**
 * Hỏi SEC về những mã đã quá hạn kiểm tra.
 *
 * Trả về số việc đã làm, để cái vòng lặp nền còn có thứ mà in ra - một
 * bộ đếm đứng yên đọc ra là "hỏng", còn im lặng thì đọc ra là "ổn".
 */
export async function syncInsiders(
  symbols: string[],
  opts: { maxAgeMs?: number; now?: number } = {}
): Promise<{ checked: number; fetched: number; errors: Record<string, string> }> {
  const maxAge = opts.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const now = opts.now ?? Date.now();
  const store = await read();
  const errors: Record<string, string> = {};
  let checked = 0;
  let fetched = 0;

  const wanted = [...new Set(symbols.map((s) => s.trim().toUpperCase()))].filter(
    (s) => {
      const seen = store.symbols[s];
      return s && !(seen?.checkedAt !== undefined && now - seen.checkedAt < maxAge);
    }
  );
  if (!wanted.length) return { checked, fetched, errors };

  let found: Record<string, string>;
  let missing: string[];
  try {
    ({ found, missing } = await ciksFor(wanted));
  } catch (e: any) {
    // Không tra được danh bạ thì không mã nào hỏi được. Ghi lỗi thật ra,
    // đừng đánh dấu là "đã kiểm tra, không có gì".
    for (const s of wanted) errors[s] = e?.message ?? String(e);
    return { checked, fetched, errors };
  }

  for (const s of missing) {
    // ETF và quỹ không có ai nộp Form 4. Đây là câu trả lời dứt khoát,
    // không phải lỗi, nên vẫn đánh dấu là đã kiểm tra.
    store.symbols[s] = { checkedAt: now, noFiler: true };
    checked++;
  }

  for (const [symbol, cik] of Object.entries(found)) {
    try {
      const recent: Filing[] = await recentFilings(cik);
      for (const f of form4sSince(recent, LOOKBACK_DAYS, now)) {
        // Một Form 4 đã nộp thì không đổi nữa. Đọc rồi là thôi.
        if (store.filings[f.accessionNumber]) continue;
        const url = archiveXmlUrl(cik, f.accessionNumber, f.primaryDocument);
        try {
          const parsed = parseForm4(await getText(url));
          fetched++;
          store.filings[f.accessionNumber] = {
            symbol,
            filingDate: f.filingDate,
            url,
            plan10b5One: parsed.plan10b5One,
            owners: parsed.owners,
            buys: openMarketBuys(parsed).map((b) => ({
              shares: b.shares ?? 0,
              price: b.pricePerShare,
            })),
          };
        } catch (e: any) {
          // Một hồ sơ hỏng không được làm hỏng cả mã. Bỏ qua hồ sơ đó,
          // lần sau thử lại (không ghi vào kho nên nó vẫn "chưa đọc").
          errors[`${symbol}:${f.accessionNumber}`] = e?.message ?? String(e);
        }
      }
      // Chạy lọt thì xoá lỗi cũ đi, đừng để một lần hỏng từ tuần trước
      // còn dán trên màn hình mãi.
      store.symbols[symbol] = { checkedAt: now };
      checked++;
    } catch (e: any) {
      const msg =
        e instanceof SecError && e.status
          ? `SEC trả mã ${e.status}${e.body ? ` — ${e.body.slice(0, 120)}` : ''}`
          : e?.message ?? String(e);
      errors[symbol] = msg;
      // KHÔNG đụng vào `checkedAt`: lần chạy sau phải thử lại, và trên
      // màn hình mã này phải hiện là "chưa lấy được", không phải "sạch".
      // Nhưng có ghi lại lý do, để "hỏi SEC không được" không đọc thành
      // "chưa hỏi bao giờ" - hai chuyện đó sửa bằng hai cách khác nhau.
      store.symbols[symbol] = { ...(store.symbols[symbol] ?? {}), lastError: msg };
    }
  }

  await write(store);
  return { checked, fetched, errors };
}

/** Đọc kết quả đã đồng bộ. Không chạm mạng, nên trang mở ra là có ngay. */
export async function readInsiders(
  symbols: string[],
  opts: { now?: number } = {}
): Promise<SymbolInsiders[]> {
  const now = opts.now ?? Date.now();
  const store = await read();
  const cutoff = now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  return [...new Set(symbols.map((s) => s.trim().toUpperCase()))]
    .filter(Boolean)
    .map((symbol) => {
      const meta = store.symbols[symbol];
      const buys: InsiderBuy[] = [];

      for (const [accessionNumber, f] of Object.entries(store.filings)) {
        if (f.symbol !== symbol || !f.buys.length) continue;
        if (Date.parse(f.filingDate + 'T00:00:00Z') < cutoff) continue;
        const owner = f.owners[0];
        const shares = f.buys.reduce((n, b) => n + b.shares, 0);
        const priced = f.buys.every((b) => b.price !== null);
        buys.push({
          accessionNumber,
          filingDate: f.filingDate,
          ownerName: owner?.name ?? '',
          ownerCik: owner?.cik ?? '',
          title: owner?.title ?? '',
          isDirector: owner?.isDirector ?? false,
          isOfficer: owner?.isOfficer ?? false,
          isTenPercentOwner: owner?.isTenPercentOwner ?? false,
          shares,
          value: priced ? f.buys.reduce((n, b) => n + b.shares * (b.price as number), 0) : null,
          url: f.url,
        });
      }

      buys.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
      // Đếm theo NGƯỜI, không theo lượt: một người mua năm lần vẫn là một
      // người tin tưởng, còn năm người mua mỗi người một lần thì mạnh hơn
      // hẳn. Đếm theo CIK vì cùng một người có thể ghi tên khác nhau.
      const buyerCount = new Set(buys.map((b) => b.ownerCik || b.ownerName)).size;
      const anyUnpriced = buys.some((b) => b.value === null);

      return {
        symbol,
        buys,
        buyerCount,
        totalValue: anyUnpriced ? null : buys.reduce((n, b) => n + (b.value ?? 0), 0),
        clusterBuy: buyerCount >= CLUSTER_MIN_BUYERS,
        lastBuyDate: buys[0]?.filingDate ?? null,
        checkedAt: meta?.checkedAt ?? null,
        lastError: meta?.lastError ?? null,
        // Bốn trạng thái, và chúng KHÔNG được hiện giống nhau: chưa hỏi
        // bao giờ / mã vốn không có hồ sơ / hỏi hỏng chưa có gì / đã hỏi
        // xong và đúng là không ai mua (unavailable = null).
        unavailable: meta?.noFiler
          ? 'no-filer'
          : meta?.checkedAt !== undefined
            ? null
            : meta?.lastError
              ? 'fetch-failed'
              : 'never-checked',
      };
    });
}

/** Chỉ dùng cho kiểm thử. */
export const __store = STORE;

/* ------------------------------------------------------------------ */
/* Chạy nền: những mã app này vốn đã theo dõi                          */
/* ------------------------------------------------------------------ */

export type InsiderRun = {
  at: number;
  checked: number;
  fetched: number;
  symbols: number;
  errors: string[];
  /** Không lấy được danh sách mã đang giữ thì nói ra, đừng lặng lẽ bỏ sót. */
  holdingsError: string | null;
};

let lastRun: InsiderRun | null = null;
export const getInsiderLastRun = () => lastRun;

/**
 * Những mã cần hỏi SEC: watchlist cộng với những mã đang thật sự giữ.
 *
 * Mã đang giữ quan trọng hơn cả: đó là chỗ tiền đang nằm. Nhưng nó phải
 * đi qua Schwab, mà phiên Schwab thì hết hạn sau 7 ngày - nên hỏng phần
 * đó không được kéo sập cả tính năng. Watchlist đọc từ đĩa, luôn có.
 */
export async function trackedSymbols(): Promise<{
  symbols: string[];
  holdingsError: string | null;
}> {
  const { readWatchlist } = await import('./watchlist');
  const list = await readWatchlist().catch(() => [] as string[]);
  let holdingsError: string | null = null;
  let held: string[] = [];
  try {
    const { loadPortfolio } = await import('./portfolio');
    const pf = await loadPortfolio();
    held = pf.rows.map((r: any) => r.symbol).filter(Boolean);
  } catch (e: any) {
    holdingsError = String(e?.message ?? e);
  }
  return {
    symbols: [...new Set([...list, ...held].map((s) => s.toUpperCase()))],
    holdingsError,
  };
}

/**
 * Một lượt đồng bộ. Gọi được nhiều lần thoải mái: `syncInsiders` tự bỏ
 * qua mã đã hỏi trong ngày, nên chạy mỗi 15 phút cũng chỉ tốn mạng một
 * lần mỗi ngày.
 */
export async function syncTracked(force = false): Promise<InsiderRun> {
  const at = Date.now();
  const { symbols, holdingsError } = await trackedSymbols();
  const r = await syncInsiders(symbols, force ? { maxAgeMs: 0 } : {});
  lastRun = {
    at,
    checked: r.checked,
    fetched: r.fetched,
    symbols: symbols.length,
    errors: Object.entries(r.errors).map(([k, v]) => `${k}: ${v}`),
    holdingsError,
  };
  return lastRun;
}
