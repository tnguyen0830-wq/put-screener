import { uwConfigured, uwGet, UwError } from './unusualwhales';
import { sessionOpenAt } from './internals-pure';
import { mergeRows, parseLiveRow, rowsOf, type LiveRow } from './liveflow';

/**
 * Lấy luồng alert cho tab Live Flow — xem đầu `liveflow.ts` về nguồn.
 *
 * ĐO ĐƯỢC ở production (2026-09-23, ảnh chụp của chủ app, QQQ đặt cạnh màn
 * UW): tên trường phía (`total_ask_side_prem`/`total_bid_side_prem`) và các
 * trường giá đều ĐÚNG — 100 dòng ra ASK 65 · BID 35, không dòng nào "?". Nhưng
 * cùng ảnh đó lộ ra lỗi thật của bản #218: MỌI lượt về đúng 100 dòng, tức
 * luồng toàn thị trường dày hơn 100 alert mỗi 10 giây và app SÓT alert giữa
 * hai lượt; gõ QQQ thì chỉ lọc lại 100 dòng toàn thị trường đó.
 *
 * Hai sửa, cả hai dùng tham số ĐÃ CHẠY THẬT trong `optionflow.ts`:
 *
 * 1. **Lật trang cho đủ**: mỗi lượt hỏi `newer_than` = alert mới nhất đã có,
 *    rồi lùi `older_than` từng trang 200 cho tới khi một trang chưa đầy —
 *    nghĩa là đã nối liền với lượt trước. Trần `MAX_PAGES` trang/lượt; chạm
 *    trần thì `pageFull` nói thẳng là có thể còn sót. Lượt ĐẦU TIÊN chỉ lấy
 *    một trang: lật ngược cả lịch sử là tốn hạn mức cho thứ không ai cuộn tới.
 * 2. **Lọc mã phía UW**: gõ QQQ là hỏi `ticker_symbol=QQQ`, nên đủ alert của
 *    QQQ chứ không phải những dòng QQQ lọt được vào 100 dòng toàn thị trường.
 *    Mỗi bộ mã một bộ đệm riêng (tối đa `MAX_BUFFERS`, bỏ bộ lâu không ai
 *    xem nhất).
 *
 * CHI PHÍ: bộ đệm dùng chung mọi người xem, làm mới nhiều nhất 10 giây/lượt
 * trong phiên và 10 phút/lượt khi sàn đóng, CHỈ khi có người hỏi đúng bộ mã
 * đó. Một lượt thường là 1 request; chỉ khi luồng dồn dập mới lật thêm trang.
 * Các request đi LẦN LƯỢT (trần 3 đồng thời của cả tài khoản, #209).
 *
 * Bị UW từ chối thì GIỮ bảng cũ, ghi nguyên văn (mã đứng trước), lùi 30 giây.
 * Bộ đệm nằm trong RAM của MỘT route bundle (`/api/liveflow`) — đúng chỗ (#193).
 */

export const OPEN_TTL_MS = 10_000;
export const CLOSED_TTL_MS = 10 * 60_000;
export const BACKOFF_MS = 30_000;
/** 200 là số `optionflow.ts` đã dùng thật ở production. */
export const PAGE = 200;
export const MAX_PAGES = 5;
/** Số dòng giữ và gửi về mỗi bộ — trình duyệt hỏi vài giây một lần, gửi
 *  nghìn dòng mỗi lượt là nặng vô ích khi màn hình chỉ vẽ 300. */
export const CAP = 500;
export const MAX_BUFFERS = 8;
export const MAX_TICKERS = 10;

const TICKER_RE = /^[A-Z][A-Z0-9./]{0,9}$/;

/** Chuẩn hoá danh sách mã từ ô lọc: viết hoa, bỏ trùng, xếp thứ tự (để
 *  "SPY,QQQ" và "qqq spy" dùng CHUNG một bộ đệm), bỏ thứ không phải mã.
 *  Trả thêm `rejected` để màn hình nói ra chứ không lặng lẽ bỏ. */
export function normTickers(raw: string | null | undefined): { tickers: string[]; rejected: string[] } {
  const parts = String(raw ?? '')
    .toUpperCase()
    .split(/[\s,]+/)
    .filter(Boolean);
  const ok = new Set<string>();
  const rejected: string[] = [];
  for (const p of parts) {
    if (TICKER_RE.test(p) && ok.size < MAX_TICKERS) ok.add(p);
    else rejected.push(p);
  }
  return { tickers: [...ok].sort(), rejected };
}

type State = {
  rows: LiveRow[];
  fetchedAt: number | null;
  nextAt: number;
  error: string | null;
  errorAt: number | null;
  pageFull: boolean;
  sampleKeys: string[];
  lastBatch: number;
  lastPages: number;
  unparsed: number;
  lastDemand: number;
  inFlight: Promise<void> | null;
};

const buffers = new Map<string, State>();

function stateFor(key: string, now: number): State {
  let s = buffers.get(key);
  if (!s) {
    s = {
      rows: [],
      fetchedAt: null,
      nextAt: 0,
      error: null,
      errorAt: null,
      pageFull: false,
      sampleKeys: [],
      lastBatch: 0,
      lastPages: 0,
      unparsed: 0,
      lastDemand: now,
      inFlight: null,
    };
    buffers.set(key, s);
    if (buffers.size > MAX_BUFFERS) {
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, v] of buffers) {
        if (k !== key && !v.inFlight && v.lastDemand < oldest) {
          oldest = v.lastDemand;
          oldestKey = k;
        }
      }
      if (oldestKey !== null) buffers.delete(oldestKey);
    }
  }
  s.lastDemand = now;
  return s;
}

