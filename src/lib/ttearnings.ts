import fs from 'node:fs/promises';
import path from 'node:path';
import { ttConfigured, ttGet, TtError } from './tastytrade';

/**
 * Lịch earnings lấy từ tastytrade `/market-metrics`.
 *
 * Đây là thứ vá lỗ hổng #131. `data/earnings.json` chỉ dựng cho watchlist,
 * nên quét cả S&P 500 thì ~450 mã đi qua cổng "không có earnings trong kỳ
 * hợp đồng" vì KHÔNG CÓ DỮ LIỆU chứ không phải vì không có earnings. #131
 * làm cho chuyện đó NHÌN THẤY được (`unknown: true`); file này làm cho nó
 * BIẾN MẤT với mọi mã tastytrade phủ được.
 *
 * ĐO THẬT từ production 2026-09-16, không phải đọc tài liệu:
 *
 *   AAPL  earnings = {visible: true,  expected-report-date: "2026-10-29",
 *                     estimated: false, quarter-end-date, actual-eps, …}
 *   SPY   earnings = {visible: false, estimated: false, late-flag: 0}
 *
 * SPY là ETF nên KHÔNG CÓ earnings, và tastytrade nói ra điều đó bằng
 * `visible: false` cộng với việc không gửi `expected-report-date` - chứ
 * không phải bằng cách im lặng. Đó chính là ranh giới mà cả #131 xoay
 * quanh: "đã hỏi, mã này không có earnings" là một câu trả lời THẬT, khác
 * hẳn "chưa ai hỏi mã này bao giờ".
 *
 * File này giờ CŨNG lưu IV rank (`parseIvRank`, kho `ivRanks`) - cùng bản
 * ghi `/market-metrics`, cùng lượt gọi, không tốn thêm request nào. Dùng
 * cho chỉ báo "IV rank trung bình" ở tab Bề rộng thị trường (`lib/
 * internals.ts`) - CLAUDE.md từng ghi đây là việc "cố ý CHƯA làm" vì hai
 * bẫy thật (ba trường IV rank khác nhau đọc lệch nhau tới ~6 điểm, và
 * thang 0-1 của tastytrade khác thang 0-100 của app) - cả hai bẫy đó nằm
 * hết trong `parseIvRank()`, không lặp lại ở nơi gọi.
 */

/**
 * Kho nằm cạnh `SCAN_PATH` (tức /var/data ở production), KHÔNG ở `.cache/`.
 *
 * Bản đầu (#135) để ở `.cache/` với lập luận "mất được, dựng lại được, ~6
 * request". Lập luận đó đúng về chi phí và SAI về thời gian: `.cache` bị xoá
 * ở MỖI lần deploy (có ngày năm lần), và lượt đồng bộ lại chỉ chạy khi vòng
 * lặp nền đã khởi động VÀ đã chờ đủ 15 phút - nên phần lớn thời gian cả tab
 * Analyze, Screener lẫn My Portfolio đều không có ngày earnings nào từ
 * tastytrade. Chủ app: *"Tại sao analysis hay các tab đều không có ngày ER"*.
 *
 * Suy từ THƯ MỤC của `SCAN_PATH` chứ không thêm biến môi trường - đúng lối
 * `lt-store.ts` né bẫy `USERS_PATH` (Render không tự thêm biến vào service
 * đã tạo, và dữ liệu lặng lẽ rơi vào thư mục build). `TT_EARNINGS_PATH` vẫn
 * thắng nếu có đặt.
 */
function storePath(): string {
  if (process.env.TT_EARNINGS_PATH) return path.resolve(process.env.TT_EARNINGS_PATH);
  const base = process.env.SCAN_PATH || './.cache/last-scan.json';
  return path.resolve(path.join(path.dirname(base), 'ttearnings.json'));
}
/** Chỗ cũ. Chỉ đọc khi chỗ mới chưa có gì (máy dev đã đồng bộ từ trước). */
const LEGACY_STORE = path.resolve('./.cache/ttearnings.json');

