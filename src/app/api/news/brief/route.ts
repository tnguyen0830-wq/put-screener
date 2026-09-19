import Anthropic from '@anthropic-ai/sdk';
import { briefFacts, briefKey, briefSystem, sanitizeHeadlines } from '@/lib/newsbrief';

export const dynamic = 'force-dynamic';

const MODEL = 'claude-opus-5';

/** Trần, không phải mức chi — suy luận thích ứng ĂN CHUNG hạn mức này (#118). */
const MAX_TOKENS = 16_000;

/**
 * Bản tóm tắt đã viết xong được giữ 20 phút theo khoá = bộ tiêu đề + ngôn
 * ngữ. Trang tin tự cache 5 phút nên cùng bộ tiêu đề quay lại nhiều lần; hai
 * người trong nhà cùng bấm "Tóm tắt" trong 20 phút là MỘT lượt gọi Claude.
 * RAM, deploy là quên — chấp nhận, tóm tắt tin 20 phút trước không đáng
 * một file trên đĩa.
 */
const BRIEF_CACHE_MS = 20 * 60_000;
const briefs = new Map<string, { at: number; text: string }>();

/**
 * "Tóm tắt tiếng Việt" — chỉ chạy khi người dùng BẤM, MỘT lượt gọi cho cả
 * hai cột. Client GỬI LÊN đúng danh sách nó đang hiện (khuôn /api/ai,
 * /api/tradebrief, /api/longterm/why) nên bản tóm tắt không thể nói về một
 * bộ tiêu đề khác với bảng bên cạnh.
 */
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'AI_NOT_CONFIGURED' }, { status: 503 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }
  const headlines = sanitizeHeadlines(body?.headlines);
  if (!headlines.length) return Response.json({ error: 'NO_HEADLINES' }, { status: 400 });
  const lang: 'vi' | 'en' = body?.lang === 'en' ? 'en' : 'vi';

  const key = briefKey(headlines, lang);
  const hit = briefs.get(key);
  if (hit && Date.now() - hit.at < BRIEF_CACHE_MS) {
    return new Response(hit.text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        // Màn hình in "bản tóm tắt lúc HH:MM" — một bản 19 phút tuổi trông y
        // hệt bản vừa viết nếu không nói.
        'X-Brief-At': new Date(hit.at).toISOString(),
      },
    });
  }

  const client = new Anthropic();
  const params = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: briefSystem(lang),
    thinking: { type: 'adaptive' as const },
    messages: [{ role: 'user' as const, content: briefFacts(headlines) }],
  };
  const at = new Date();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (t: string) => controller.enqueue(encoder.encode(t));
      let acc = '';
      try {
        const s = client.messages.stream(params);
        for await (const event of s) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            acc += event.delta.text;
            send(event.delta.text);
          }
        }
        const final = await s.finalMessage();
        if (final.stop_reason === 'max_tokens') send('\n\n[AI_TRUNCATED]');
        else if (final.stop_reason === 'refusal') send('\n\n[REFUSED]');
        // Chỉ cache bản VIẾT XONG: một bản bị cắt mà cache 20 phút là 20 phút
        // ai bấm cũng nhận đúng bản cụt đó.
        else if (acc.trim()) briefs.set(key, { at: at.getTime(), text: acc });
      } catch (e: any) {
        const msg =
          e instanceof Anthropic.AuthenticationError
            ? 'AI_BAD_KEY'
            : e instanceof Anthropic.RateLimitError
              ? 'AI_RATE_LIMITED'
              : e instanceof Anthropic.BadRequestError
                ? 'AI_BAD_REQUEST'
                : 'AI_FAILED';
        send(`\n\n[${msg}]`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Brief-At': at.toISOString(),
    },
  });
}
