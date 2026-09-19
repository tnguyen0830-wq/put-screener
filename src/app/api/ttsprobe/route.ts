import { NextResponse } from 'next/server';
import { ElevenError, elevenConfigured, listVoices, modelId, subscription } from '@/lib/eleventts';

/**
 * Đo HÌNH DẠNG thật của ElevenLabs — chạy một lần ở production.
 *
 * `api.elevenlabs.io` bị chặn từ sandbox (2026-09-19) nên mọi tên trường ở
 * lib/eleventts.ts là nhớ được. Probe trả lời: key có được nhận không (và
 * 401 là JSON của API hay HTML ở rìa — #130), tài khoản còn bao nhiêu ký
 * tự (`character_count`/`character_limit`), tên + nhãn thật của các giọng
 * (để chọn `ELEVENLABS_VOICE_ID` cho tiếng Việt), và khoá thật của
 * `/user/subscription` nếu tên trường nhớ sai.
 *
 * KHÔNG tổng hợp audio: hai endpoint này miễn phí, còn tổng hợp là tiêu ký
 * tự — chính nút Nghe là phép đo đó. Không bao giờ trả về key. OWNER_ONLY vì
 * đây là tài khoản trả phí của chủ app.
 */
export const dynamic = 'force-dynamic';

async function step(run: () => Promise<Record<string, unknown>>) {
  try {
    return { ok: true, ...(await run()) };
  } catch (e: any) {
    if (e instanceof ElevenError) return { ok: false, kind: e.kind, status: e.status ?? null, error: e.message };
    return { ok: false, error: String(e?.message ?? e).slice(0, 300) };
  }
}

export async function GET() {
  if (!elevenConfigured()) {
    return NextResponse.json({ ok: false, reason: 'TTS_NOT_CONFIGURED', hint: 'Đặt ELEVENLABS_API_KEY trên Render (Profile → API Keys ở elevenlabs.io).' }, { status: 400 });
  }
  const [sub, voices] = await Promise.all([
    step(async () => ({ ...(await subscription()) })),
    step(async () => {
      const vs = await listVoices();
      return {
        count: vs.length,
        voices: vs.slice(0, 40).map((v) => ({ id: v.id, name: v.name, category: v.category ?? null, labels: v.labels })),
      };
    }),
  ]);
  return NextResponse.json({
    model: modelId(),
    envVoiceId: process.env.ELEVENLABS_VOICE_ID ?? null,
    subscription: sub,
    voices,
    note:
      'subscription.used/limit là ký tự đã dùng / hạn mức tháng (null = trường không có tên như nhớ, xem keys). ' +
      'voices[].labels thường có language/accent — chọn giọng cho tiếng Việt rồi đặt ELEVENLABS_VOICE_ID, hoặc chọn ngay trong ô giọng trên tab Tin tức.',
  });
}