/**
 * Bao nhiêu mã một lượt gọi.
 *
 * CHƯA ĐO được trần thật của endpoint (mới xác nhận 8/8 và 1/1). 100 là
 * chọn thận trọng, và quan trọng hơn: mỗi lô đều ĐỐI CHIẾU số mã hỏi với
 * số mã về, mã rơi được ghi lại và báo ra (`missing`). Nên trần có thấp
 * hơn 100 thì nó lộ ra thành một con số, không phải thành một khoảng
 * trống im lặng trong cổng - đúng thứ file này sinh ra để chặn.
 */
const BATCH = 100;

/** Ngày báo cáo đổi rất chậm; hỏi lại mỗi mã nhiều nhất một lần một ngày. */
const TTL_MS = 24 * 60 * 60 * 1000;

export type TtEarningsRecord = {
  /** Ngày báo cáo kế tiếp, hoặc null khi tastytrade nói mã này không có
   *  earnings (ETF). null ở đây là một CÂU TRẢ LỜI, không phải chỗ trống. */
  date: string | null;
  /** tastytrade tự đánh dấu ngày này là ước tính hay đã xác nhận. Một ngày
   *  đoán và một ngày chắc không được hiện giống nhau. */
  estimated: boolean;
  /** `earnings.visible`. false = công cụ này không có khái niệm earnings. */
  visible: boolean;
  fetchedAt: number;
};

export type TtIvRankRecord = {
  /** 0-100. tastytrade trả 0-1; nhân 100 đúng MỘT LẦN ở biên này. null khi
   *  tastytrade không trả trường này cho mã đó. */
  value: number | null;
  fetchedAt: number;
};

