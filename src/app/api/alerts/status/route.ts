import { NextResponse } from 'next/server';
import { getLastRun, runOnce, startAlertLoop } from '@/lib/alert-runner';
import { telegramConfigured, telegramTokenSet, telegramChatSet, webPushConfigured } from '@/lib/notify';

/**
 * Trạng thái bộ cảnh báo, và cũng là chỗ khởi động vòng lặp.
 *
 * Next.js chỉ nạp module khi có request đầu tiên chạm tới, nên gọi
 * startAlertLoop() ở đây: trang My Portfolio hỏi trạng thái mỗi lần mở, và
 * lần hỏi đầu tiên sau khi server khởi động lại chính là lúc bật lại vòng
 * lặp. Gọi nhiều lần vô hại - hàm tự bỏ qua nếu đã chạy.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  startAlertLoop();
  return NextResponse.json({
    telegram: telegramConfigured(),
    telegramTokenSet: telegramTokenSet(),
    telegramChatSet: telegramChatSet(),
    webPush: webPushConfigured(),
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    lastRun: getLastRun(),
  });
}

/** Bấm "Gửi thử" trên giao diện: chạy ngay, kể cả ngoài giờ giao dịch. */
export async function POST() {
  return NextResponse.json(await runOnce(true));
}
