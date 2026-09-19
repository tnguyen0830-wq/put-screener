import Anthropic from '@anthropic-ai/sdk';
import { logActivity } from '@/lib/activity';
import { currentUser } from '@/lib/users';
import { system, facts } from '@/lib/rrgbrief';

/**
 * Claude viết phần diễn giải cho biểu đồ RRG (Heatmap → tab RRG). Client post
 * lại đúng payload /api/rrg đã hiển thị - route này không gọi Schwab, không
 * tính lại một con số nào. Kiến trúc lặp lại y hệt /api/ai/trade-briefing
 * (streaming, retry fallback khi bị từ chối, marker báo lỗi trong luồng chữ)
 * - xem chú thích ở đó cho lý do đầy đủ.
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

  const rrg = body?.rrg;
  if (!Array.isArray(rrg?.points) || !rrg.points.length) {
    return Response.json({ error: 'Missing rrg' }, { status: 400 });
  }

  await logActivity(currentUser(req), 'ai', 'RRG');

  const client = new Anthropic();
  const params = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: system(body?.lang === 'en' ? 'en' : 'vi'),
    thinking: { type: 'adaptive' as const },
    messages: [{ role: 'user' as const, content: facts(rrg) }],
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      let sent = 0;

      const run = async (withFallbacks: boolean) => {
        const s = withFallbacks
          ? client.beta.messages.stream({
              ...params,
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
            } as any)
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
        if (final.stop_reason === 'refusal') {
          send('\n\n[REFUSED]');
        }
      } catch (e: any) {
        const msg =
          e instanceof Anthropic.AuthenticationError
            ? 'AI_BAD_KEY'
            : e instanceof Anthropic.RateLimitError
              ? 'AI_RATE_LIMITED'
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
    },
  });
}
