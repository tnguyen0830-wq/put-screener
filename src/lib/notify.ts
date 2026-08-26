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

/* Token và chat id đặt riêng lẻ được, và "có token nhưng thiếu chat id" là
   trạng thái BÌNH THƯỜNG lúc cài đặt - phải có token trước mới dò ra chat
   id được. Gộp cả hai vào một chữ "chưa cấu hình" thì lúc đang cài đặt dở
   không biết mình đang thiếu cái nào. */
export const telegramTokenSet = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);
export const telegramChatSet = () => Boolean(process.env.TELEGRAM_CHAT_ID);

export type TelegramProbe = {
  /** @tên bot mà token này thuộc về - xác nhận đúng bot chứ không phải bot khác. */
  bot: string | null;
  /** Các đoạn chat đã nhắn cho bot; id ở đây chính là TELEGRAM_CHAT_ID cần đặt. */
  chats: { id: number; name: string }[];
  error: string | null;
};

/**
 * Dò chat id giúp, thay vì bắt người dùng tự ghép URL getUpdates trên điện
 * thoại.
 *
 * Gọi getMe trước để trả lời được câu hỏi "token này của bot nào" - nếu
 * getUpdates rỗng thì cần biết ngay là do chưa nhắn cho bot, hay do đang
 * cầm nhầm token của bot khác.
 */
export async function probeTelegram(): Promise<TelegramProbe> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { bot: null, chats: [], error: 'Chưa đặt TELEGRAM_BOT_TOKEN.' };

  const call = async (method: string) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`);
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok)
      throw new Error(`${method} ${res.status}: ${j?.description ?? '(không đọc được)'}`);
    return j.result;
  };

  try {
    const me = await call('getMe');
    const updates: any[] = await call('getUpdates');

    const chats = new Map<number, string>();
    for (const u of updates) {
      const c = u?.message?.chat ?? u?.channel_post?.chat ?? u?.my_chat_member?.chat;
      if (!c?.id) continue;
      chats.set(
        c.id,
        [c.first_name, c.last_name].filter(Boolean).join(' ') || c.title || c.username || '—'
      );
    }
    return {
      bot: me?.username ? `@${me.username}` : null,
      chats: [...chats].map(([id, name]) => ({ id, name })),
      error: null,
    };
  } catch (e: any) {
    return { bot: null, chats: [], error: String(e?.message ?? e) };
  }
}

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
