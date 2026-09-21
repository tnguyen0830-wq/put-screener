import Anthropic from '@anthropic-ai/sdk';
import { logActivity } from '@/lib/activity';
import { lessonById } from '@/lib/learn';
import { learnSystem, learnUserMessage } from '@/lib/learnask';
import { currentUser } from '@/lib/users';

/**
 * "Hỏi Claude về bài này" — tab Learn.
 *
 * Cùng khuôn stream của `/api/ai`: lỗi sau khi stream đã bắt đầu không thể
 * thành mã HTTP nữa nên đi xuống ống dưới dạng dấu `[AI_xxx]` mà client
 * đọc; dự phòng server-side fallback có thử lại không-fallback nếu cờ beta
 * bị từ chối TRƯỚC khi có chữ nào tới trình duyệt.
 *
 * Bài học lấy theo `lessonId` TRÊN SERVER (`lessonById`) chứ không nhận thân
 * bài từ client: prompt phải là đúng bài app đang hiển thị, không phải một
 * văn bản tuỳ ý ai đó dán vào body.
 *
 * Mở cho người nhà — tab của cả nhà — nhưng mỗi lần bấm là tiền thật trên
 * key của chủ app, nên ghi vào nhật ký hoạt động (`learn`) như mọi nút tốn
 * tiền khác.
 */
export const dynamic = 'force-dynamic';

const MODEL = 'claude-opus-5';
/** Trần, không phải chi tiêu — adaptive thinking ăn chung ngân sách (#118). */
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

  const lesson = lessonById(typeof body?.lessonId === 'string' ? body.lessonId : '');
  if (!lesson) return Response.json({ error: 'BAD_LESSON' }, { status: 400 });
  const user = learnUserMessage(body?.question);
  if (!user) return Response.json({ error: 'NO_QUESTION' }, { status: 400 });
  const lang = body?.lang === 'en' ? 'en' : 'vi';

  await logActivity(currentUser(req), 'learn', lesson.id);

  const client = new Anthropic();
  const params = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: learnSystem(lesson, lang),
    thinking: { type: 'adaptive' as const },
    messages: [{ role: 'user' as const, content: user }],
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
        if (final.stop_reason === 'refusal') send('\n\n[REFUSED]');
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
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