type Stored = {
  records: Record<string, TtEarningsRecord>;
  /** Cùng lượt gọi /market-metrics với `records` - không tốn thêm request
   *  nào để có IV rank, chỉ đọc thêm một trường từ đúng bản ghi đã có. */
  ivRanks: Record<string, TtIvRankRecord>;
  lastSyncAt: number | null;
  /** Lượt đồng bộ gần nhất, lưu TRÊN ĐĨA chứ không chỉ trong RAM: mỗi route
   *  của Next là một bundle riêng với bản sao module riêng (#193), nên biến
   *  `lastRun` của vòng lặp nền không bao giờ tới được route Analyze. */
  lastRun?: TtEarningsRun | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Một bản ghi `/market-metrics` -> trạng thái earnings, hoặc null khi chưa
 * kết luận được.
 *
 * Ba lối ra, và việc tách chúng CHÍNH LÀ điểm của hàm này:
 *
 *   visible === false            -> đã hỏi, mã này không có earnings  -> date null
 *   visible === true  + có ngày  -> đã hỏi, có ngày                   -> date
 *   visible === true  + KHÔNG có -> tastytrade biết mã này báo cáo nhưng
 *                                   hiện chưa có ngày -> CHƯA BIẾT, trả null
 *                                   để mã không vào kho và cổng vẫn gắn cờ
 *                                   `unknown`.
 *
 * Lối ra thứ ba là lối dễ làm sai nhất: gộp nó vào "không có earnings" sẽ
 * vẽ một dấu ✓ chắc nịch lên đúng thứ chưa ai biết - lặp lại nguyên vẹn lỗi
 * #131 vừa sửa, chỉ là ở một tầng sâu hơn.
 */
export function parseEarnings(rec: any, now = Date.now()): TtEarningsRecord | null {
  const e = rec?.earnings;
  if (!e || typeof e !== 'object') return null;

  const visible = e.visible === true;
  const raw = e['expected-report-date'];
  const date = typeof raw === 'string' && DATE_RE.test(raw.trim()) ? raw.trim() : null;

  if (!visible) return { date: null, estimated: false, visible: false, fetchedAt: now };
  if (!date) return null;
  return { date, estimated: e.estimated === true, visible: true, fetchedAt: now };
}

/**
 * IV rank 0-100, đọc RÕ MỘT nguồn - `tos-implied-volatility-index-rank`,
 * không phải trường chung `implied-volatility-index-rank`.
 *
 * CLAUDE.md đã cảnh báo trường chung chỉ ÂM THẦM trỏ theo
 * `implied-volatility-index-rank-source` (hiện đang trỏ "tos", nhưng đó là
 * một con trỏ có thể đổi hướng bất kỳ lúc nào) - đọc trường chung là đọc
 * theo con trỏ đó chứ không phải một nguồn cố định. Chọn "tos" một cách
 * TƯỜNG MINH vì đó là nền thinkorswim chủ app đối chiếu ở nơi khác trong
 * app này.
 *
 * tastytrade trả 0-1 (phân số); app này dùng thang 0-100 khắp nơi khác
 * (ivRank() trong gex.ts) - nhân 100 đúng MỘT LẦN ở biên này, không để lọt
 * ra ngoài dưới dạng phân số rồi bị hiểu nhầm là phần trăm.
 */
export function parseIvRank(rec: any): number | null {
  const raw = rec?.['tos-implied-volatility-index-rank'];
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  return Number.isFinite(n) ? n * 100 : null;
}

async function readFile(file: string): Promise<Stored | null> {
  try {
    const j = JSON.parse(await fs.readFile(file, 'utf8'));
    // `ivRanks` không có trong file cũ (trước khi trường này tồn tại) - đọc
    // dung thứ, mặc định rỗng, chứ không coi file cũ là hỏng.
    if (j && typeof j === 'object' && j.records) return { ivRanks: {}, lastSyncAt: null, ...j };
  } catch {
    /* chưa có file */
  }
  return null;
}

async function read(): Promise<Stored> {
  const file = storePath();
  const cur = await readFile(file);
  if (cur) return cur;
  if (file !== LEGACY_STORE) {
    const old = await readFile(LEGACY_STORE);
    if (old) return old;
  }
  return { records: {}, ivRanks: {}, lastSyncAt: null };
}

/**
 * Ghi kiểu GỘP chứ không đè cả file.
 *
 * Hai nơi ghi vào cùng kho: lượt đồng bộ cả rổ (vòng lặp nền, đọc lúc đầu
 * và ghi lúc cuối - có thể cách nhau vài phút) và lượt hỏi MỘT mã từ tab
 * Analyze. Ghi đè thẳng thì lượt đồng bộ dài sẽ xoá mất bản ghi Analyze vừa
 * lấy giữa chừng. Nên đọc lại đĩa ngay trước khi ghi, và mỗi mã giữ bản ghi
 * MỚI HƠN (`fetchedAt`). Không bao giờ xoá bản ghi nào.
 *
 * Ghi tạm rồi đổi tên: sập giữa chừng không để lại JSON cụt ở chỗ cả ba tab
 * đọc.
 */
async function write(s: Stored): Promise<void> {
  const file = storePath();
  const disk = (await readFile(file)) ?? { records: {}, ivRanks: {}, lastSyncAt: null };
  const out: Stored = {
    records: mergeNewer(disk.records, s.records),
    ivRanks: mergeNewer(disk.ivRanks, s.ivRanks),
    lastSyncAt: Math.max(disk.lastSyncAt ?? 0, s.lastSyncAt ?? 0) || null,
    lastRun: s.lastRun !== undefined ? s.lastRun : disk.lastRun ?? null,
  };
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(out));
  await fs.rename(tmp, file);
}

export function mergeNewer<T extends { fetchedAt: number }>(
  a: Record<string, T>,
  b: Record<string, T>
): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (!out[k] || v.fetchedAt >= out[k].fetchedAt) out[k] = v;
  }
  return out;
}

/**
 * Kho đã đồng bộ, đổi sang đúng hình dạng `data/earnings.json` dùng.
 *
 * Mã "không có earnings" ra MẢNG RỖNG chứ không bị bỏ ra ngoài - và đó là
 * cả mẹo tích hợp: cổng đọc `!(symbol in earnings)` để biết "chưa biết",
 * nên một mảng rỗng nói đúng "đã kiểm, không có gì" mà không phải sửa một
 * dòng nào của cổng. Khuôn đã có sẵn từ #131; chỗ này chỉ đổ dữ liệu thật
 * vào.
 */
export async function loadTtEarnings(): Promise<Record<string, string[]>> {
  const store = await read();
  const out: Record<string, string[]> = {};
  for (const [sym, r] of Object.entries(store.records)) {
    out[sym] = r.date ? [r.date] : [];
  }
  return out;
}

