/**
 * Tải dữ liệu Unusual Whales cho MỘT mã ở tab Analyze (xem `uwsummary.ts`).
 *
 * Vì sao hỏi UW trực tiếp thay vì đọc kho của tab Insider Trade: kho đó chỉ
 * phủ mã thuộc S&P 500 + watchlist + danh mục, và chỉ đồng bộ trong giờ
 * giao dịch (#78). Tab Analyze mở MỌI mã, bất kỳ giờ nào — đọc kho sẽ ra
 * rỗng cho đúng những mã người dùng tò mò nhất, và "rỗng vì không theo
 * dõi" trông y hệt "rỗng vì không ai giao dịch".
 *
 * Chi phí: HAI request cho mã thường, tối đa BỐN cho mã sôi động (flow lật tối đa 3 trang, xem dưới) (flow-alerts lọc `ticker_symbol` — tham số đã
 * đo ở production #220 — và `/api/darkpool/{ticker}`, endpoint vòng đồng bộ
 * đang chạy thật), đi LẦN LƯỢT vì trần 3 request đồng thời là của cả tài
 * khoản (#209), và cache 10 phút theo mã — cả khi lỗi, vì hỏi lại một
 * endpoint đang 429 chỉ đẩy thêm vào đúng cái trần đang chặn mình.
 * Quốc hội đọc từ kho sẵn có (0 request): đó là một feed chung toàn thị
 * trường, và hỏi riêng một mã không có endpoint nào rẻ hơn.
 *
 * Mỗi nửa hỏng ĐỘC LẬP và mang nguyên văn lời UW, mã trạng thái đứng
 * trước (#102). Cache nằm trong RAM của route bundle này (#193 — đúng chỗ,
 * chỉ một route dùng).
 */

import { uwConfigured, uwGet, UwError } from './unusualwhales';
import { parseLiveRow, rowsOf, type LiveRow } from './liveflow';
import { parsePrint, MIN_PREMIUM, type DarkpoolPrint } from './darkpool';
import { readCongress } from './congress';
import { FLOW_DAYS, type UwContext } from './uwsummary';

const FLOW_PAGE = 200;
/** Trần 3 trang = nhiều nhất 4 request UW cho một mã (3 flow + 1 dark
 *  pool), mỗi 10 phút. Mã thường chỉ tốn 2. */
const FLOW_MAX_PAGES = 3;

const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 50;
const cache = new Map<string, { at: number; value: UwContext }>();

/** `$SPX`/`$SPX.X` → `SPX` (cách UW viết chỉ số, #210); `BRK/B` → `BRK.B`
 *  (cách viết nhiều lớp của UW CHƯA ĐO — lỗi sẽ hiện nguyên văn). */
export function uwTicker(symbol: string): string {
  return symbol.toUpperCase().replace(/^\$/, '').replace(/\.X$/, '').replace('/', '.');
}

export function describeUwError(e: unknown): string {
  if (e instanceof UwError) {
    const body = e.body ? ` · ${e.body.replace(/\s+/g, ' ').slice(0, 200)}` : '';
    return `${e.status ?? '—'} ${e.message}${body}`;
  }
  return String((e as any)?.message ?? e).slice(0, 240);
}

export async function loadUwContext(symbol: string, now = Date.now()): Promise<UwContext> {
  const key = symbol.toUpperCase();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.value;

  const base: UwContext = {
    configured: uwConfigured(),
    symbol: key,
    fetchedAt: new Date(now).toISOString(),
    flow: { data: [], error: null, unparsed: 0, sampleKeys: [] },
    darkpool: { data: [], error: null },
    congress: { data: null, error: null },
  };
  if (!base.configured) return base;

  const t = uwTicker(key);

  try {
    /* Lật trang lùi bằng `older_than` (tham số chạy thật ở #220) tới khi
       phủ đủ FLOW_DAYS ngày, một trang chưa đầy, hoặc chạm trần. Mã sôi
       động (SPY, TSLA) vượt 200 alert trong vài giờ; đọc mỗi trang đầu là
       đọc một buổi chiều rồi gọi nó là "7 ngày". Một trang không mang
       alert nào mới thì DỪNG — UW có thể bỏ qua tham số. */
    const cutoff = now - FLOW_DAYS * 86_400_000;
    const seen = new Set<string>();
    const rows: LiveRow[] = [];
    let firstRaw: any = null;
    let olderThan: string | undefined;
    let covered = false;
    for (let page = 0; page < FLOW_MAX_PAGES; page++) {
      const payload = await uwGet('/api/option-trades/flow-alerts', {
        ticker_symbol: t,
        limit: FLOW_PAGE,
        older_than: olderThan,
      });
      base.flow.pages = page + 1;
      const raws = rowsOf(payload);
      if (!firstRaw && raws.length) firstRaw = raws[0];
      let fresh = 0;
      let oldest = Infinity;
      for (const r of raws) {
        const row = parseLiveRow(r);
        if (!row) {
          base.flow.unparsed++;
          continue;
        }
        const at = Date.parse(row.at);
        if (at < oldest) oldest = at;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
        fresh++;
      }
      if (raws.length < FLOW_PAGE || oldest < cutoff) {
        covered = true;
        break;
      }
      if (!fresh || !Number.isFinite(oldest)) {
        covered = true;
        break;
      }
      olderThan = new Date(oldest).toISOString();
    }
    base.flow.capped = !covered;
    /* Chốt an toàn: nếu UW bỏ qua `ticker_symbol` thì đây là luồng toàn
       thị trường — giữ đúng mã này thôi, và nói ra nếu phải loại. */
    base.flow.data = rows.filter((r) => !r.ticker || r.ticker === t);
    const foreign = rows.length - base.flow.data.length;
    if (foreign > 0 && base.flow.data.length === 0) {
      base.flow.error = `UW trả ${foreign} alert của mã khác, không có alert nào của ${t} — tham số ticker_symbol có thể đã bị bỏ qua`;
    }
    if (firstRaw && !rows.length) base.flow.sampleKeys = Object.keys(firstRaw).slice(0, 40);
  } catch (e) {
    base.flow.error = describeUwError(e);
  }

  try {
    const payload = await uwGet(`/api/darkpool/${encodeURIComponent(t)}`, { limit: 200, min_premium: MIN_PREMIUM });
    const prints: DarkpoolPrint[] = rowsOf(payload)
      .filter((r: any) => r && !r.canceled)
      .map(parsePrint)
      /* Lọc lại sàn premium phía mình: chưa ai xác nhận endpoint theo mã
         tôn trọng `min_premium` (cùng lý do vòng đồng bộ lọc lại). */
      .filter((p) => (p.premium ?? 0) >= MIN_PREMIUM)
      .filter((p) => now - Date.parse(p.executedAt) <= 14 * 86_400_000);
    base.darkpool.data = prints;
  } catch (e) {
    base.darkpool.error = describeUwError(e);
  }

  try {
    const [c] = await readCongress([key]);
    base.congress.data = c ?? null;
  } catch (e) {
    base.congress.error = describeUwError(e);
  }

  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { at: now, value: base });
  return base;
}

/** Chỉ dùng cho kiểm thử. */
export function _resetUwContext(): void {
  cache.clear();
}
