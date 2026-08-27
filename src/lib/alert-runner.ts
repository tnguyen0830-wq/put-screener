import fs from 'node:fs/promises';
import path from 'node:path';
import { collectAlerts, inMarketHours, tradingDay, type Alert } from './alerts';
import { sendAlerts, telegramConfigured, webPushConfigured } from './notify';
import { syncTracked } from './insiders';

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

export async function runOnce(force = false): Promise<RunReport> {
  const at = Date.now();

  if (!force && !inMarketHours()) {
    lastRun = { at, skipped: 'market-closed', found: 0, sent: 0, channels: [], errors: [] };
    return lastRun;
  }
  if (!telegramConfigured() && !webPushConfigured()) {
    lastRun = { at, skipped: 'no-channel', found: 0, sent: 0, channels: [], errors: [] };
    return lastRun;
  }

  const errors: string[] = [];
  let found = 0;
  let sent = 0;
  let channels: string[] = [];

  try {
    const day = tradingDay();
    const all = await collectAlerts();
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

  lastRun = { at, skipped: null, found, sent, channels, errors };
  return lastRun;
}

let timer: NodeJS.Timeout | null = null;

/** Khởi động vòng lặp đúng một lần cho cả tiến trình. */
export function startAlertLoop() {
  if (timer) return;
  timer = setInterval(() => {
    void runOnce().catch(() => {});
    void syncTracked().catch(() => {});
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
}