/** Chi tiết cho màn hình: ngày này là ước tính hay đã xác nhận. */
export async function ttEarningsDetail(): Promise<Record<string, TtEarningsRecord>> {
  return (await read()).records;
}

/**
 * IV rank đã đồng bộ, theo mã. `null` cho một mã nghĩa là ĐÃ HỎI nhưng
 * tastytrade không trả trường này cho mã đó (khác hẳn mã chưa từng được
 * hỏi - mã đó đơn giản không có mặt trong object trả về ở đây).
 */
export async function loadTtIvRanks(): Promise<Record<string, number | null>> {
  const store = await read();
  const out: Record<string, number | null> = {};
  for (const [sym, r] of Object.entries(store.ivRanks)) out[sym] = r.value;
  return out;
}

export type TtEarningsRun = {
  at: number;
  asked: number;
  returned: number;
  /** Mã hỏi mà KHÔNG về. Một cái gate phải biết mình đang không phủ mã nào. */
  missing: string[];
  /** Mã về nhưng chưa kết luận được (tastytrade bảo có báo cáo, chưa có ngày). */
  undecided: string[];
  saved: number;
  batches: number;
  skipped: 'not-configured' | null;
  error: string | null;
};

let lastRun: TtEarningsRun | null = null;
export const getTtEarningsLastRun = () => lastRun;

let inFlight = false;
export const ttEarningsSyncing = () => inFlight;

/**
 * Kéo ngày earnings cho các mã đưa vào, bỏ qua mã đã hỏi trong 24 giờ.
 *
 * Một lô lỗi được BỎ QUA chứ không làm hỏng cả lượt: mất một lô là mất
 * ~100 mã trong lần này (chúng giữ nguyên trạng thái "chưa biết", đúng
 * nghĩa), còn ném ra ngoài là mất tất cả những lô đã lấy được.
 */
export async function syncTtEarnings(symbols: string[]): Promise<TtEarningsRun> {
  if (inFlight) {
    return lastRun ?? { at: Date.now(), asked: 0, returned: 0, missing: [], undecided: [], saved: 0, batches: 0, skipped: null, error: null };
  }
  if (!ttConfigured()) {
    lastRun = { at: Date.now(), asked: 0, returned: 0, missing: [], undecided: [], saved: 0, batches: 0, skipped: 'not-configured', error: null };
    await write({ records: {}, ivRanks: {}, lastSyncAt: null, lastRun }).catch(() => {});
    return lastRun;
  }

  inFlight = true;
  const at = Date.now();
  let returned = 0;
  let saved = 0;
  let batches = 0;
  const missing: string[] = [];
  const undecided: string[] = [];
  let error: string | null = null;

  try {
    const store = await read();
    const want = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].filter(
      (s) => !(store.records[s] && at - store.records[s].fetchedAt < TTL_MS)
    );

    for (let i = 0; i < want.length; i += BATCH) {
      const lot = want.slice(i, i + BATCH);
      batches++;
      try {
        const { data } = await ttGet<any>('/market-metrics', { symbols: lot.join(',') });
        const body = data?.data ?? data;
        const items: any[] = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [];
        const seen = new Set<string>();
        for (const rec of items) {
          const sym = String(rec?.symbol ?? '').toUpperCase();
          if (!sym) continue;
          seen.add(sym);
          returned++;
          const parsed = parseEarnings(rec, at);
          if (parsed) {
            store.records[sym] = parsed;
            saved++;
          } else {
            /* tastytrade trả lời nhưng chưa kết luận được. KHÔNG ghi vào
               kho: để trống thì cổng vẫn gắn cờ "chưa biết", đúng sự thật. */
            undecided.push(sym);
          }
          // IV rank ghi ĐỘC LẬP với việc earnings có kết luận được hay
          // không - cùng bản ghi, cùng lượt gọi, không tốn thêm request nào.
          store.ivRanks[sym] = { value: parseIvRank(rec), fetchedAt: at };
        }
        for (const s of lot) if (!seen.has(s)) missing.push(s);
      } catch (e: any) {
        /* Lô hỏng thì cả lô coi như chưa hỏi - đúng nghĩa, và những lô
           trước đó vẫn được giữ lại. */
        for (const s of lot) missing.push(s);
        if (!error) {
          error =
            e instanceof TtError && e.status
              ? `tastytrade trả mã ${e.status}${e.body ? ` — ${e.body.slice(0, 150)}` : ''}`
              : String(e?.message ?? e);
        }
      }
    }

    store.lastSyncAt = at;
    lastRun = { at, asked: want.length, returned, missing, undecided, saved, batches, skipped: null, error };
    store.lastRun = lastRun;
    await write(store);
  } catch (e: any) {
    lastRun = { at, asked: 0, returned, missing, undecided, saved, batches, skipped: null, error: String(e?.message ?? e) };
    await write({ records: {}, ivRanks: {}, lastSyncAt: null, lastRun }).catch(() => {});
  } finally {
    inFlight = false;
  }

  return lastRun!;
}

