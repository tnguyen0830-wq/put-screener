import fs from 'node:fs/promises';
import path from 'node:path';
import { collectAlerts, inMarketHours, tradingDay, type Alert } from './alerts';
import { sendAlerts, telegramConfigured, webPushConfigured } from './notify';
import { syncTracked } from './insiders';
import { syncTtEarnings } from './ttearnings';
import { trackedSymbols } from './insiders';
import { syncCongress } from './congress';
import { syncOptionFlow } from './optionflow';
import { syncDarkpool } from './darkpool';
import { collectEventAlerts, type EventReport } from './liveevents';
import { sampleInternals } from './internals';

/**
 * Vòng kiểm tra tự chạy.
 *
 * App vốn hoàn toàn thụ động - mọi thứ chỉ tính khi trình duyệt gọi. Muốn
 * có thông báo thì phải có thứ gì đó tự chạy, nên đây là bộ đếm giờ duy
 * nhất trong toàn bộ app.
 *
 * Chọn bộ đếm giờ trong tiến trình thay vì Render Cron Job riêng vì đĩa
 * /var/data (chứa token Schwab) chỉ gắn được vào MỘT service - cron riêng
 * sẽ không đọc được token, phải gọi ngược HTTP về đây, phức tạp hơn mà
 * không lợi gì. Gói starter của Render chạy liên tục không ngủ nên bộ đếm
 * giờ sống được.
 *
 * Điểm yếu của cách này là nó chạy ngầm, không ai thấy. Bù lại bằng
 * `lastRun` - trang My Portfolio hiện lần kiểm tra gần nhất, nên bộ đếm giờ
 * chết là thấy ngay, không im lặng.
 */

const STATE_FILE = () =>
  path.resolve(process.env.ALERT_STATE_PATH || './.cache/alert-state.json');

const INTERVAL_MS = 15 * 60_000;

type State = {
  /** khoá cảnh báo -> ngày giao dịch đã gửi. Cùng khoá cùng ngày = không gửi lại. */
  sent: Record<string, string>;
};

async function readState(): Promise<State> {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE(), 'utf8'));
  } catch {
    return { sent: {} };
  }
}

async function writeState(s: State) {
  await fs.mkdir(path.dirname(STATE_FILE()), { recursive: true });
  await fs.writeFile(STATE_FILE(), JSON.stringify(s));
}

export type RunReport = {
  at: number;
  skipped: 'market-closed' | 'no-channel' | null;
  found: number;
  sent: number;
  channels: string[];
  errors: string[];
  /**
   * Sàn có đang mở không. TRƯỚC ĐÂY thông tin này nằm trong `skipped:
   * 'market-closed'` vì đóng cửa nghĩa là bỏ hẳn cả lượt chạy; giờ không
   * còn thế nữa - cảnh báo 8-K vẫn chạy ngoài giờ - nên nó phải là một
   * trường riêng, nếu không màn hình sẽ nói "đã bỏ qua" về một lượt chạy
   * thật sự có làm việc.
   */
  marketOpen: boolean;
  /** Tình trạng phần cảnh báo sự kiện; null = lượt này không chạy được. */
  events: EventReport | null;
};

let lastRun: RunReport | null = null;
export const getLastRun = () => lastRun;

/** Bỏ những cảnh báo đã gửi trong cùng ngày giao dịch. */
export function dedupe(alerts: Alert[], state: State, day: string): Alert[] {
  return alerts.filter((a) => state.sent[a.key] !== day);
}

/** Quên các khoá của những ngày trước, để file không phình vô hạn. */
export function prune(state: State, day: string): State {
  const sent: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.sent)) if (v === day) sent[k] = v;
  return { sent };
}

/**
 * `pressDue` giãn riêng cho tầng tiêu đề báo chí: Yahoo tốn 1 request MỖI
 * MÃ (không gộp lô được), nên gọi ở đúng nhịp 15 phút như mọi thứ khác là
 * đi lại vết xe Dark Pool từng đốt sạch hạn mức UW. Mặc định theo `force`,
 * để nút "Chạy thử ngay" luôn kiểm tin thật. Vòng lặp truyền
 * `tick % 4 === 0` (~60 phút) - và cửa sổ 90 phút của cảnh báo khiến nhịp
 * giãn đó KHÔNG làm mất bài nào.
 */
