import { NextRequest, NextResponse } from 'next/server';
import { loadEarnings } from '@/lib/screener';
import { normalizeSymbol } from '@/lib/watchlist';
import { symbolNews } from '@/lib/news';
import { finvizQuote } from '@/lib/finviz';
import { fmpCompanyProfile, mergeProfile } from '@/lib/profile';
import { technicalSnapshot } from '@/lib/technical';

export const dynamic = 'force-dynamic';

/**
 * Năm việc song song cho mỗi lần phân tích: chỉ số kỹ thuật (3 request
 * Schwab, xem lib/technical.ts), lịch earnings, tin tức, Finviz, hồ sơ FMP.
 * Chỉ chạy khi người dùng bấm, nên không đụng tới hạn mức của lần quét rổ.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbol');
  if (!raw)
    return NextResponse.json({ error: 'Thiếu tham số symbol' }, { status: 400 });
  const symbol = normalizeSymbol(raw);

  try {
    const [snap, earnings, news, finviz, fmpProfile] = await Promise.all([
      technicalSnapshot(symbol),
      loadEarnings(),
      // Tin tức là phần phụ: hỏng thì phần còn lại vẫn trả về đủ.
      symbolNews(symbol).catch(() => []),
      // Finviz là đọc HTML, dễ hỏng khi họ đổi giao diện: hỏng thì bỏ qua.
      finvizQuote(symbol).catch(() => null),
      // Hồ sơ công ty: tự nuốt lỗi, lý do trả về trong `note`.
      fmpCompanyProfile(symbol),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const nextEarnings = (earnings[symbol] || []).find((d) => d >= today) ?? null;

    return NextResponse.json({
      symbol: snap.symbol,
      name: snap.name,
      exchange: snap.exchange,
      assetSubType: snap.assetSubType,
      price: snap.price,
      technical: snap.technical,
      options: snap.options,
      fundamental: { ...snap.fundamental, nextEarnings },

      news,
      finviz,
      // Công ty này làm gì — Schwab không có dòng nào về chuyện đó, nên ghép từ
      // FMP và Finviz. null nghĩa là cả hai nguồn đều không nói gì.
      profile: mergeProfile(fmpProfile, finviz?.profile ?? null),

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
