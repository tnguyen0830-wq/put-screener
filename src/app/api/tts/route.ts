import { NextResponse } from 'next/server';
import { ElevenError, MAX_CHARS, elevenConfigured, listVoices, pickElevenVoice, synthesize } from '@/lib/eleventts';
import { cleanForSpeech } from '@/lib/tts';
import { logActivity } from '@/lib/activity';
import { currentUser } from '@/lib/users';

/**
 * Đọc bản tóm tắt bằng giọng AI (ElevenLabs). Chỉ chạy khi BẤM; cache trên
 * đĩa theo văn bản + giọng nên bấm lại không tốn ký tự (xem lib/eleventts.ts).
 *
 * Mở cho cả người nhà (không OWNER_ONLY): tab Tin tức là tab của cả nhà, và
 * cache khiến lượt bấm thứ hai trên cùng bản tóm tắt là 0 ký tự. Trần
 * 8.000 ký tự/lượt là chốt chặn chi phí; văn bản dài hơn bị TỪ CHỐI chứ
 * không cắt lặng lẽ — và trần được kiểm TRÊN BẢN ĐÃ DỌN MARKDOWN
 * (`cleanForSpeech()`), không phải trên chuỗi thô client gửi lên: đếm cả
 * `**`/`##`/gạch đầu dòng là tự cộng thêm vào đúng con số làm HTTP 413 xảy
 * ra oan cho một bản tóm tắt thật bình thường (#188).
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
  const raw = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!raw) return NextResponse.json({ error: 'NO_TEXT' }, { status: 400 });
  const text = cleanForSpeech(raw);
  if (!text) return NextResponse.json({ error: 'NO_TEXT' }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: 'TOO_LONG', chars: text.length, max: MAX_CHARS }, { status: 413 });
  }
  const chosen = typeof body?.voiceId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.voiceId) ? body.voiceId : null;

  /* Ghi SỐ KÝ TỰ, vì đó chính là đơn vị ElevenLabs tính tiền - "đã bấm
     Nghe" không trả lời được câu hỏi tốn bao nhiêu. Ghi TRƯỚC khi tổng hợp:
     lượt gọi hỏng vẫn là một lần người dùng bấm nút tiêu tiền, và một lần
     bấm không hiện ra vì nó lỗi là đúng cái kiểu im lặng repo này chống. */
  await logActivity(currentUser(req), 'tts', `${text.length} ký tự`);

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