export async function runOnce(force = false, pressDue = force): Promise<RunReport> {
  const at = Date.now();
  const marketOpen = force || inMarketHours();

  /* Cổng "chưa cấu hình kênh nào" lên TRƯỚC: tính toán xong mà không có chỗ
     gửi thì chỉ tốn request. Cổng giờ giao dịch KHÔNG còn chặn cả lượt chạy
     nữa - nó chỉ quyết định nguồn nào chạy (xem dưới). */
  if (!telegramConfigured() && !webPushConfigured()) {
    lastRun = {
      at, skipped: 'no-channel', found: 0, sent: 0, channels: [], errors: [],
      marketOpen, events: null,
    };
    return lastRun;
  }

  const errors: string[] = [];
  let found = 0;
  let sent = 0;
  let channels: string[] = [];
  let events: EventReport | null = null;

  try {
    const day = tradingDay();

    /* HAI nguồn, hỏng ĐỘC LẬP nhau.
     *
     * - Cảnh báo danh mục (ITM, earnings, skew, quy mô) giữ NGUYÊN hành vi
     *   cũ: chỉ chạy trong giờ giao dịch. Chúng đọc giá và greek, ngoài giờ
     *   thì chỉ lặp lại con số đóng cửa.
     * - Cảnh báo sự kiện chạy BẤT KỂ GIỜ, vì 8-K phần lớn nộp sau khi sàn
     *   đóng - gắn nó vào cổng giờ là bỏ lỡ đúng thứ nó sinh ra để bắt.
     *
     * Tách bằng allSettled chứ không await nối tiếp: phiên Schwab hết hạn
     * làm `collectAlerts()` ném, và trước đây cú ném đó giết cả lượt chạy.
     * Giờ nó không được phép làm mất cảnh báo 8-K, vốn không cần Schwab. */
    const [pfSettled, evSettled] = await Promise.allSettled([
      marketOpen ? collectAlerts() : Promise.resolve([] as Alert[]),
      collectEventAlerts(marketOpen, day, Date.now(), pressDue),
    ]);

    const all: Alert[] = [];
    if (pfSettled.status === 'fulfilled') all.push(...pfSettled.value);
    else errors.push(`portfolio: ${String(pfSettled.reason?.message ?? pfSettled.reason)}`);

    if (evSettled.status === 'fulfilled') {
      all.push(...evSettled.value.alerts);
      events = evSettled.value.report;
    } else {
      errors.push(`events: ${String(evSettled.reason?.message ?? evSettled.reason)}`);
    }

    found = all.length;

    let state = prune(await readState(), day);
    const fresh = dedupe(all, state, day);

    if (fresh.length) {
      const res = await sendAlerts(fresh);
      channels = res.channels;
      errors.push(...res.errors);
      // Chỉ đánh dấu đã gửi khi thật sự gửi được ít nhất một kênh - nếu
      // Telegram lỗi thì lần chạy sau phải thử lại, không được nuốt luôn.
      if (!res.errors.length || res.channels.length > res.errors.length) {
        for (const a of fresh) state.sent[a.key] = day;
        sent = fresh.length;
      }
      await writeState(state);
    }
  } catch (e: any) {
    errors.push(String(e?.message ?? e));
  }

  lastRun = { at, skipped: null, found, sent, channels, errors, marketOpen, events };
  return lastRun;
}

let timer: NodeJS.Timeout | null = null;
/** Đếm số lần bộ đếm giờ 15 phút đã bắn. Chỉ dùng để giãn nhịp cho HAI
 *  thứ tốn 1 request mỗi mã: syncDarkpool() và tầng tiêu đề báo chí của
 *  runOnce() (xem chú thích ở từng chỗ). Không liên quan gì tới trading
 *  day hay bất kỳ trạng thái nào khác. */
let tick = 0;


/**
 * Lịch earnings từ tastytrade, đi nhờ chính bộ đếm giờ này.
 *
 * ĐỨNG NGOÀI `runOnce()`, cùng lý do với Form 4: cảnh báo thì nghỉ ngoài
 * giờ giao dịch và tắt hẳn khi chưa cấu hình kênh nào, còn ngày earnings
 * thì công ty công bố bất kể giờ nào - phần lớn là sau khi sàn đóng cửa,
 * tức đúng khoảng thời gian `runOnce()` đang nghỉ. Gắn nó vào runOnce sẽ
 * làm cái lịch này lặng lẽ ngừng cập nhật.
 *
 * Gọi mỗi 15 phút vẫn rẻ: `syncTtEarnings()` bỏ qua mọi mã đã hỏi trong
 * 24 giờ, nên thực tế mỗi mã chỉ ra mạng một lần một ngày, và gộp lô 100
 * mã nên cả rổ ~500 mã tốn khoảng 6 request.
 */
async function syncEarningsCalendar() {
  const { symbols } = await trackedSymbols();
  if (symbols.length) await syncTtEarnings(symbols);
}

