import Anthropic from '@anthropic-ai/sdk';
import { symbolNewsAll, type NewsResult } from '@/lib/news';
import { technicalSnapshot, type TechnicalSnapshot } from '@/lib/technical';
import { whyFacts, whySystem } from '@/lib/ltwhy';

export const dynamic = 'force-dynamic';

const MODEL = 'claude-opus-5';

/**
 * Trần, không phải mức chi - Claude tính tiền theo thứ nó thật sự viết ra.
 * Đặt cao hẳn vì suy luận thích ứng ĂN CHUNG hạn mức này, đúng cái bẫy đã
 * làm bản dịch hồ sơ công ty hỏng suốt ba vòng sửa (#118).
 */
const MAX_TOKENS = 16_000;

/**
 * "Tại sao rớt?" - chỉ chạy khi người dùng BẤM.
 *
 * Chủ app chọn đúng cách này thay vì tự chạy cho mọi mã: một lượt quét ra 20
 * mã sẽ thành 20 lượt gọi Claude và 20 lần lấy tin, trong khi thường chỉ có
 * vài mã đáng đọc kỹ. Cùng tinh thần nút "Ask Claude" ở tab Analyze.
 *
 * Client GỬI LÊN chính dòng nó đang hiện (cùng khuôn /api/ai và
 * /api/tradebrief), nên route này không quét lại và không thể bất đồng với
 * bảng chính - Long-term chỉ tính SMA200 + vùng hỗ trợ, không có RSI/MACD/
 * Bollinger/ATR/IV. Route thêm HAI thứ client không có: tin tức, và ảnh
 * chụp kỹ thuật/IV của tab Analyze cho đúng mã này (`technicalSnapshot()`
 * trong lib/technical.ts - CÙNG hàm tab Analyze dùng, không phải một lần
 * tính riêng có thể trôi lệch, đúng bài học #96/#99). Chủ app hỏi thẳng:
 * "khi longterm kiếm ra được stock nào thì khi tôi bấm vô nút hỏi claude
 * thì lấy thêm thông tin bên tab analysis nữa" - đây là câu trả lời.
 *
 * Cố ý KHÔNG gọi lại Finviz hay tin tức của tab Analyze (`/api/analyze`
 * cũng có cả hai): Long-term đã có Finviz riêng từ chính lượt quét
 * (`row.fa`) và tin tức riêng từ `news.ts` - gọi lại là tốn thêm và có
 * thể ra một con số LỆCH với con số đã hiện trên bảng bên cạnh.
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

  const row = body?.row;
  if (!row?.symbol) return Response.json({ error: 'Missing row' }, { status: 400 });

  /* Tin hỏng KHÔNG làm hỏng cả câu trả lời: prompt có nhánh riêng nói rằng
     không kiểm được tin, và Claude được dặn phải nói ra điều đó. Nuốt lỗi
     rồi im lặng sẽ biến một lỗi mạng thành kết luận "không có tin gì xấu".
     Cùng lý do, kỹ thuật/IV cũng chạy song song và hỏng riêng: một request
     Schwab lỗi không được phép làm mất phần tin tức đã lấy được, và ngược
     lại. */
  const [newsSettled, techSettled] = await Promise.allSettled([
    symbolNewsAll(String(row.symbol), 10, row.name ? String(row.name) : null),
    // Đúng con số tab Analyze đang hiện cho mã này (lib/technical.ts) -
    // không phải một lần tính riêng có thể lệch với tab kia (#96/#99).
    technicalSnapshot(String(row.symbol)),
  ]);

  let news: NewsResult | null = null;
  let newsError: string | null = null;
  if (newsSettled.status === 'fulfilled') {
    news = newsSettled.value;
    /* Mọi nguồn cùng chết mới là "không kiểm được tin". Một nguồn chết thì
       `news.failed` đã nói rõ trong prompt, và phần còn lại vẫn đọc được -
       gộp hai chuyện đó lại là tự bịt mắt mình một nửa. */
    if (!news.ok.length && news.failed.length) {
      newsError = news.failed.map((f) => `${f.source}: ${f.error}`).join(' | ');
    }
  } else {
    newsError = String(newsSettled.reason?.message ?? newsSettled.reason).slice(0, 200);
  }

  let tech: TechnicalSnapshot | null = null;
  let techError: string | null = null;
  if (techSettled.status === 'fulfilled') {
    tech = techSettled.value;
  } else {
    techError = String(techSettled.reason?.message ?? techSettled.reason).slice(0, 200);
  }

  const client = new Anthropic();
  const params = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: whySystem(body?.lang === 'en' ? 'en' : 'vi'),
    thinking: { type: 'adaptive' as const },
    messages: [{ role: 'user' as const, content: whyFacts(row, news, newsError, tech, techError) }],
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (t: string) => controller.enqueue(encoder.encode(t));
      try {
        const s = client.messages.stream(params);
        for await (const event of s) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send(event.delta.text);
          }
        }
        const final = await s.finalMessage();
        /* Bị cắt giữa chừng phải NÓI RA. Một câu trả lời đứt ngang trông y
           hệt một câu trả lời viết xong - và #118 đã mất ba vòng sửa đúng vì
           chỗ này im lặng. */
        if (final.stop_reason === 'max_tokens') send('\n\n[AI_TRUNCATED]');
        if (final.stop_reason === 'refusal') send('\n\n[REFUSED]');
      } catch (e: any) {
        const msg =
          e instanceof Anthropic.AuthenticationError
            ? 'AI_BAD_KEY'
            : e instanceof Anthropic.RateLimitError
              ? 'AI_RATE_LIMITED'
              : e instanceof Anthropic.BadRequestError
                ? 'AI_BAD_REQUEST'
                : 'AI_FAILED';
        // Luồng đã mở nên lỗi không thể thành mã HTTP nữa - nó đi xuống ống
        // như một dấu hiệu để client vẽ.
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

/* Tin tức cũng cần đường riêng: bảng muốn hiện vài tiêu đề mà KHÔNG gọi
   Claude (miễn phí, không tốn hạn mức API). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const symbol = sp.get('symbol');
  if (!symbol) return Response.json({ error: 'Missing symbol' }, { status: 400 });
  try {
    const r = await symbolNewsAll(symbol, 8, sp.get('name'));
    return Response.json({ news: r.items, sources: r.ok, failed: r.failed });
  } catch (e: any) {
    /* 200 kèm lý do THẬT, không phải 500 trống: màn hình cần phân biệt
       "không có tin" với "không lấy được tin". */
    return Response.json({ news: null, error: String(e?.message ?? e).slice(0, 200) });
  }
}
