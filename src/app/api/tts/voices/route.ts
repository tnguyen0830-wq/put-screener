import { NextResponse } from 'next/server';
import { ElevenError, elevenConfigured, listVoices, modelId, pickElevenVoice } from '@/lib/eleventts';

/**
 * Danh sách giọng của TÀI KHOẢN ElevenLabs cho ô chọn trên màn hình, kèm
 * giọng mặc định. Không có key → `configured: false` và màn hình rơi về giọng
 * trình duyệt, NÓI RA là đường lùi. Lỗi thật đi kèm để "không lấy được danh
 * sách" không trông giống "tài khoản không có giọng".
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!elevenConfigured()) return NextResponse.json({ configured: false, voices: [], defaultId: null, model: modelId() });
  try {
    const voices = await listVoices();
    const def = pickElevenVoice(voices, process.env.ELEVENLABS_VOICE_ID, null);
    return NextResponse.json({
      configured: true,
      voices: voices.map((v) => ({ id: v.id, name: v.name, labels: v.labels, category: v.category ?? null })),
      defaultId: def?.id ?? null,
      envVoiceMissing: !!process.env.ELEVENLABS_VOICE_ID && !voices.some((v) => v.id === process.env.ELEVENLABS_VOICE_ID),
      model: modelId(),
    });
  } catch (e: any) {
    const kind = e instanceof ElevenError ? e.kind : 'unavailable';
    return NextResponse.json({ configured: true, voices: [], defaultId: null, model: modelId(), error: `TTS_${kind.toUpperCase().replace('-', '_')}`, detail: String(e?.message ?? e).slice(0, 300) });
  }
}