/** Khởi động vòng lặp đúng một lần cho cả tiến trình. */
export function startAlertLoop() {
  if (timer) return;
  /* Lịch earnings chạy NGAY một lượt, không chờ tick đầu 15 phút sau. Sau
     mỗi deploy vòng lặp khởi động lại từ đầu, và chờ 15 phút nghĩa là cả
     khoảng đó Screener / My Portfolio / Analyze không có ngày nào từ
     tastytrade (chủ app: "các tab đều không có ngày ER"). Rẻ: mã đã hỏi
     trong 24 giờ bị bỏ qua, và kho giờ nằm trên /var/data nên sau deploy
     phần lớn mã vẫn còn hạn. Chỉ lịch earnings - các nguồn khác giữ nguyên
     nhịp cũ vì chúng tốn hạn mức (#78). */
  void syncEarningsCalendar().catch(() => {});
  timer = setInterval(() => {
    tick++;
    // 1 trong 4 tick (~60 phút) mới hỏi tin báo chí - xem chú thích
    // `pressDue` ở `runOnce`. Cùng nhịp với syncDarkpool() bên dưới, nhưng
    // là host khác nên không cộng dồn vào cùng một hạn mức.
    void runOnce(false, tick % 4 === 0).catch(() => {});
    void syncTracked().catch(() => {});
    void syncCongress().catch(() => {});
    void syncEarningsCalendar().catch(() => {});
    void syncOptionFlow().catch(() => {});
    // Lấy mẫu market internals ($TICKQ/$ADV/$DECL/$PCCE) - MỘT lượt /quotes
    // gộp cả bốn mã (rẻ), tự gác giờ giao dịch bên trong nên gọi mỗi tick
    // vẫn an toàn, không cần giãn nhịp như Dark Pool (nơi tốn 1 request MỖI
    // MÃ). Xem lib/internals.ts.
    void sampleInternals().catch(() => {});
    // Dark Pool tốn hẳn 1 request MỖI MÃ (không gộp lô được như Options
    // Flow) - với rổ ~500+ mã, gọi ở đúng nhịp 15 phút như các mục còn
    // lại từng đốt cả hạn mức 30.000 request/ngày của UW chỉ riêng
    // endpoint này (sự cố thật, xem chú thích đầu darkpool.ts). Giãn ra
    // còn 1 trong mỗi 4 tick (~60 phút) - syncDarkpool() tự nó cũng đã
    // bỏ qua ngoài giờ giao dịch, hai lớp cộng lại mới đủ an toàn.
    if (tick % 4 === 0) void syncDarkpool().catch(() => {});
  }, INTERVAL_MS);
  // Không giữ tiến trình sống chỉ vì bộ đếm giờ này.
  timer.unref?.();
  void runOnce().catch(() => {});
  // Đồng bộ Form 4 đi nhờ chính bộ đếm giờ này, nhưng KHÔNG đi chung với
  // runOnce: cảnh báo thì nghỉ ngoài giờ giao dịch và tắt hẳn khi chưa
  // cấu hình kênh nào, còn hồ sơ SEC thì nộp bất kể giờ nào (Form 4 hạn
  // nộp trong 2 ngày làm việc, thường vào buổi tối). Bản thân syncTracked
  // tự bỏ qua mã đã hỏi trong ngày nên gọi mỗi 15 phút vẫn chỉ ra mạng
  // một lần một ngày.
  void syncTracked().catch(() => {});
  // Giao dịch Quốc hội cũng đi nhờ bộ đếm giờ này, cùng lý do đứng ngoài
  // runOnce ở trên. Khác Form 4 ở chỗ không có "một lần một ngày mỗi mã"
  // - syncCongress() tự dừng sớm ngay khi gặp trang đã thấy hết (xem
  // congress.ts), nên gọi mỗi 15 phút vẫn rẻ: phần lớn lượt chỉ tốn một
  // request để biết "chưa có gì mới". KHÔNG bỏ qua ngoài giờ giao dịch -
  // khác Options Flow/Dark Pool, đơn công bố của Quốc hội không gắn với
  // phiên giao dịch nào cả.
  void syncCongress().catch(() => {});
  void syncEarningsCalendar().catch(() => {});
  // Options Flow và Dark Pool: quyền chọn/lệnh khối lớn ngoài sàn chỉ
  // thật sự khớp lệnh trong giờ sàn mở cửa (SỬA lại chú thích cũ ở đây -
  // từng ghi nhầm là "bất kể giờ nào", đúng là lý do gây ra sự cố hết hạn
  // mức UW). Cả hai tự bỏ qua khi ngoài giờ (xem chú thích trong từng
  // file); dark pool còn bị giãn nhịp xuống ~60 phút ở bộ đếm giờ phía
  // trên vì tốn 1 request/mã, Options Flow gọi mỗi 15 phút vẫn rẻ nhờ gộp
  // lô 50 mã/request.
  void syncOptionFlow().catch(() => {});
  void syncDarkpool().catch(() => {});
}
