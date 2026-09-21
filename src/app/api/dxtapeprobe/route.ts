import { NextRequest, NextResponse } from 'next/server';
import { ttConfigured } from '@/lib/tastytrade';
import { fetchDxQuoteToken } from '@/lib/dxtoken';
import { dxHandshake } from '@/lib/dxprobe';
import {
  CANDLE_PERIOD,
  TAPE_LOOKBACK_MS,
  bestRoute,
  candleSymbol,
  countsByType,
  emptyTapeState,
  footprintCheck,
  observeTape,
  tapePlan,
} from '@/lib/dxtape';
import { sessionOpenAt } from '@/lib/internals-pure';

/**
 * Tape của DXLink có đủ để dựng FOOTPRINT không? Chạy một lần ở
 * production, đọc hình dạng THẬT, rồi mới bàn tính năng.
 *
 * Bốn câu hỏi và lý do từng câu: xem đầu `src/lib/dxtape.ts`. Tóm tắt cách
 * đọc kết quả nằm ở `howToRead` cuối câu trả lời.
 *
 * CỐ TÌNH trong OWNER_ONLY: probe này mở một phiên streaming trên TÀI KHOẢN
 * MÔI GIỚI của chủ app (cùng lý do `/api/breadthprobe` và `/api/ttprobe`).
 * Và KHÔNG BAO GIỜ trả token: `quoteToken` chỉ mang boolean/tên khoá/độ
 * dài, còn thông điệp AUTH ghi lại đã che token ngay trong `dxHandshake`.
 */
export const dynamic = 'force-dynamic';

const DEFAULT_SYMBOLS = ['AAPL', 'SPY', 'SPX'];
const MAX_SYMBOLS = 5;
const DEFAULT_SECONDS = 15;
const MAX_SECONDS = 30;

function askedSymbols(req: NextRequest): string[] {
  const raw = req.nextUrl.searchParams.get('symbols');
  if (!raw) return DEFAULT_SYMBOLS;
  const list = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);
  return list.length ? list : DEFAULT_SYMBOLS;
}

