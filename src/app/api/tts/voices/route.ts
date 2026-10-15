import { NextResponse } from 'next/server';
import { ElevenError, MISS_REFRESH_MS, elevenConfigured, listVoices, modelId, pickElevenVoice, voicesListedAt } from '@/lib/eleventts';

/**
 * Danh sách giọng của TÀI KHOẢN ElevenLabs cho ô chọn trên màn hình, kèm
 * giọng mặc định. Không có key → `configured: false` và màn hình rơi về giọng
 * trình duyệt, NÓI RA là đường lùi. Lỗi thật đi kèm để "không lấy được danh
 * sách" không trông giống "tài khoản không có giọng".
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!elevenConfigured()) return NextResponse.json({ configured: false, voices: [], defaultId: null, model: modelId() });
  try {
    /* `?fresh=1` = nút "Tải lại danh sách giọng": hỏi ElevenLabs ngay. Không
       có nút đó mà env trỏ vào giọng chưa có trong bản đang giữ thì cũng hỏi
       lại (tối đa mỗi phút một lần) — giọng vừa Add to my voices phải hiện ra
       ngay, không phải sau một giờ. */
    const envId = process.env.ELEVENLABS_VOICE_ID || undefined;
    const fresh = new URL(req.url).searchParams.get('fresh') === '1';
    let voices = await listVoices(fresh);
    if (!fresh && envId && !voices.some((v) => v.id === envId)) voices = await listVoices(false, MISS_REFRESH_MS);
    const def = pickElevenVoice(voices, envId, null);
    const envVoiceMissing = !!envId && !voices.some((v) => v.id === envId);
    return NextResponse.json({
      configured: true,
      voices: voices.map((v) => ({ id: v.id, name: v.name, labels: v.labels, category: v.category ?? null })),
      defaultId: def?.id ?? null,
      envVoiceMissing,
      /* Id không phải bí mật (nó nằm trong URL của trang giọng trên
         elevenlabs.io), và in nó ra là cách duy nhất để biết env trỏ đúng
         giọng mình định hay gõ nhầm. */
      envVoiceId: envVoiceMissing ? envId : undefined,
      listedAt: voicesListedAt(),
      model: modelId(),
    });
  } catch (e: any) {
    const kind = e instanceof ElevenError ? e.kind : 'unavailable';
    return NextResponse.json({ configured: true, voices: [], defaultId: null, model: modelId(), error: `TTS_${kind.toUpperCase().replace('-', '_')}`, detail: String(e?.message ?? e).slice(0, 300) });
  }
}
