import { NextRequest, NextResponse } from 'next/server';
import { quotes } from '@/lib/schwab';
import { loadEarnings } from '@/lib/screener';
import {
  daysBetween,
  osiSymbol,
  readPositions,
  writePositions,
  type Position,
} from '@/lib/positions';

/**
 * Danh mục: vị thế nhập tay, định giá lại bằng báo giá Schwab.
 *
 * GET trả về vị thế kèm mọi con số phụ thuộc thị trường. PUT ghi lại danh sách.
 *
 * Không nằm dưới /api/md/*, vốn bị MD_API_TOKEN chặn cho app điện thoại.
 */
export const dynamic = 'force-dynamic';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Giá mua lại một hợp đồng.
 *
 * Lấy trung điểm bid/ask khi cả hai còn sống, vì đó mới là giá đóng vị thế thật
 * sự phải trả. Giá khớp gần nhất chỉ dùng khi không có bid/ask - hợp đồng thanh
 * khoản mỏng có thể cả buổi không khớp lệnh nào, lúc đó giá cũ nói dối về lời
 * lỗ hiện tại.
 */
function markOf(q: any): number | null {
  const bid = q?.bidPrice;
  const ask = q?.askPrice;
  if (typeof bid === 'number' && typeof ask === 'number' && bid > 0 && ask > 0)
    return (bid + ask) / 2;
  const last = q?.lastPrice ?? q?.mark;
  return typeof last === 'number' && last >= 0 ? last : null;
}

export async function GET() {
  const positions = await readPositions();
  if (!positions.length) {
    return NextResponse.json({ positions: [], rows: [], summary: null });
  }

  const now = today();
  const puts = positions.filter((p) => p.kind === 'put');

  // Một lần /quotes cho cả danh mục: mã cơ sở và hợp đồng quyền chọn đi chung
  // một danh sách.
  const optionSymbols = new Map<string, string>();
  for (const p of puts)
    optionSymbols.set(p.id, osiSymbol(p.symbol, p.expiration!, p.strike!));

  let q: Record<string, any> = {};
  let quoteError: string | null = null;
  try {
    q = await quotes([
      ...new Set([...positions.map((p) => p.symbol), ...optionSymbols.values()]),
    ]);
  } catch (e: any) {
    // Phiên Schwab hỏng thì vẫn trả về danh sách vị thế: những gì bạn đã nhập
    // vẫn còn đó, chỉ thiếu phần định giá lại.
    quoteError = String(e?.message ?? e);
  }

  const earnings = await loadEarnings().catch(() => ({}) as Record<string, string[]>);

  const rows = positions.map((p: Position) => {
    const under = q[p.symbol]?.quote;
    const spot: number | null = under?.lastPrice ?? null;

    if (p.kind === 'stock') {
      const value = spot === null ? null : spot * p.shares!;
      const cost = p.cost! * p.shares!;
      return {
        ...p,
        spot,
        changePct: under?.netPercentChange ?? null,
        value,
        costTotal: cost,
        pl: value === null ? null : value - cost,
        plPct: value === null ? null : (value - cost) / cost,
        daysHeld: daysBetween(p.openedAt, now),
      };
    }

    const opt = q[optionSymbols.get(p.id)!]?.quote;
    const mark = markOf(opt);
    const shares = p.contracts! * 100;
    const creditTotal = p.credit! * shares;
    const buyback = mark === null ? null : mark * shares;
    const pl = buyback === null ? null : creditTotal - buyback;
    // Put bán khống được bảo chứng bằng tiền: thế chấp là toàn bộ số tiền phải
    // sẵn sàng mua cổ phiếu nếu bị assign.
    const collateral = p.strike! * shares;
    const daysHeld = Math.max(1, daysBetween(p.openedAt, now));
    const dte = daysBetween(now, p.expiration!);
    const totalDays = Math.max(1, daysBetween(p.openedAt, p.expiration!));

    // Ngày earnings rơi vào trước khi đáo hạn là rủi ro riêng của người bán
    // put: một cú gap sau earnings có thể đẩy hợp đồng vào trong tiền chỉ sau
    // một đêm.
    const nextEarnings =
      (earnings[p.symbol] || []).find((d) => d >= now && d <= p.expiration!) ?? null;

    return {
      ...p,
      spot,
      changePct: under?.netPercentChange ?? null,
      mark,
      delta: opt?.delta ?? null,
      creditTotal,
      buyback,
      pl,
      // Đã ăn được bao nhiêu phần của credit: 1.0 là hợp đồng đã về gần 0.
      captured: mark === null ? null : (p.credit! - mark) / p.credit!,
      collateral,
      dte,
      daysHeld,
      // ROC quy năm tính trên phần lời đang có và số ngày đã giữ thật.
      rocAnnual: pl === null ? null : (pl / collateral) * (365 / daysHeld),
      // ROC quy năm nếu giữ tới đáo hạn và hợp đồng hết hạn vô giá trị.
      rocIfExpired: (creditTotal / collateral) * (365 / totalDays),
      // Dương là giá còn ở trên strike; âm là đã vào trong tiền.
      cushion: spot === null ? null : (spot - p.strike!) / p.strike!,
      itm: spot === null ? null : spot < p.strike!,
      nextEarnings,
    };
  });

  const putRows = rows.filter((r) => r.kind === 'put') as any[];
  const stockRows = rows.filter((r) => r.kind === 'stock') as any[];
  const sum = (xs: (number | null)[]) =>
    xs.reduce<number>((a, b) => a + (b ?? 0), 0);

  const summary = {
    putCount: putRows.length,
    stockCount: stockRows.length,
    collateral: sum(putRows.map((r) => r.collateral)),
    creditTotal: sum(putRows.map((r) => r.creditTotal)),
    openPl: sum(rows.map((r: any) => r.pl)),
    stockValue: sum(stockRows.map((r) => r.value)),
    itmCount: putRows.filter((r) => r.itm).length,
    earningsCount: putRows.filter((r) => r.nextEarnings).length,
    nearestDte: putRows.length ? Math.min(...putRows.map((r) => r.dte)) : null,
    quoteError,
  };

  return NextResponse.json({ rows, summary });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.positions)) {
    return NextResponse.json({ error: 'Cần mảng positions' }, { status: 400 });
  }
  const saved = await writePositions(body.positions);
  // Trả về đúng những gì đã ghi: vị thế nhập thiếu số bị loại ở đây, và client
  // phải thấy điều đó thay vì tưởng đã lưu.
  return NextResponse.json({ positions: saved });
}
