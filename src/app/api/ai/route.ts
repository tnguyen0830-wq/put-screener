import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude's read of the indicators already on screen in the analyze tab.
 *
 * The client posts the analysis object it is displaying rather than a symbol,
 * so this route costs no extra Schwab quota and cannot describe numbers the
 * user is not looking at. Only the fields below are forwarded - the payload
 * also carries a news array and raw candles, which would inflate the prompt
 * without changing the reading.
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

const n = (v: unknown, digits = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : 'n/a';

const pct = (v: unknown, digits = 1) =>
  typeof v === 'number' && Number.isFinite(v)
    ? `${(v * 100).toFixed(digits)}%`
    : 'n/a';

/** Flatten the analysis payload into the compact table Claude reads. */
function facts(a: any): string {
  const p = a?.price ?? {};
  const te = a?.technical ?? {};
  const o = a?.options ?? {};
  const f = a?.fundamental ?? {};

  return [
    `Ticker: ${a?.symbol} (${a?.name ?? ''})`,
    `Price: ${n(p.spot)}  change ${pct((p.changePct ?? 0) / 100)}`,
    `52-week: low ${n(p.low52)} / high ${n(p.high52)}, position in range ${pct(p.pos52)}`,
    '',
    `SMA20 ${n(te.sma20)} (price vs: ${pct(te.vsSma20)})`,
    `SMA50 ${n(te.sma50)} (price vs: ${pct(te.vsSma50)})`,
    `SMA200 ${n(te.sma200)} (price vs: ${pct(te.vsSma200)}), sessions on current side: ${te.sma200Streak ?? 'n/a'}`,
    `RSI14 ${n(te.rsi14, 1)}`,
    `MACD ${n(te.macd?.macd, 3)}, signal ${n(te.macd?.signal, 3)}, histogram ${n(te.macd?.histogram, 3)}`,
    `ATR14 ${n(te.atr14)} (${pct(te.atrPct)} of price)`,
    `Bollinger: lower ${n(te.bollinger?.lower)}, mid ${n(te.bollinger?.mid)}, upper ${n(te.bollinger?.upper)}`,
    `Realized vol: HV20 ${pct(te.hv20)}, HV60 ${pct(te.hv60)}, ratio ${n(te.volRatio)}`,
    '',
    `Implied vol ${pct(o.iv)}, IV/HV20 ${n(o.ivHv)}`,
    `Reference put: delta ${n(o.refDelta)}, strike ${n(o.refStrike)}, expiry ${o.refExpiration ?? 'n/a'}`,
    '',
    `P/E ${n(f.peRatio)}, EPS ${n(f.eps)}, market cap ${f.marketCap ? Math.round(f.marketCap / 1e9) + 'B' : 'n/a'}`,
    `Dividend yield ${n(f.divYield)}%, ex-date ${f.divExDate ?? 'n/a'}`,
    `Earnings: last ${f.lastEarnings ?? 'n/a'}, next ${f.nextEarnings ?? 'unknown'}`,
    `Average volume: 10-day ${f.avgVolume10d ?? 'n/a'}, 1-year ${f.avgVolume1y ?? 'n/a'}`,
  ].join('\n');
}

const system = (lang: string) => `You are reading technical and fundamental \
indicators for someone deciding whether to sell a cash-secured put on this \
stock. Selling a cash-secured put means being obliged to buy 100 shares at the \
strike, so the question that matters is what the data says about the risk of \
owning this stock at a discount, and about how well the option is currently \
being paid.

Write your answer in ${lang === 'en' ? 'English' : 'Vietnamese'}.

Cover, in short labelled sections:
1. What the trend and momentum indicators say when read together.
2. What the volatility picture says about whether premium is rich or thin \
right now - IV against realized vol is the key comparison.
3. The clearest risks in this data, including any earnings date that falls \
inside a typical 25-50 day option.

Rules you must follow:
- Use only the numbers given. Never invent a figure, a date, or a news event.
- Where indicators disagree, say so plainly rather than picking a side. A \
conflicting picture is the useful finding, not a problem to smooth over.
- Do not give a buy, sell, or hold recommendation, and do not predict a price. \
Describe what the indicators show and let the reader decide.
- If a number is missing (n/a), say what its absence prevents you concluding \
rather than working around it silently.
- Around 300 words. No preamble - start with the first section.
- Plain text only. No markdown: no asterisks, no hash marks, no bullet characters. Put each section's label on its own line - it is rendered as-is, so any syntax you type shows up literally as punctuation.`;

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
    messages: [{ role: 'user' as const, content: facts(analysis) }],
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