function describe(e: unknown): string {
  if (e instanceof UwError) {
    const body = e.body ? ` · ${e.body.replace(/\s+/g, ' ').slice(0, 180)}` : '';
    return `${e.status ?? '—'} ${e.message}${body}`;
  }
  return String((e as any)?.message ?? e).slice(0, 240);
}

async function refresh(s: State, tickers: string[], now: number, open: boolean): Promise<void> {
  try {
    // Mốc nối: alert mới nhất đang có. Chưa có gì thì chỉ lấy một trang.
    // Cùng định dạng ISO mà `optionflow.ts` gửi ở production, không gửi
    // nguyên văn chuỗi UW (có thể mang micro-giây — chưa đo UW nhận không).
    const newest = s.rows[0] ? Date.parse(s.rows[0].at) : NaN;
    const newerThan = Number.isFinite(newest) ? new Date(newest).toISOString() : undefined;
    const known = new Set(s.rows.map((r) => r.id));
    const base: Record<string, string | number | undefined> = {
      limit: PAGE,
      ticker_symbol: tickers.length ? tickers.join(',') : undefined,
      newer_than: newerThan,
    };
    const all: any[] = [];
    let olderThan: string | undefined;
    let pages = 0;
    let capped = false;
    for (;;) {
      const payload = await uwGet('/api/option-trades/flow-alerts', { ...base, older_than: olderThan });
      pages++;
      const raw = rowsOf(payload);
      all.push(...raw);
      if (raw.length < PAGE) break; // chưa đầy = đã nối liền (hoặc hết dữ liệu)
      // Trang đầy mà KHÔNG mang alert mới nào = UW bỏ qua `newer_than` (chưa
      // đo là nó tôn trọng) hoặc đã nối liền. Lật tiếp là đốt 5 request mỗi
      // 10 giây cho đúng những dòng đã có — dừng.
      if (!raw.some((r: any) => r && r.id !== undefined && !known.has(String(r.id)))) break;
      if (!newerThan) {
        capped = true; // lượt đầu: một trang là đủ, và nói ra là còn nữa
        break;
      }
      if (pages >= MAX_PAGES) {
        capped = true;
        break;
      }
      const oldest = raw[raw.length - 1]?.created_at;
      if (!oldest || oldest === olderThan) break;
      olderThan = String(oldest);
    }
    const parsed: LiveRow[] = [];
    let unparsed = 0;
    for (const r of all) {
      const row = parseLiveRow(r);
      if (row) parsed.push(row);
      else unparsed++;
    }
    s.rows = mergeRows(s.rows, parsed, CAP);
    s.fetchedAt = now;
    s.lastBatch = all.length;
    s.lastPages = pages;
    s.unparsed = unparsed;
    // Lượt đầu chạm trần một trang là chuyện bình thường (lịch sử còn dài),
    // không phải "đang sót" — chỉ cảnh báo khi đã có mốc nối mà vẫn chạm trần.
    s.pageFull = capped && !!newerThan;
    if (all[0] && typeof all[0] === 'object') s.sampleKeys = Object.keys(all[0]).slice(0, 60);
    s.error = null;
    s.errorAt = null;
    s.nextAt = now + (open ? OPEN_TTL_MS : CLOSED_TTL_MS);
  } catch (e) {
    s.error = describe(e);
    s.errorAt = now;
    s.nextAt = now + BACKOFF_MS;
  }
}

export type LiveFlowResult =
  | { configured: false }
  | {
      configured: true;
      tickers: string[];
      rejected: string[];
      rows: LiveRow[];
      fetchedAt: number | null;
      now: number;
      marketOpen: boolean;
      error: string | null;
      errorAt: number | null;
      pageFull: boolean;
      sampleKeys: string[];
      lastBatch: number;
      lastPages: number;
      unparsed: number;
      ttlMs: number;
    };

export async function loadLiveFlow(rawTickers?: string | null, now = Date.now()): Promise<LiveFlowResult> {
  if (!uwConfigured()) return { configured: false };
  const { tickers, rejected } = normTickers(rawTickers);
  const open = sessionOpenAt(new Date(now));
  const s = stateFor(tickers.join(','), now);
  if (now >= s.nextAt) {
    if (!s.inFlight) {
      s.inFlight = refresh(s, tickers, now, open).finally(() => {
        s.inFlight = null;
      });
    }
    await s.inFlight;
  }
  return {
    configured: true,
    tickers,
    rejected,
    rows: s.rows,
    fetchedAt: s.fetchedAt,
    now,
    marketOpen: open,
    error: s.error,
    errorAt: s.errorAt,
    pageFull: s.pageFull,
    sampleKeys: s.sampleKeys,
    lastBatch: s.lastBatch,
    lastPages: s.lastPages,
    unparsed: s.unparsed,
    ttlMs: open ? OPEN_TTL_MS : CLOSED_TTL_MS,
  };
}

export function _resetLiveFlow(): void {
  buffers.clear();
}
