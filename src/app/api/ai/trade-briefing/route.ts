import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude viết phần diễn giải cho AI Trade Briefing trong khung GEX - CHỈ
 * diễn giải, không tự tạo số. Client post lại đúng object đã hiển thị (lấy
 * từ /api/tradebrief) - route này không đụng Schwab, không tính lại gì.
 *
 * Kiến trúc lặp lại y hệt /api/ai/route.ts (streaming, retry fallback khi
 * bị từ chối, cùng cách báo lỗi qua marker trong luồng chữ) - xem chú thích
 * ở file đó cho lý do đầy đủ của từng phần, không lặp lại ở đây.
 */
export const dynamic = 'force-dynamic';

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 16_000;

const n = (v: unknown, digits = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : 'n/a';

const pct = (v: unknown, digits = 1) =>
  typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(digits)}%` : 'n/a';

function ideaLine(idea: any): string {
  const gain = idea.maxGain === null ? 'unlimited' : `$${n(idea.maxGain)}`;
  const loss = idea.maxLoss === null ? 'unlimited' : `$${n(idea.maxLoss)}`;
  const be = (idea.breakeven ?? []).map((b: number) => n(b)).join(' / ') || 'n/a';
  const cost = idea.netCost >= 0 ? `cost $${n(idea.netCost)}` : `credit $${n(-idea.netCost)}`;
  return `- [${idea.kind}, ${idea.bias}] ${idea.legsLabel} (${idea.dte}d, exp ${idea.expiration}) - ${cost}, delta ${n(idea.greeks.delta, 2)}, max gain ${gain}, max loss ${loss}, breakeven ${be}`;
}

function horizonBlock(label: string, h: any): string {
  const ideas = (h.ideas ?? []).map(ideaLine).join('\n');
  return [
    `${label}: ${h.dte} DTE, expiration ${h.expiration ?? 'n/a'}`,
    `ATM IV ${pct(h.atmIv)}, expected move ~$${n(h.expectedMove)}`,
    ideas || '(no listed strikes close enough to the target levels)',
  ].join('\n');
}

/** Gộp toàn bộ facts đã tính sẵn thành bảng compact Claude đọc. */
function facts(b: any): string {
  return [
    `Ticker: ${b?.symbol}, spot ${n(b?.spot)}, date ${b?.date}`,
    `GEX regime: ${b?.regime}, total net GEX ${n(b?.totalGex, 0)}`,
    `Put wall ${n(b?.putWall)}, call wall ${n(b?.callWall)}, gamma flip ${n(b?.gammaFlip)}`,
    `IV ${pct(b?.vol?.iv)}, HV20 ${pct(b?.vol?.hv20 ? b.vol.hv20 * 100 : null)}, HV60 ${pct(b?.vol?.hv60 ? b.vol.hv60 * 100 : null)}`,
    `Term structure (IV60/IV30) ${n(b?.termStructure, 3)}, skew (put25d - call25d IV) ${n(b?.skew, 3)}, skew z-score ${n(b?.skewZ, 2)}`,
    '',
    horizonBlock('SHORT TERM', b?.shortTerm ?? {}),
    '',
    horizonBlock('MEDIUM TERM', b?.mediumTerm ?? {}),
  ].join('\n');
}

const system = (lang: string) => `You are writing the narrative portion of an \
options trade briefing built around gamma exposure (GEX) - put wall, call \
wall, and gamma flip - for someone deciding on a short-term options trade.

All the numbers below (strikes, cost/credit, greeks, max gain/loss, \
breakeven) are ALREADY COMPUTED from real listed option prices and real \
option payoff math. Do not recompute, restate as a table, or invent any \
number - the app renders those separately from the same data. Your job is \
only the prose: why the regime and levels make each listed idea reasonable, \
what to watch for as a trigger, and what the vol/skew numbers say about \
whether premium is rich or cheap right now.

Write your answer in ${lang === 'en' ? 'English' : 'Vietnamese'}.

Structure, in labelled sections:
1. Regime read: what POSITIVE vs NEGATIVE gamma means for how price is likely \
to behave here (mean-reversion vs trend-amplifying), and where spot sits \
relative to the gamma flip.
2. Vol read: IV against HV20/HV60, and what the term structure/skew numbers \
say - rich or cheap premium, any near-term event pricing.
3. Short term: one short paragraph per listed short-term idea explaining the \
rationale and a concrete trigger condition.
4. Medium term: same, for the medium-term ideas.

Rules:
- Use only the numbers given. Never invent a figure, a strike, a date, or a \
news event.
- Do not give a buy, sell, or hold recommendation on the underlying stock \
itself - describe what the setup offers and let the reader decide.
- If a horizon has no listed ideas (thin chain near the target strikes), say \
so plainly rather than inventing one.
- Plain text only. No markdown asterisks or hash marks - section labels on \
their own line, rendered as-is.`;

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

  const brief = body?.brief;
  if (!brief?.symbol) {
    return Response.json({ error: 'Missing brief' }, { status: 400 });
  }

  const client = new Anthropic();
  const params = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: system(body?.lang === 'en' ? 'en' : 'vi'),
    thinking: { type: 'adaptive' as const },
    messages: [{ role: 'user' as const, content: facts(brief) }],
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
