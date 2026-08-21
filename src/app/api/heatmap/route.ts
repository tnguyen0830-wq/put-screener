import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { quotes } from '@/lib/schwab';

export const dynamic = 'force-dynamic';

type Constituent = { symbol: string; name: string; sector: string; industry?: string };

/**
 * Kích thước ô luôn lấy từ Schwab (vốn hoá = giá × số cổ phiếu lưu hành), vì đó
 * là dữ liệu bạn có quyền truy cập và là real-time.
 *
 * Màu ô: khung 1 ngày cũng lấy từ Schwab. Các khung dài hơn (1 tuần, 1 tháng,
 * YTD) lấy từ endpoint bản đồ của Finviz — tính từ Schwab sẽ tốn 503 request
 * lịch sử giá, còn Finviz trả đủ trong đúng một request. robots.txt của họ
 * không chặn đường dẫn này.
 */
const FINVIZ_ST: Record<string, string> = { '1w': 'w1', '1m': 'm1', ytd: 'ytd' };
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

/* 503 báo giá = 6 request Schwab. Cache ngắn để đổi khung thời gian hoặc mở
   lại tab không phải quét lại từ đầu. */
let cache: { at: number; rows: any[] } | null = null;
const TTL_MS = 60_000;

async function schwabRows() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const raw = await fs.readFile(
    path.resolve(process.cwd(), 'data/sp500.json'),
    'utf8'
  );
  const list: Constituent[] = JSON.parse(raw);
  const q = await quotes(list.map((c) => c.symbol.replace('.', '/')));

  const rows = list
    .map((c) => {
      const row = q[c.symbol.replace('.', '/')];
      const px = row?.quote?.lastPrice;
      const sh = row?.fundamental?.sharesOutstanding;
      if (!px || !sh) return null;
      return {
        symbol: c.symbol,
        name: c.name,
        sector: c.sector,
        // Ngành con GICS lấy từ danh sách rổ; thiếu thì lùi về ngành lớn.
        industry: c.industry || c.sector,
        marketCap: px * sh,
        price: px,
        change1d: row.quote.netPercentChange ?? 0,
      };
    })
    .filter(Boolean);

  cache = { at: Date.now(), rows };
  return rows;
}

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
    const rows = await schwabRows();

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
      cached: cache ? Date.now() - cache.at > 1000 : false,
    });
  } catch (e: any) {
    const reauth = String(e.message).includes('REAUTH_REQUIRED');
    return NextResponse.json(
      { error: reauth ? 'Phiên Schwab hết hạn. Bấm Kết nối lại.' : e.message },
      { status: reauth ? 401 : 500 }
    );
  }
}
