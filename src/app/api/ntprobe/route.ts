import { NextRequest, NextResponse } from 'next/server';
import {
  NtError,
  describeList,
  ntBaseUrl,
  ntConfigured,
  ntEnv,
  ntGet,
  ntMdHandshake,
  ntMdWsUrl,
  ntRequestToken,
  scrubJson,
} from '@/lib/ninjatrader';

/**
 * Dò HÌNH DẠNG thật của API Tradovate (nền của web.ninjatrader.com), chạy
 * một lần trong production. Cùng lý do tồn tại với `/api/ttprobe` và
 * `/api/xprobe`: host bị chặn từ sandbox, và "đọc tài liệu rồi code theo"
 * đã sai nhiều lần ở repo này. Năm câu hỏi và lý do từng câu: xem đầu
 * `src/lib/ninjatrader.ts`.
 *
 * CỐ TÌNH: chỉ chủ app (`/api/ntprobe` nằm trong OWNER_ONLY) — token
 * Tradovate KHÔNG có scope chỉ-đọc, nó là token của tài khoản môi giới,
 * người nhà không được là người bấm nút trên đó. Và KHÔNG BAO GIỜ trả mật
 * khẩu, `sec` hay token: mọi thứ về xác thực đi ra ngoài là boolean, tên
 * khoá hoặc mã trạng thái; câu trả lời cuối còn được quét che lần nữa.
 */
export const dynamic = 'force-dynamic';

type Step = { ok: boolean; status?: number | null; bodyKind?: string | null; error?: string; body?: string | null; [k: string]: unknown };

async function step(run: () => Promise<Record<string, unknown>>): Promise<Step> {
  try {
    return { ok: true, ...(await run()) };
  } catch (e: any) {
    if (e instanceof NtError) return { ok: false, status: e.status, bodyKind: e.bodyKind, error: e.message, body: e.body };
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

export async function GET(req: NextRequest) {
  if (!ntConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'NT_NOT_CONFIGURED',
        hint:
          'Đặt NT_USER + NT_PASSWORD (tên/mật khẩu đăng nhập web.ninjatrader.com) và NT_CID + NT_SEC ' +
          '(cặp khoá API tạo trong phần API Access của tài khoản) trên Render. NT_ENV=demo (mặc định) hay live.',
      },
      { status: 400 }
    );
  }

  const secrets = [process.env.NT_PASSWORD, process.env.NT_SEC];
  const out: Record<string, unknown> = {
    env: ntEnv(),
    baseUrl: ntBaseUrl(),
    mdWsUrl: ntMdWsUrl(),
    cidSet: Boolean(process.env.NT_CID),
    secSet: Boolean(process.env.NT_SEC),
  };

  /* 1. TOKEN — câu hỏi 1 và 2. Thất bại ở đây thì mọi bước sau vô nghĩa,
        nên trả về ngay với lời thật của Tradovate. */
  let tokens: Awaited<ReturnType<typeof ntRequestToken>> | null = null;
  out.auth = await step(async () => {
    tokens = await ntRequestToken();
    return { ...tokens.reply };
  });
  if (!tokens) {
    const a = out.auth as Step;
    out.note =
      a.bodyKind === 'bot-wall' || a.bodyKind === 'html-other'
        ? 'Bị chặn ở RÌA (thân là HTML), request chưa tới API — giấy tờ có thể vẫn đúng; đây là chuyện cách gửi/User-Agent, không phải mật khẩu (#130).'
        : 'API ĐÃ trả lời và từ chối — đọc `auth.body`: `errorText` là lời thật của Tradovate (thiếu gói API Access? sai cid/sec?), `p-ticket` là bị giãn nhịp (chờ p-time giây), `p-captcha` true là phải giải captcha trên web, không tự động hoá được.';
    return finish(out, secrets);
  }
  const { accessToken, mdAccessToken } = tokens as Awaited<ReturnType<typeof ntRequestToken>>;
  const allSecrets = [...secrets, accessToken, mdAccessToken];

  /* 2. BA ENDPOINT ĐỌC, song song. Chỉ hình dạng: số dòng, khoá, kiểu; và
        vài trường CÔNG KHAI đáng đọc (tên hợp đồng, loại tài khoản). */
  const [accounts, contracts, plugins] = await Promise.all([
    step(async () => {
      const { status, json } = await ntGet('/account/list', accessToken);
      return { status, ...describeList(json, ['accountType', 'active', 'archived', 'clearingHouse']) };
    }),
    step(async () => {
      const t = (req.nextUrl.searchParams.get('t') || 'ES').toUpperCase().slice(0, 6);
      const { status, json } = await ntGet(`/contract/suggest?t=${encodeURIComponent(t)}&l=5`, accessToken);
      return { status, asked: t, ...describeList(json, ['name', 'contractMaturityId', 'status']) };
    }),
    /* Danh sách gói thêm của tài khoản — chưa đo có endpoint này không; một
       cái 404 cũng là phát hiện (phải tìm "API Access" ở chỗ khác). */
    step(async () => {
      const { status, json } = await ntGet('/userPlugin/list', accessToken);
      return { status, ...describeList(json, ['pluginName', 'expirationDate', 'autorenewal']) };
    }),
  ]);
  out.accounts = accounts;
  out.contracts = contracts;
  out.plugins = plugins;

  /* 3. WEBSOCKET dữ liệu thị trường — câu hỏi 3 và 4. Mã đăng ký lấy từ
        CHÍNH `contract/suggest` (tên thật, không đoán); không có thì dùng
        `?symbol=` hoặc `ESZ6` và nói rõ là đoán. */
  const picked = (contracts as any)?.picked?.[0]?.name;
  const symbol = req.nextUrl.searchParams.get('symbol') || (typeof picked === 'string' ? picked : 'ESZ6');
  const mdToken = mdAccessToken ?? accessToken;
  const md = await ntMdHandshake(ntMdWsUrl(), mdToken, symbol, 8000);
  out.md = {
    symbol,
    symbolSource: req.nextUrl.searchParams.get('symbol') ? 'query' : typeof picked === 'string' ? 'contract/suggest' : 'đoán (ESZ6)',
    tokenUsed: mdAccessToken ? 'mdAccessToken' : 'accessToken (không có mdAccessToken)',
    ...md,
  };

  out.note =
    'Chỉ dò hình dạng, không có bí mật nào trong câu trả lời. Đọc theo thứ tự: `auth.hasMdAccessToken` (token md riêng?), ' +
    '`contracts.picked` (tên hợp đồng thật), `md.authorized` + `md.observation.mdFrames` (luồng md chạy?), ' +
    '`md.observation.quoteEntryKeys` (Bid/Offer/Trade?), `md.observation.chartBarKeys` (có histogram/bid-ask volume cho footprint?). ' +
    'Ngoài giờ giao dịch ES vẫn có quote (gần 23/24h) nhưng ít tick; `md.messages` là nguyên văn hai chiều, lời từ chối nói ra định dạng đúng.';
  return finish(out, allSecrets);
}

function finish(out: Record<string, unknown>, secrets: (string | undefined | null)[]) {
  return NextResponse.json(scrubJson(out, secrets));
}
