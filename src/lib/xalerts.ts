import fs from 'node:fs/promises';
import path from 'node:path';
import type { Alert, Severity } from './alerts';
import { pressSeverity } from './pressalerts';
import {
  xConfigured,
  xGet,
  cashtagBatches,
  parseSearch,
  symbolsIn,
  type XPost,
} from './xnews';

/**
 * X (Twitter) — tầng cảnh báo THỨ TƯ cho vị thế đang nắm + watchlist.
 *
 * Probe #159/#161 đo xong ở production 2026-09-19. Ba câu quyết định thiết
 * kế, cả ba đều trả lời được rồi, không còn là giả định:
 *
 *   - Toán tử `$AAPL` (cashtag) DÙNG ĐƯỢC: hỏi $AAPL/$TSLA/$NVDA ra 10 bài,
 *     cả 10 đều mang `entities.cashtags` do CHÍNH X gắn (10/10) → tìm thẳng
 *     theo mã là đường đúng, không cần bám danh sách tài khoản.
 *   - `since_id` ĐƯỢC TÔN TRỌNG: hỏi lại ngay với since_id = newest_id vừa
 *     nhận ra đúng 0 bài.
 *   - Trần độ dài câu truy vấn ĐO được là 512 ký tự — khớp con số đã đặt
 *     sẵn trong `cashtagQuery()`, lời từ chối thật của X: "query parameter
 *     length must be <= 512".
 *
 * ============================================================
 * MỘT câu truy vấn cho NHIỀU mã, không phải một request/mã
 * ============================================================
 *
 * Khác hẳn tầng báo chí (`pressalerts.ts`), nơi Yahoo bắt hỏi TỪNG MÃ. X cho
 * gộp bằng `$A OR $B OR $C` trong MỘT request (`cashtagBatches()` bên
 * xnews.ts), nên cả watchlist chỉ tốn vài lô thay vì một request mỗi mã.
 *
 * ============================================================
 * `since_id` là một con số TOÀN CỤC, không theo từng lô
 * ============================================================
 *
 * ID của X tăng dần theo thời gian trên TOÀN NỀN TẢNG (snowflake id), nên
 * "id mới nhất từng thấy" là MỘT con số dùng chung cho mọi lô, bất kể
 * watchlist đổi khiến mã nào rơi vào lô nào giữa hai lượt chạy. Lưu
 * since_id theo từng lô sẽ vỡ ngay khi watchlist đổi kích thước.
 *
 * ============================================================
 * LƯỢT ĐẦU TIÊN không có since_id — và đó là chỗ dễ tràn
 * ============================================================
 *
 * Không có since_id thì X trả bài trong 7 ngày gần nhất cho MỌI mã đang
 * theo dõi. Cửa sổ `X_FRESH_MS` (đúng khuôn `FRESH_MS` của liveevents.ts)
 * chặn điều đó: chỉ bài trong khoảng gần đây mới được xét làm cảnh báo, bất
 * kể since_id có hay không — since_id chỉ quyết định lượt SAU có phải trả
 * tiền đọc lại bài cũ hay không, cửa sổ thời gian mới quyết định bài có
 * ĐÁNG báo hay không. Mất file since_id (redeploy) chỉ khiến lượt kế tiếp
 * bị coi là lượt đầu — an toàn, không tràn, vì cửa sổ vẫn chặn.
 *
 * ============================================================
 * ĐỘ NẶNG TỪ KHOÁ: DÙNG LẠI của tầng báo chí, không viết lại
 * ============================================================
 *
 * `pressSeverity()` đã được đo và sửa ba lỗi im lặng (#157: chia động từ,
 * rụng e câm, từ đệm) — viết một bảng từ khoá THỨ HAI cho X là lặp lại
 * đúng ba lỗi đó từ đầu. Bài trên X ít trang trọng hơn báo chí, nhưng sự
 * kiện KHẨN (phá sản, an ninh mạng, huỷ niêm yết...) vẫn dùng đúng những
 * từ đó, và hai tầng dùng chung một bảng thì không thể trôi lệch nhau.
 *
 * ============================================================
 * VẪN LÀ BÀI ĐĂNG CHƯA KIỂM CHỨNG — yếu hơn cả tầng báo chí
 * ============================================================
 *
 * 8-K là công ty tự khai bắt buộc. Báo chí là người ngoài viết, có biên
 * tập. Một bài trên X là NGƯỜI DÙNG BẤT KỲ gõ, không ai kiểm chứng trước
 * khi đăng — yếu nhất trong bốn tầng, nên mang nhãn `[X]` và thân nói
 * thẳng đây là bài đăng chưa kiểm chứng.
 */

export const X_FRESH_MS = 90 * 60_000;
export const MAX_X_ALERTS = 5;
/** Nhiều nhất bao nhiêu mã hỏi trong một lượt — chặn watchlist khổng lồ
 *  không làm một lượt chạy phình ra quá nhiều lô. */
export const MAX_X_SYMBOLS = 200;

const xKey = (symbol: string, id: string) => `x-${symbol}-${id}`;

export type XScan = {
  alerts: Alert[];
  /** Bài mới, khớp mã, nhưng không khớp từ khoá — đếm, không gửi. */
  routine: number;
  /** Cảnh báo bị cắt vì chạm trần mỗi lượt. */
  overflow: number;
};

/**
 * Dựng cảnh báo từ danh sách bài đã bóc. Hàm THUẦN — không mạng, không đĩa,
 * test được không cần Internet, đúng lý do `pressAlertsFrom` và
 * `eventAlertsFrom` là hàm thuần.
 */
