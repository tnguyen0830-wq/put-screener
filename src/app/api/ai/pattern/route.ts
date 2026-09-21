import Anthropic from '@anthropic-ai/sdk';
import { logActivity } from '@/lib/activity';
import { patternFacts, patternSystem, type PatternFacts } from '@/lib/patternread';
import { currentUser } from '@/lib/users';

/**
 * "Đọc mẫu hình này" — tab Patterns. Cùng khuôn stream `/api/ai`.
 *
 * Client POST đúng cái nó đang hiển thị (mẫu hình + mức giá app đã tính),
 * theo lối "post what you display" của `/api/ai` — route không gọi Schwab,
 * và Claude không thể nói về một mẫu không có trên màn hình. Mỗi lần bấm là
 * tiền thật trên key chủ app → ghi `patai` vào Hoạt động.
 */
export const dynamic = 'force-dynamic';

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 16_000;

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
  const f = body?.facts as PatternFacts | undefined;
  if (!f?.symbol || !Array.isArray(f.detections)) {
    return Response.json({ error: 'Missing facts' }, { status: 400 });
  }
  const lang = body?.lang === 'en' ? 'en' : 'vi';
  await logActivity(currentUser(req), 'patai', String(f.symbol));

  const client = new Anthropic();
  const params = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: patternSystem(lang),
    thinking: { type: 'adaptive' as const },
    messages: [{ role: 'user' as const, content: patternFacts(f) }],
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      let sent = 0;
      const run = async (withFallbacks: boolean) => {
        const s = withFallbacks
          ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as any)
          : client.messages.stream(params);
        for await (const event of s) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            sent += event.delta.text.length;
            send(event.delta.text);
          }
        }
        return s.finalMessage();
      };
      try {
        let final;
        try {
          final = await run(true);
        } catch (e) {
          if (!(e instanceof Anthropic.BadRequestError) || sent > 0) throw e;
          final = await run(false);
        }
        if (final.stop_reason === 'refusal') send('\n\n[REFUSED]');
      } catch (e: any) {
        const msg =
          e instanceof Anthropic.AuthenticationError ? 'AI_BAD_KEY'
            : e instanceof Anthropic.RateLimitError ? 'AI_RATE_LIMITED'
              : 'AI_FAILED';
        send(`\n\n[${msg}]`);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