export async function GET(req: NextRequest) {
  if (!ttConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'TT_NOT_CONFIGURED',
        hint: 'Cần tài khoản tastytrade đã cấu hình (TT_CLIENT_SECRET + TT_REFRESH_TOKEN, hoặc TT_USERNAME + TT_PASSWORD) — xem DEPLOY.md.',
      },
      { status: 400 }
    );
  }

  const symbols = askedSymbols(req);
  const secondsRaw = Number(req.nextUrl.searchParams.get('seconds'));
  const seconds = Number.isFinite(secondsRaw) ? Math.min(MAX_SECONDS, Math.max(5, secondsRaw)) : DEFAULT_SECONDS;

  const now = new Date();
  const marketOpen = sessionOpenAt(now);
  /* Cả cửa sổ lùi lại có nằm ngoài phiên không? Nếu có thì một cái tape
     RỖNG không chứng minh được gì — "không có lệnh nào khớp lúc 22h" và
     "feed này không phục vụ TimeAndSale" là hai chuyện khác hẳn, và đây là
     thứ duy nhất tách được chúng. */
  const windowStart = new Date(now.getTime() - TAPE_LOOKBACK_MS);
  const windowAllClosed = !marketOpen && !sessionOpenAt(windowStart);

  const got = await fetchDxQuoteToken();
  if (!got.ok) {
    return NextResponse.json({
      note: 'Bước 1 (xin token streamer) chưa qua nên chưa bắt tay. Không có token nào trong câu trả lời này.',
      quoteToken: got.info,
      dxlink: {
        attempted: false,
        skipped:
          got.kind === 'failed'
            ? 'không xin được token streamer — hướng DXLink đóng ngay ở bước này'
            : `200 nhưng thiếu ${got.missing} — đọc bodyKeys để thấy tên trường thật`,
      },
      howToRead:
        got.kind === 'failed'
          ? 'Đọc `quoteToken.error`: 404 = tài khoản không có đường này, 403 = có nhưng chưa được cấp quyền, 401 = giấy tờ sai. Ba thứ đó ba cách sửa khác nhau.'
          : 'Tên trường trong `lib/dxtoken.ts` là NHỚ, chưa đo chắc. `quoteToken.bodyKeys` là tên THẬT — sửa theo đó.',
    });
  }

  const plan = tapePlan(symbols);
  const state = emptyTapeState();
  const dx = await dxHandshake(got.url, got.token, symbols, seconds * 1000, {
    plan,
    onMessage: (raw) => observeTape(raw, state),
    /* KHÔNG dừng sớm: cần nghe hết cửa sổ để số đếm và nhịp gộp có nghĩa,
       và một mã im lặng chỉ chứng minh được điều gì sau khi đã chờ đủ. */
    stopWhen: () => false,
  });

  const counts = countsByType(state);
  const checks = [...state.tape.values()].map(footprintCheck).sort((a, b) => b.events - a.events);
  const route = checks.length ? bestRoute(checks) : 'no-tape';

  /* Nhịp gộp: đọc cái máy chủ CẤP, không phải cái ta XIN. Đây là câu hỏi
     nguy hiểm nhất của cả phép đo — tape bị gộp thì footprint dựng trên nó
     SAI mà TRÔNG ĐÚNG, đúng hình dạng lỗi đã làm đường NinjaTrader dừng. */
  const granted = dx.feedConfigs.map((c) => ({ channel: c.channel, aggregationPeriod: c.aggregationPeriod }));
  const conflated = granted.filter((g) => typeof g.aggregationPeriod === 'number' && g.aggregationPeriod > 0);

  const tapeEvents = counts.TimeAndSale ?? 0;
  const feedAlive = (counts.Quote ?? 0) + (counts.Trade ?? 0) + tapeEvents > 0;

  let howToRead: string;
  if (!dx.authorized) {
    howToRead =
      'CHƯA xác thực được với DXLink — mọi kết luận về footprint đều vô nghĩa ở đây. Đọc `dxlink.messages`: lời từ chối của DXLink nói ra chỗ hỏng (token hết hạn, sai định dạng SETUP/AUTH).';
  } else if (!feedAlive) {
    howToRead =
      'Xác thực XONG nhưng KHÔNG một sự kiện nào chảy về (kể cả Quote của mã đối chứng AAPL). ' +
      (marketOpen
        ? 'Sàn đang mở, nên đây là chuyện đăng ký: đọc `dxlink.messages` xem DXLink có từ chối FEED_SETUP/FEED_SUBSCRIPTION không, và `dxlink.channelsOpened` xem kênh nào mở được.'
        : 'Sàn đang ĐÓNG — chưa kết luận được gì, bấm lại trong phiên (09:30–16:00 New York).');
  } else if (tapeEvents === 0) {
    howToRead =
      `Feed SỐNG (Quote ${counts.Quote ?? 0}, Trade ${counts.Trade ?? 0}) nhưng KHÔNG có sự kiện TimeAndSale nào. Ba khả năng, và chúng cần ba cách sửa khác nhau: ` +
      '(a) gói này không phục vụ TimeAndSale; ' +
      '(b) đăng ký sai dạng — `fromTime` là thứ tôi NHỚ chứ chưa đo, nên đọc `dxlink.messages` xem DXLink có từ chối mục đăng ký không; ' +
      (windowAllClosed
        ? `(c) cả cửa sổ lùi ${Math.round(TAPE_LOOKBACK_MS / 60000)} phút nằm NGOÀI phiên nên đúng là không có lệnh nào khớp — khả năng này đang đứng, bấm lại trong phiên trước khi kết luận.`
        : '(c) không có lệnh nào khớp — KHÔNG phải ở đây, vì cửa sổ lùi có chạm vào phiên.');
  } else {
    const best = checks.find((c) => c.route === route);
    howToRead =
      `Tape CHẢY: ${tapeEvents} sự kiện TimeAndSale trên ${checks.length} (kênh × mã). ` +
      (route === 'feed'
        ? `LÀM ĐƯỢC FOOTPRINT thẳng từ feed. ${best?.reason ?? ''}`
        : route === 'infer'
          ? `Làm được footprint bằng cách SUY phía từ bid/ask, kèm một phần không suy được — con số ở \`tape[].inferCoverage\`. ${best?.reason ?? ''}`
          : `KHÔNG dựng được footprint từ nguồn này. ${best?.reason ?? ''}`) +
      ' Đọc thêm `tape[].fieldKeys` (tên trường THẬT — mọi tên trong dxtape.ts là nhớ) và `tape[].sample` (một sự kiện nguyên văn).';
  }

  if (conflated.length) {
    howToRead +=
      ` ⚠ MÁY CHỦ GỘP NHỊP: xin acceptAggregationPeriod=0 nhưng được cấp ${conflated
        .map((g) => `kênh ${g.channel}=${g.aggregationPeriod}`)
        .join(', ')}. Tape đã gộp thì footprint dựng trên nó SAI mà TRÔNG ĐÚNG — phải giải quyết chuyện này trước mọi thứ khác.`;
  }

  return NextResponse.json({
    note:
      'Dò xem tape của DXLink có đủ dựng footprint không (từng lệnh khớp: giá + khối lượng + phía chủ động). ' +
      'Chưa có tính năng nào đọc cái này — đo trước, code sau. Không có token hay khoá nào trong câu trả lời.',
    askedSymbols: symbols,
    candleSymbols: symbols.map(candleSymbol),
    candlePeriod: CANDLE_PERIOD,
    listenSeconds: seconds,
    lookbackMinutes: Math.round(TAPE_LOOKBACK_MS / 60000),
    newYork: now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
    marketOpen,
    /** Cả cửa sổ lùi nằm ngoài phiên → tape rỗng KHÔNG chứng minh được gì. */
    lookbackWindowAllClosed: windowAllClosed,
    quoteToken: got.info,
    eventCounts: counts,
    /** Nến thời gian thực: có thì thay được đường hỏi-đáp `/pricehistory`. */
    candlesReceived: counts.Candle ?? 0,
    aggregationGranted: granted,
    feedConfigs: dx.feedConfigs,
    footprintRoute: route,
    tape: checks.map((c) => {
      const o = state.tape.get(`${c.channel}|${c.symbol}`);
      return { ...c, fieldKeys: o?.fieldKeys ?? [], stringValues: o?.stringValues ?? {}, sample: o?.sample ?? null };
    }),
    dxlink: {
      attempted: dx.attempted,
      skipped: dx.skipped,
      authorized: dx.authorized,
      channelsOpened: dx.channelsOpened,
      error: dx.error,
      messages: dx.messages,
    },
    howToRead,
  });
}