export function xAlertsFrom(
  posts: XPost[],
  symbols: string[],
  names: Record<string, string>,
  now = Date.now()
): XScan {
  const cutoff = now - X_FRESH_MS;
  let routine = 0;

  type Cand = { a: Alert; at: number; urgent: boolean };
  const cands: Cand[] = [];
  const perSymbol = new Set<string>();

  /* Mới nhất trước, để "mỗi mã nhiều nhất một" giữ bài MỚI NHẤT chứ không
     phải bài tình cờ đứng đầu mảng — cùng lý do pressAlertsFrom làm vậy. */
  const sorted = [...posts].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

  for (const p of sorted) {
    const t = p.createdAt ? Date.parse(p.createdAt) : NaN;
    if (!Number.isFinite(t) || t < cutoff) continue;

    const hitSymbols = symbolsIn(p, symbols, names);
    if (!hitSymbols.length) continue; // đã hỏi đúng mã theo cashtag, nhưng khớp lại tự dò để chắc

    const sev = pressSeverity(p.text);
    if (!sev) {
      routine++;
      continue;
    }

    const when = new Date(t).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    for (const symbol of hitSymbols) {
      if (perSymbol.has(symbol)) continue;
      perSymbol.add(symbol);

      cands.push({
        at: t,
        urgent: sev.severity === 'urgent',
        a: {
          key: xKey(symbol, p.id),
          severity: sev.severity as Severity,
          title: `[X] ${symbol}: ${p.text.slice(0, 140)}`,
          body:
            `${p.authorHandle ? `@${p.authorHandle}` : 'tài khoản không rõ'}, ${when} giờ New York. ` +
            'Đây là một BÀI ĐĂNG chưa kiểm chứng trên X, không phải hồ sơ SEC hay báo chí đã biên tập — ' +
            'người đăng có thể đoán sai hoặc cố tình sai. ' +
            `https://x.com/i/status/${p.id}`,
        },
      });
    }
  }

  cands.sort((a, b) => (a.urgent === b.urgent ? b.at - a.at : a.urgent ? -1 : 1));

  return {
    alerts: cands.slice(0, MAX_X_ALERTS).map((c) => c.a),
    routine,
    overflow: Math.max(0, cands.length - MAX_X_ALERTS),
  };
}

/* ------------------------------------------------------------------ *
 *  Phần có IO.
 * ------------------------------------------------------------------ */

const STATE_FILE = () => path.resolve(process.env.X_SINCE_PATH || './.cache/x-since.json');

type State = { sinceId: string | null };

async function readState(): Promise<State> {
  try {
    const raw = JSON.parse(await fs.readFile(STATE_FILE(), 'utf8'));
    return { sinceId: typeof raw?.sinceId === 'string' ? raw.sinceId : null };
  } catch {
    return { sinceId: null };
  }
}

async function writeState(s: State) {
  await fs.mkdir(path.dirname(STATE_FILE()), { recursive: true });
  await fs.writeFile(STATE_FILE(), JSON.stringify(s));
}

/** ID X là chuỗi số; so bằng độ dài rồi từ điển — đúng cách so snowflake id
 *  dạng chuỗi mà không tràn số (chúng vượt Number.MAX_SAFE_INTEGER). */
function maxId(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  if (a.length !== b.length) return a.length > b.length ? a : b;
  return a > b ? a : b;
}

export type XReport = {
  ran: boolean;
  checked: number;
  batches: number;
  routine: number;
  overflow: number;
  errors: string[];
};

/**
 * Lấy bài thật rồi dựng cảnh báo. `symbols`/`names` là vị thế nắm ∪
 * watchlist — cùng phạm vi liveevents.ts đã chọn, truyền vào từ đó để
 * không tính lại.
 *
 * Mỗi LÔ hỏng riêng (allSettled) — một lô lỗi không được xoá cảnh báo của
 * lô khác đã lấy được, cùng nguyên tắc `fetchPressHeadlines` dùng cho
 * Yahoo.
 */
export async function collectXAlerts(
  symbols: string[],
  names: Record<string, string>,
  now = Date.now()
): Promise<{ alerts: Alert[]; report: XReport }> {
  const report: XReport = {
    ran: false,
    checked: 0,
    batches: 0,
    routine: 0,
    overflow: 0,
    errors: [],
  };

  if (!xConfigured() || !symbols.length) return { alerts: [], report };

  const asked = symbols.slice(0, MAX_X_SYMBOLS);
  const batches = cashtagBatches(asked);
  report.ran = true;
  report.checked = batches.reduce((n, b) => n + b.used.length, 0);
  report.batches = batches.length;

  const state = await readState();
  let newestSeen: string | null = null;

  const settled = await Promise.allSettled(
    batches.map(async (b) => {
      const { json } = await xGet('/tweets/search/recent', {
        query: b.query,
        max_results: 50,
        since_id: state.sinceId ?? undefined,
        'tweet.fields': 'created_at,author_id,entities,lang',
        expansions: 'author_id',
        'user.fields': 'username,name',
      });
      const parsed = parseSearch(json);
      return { posts: parsed.posts, newest: parsed.newestId };
    })
  );

  const posts: XPost[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      posts.push(...r.value.posts);
      newestSeen = maxId(newestSeen, r.value.newest);
    } else if (report.errors.length < 3) {
      report.errors.push(String(r.reason?.message ?? r.reason).slice(0, 160));
    }
  }

  /* Cập nhật MỐC dù một vài lô lỗi — một lô lỗi không được kéo lùi mốc của
     những lô đã thành công, nếu không lượt sau sẽ trả tiền đọc lại bài đã
     thấy. */
  if (newestSeen) {
    await writeState({ sinceId: maxId(state.sinceId, newestSeen) }).catch(() => {});
  }

  const scan = xAlertsFrom(posts, asked, names, now);
  report.routine = scan.routine;
  report.overflow = scan.overflow;

  return { alerts: scan.alerts, report };
}
