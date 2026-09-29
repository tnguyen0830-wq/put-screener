import Anthropic from '@anthropic-ai/sdk';
import { facts, system } from '@/lib/airead';
import { buildOutlook, outlookFacts } from '@/lib/outlook';
import { uwFacts, type UwContext } from '@/lib/uwsummary';
import { xFacts, type XSymbolResult } from '@/lib/xsymbol';
import { socialFacts, type SocialResult } from '@/lib/social';
import { chartImageRules, parseChartImages } from '@/lib/chartimage';
import { logActivity } from '@/lib/activity';
import { currentUser } from '@/lib/users';

/**
 * Claude's read of the indicators already on screen in the analyze tab.
 *
 * The client posts the analysis object it is displaying rather than a symbol,
 * so this route costs no extra Schwab quota and cannot describe numbers the
 * user is not looking at. Only the fields lib/airead.ts picks are forwarded.
 * Since #229 that includes the news list, its per-source status and the
 * price-move-vs-market read (`moves`), so Claude can say what the market is
 * saying about the move; headlines are capped at MAX_NEWS and length-clipped
 * in `newsFacts()`. The GEX reading the page already
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

  /* MỘT lượt đọc (#239): chart → chỉ báo → GEX → dòng tiền → tin tức → kết
     luận + xu hướng sắp tới. Trước đây là hai chế độ tách rời (đọc chỉ số /
     kịch bản giá) và người dùng phải chọn một. Bản đồ mức giá vẫn được dựng
     LẠI ở đây từ đúng các payload client gửi, bằng CÙNG hàm màn hình dùng —
     không nhận bản đồ client tự tính, để prompt không thể chứa một con số
     màn hình không có. Trường `mode` cũ (trang mở từ trước deploy) bị bỏ qua. */
  const lang = body?.lang === 'en' ? 'en' : 'vi';
  const gex = body?.gex ?? null;
  const gexError =
    typeof body?.gexError === 'string' ? body.gexError.slice(0, 300) : null;

  /* Ảnh chart người dùng đính kèm (chụp tab / chọn ảnh / dán). Kiểm tra lại
     ở đây vì client không đáng tin; ảnh bị loại được ĐẾM và prompt nói ra,
     để câu trả lời không âm thầm thiếu một khung người dùng tưởng đã gửi. */
  const shots = parseChartImages(body?.images);

  await logActivity(
    currentUser(req),
    'ai',
    `${analysis.symbol}${shots.images.length ? ` · ${shots.images.length} ảnh` : ''}`
  );

  /* Dữ liệu Unusual Whales mà trang đang hiện (`/api/analyze/uw`), gửi lên
     như `gex` — "post what you display". Chỉ nhận đúng hình dạng; thứ khác
     coi như không có, và prompt nói KHÔNG CÓ chứ không để trống. */
  const uw: UwContext | null =
    body?.uw && typeof body.uw === 'object' && typeof body.uw.configured === 'boolean'
      ? (body.uw as UwContext)
      : null;

  /* Bài đăng X của mã (`/api/analyze/x`), gửi lên như `uw`. Thiếu thì
     `xFacts()` nói KHÔNG CÓ chứ không để trống. */
  const x: XSymbolResult | null =
    body?.x && typeof body.x === 'object' && typeof body.x.configured === 'boolean'
      ? (body.x as XSymbolResult)
      : null;

  /* StockTwits + Reddit (`/api/analyze/social`), gửi lên như `x`. Thiếu
     thì `socialFacts()` nói KHÔNG CÓ cho từng nguồn chứ không để trống. */
  const social: SocialResult | null =
    body?.social && typeof body.social === 'object' && (body.social.stocktwits || body.social.reddit)
      ? (body.social as SocialResult)
      : null;

  /* Ba lý do "không có" khác nhau, và chỉ lý do nói ra được cách sửa: trang
     gửi yêu cầu này nạp TRƯỚC khi có StockTwits/Reddit (khoá `social` vắng
     hẳn — tải lại trang là xong), hay chính lượt hỏi `/api/analyze/social`
     của trang đã hỏng (lý do thật đi kèm). */
  const socialMissing = social
    ? null
    : !body || typeof body !== 'object' || !('social' in body)
      ? 'the page that sent this request was loaded before StockTwits/Reddit were added to the app; tell the user to reload the page'
      : typeof body.socialError === 'string' && body.socialError
        ? `the app's own request for this data failed: ${body.socialError.slice(0, 200)}`
        : null;

  const table = `${facts(analysis, gex, gexError)}\n\n${xFacts(x).join('\n')}\n\n${socialFacts(social, Date.now(), socialMissing).join('\n')}\n\n${uwFacts(uw)}`;
  const client = new Anthropic();
  const imageRules = chartImageRules(shots.images.length, shots.dropped.length);
  const text = `${table}\n\n${outlookFacts(buildOutlook(analysis, gex, undefined, uw))}`;
  /* Ảnh đứng TRƯỚC bảng chữ trong cùng một lượt user — thứ tự tài liệu API
     khuyên cho ảnh kèm câu hỏi. Không có ảnh thì nội dung vẫn là một chuỗi
     như cũ, nên lượt hỏi không ảnh gửi đi y hệt trước đây. */
  const content: Anthropic.MessageParam['content'] = shots.images.length
    ? [
        ...shots.images.map((im) => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: im.media_type, data: im.data },
        })),
        { type: 'text' as const, text },
      ]
    : text;
  const params = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: system(lang, imageRules, shots.images.length),
    thinking: { type: 'adaptive' as const },
    messages: [{ role: 'user' as const, content }],
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
