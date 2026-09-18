import { NextRequest, NextResponse } from 'next/server';
import { sp500Rows } from '@/lib/sp500rows';

export const dynamic = 'force-dynamic';

/**
 * Kích thước ô luôn lấy từ Schwab (vốn hoá = giá × số cổ phiếu lưu hành), vì đó
 * là dữ liệu bạn có quyền truy cập và là real-time. Phần đọc rổ + báo giá nằm
 * ở `lib/sp500rows.ts` (dùng chung với tab Bề rộng TT, cùng một cache 60s).
 *
 * Màu ô: khung 1 ngày cũng lấy từ Schwab. Các khung dài hơn (1 tuần, 1 tháng,
 * YTD) lấy từ endpoint bản đồ của Finviz — tính từ Schwab sẽ tốn 503 request
 * lịch sử giá, còn Finviz trả đủ trong đúng một request. robots.txt của họ
 * không chặn đường dẫn này.
 */
const FINVIZ_ST: Record<string, string> = { '1w': 'w1', '1m': 'm1', ytd: 'ytd' };
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

async function finvizPerf(st: string): Promise<Record<string, number>> {
  const r = await fetch(`https://finviz.com/api/map_perf?t=sec&st=${st}`, {
    headers: { 'User-Agent': UA },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Finviz ${r.status}`);
  return (await r.json())?.nodes ?? {};
}

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get('range') ?? '1d';

  try {
    const { rows, at } = await sp500Rows();

    let perf: Record<string, number> | null = null;
    let source = 'Schwab (real-time)';
    if (FINVIZ_ST[range]) {
      try {
        perf = await finvizPerf(FINVIZ_ST[range]);
        source = 'Finviz';
      } catch {
        // Finviz hỏng thì rơi về khung 1 ngày thay vì trả lỗi cả bản đồ.
        perf = null;
        source = 'Schwab (Finviz không phản hồi, hiện khung 1 ngày)';
      }
    }

    // sp500.json viết cổ phiếu nhiều lớp bằng gạch chéo (BRK/B, BF/B) theo kiểu
    // Schwab; Finviz dùng gạch ngang (BRK-B, BF-B).
    const items = rows.map((r: any) => ({
      ...r,
      change: perf
        ? perf[r.symbol] ?? perf[r.symbol.replace('/', '-')] ?? null
        : r.change1d,
    }));

    /* Biến động của một nhóm là trung bình có trọng số theo vốn hoá — đúng cách
       một chỉ số theo vốn hoá vận động, không phải trung bình cộng. */
    const rollup = (members: any[]) => {
      const withChange = members.filter((m) => m.change !== null);
      const capSum = withChange.reduce((a, b) => a + b.marketCap, 0);
      return {
        marketCap: members.reduce((a, b) => a + b.marketCap, 0),
        change: capSum
          ? withChange.reduce((a, b) => a + b.change * b.marketCap, 0) / capSum
          : 0,
      };
    };

    /* Ba tầng: ngành lớn -> ngành con -> mã, giống cách bản đồ Finviz xếp. Gom
       thêm một tầng làm những mã cùng nhóm nằm cạnh nhau, nên nhìn ra được cả
       nhóm đang đỏ hay chỉ một mã lẻ đỏ. */
    const bySector: Record<string, any[]> = {};
    for (const it of items) (bySector[it.sector] ||= []).push(it);

    const sectors = Object.entries(bySector)
      .map(([name, members]) => {
        const byIndustry: Record<string, any[]> = {};
        for (const it of members) (byIndustry[it.industry] ||= []).push(it);
        return {
          name,
          ...rollup(members),
          industries: Object.entries(byIndustry)
            .map(([iname, imembers]) => ({
              name: iname,
              ...rollup(imembers),
              members: imembers.sort((a, b) => b.marketCap - a.marketCap),
            }))
            .sort((a, b) => b.marketCap - a.marketCap),
        };
      })
      .sort((a, b) => b.marketCap - a.marketCap);

    return NextResponse.json({
      range,
      source,
      sectors,
      count: items.length,
      fetchedAt: new Date().toISOString(),
      cached: Date.now() - at > 1000,
    });
  } catch (e: any) {
    const reauth = String(e.message).includes('REAUTH_REQUIRED');
    return NextResponse.json(
      { error: reauth ? 'Phiên Schwab hết hạn. Bấm Kết nối lại.' : e.message },
      { status: reauth ? 401 : 500 }
    );
  }
}
