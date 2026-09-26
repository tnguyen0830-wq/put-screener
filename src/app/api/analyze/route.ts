import { NextRequest, NextResponse } from 'next/server';
import { loadManualEarnings } from '@/lib/screener';
import { ttEarningsFor, ttEarningsStatus } from '@/lib/ttearnings';
import { resolveNextEarnings } from '@/lib/earningsdate';
import { startAlertLoop } from '@/lib/alert-runner';
import { normalizeSymbol } from '@/lib/watchlist';
import { symbolNewsAll, type NewsResult } from '@/lib/news';
import { basketEntry, loadMoves } from '@/lib/moveload';
import { finvizQuote } from '@/lib/finviz';
import { fmpCompanyProfile, mergeProfile } from '@/lib/profile';
import { technicalSnapshot } from '@/lib/technical';
import { logActivity } from '@/lib/activity';
import { currentUser } from '@/lib/users';

export const dynamic = 'force-dynamic';

/**
 * Các việc song song cho mỗi lần phân tích: chỉ số kỹ thuật (3 request
 * Schwab, xem lib/technical.ts), lịch earnings, tin tức (Yahoo + Google News
 * + SEC), Finviz, hồ sơ FMP, và diễn biến giá so với SPY/ngành (1 request
 * Schwab + nến ngày đã cache — lib/moveload.ts).
 * Chỉ chạy khi người dùng bấm, nên không đụng tới hạn mức của lần quét rổ.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbol');
  if (!raw)
    return NextResponse.json({ error: 'Thiếu tham số symbol' }, { status: 400 });
  const symbol = normalizeSymbol(raw);
  /* Ghi nhật ký hoạt động (lib/activity.ts). Không bao giờ ném, không chặn
     đường đi chính - xem chú thích ở `logActivity`. */
  await logActivity(currentUser(req), 'analyze', symbol);
  /* Vòng lặp nền mang lượt đồng bộ lịch earnings cho cả Screener và My
     Portfolio; trước đây nó chỉ khởi động khi có người mở Insider Trade hay
     My Portfolio. Idempotent - gọi lại không làm gì. */
  startAlertLoop();

  try {
    /* Tên công ty cho Google News: rổ S&P 500 có tên sạch ngay tức thì (đọc
       file), nên tin tức chạy SONG SONG với Schwab. Mã ngoài rổ thì chờ tên
       Schwab trả về — tìm theo mã trần ra tin rác với ALL, ON, IT, NOW. */
    const entry = await basketEntry(symbol);
    const snapP = technicalSnapshot(symbol);
    const namedP: Promise<string | null> = entry?.name
      ? Promise.resolve(entry.name)
      : snapP.then((s) => s.name).catch(() => null);
    /* Ba nguồn tin hỏng ĐỘC LẬP (news.ts). Trước đây lỗi bị nuốt thành mảng
       rỗng, tức "mọi nguồn chết" hiện y hệt "không có tin" — giờ trả kèm
       nguồn nào trả lời, nguồn nào hỏng và vì sao. */
    const newsP: Promise<NewsResult> = namedP
      .then((name) => symbolNewsAll(symbol, 12, name))
      .catch((e: any) => ({
        items: [],
        ok: [],
        failed: [{ source: 'news', error: String(e?.message ?? e).slice(0, 200) }],
      }));
    /* Diễn biến giá so với SPY/ngành (lib/moveread.ts) — cần nến và HV20 của
       chính mã, nên chạy sau Schwab; hỏng thì null, phần còn lại vẫn đủ. */
    const movesP = snapP
      .then((s) =>
        loadMoves({
          symbol,
          spot: s.price.spot,
          recent: s.recent,
          hv20: s.technical.hv20,
          gicsSector: entry?.sector ?? null,
        })
      )
      .catch(() => null);

    const [snap, manual, ttLookup, ttStatus, newsR, finviz, fmpProfile, moves] = await Promise.all([
      snapP,
      loadManualEarnings().catch(() => ({}) as Record<string, string[]>),
      // Hỏi riêng mã này nếu kho chưa có hoặc đã quá 24 giờ - mã ngoài danh
      // sách theo dõi không bao giờ được lượt nền hỏi tới.
      ttEarningsFor(symbol).catch((e: any) => ({
        configured: true, record: null, asked: true, undecided: false, missing: false,
        error: String(e?.message ?? e),
      })),
      ttEarningsStatus().catch(() => null),
      // Tin tức là phần phụ: hỏng thì phần còn lại vẫn trả về đủ.
      newsP,
      // Finviz là đọc HTML, dễ hỏng khi họ đổi giao diện: hỏng thì bỏ qua.
      finvizQuote(symbol).catch(() => null),
      // Hồ sơ công ty: tự nuốt lỗi, lý do trả về trong `note`.
      fmpCompanyProfile(symbol),
      movesP,
    ]);

    /* Ngày New York, không phải UTC: sau 20:00 ET ngày UTC đã sang hôm sau
       và một earnings báo cáo tối nay sẽ bị coi là "đã qua". */
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const earnings = resolveNextEarnings({
      today,
      tt: ttLookup,
      fileDates: manual[symbol],
      finvizRaw: finviz?.metrics?.['Earnings'] ?? null,
      schwabLast: snap.fundamental.lastEarnings,
    });
    const nextEarnings = earnings.date;

    return NextResponse.json({
      symbol: snap.symbol,
      name: snap.name,
      exchange: snap.exchange,
      assetSubType: snap.assetSubType,
      price: snap.price,
      technical: snap.technical,
      options: snap.options,
      fundamental: {
        ...snap.fundamental,
        nextEarnings,
        nextEarningsSource: earnings.source,
        nextEarningsEstimated: earnings.estimated,
      },
      /* Nguồn, trạng thái và vì sao thiếu (lib/earningsdate.ts), cộng tình
         trạng lượt đồng bộ tastytrade dùng chung cho Screener/My Portfolio. */
      earnings: { ...earnings, sync: ttStatus },

      news: newsR.items,
      newsStatus: { ok: newsR.ok, failed: newsR.failed },
      moves,
      finviz,
      // Công ty này làm gì — Schwab không có dòng nào về chuyện đó, nên ghép từ
      // FMP và Finviz. null nghĩa là cả hai nguồn đều không nói gì.
      profile: mergeProfile(fmpProfile, finviz?.profile ?? null),

      /* Vùng hỗ trợ/kháng cự cho phần "Kịch bản giá" (lib/outlook.ts). */
      zones: snap.zones,

      meta: snap.meta,
    });
  } catch (e: any) {
    const reauth = String(e.message).includes('REAUTH_REQUIRED');
    const notFound = /không có dữ liệu|không đủ lịch sử/i.test(String(e.message));
    return NextResponse.json(
      { error: reauth ? 'Phiên Schwab hết hạn. Bấm Kết nối lại.' : e.message },
      { status: reauth ? 401 : notFound ? 404 : 500 }
    );
  }
}
