import { NextResponse } from 'next/server';
import { ElevenError, MAX_CHARS, elevenConfigured, listVoices, pickElevenVoice, synthesize } from '@/lib/eleventts';

/**
 * Đọc bản tóm tắt bằng giọng AI (ElevenLabs). Chỉ chạy khi BẤM; cache trên
 * đĩa theo văn bản + giọng nên bấm lại không tốn ký tự (xem lib/eleventts.ts).
 *
 * Mở cho cả người nhà (không OWNER_ONLY): tab Tin tức là tab của cả nhà, và
 * cache khiến lượt bấm thứ hai trên cùng bản tóm tắt là 0 ký tự. Trần
 * 4.000 ký tự/lượt là chốt chặn chi phí; văn bản dài hơn bị TỪ CHỐI chứ
 * không cắt lặng lẽ.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!elevenConfigured()) return NextResponse.json({ error: 'TTS_NOT_CONFIGURED' }, { status: 503 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'NO_TEXT' }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: 'TOO_LONG', chars: text.length, max: MAX_CHARS }, { status: 413 });
  }
  const chosen = typeof body?.voiceId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.voiceId) ? body.voiceId : null;

  try {
    const voices = await listVoices();
    const voice = pickElevenVoice(voices, process.env.ELEVENLABS_VOICE_ID, chosen);
    if (!voice) return NextResponse.json({ error: 'NO_VOICES', detail: 'Tài khoản ElevenLabs không có giọng nào trong /v1/voices.' }, { status: 502 });
    const s = await synthesize(text, voice.id);
    return new NextResponse(new Uint8Array(s.audio), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(s.audio.length),
        'Cache-Control': 'no-store',
        'X-TTS-Cached': s.cached ? '1' : '0',
        'X-TTS-Voice': encodeURIComponent(voice.name),
        'X-TTS-Model': s.model,
        'X-TTS-Chars': String(s.chars),
      },
    });
  } catch (e: any) {
    if (e instanceof ElevenError) {
      const status = e.kind === 'bad-key' ? 401 : e.kind === 'quota' ? 402 : e.kind === 'not-configured' ? 503 : 502;
      return NextResponse.json({ error: `TTS_${e.kind.toUpperCase().replace('-', '_')}`, detail: e.message.slice(0, 300) }, { status });
    }
    return NextResponse.json({ error: 'TTS_FAILED', detail: String(e?.message ?? e).slice(0, 300) }, { status: 502 });
  }
}
