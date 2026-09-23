import { uwConfigured, uwGet, UwError } from './unusualwhales';
import { sessionOpenAt } from './internals-pure';
import { mergeRows, parseLiveRow, rowsOf, type LiveRow } from './liveflow';

/**
 * Lấy luồng cho tab Live Flow — xem đầu `liveflow.ts` về nguồn và giới hạn.
 *
 * CHI PHÍ là thiết kế: mọi người xem đều đọc CHUNG một bộ đệm phía server,
 * làm mới nhiều nhất một lần mỗi `OPEN_TTL_MS`. Nên dù mở bao nhiêu tab,
 * trong phiên (6,5 giờ) là ~2.340 request/ngày — dưới hẳn trần 30.000 mà
 * dark pool từng đốt sạch (#78). Ngoài phiên thì 10 phút một lần: lệnh
 * quyền chọn không khớp khi sàn đóng, gọi dày chỉ tốn hạn mức, nhưng vẫn
 * gọi THƯA để màn hình mở lúc tối có bảng của phiên vừa rồi chứ không trống.
 *
 * MỘT request mỗi lượt, không song song: trần 3 request đồng thời là của CẢ
 * TÀI KHOẢN (#209), và chuỗi UW của thang GEX có thể đang giữ hai suất.
 *
 * Bị UW từ chối (429 vì trần đồng thời, 5xx) thì GIỮ bảng cũ, ghi lỗi nguyên
 * văn, và lùi `BACKOFF_MS` — bấm dồn vào một endpoint đang 429 chỉ đẩy thêm
 * request vào đúng cái trần đang chặn mình.
 *
 * Bộ đệm nằm trong RAM của MỘT route bundle (`/api/liveflow`) — đúng chỗ nó
 * đúng, vì chỉ một route dùng (#193). Mất khi tiến trình khởi động lại, và
 * không sao: đây là luồng sống, lượt kế tiếp lấp lại.
 */

export const OPEN_TTL_MS = 10_000;
export const CLOSED_TTL_MS = 10 * 60_000;
export const BACKOFF_MS = 30_000;
/** Số dòng mỗi lượt hỏi. Về ĐÚNG bằng số này nghĩa là có thể còn alert cũ
 *  hơn chưa kịp lấy giữa hai lượt — màn hình nói ra (`pageFull`). */
export const PAGE = 100;
export const CAP = 400;

type State = {
  rows: LiveRow[];
  fetchedAt: number | null;
  nextAt: number;
  error: string | null;
  errorAt: number | null;
  pageFull: boolean;
  sampleKeys: string[];
  lastBatch: number;
  unparsed: number;
};

const state: State = {
  rows: [],
  fetchedAt: null,
  nextAt: 0,
  error: null,
  errorAt: null,
  pageFull: false,
  sampleKeys: [],
  lastBatch: 0,
  unparsed: 0,
};

let inFlight: Promise<void> | null = null;

function describe(e: unknown): string {
  if (e instanceof UwError) {
    const body = e.body ? ` · ${e.body.replace(/\s+/g, ' ').slice(0, 180)}` : '';
    return `${e.status ?? '—'} ${e.message}${body}`;
  }
  return String((e as any)?.message ?? e).slice(0, 240);
}

async function refresh(now: number, open: boolean): Promise<void> {
  try {
    const payload = await uwGet('/api/option-trades/flow-alerts', { limit: PAGE });
    const raw = rowsOf(payload);
    const parsed: LiveRow[] = [];
    let unparsed = 0;
    for (const r of raw) {
      const row = parseLiveRow(r);
      if (row) parsed.push(row);
      else unparsed++;
    }
    state.rows = mergeRows(state.rows, parsed, CAP);
    state.fetchedAt = now;
    state.lastBatch = raw.length;
    state.unparsed = unparsed;
    state.pageFull = raw.length >= PAGE;
    if (raw[0] && typeof raw[0] === 'object') state.sampleKeys = Object.keys(raw[0]).slice(0, 60);
    state.error = null;
    state.errorAt = null;
    state.nextAt = now + (open ? OPEN_TTL_MS : CLOSED_TTL_MS);
  } catch (e) {
    state.error = describe(e);
    state.errorAt = now;
    state.nextAt = now + BACKOFF_MS;
  }
}

export type LiveFlowResult =
  | { configured: false }
  | {
      configured: true;
      rows: LiveRow[];
      fetchedAt: number | null;
      now: number;
      marketOpen: boolean;
      error: string | null;
      errorAt: number | null;
      pageFull: boolean;
      sampleKeys: string[];
      lastBatch: number;
      unparsed: number;
      ttlMs: number;
    };

export async function loadLiveFlow(now = Date.now()): Promise<LiveFlowResult> {
  if (!uwConfigured()) return { configured: false };
  const open = sessionOpenAt(new Date(now));
  if (now >= state.nextAt) {
    if (!inFlight) {
      inFlight = refresh(now, open).finally(() => {
        inFlight = null;
      });
    }
    await inFlight;
  }
  return {
    configured: true,
    rows: state.rows,
    fetchedAt: state.fetchedAt,
    now,
    marketOpen: open,
    error: state.error,
    errorAt: state.errorAt,
    pageFull: state.pageFull,
    sampleKeys: state.sampleKeys,
    lastBatch: state.lastBatch,
    unparsed: state.unparsed,
    ttlMs: open ? OPEN_TTL_MS : CLOSED_TTL_MS,
  };
}

export function _resetLiveFlow(): void {
  Object.assign(state, {
    rows: [],
    fetchedAt: null,
    nextAt: 0,
    error: null,
    errorAt: null,
    pageFull: false,
    sampleKeys: [],
    lastBatch: 0,
    unparsed: 0,
  });
  inFlight = null;
}