/** Trạng thái kho cho màn hình - đọc TỪ ĐĨA (xem `Stored.lastRun`). */
export type TtEarningsStatus = {
  configured: boolean;
  symbols: number;
  lastSyncAt: number | null;
  lastRun: TtEarningsRun | null;
};

export async function ttEarningsStatus(): Promise<TtEarningsStatus> {
  const s = await read();
  return {
    configured: ttConfigured(),
    symbols: Object.keys(s.records).length,
    lastSyncAt: s.lastSyncAt,
    lastRun: s.lastRun ?? null,
  };
}

export type TtEarningsLookup = {
  configured: boolean;
  /** Bản ghi có kết luận (có ngày, hoặc "không có earnings"); null = chưa biết. */
  record: TtEarningsRecord | null;
  /** true khi lượt này thật sự ra mạng (bản ghi cũ hơn 24 giờ hoặc chưa có). */
  asked: boolean;
  /** tastytrade trả lời mã này nhưng chưa có ngày - vẫn là CHƯA BIẾT. */
  undecided: boolean;
  /** Mã hỏi mà tastytrade không trả bản ghi nào. */
  missing: boolean;
  error: string | null;
};

/**
 * Ngày earnings của ĐÚNG MỘT mã, cho tab Analyze.
 *
 * Lượt đồng bộ nền chỉ phủ mã được theo dõi (S&P 500 + watchlist + mã đang
 * giữ), nên mở Analyze một mã ngoài danh sách đó thì kho không bao giờ có
 * ngày. Hàm này hỏi riêng mã đó: MỘT request, và kết quả vào CHUNG kho (hạn
 * 24 giờ như lượt nền), nên bấm lại cả ngày không tốn thêm gì và Screener /
 * My Portfolio cũng được hưởng.
 */
export async function ttEarningsFor(symbol: string, now = Date.now()): Promise<TtEarningsLookup> {
  const sym = symbol.trim().toUpperCase();
  const store = await read();
  const have = store.records[sym];
  const base = { configured: ttConfigured(), asked: false, undecided: false, missing: false, error: null };
  if (have && now - have.fetchedAt < TTL_MS) return { ...base, record: have };
  if (!base.configured) return { ...base, record: have ?? null };

  try {
    const { data } = await ttGet<any>('/market-metrics', { symbols: sym });
    const body = data?.data ?? data;
    const items: any[] = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [];
    const rec = items.find((r) => String(r?.symbol ?? '').toUpperCase() === sym);
    if (!rec) return { ...base, asked: true, missing: true, record: have ?? null };
    const parsed = parseEarnings(rec, now);
    const patch: Stored = { records: {}, ivRanks: { [sym]: { value: parseIvRank(rec), fetchedAt: now } }, lastSyncAt: null };
    if (parsed) patch.records[sym] = parsed;
    await write(patch).catch(() => {});
    return { ...base, asked: true, undecided: !parsed, record: parsed ?? have ?? null };
  } catch (e: any) {
    const error =
      e instanceof TtError && e.status
        ? `tastytrade trả mã ${e.status}${e.body ? ` — ${String(e.body).slice(0, 150)}` : ''}`
        : String(e?.message ?? e);
    return { ...base, asked: true, error, record: have ?? null };
  }
}

/** Chỉ dùng cho kiểm thử. */
export const __store = () => storePath();
