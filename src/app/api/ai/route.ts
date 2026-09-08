import Anthropic from '@anthropic-ai/sdk';
import { facts, system } from '@/lib/airead';

/**
 * Claude's read of the indicators already on screen in the analyze tab.
 *
 * The client posts the analysis object it is displaying rather than a symbol,
 * so this route costs no extra Schwab quota and cannot describe numbers the
 * user is not looking at. Only the fields lib/airead.ts picks are forwarded -
 * the payload also carries a news array and raw candles, which would inflate
 * the prompt without changing the reading. The GEX reading the page already
 * fetched rides along as `gex` (any of /api/gex's response shapes), or
 * `gexError` when the page could not get one - the prompt then says so
 * explicitly instead of leaving a gap Claude would read as "nothing there".
 *
 * Not under /api/md/*: that prefix is gated by MD_API_TOKEN for the phone app,
 * and the browser has no token to send.
 */
export const dynamic = 'force-dynamic';

const MODEL = 'claude-opus-5';

/**
 * A ceiling, not a spend - output is billed by what Claude actually writes.
 * Set well above the few hundred tokens an answer needs because adaptive
 * thinking counts against the same limit, and truncating mid-sentence is a
 * worse failure than a generous cap.
 */
const MAX_TOKENS = 16_000;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: 'AI_NOT_CONFIGURED' },
      { status: 503 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const analysis = body?.analysis;
  if (!analysis?.symbol) {
    return Response.json({ error: 'Missing analysis' }, { status: 400 });
  }

  const client = new Anthropic();
  const params = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: system(body?.lang === 'en' ? 'en' : 'vi'),
    thinking: { type: 'adaptive' as const },
    messages: [
      {
        role: 'user' as const,
        content: facts(
          analysis,
          body?.gex ?? null,
          typeof body?.gexError === 'string' ? body.gexError.slice(0, 300) : null
        ),
      },
    ],
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (text: string) => controller.enqueue(encoder.encode(text));

      // Counts what has already reached the browser, so the retry below can
      // tell a request that died before producing anything from one that
      // failed halfway - only the first is safe to run again.
      let sent = 0;

      /**
       * Server-side fallbacks re-run a refused request on another model inside
       * the same call.
       *
       * The retry exists because this integration could not be exercised
       * against the live API while it was written: if the beta flag is ever
       * retired the request 400s, and losing the whole feature over an optional
       * safety net is the worse failure. Note that .stream() returns its handle
       * immediately and only contacts the API while being iterated, so the
       * error surfaces here rather than at the call - catching around the call
       * itself would never fire.
       */
      const run = async (withFallbacks: boolean) => {
        const s = withFallbacks
          ? client.beta.messages.stream({
              ...params,
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
            } as any)
          : client.messages.stream(params);

        for await (const event of s) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
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
        // The stream has already begun, so an error cannot become a status
        // code - it goes down the pipe as a marker the client renders.
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
