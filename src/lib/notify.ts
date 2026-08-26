import fs from 'node:fs/promises';
import path from 'node:path';
import webpush from 'web-push';
import type { Alert } from './alerts';

/**
 * Gửi cảnh báo đi, qua hai kênh song song.
 *
 * Telegram là kênh chính: miễn phí, không phụ thuộc trình duyệt còn mở hay
 * không, và iOS không tự huỷ đăng ký sau vài tuần như web push. Web push là
 * kênh phụ, được cái không cần cài gì.
 *
 * Cả hai đều TỰ TẮT khi thiếu biến môi trường, đúng nếp hai cái cổng trong
 * middleware: máy ở nhà không cấu hình gì thì chạy y như cũ, không gãy.
 */

const SUBS_FILE = () =>
  path.resolve(process.env.PUSH_SUBS_PATH || './.cache/push-subs.json');

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function readSubs(): Promise<PushSub[]> {
  try {
    return JSON.parse(await fs.readFile(SUBS_FILE(), 'utf8'));
  } catch {
    return [];
  }
}

export async function saveSub(sub: PushSub): Promise<number> {
  const subs = await readSubs();
  if (!subs.some((s) => s.endpoint === sub.endpoint)) subs.push(sub);
  await fs.mkdir(path.dirname(SUBS_FILE()), { recursive: true });
  await fs.writeFile(SUBS_FILE(), JSON.stringify(subs));
  return subs.length;
}

async function dropSub(endpoint: string) {
  const subs = (await readSubs()).filter((s) => s.endpoint !== endpoint);
  await fs.writeFile(SUBS_FILE(), JSON.stringify(subs));
}

export const telegramConfigured = () =>
  Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

export const webPushConfigured = () =>
  Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

function vapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:noreply@tylerinvestment.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
}

const icon = (s: Alert['severity']) => (s === 'urgent' ? '🔴' : '🟠');

async function sendTelegram(alerts: Alert[]): Promise<string | null> {
  const text = alerts
    .map((a) => `${icon(a.severity)} *${a.title}*\n${a.body}`)
    .join('\n\n');
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      }
    );
    if (!res.ok) {
      // Nguyên văn lời Telegram nói, không phải "gửi thất bại" chung chung -
      // sai token và sai chat id là hai lỗi khác nhau, sửa khác nhau.
      return `Telegram ${res.status}: ${(await res.text()).slice(0, 300)}`;
    }
    return null;
  } catch (e: any) {
    return `Telegram: ${String(e?.message ?? e)}`;
  }
}

async function sendWebPush(alerts: Alert[]): Promise<string | null> {
  const subs = await readSubs();
  if (!subs.length) return null;
  vapid();

  const payload = JSON.stringify({
    title:
      alerts.length === 1
        ? `${icon(alerts[0].severity)} ${alerts[0].title}`
        : `${icon(alerts[0].severity)} ${alerts.length} cảnh báo danh mục`,
    body: alerts.map((a) => a.title).join(' · '),
  });

  const errors: string[] = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub as any, payload);
    } catch (e: any) {
      // 404/410 nghĩa là trình duyệt đã bỏ đăng ký - dọn đi, không phải lỗi
      // để báo mãi.
      if (e?.statusCode === 404 || e?.statusCode === 410) await dropSub(sub.endpoint);
      else errors.push(`${e?.statusCode ?? '?'}: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  }
  return errors.length ? `Web push: ${errors.join(' · ')}` : null;
}

export type SendResult = { sent: number; channels: string[]; errors: string[] };

export async function sendAlerts(alerts: Alert[]): Promise<SendResult> {
  if (!alerts.length) return { sent: 0, channels: [], errors: [] };

  const channels: string[] = [];
  const errors: string[] = [];

  if (telegramConfigured()) {
    channels.push('telegram');
    const err = await sendTelegram(alerts);
    if (err) errors.push(err);
  }
  if (webPushConfigured()) {
    channels.push('webpush');
    const err = await sendWebPush(alerts);
    if (err) errors.push(err);
  }

  return { sent: alerts.length, channels, errors };
}
