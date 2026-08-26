import { NextRequest, NextResponse } from 'next/server';
import { saveSub, webPushConfigured } from '@/lib/notify';

/** Trình duyệt gửi đăng ký web push lên đây sau khi người dùng bấm đồng ý. */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!webPushConfigured())
    return NextResponse.json(
      { error: 'WEBPUSH_NOT_CONFIGURED', detail: 'Server chưa đặt VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.' },
      { status: 503 }
    );
  try {
    const sub = await req.json();
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth)
      return NextResponse.json({ error: 'BAD_SUBSCRIPTION' }, { status: 400 });
    return NextResponse.json({ ok: true, count: await saveSub(sub) });
  } catch (e: any) {
    return NextResponse.json({ error: 'SAVE_FAILED', detail: String(e?.message ?? e) }, { status: 500 });
  }
}
