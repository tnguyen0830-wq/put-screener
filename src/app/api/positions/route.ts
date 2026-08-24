import { NextResponse } from 'next/server';
import { quotes, traderGet } from '@/lib/schwab';
import { loadEarnings } from '@/lib/screener';
import { daysBetween, mapCashBalances, mapSchwabPositions, osiSymbol, type Position } from '@/lib/positions';

/**
 * Danh mục: đọc thẳng từ tài khoản Schwab, định giá lại bằng báo giá Schwab.
 *
 * Chỉ đọc - không có PUT. Bản đầu tiên cho nhập tay vì app chưa được duyệt
 * quyền tài khoản; giờ đã duyệt, vị thế lấy từ nguồn thật, không giữ song
 * song một bản gõ tay có thể lệch với tài khoản.
 *
 * Không nằm dưới /api/md/*, vốn bị MD_API_TOKEN chặn cho app điện thoại.
 */
export const dynamic = 'force-dynamic';

/** Dưới ngần này ngày thì quy ra năm chỉ khuếch đại nhiễu, không nói lên gì. */
const MIN_DAYS_FOR_ANNUAL = 5;

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

/** Bóc mã HTTP ra khỏi thông báo lỗi mà lib schwab ném ra. */
const statusFrom = (msg: string) => {
  const m = msg.match(/\s(\d{3}):/);
  return m ? Number(m[1]) : null;
};

export async function GET() {
  let accounts: any[];
  try {
    accounts = await traderGet('/accounts', { fields: 'positions' });
    if (!Array.isArray(accounts)) accounts = [];
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('REAUTH_REQUIRED')) {
      return NextResponse.json(
        { error: 'SCHWAB_SESSION_EXPIRED', reason: 'SCHWAB_SESSION_EXPIRED' },
        { status: 401 }
      );
    }
    // 401/403 ở đây là thiếu quyền Accounts and Trading, khác với phiên hết
    // hạn - hai chuyện đó cần hai cách sửa ngược nhau, nên tách riêng.
    return NextResponse.json(
      { error: 'NO_TRADER_ACCESS', reason: 'NO_TRADER_ACCESS', status: statusFrom(msg) },
      { status: 502 }
    );
  }

  // Gộp vị thế của mọi tài khoản nhìn thấy được thành một danh sách, không
  // tách riêng theo tài khoản.
  const { positions, skipped } = mapSchwabPositions(accounts);
  const cash = mapCashBalances(accounts);

  if (!positions.length) {
    return NextResponse.json({ rows: [], summary: null, skipped, cash });
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
    // Mất báo giá không mất danh mục: vị thế đọc từ Schwab vẫn còn đó, chỉ
    // thiếu phần định giá lại.
    quoteError = String(e?.message ?? e);
  }

  const earnings = await loadEarnings().catch(() => ({}) as Record<string, string[]>);

  const rows = positions.map((p: Position) => {
    const under = q[p.symbol]?.quote;
    const spot: number | null = under?.lastPrice ?? null;

    if (p.kind === 'stock') {
      /**
       * Ưu tiên con số Schwab đã tự tính (marketValue, longOpenProfitLoss)
       * hơn tự suy ra từ averagePrice.
       *
       * Đối chiếu với app Schwab thật cho thấy `averagePrice` không phải giá
       * vốn thật - giá thị trường đọc đúng, nhưng lời/lỗ suy từ giá vốn đó
       * sai lệch không theo quy luật cố định. Khi Schwab đã tự tính sẵn lời/lỗ
       * cho vị thế, dùng thẳng con số đó thì chắc chắn khớp với app của họ;
       * giá vốn hiển thị suy ngược lại từ đó, không dựa vào averagePrice nữa.
       */
      const haveSchwabPl = p.schwabValue !== undefined && p.schwabPl !== undefined;
      const value = haveSchwabPl ? p.schwabValue! : spot === null ? null : spot * p.shares!;
      const pl = haveSchwabPl ? p.schwabPl! : value === null ? null : value - p.cost! * p.shares!;
      const costTotal = haveSchwabPl ? p.schwabValue! - p.schwabPl! : p.cost! * p.shares!;
      const cost = p.shares! > 0 ? costTotal / p.shares! : p.cost!;
      // schwabValue/schwabPl là nguyên liệu nội bộ để tính cost/pl ở trên,
      // không cần lộ ra response - value và pl đã mang đủ thông tin đó rồi.
      // `raw` thì giữ lại, đi thẳng ra response - xem ghi chú ở lib/positions.ts.
      const { schwabValue: _sv, schwabPl: _spl, ...pClean } = p;
      return {
        ...pClean,
        cost,
        spot,
        changePct: under?.netPercentChange ?? null,
        value,
        costTotal,
        pl,
        plPct: pl === null || !costTotal ? null : pl / costTotal,
        daysHeld: p.openedAt ? daysBetween(p.openedAt, now) : null,
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
    const dte = daysBetween(now, p.expiration!);
    // Schwab không trả ngày mở qua endpoint vị thế, nên daysHeld và ROC theo
    // ngày giữ luôn vắng mặt ở dữ liệu đồng bộ - chỉ ROC còn lại (không cần
    // ngày mở) mới có giá trị.
    const daysHeld = p.openedAt ? daysBetween(p.openedAt, now) : null;
    const heldLongEnough = daysHeld !== null && daysHeld >= MIN_DAYS_FOR_ANNUAL;

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
      /**
       * Giá trị thời gian còn lại, quy năm theo số ngày còn lại.
       *
       * Trả lời câu hỏi thật của người bán put: giữ tiếp hay đóng sớm. Nếu
       * giữ tới đáo hạn chỉ còn kiếm thêm được từng này phần trăm trên số
       * tiền đang bị khoá, mà screener đang tìm ra cơ hội cao hơn, thì đóng
       * bây giờ để giải phóng tiền là đúng.
       *
       * Lấy giá trị thời gian chứ không lấy nguyên giá mua lại: với hợp đồng
       * đã vào trong tiền, phần nội tại nằm trong giá mua lại là khoản lỗ
       * đang mang, không phải lợi nhuận còn kiếm được.
       */
      rocRemaining:
        mark === null || spot === null
          ? null
          : (Math.max(0, mark - Math.max(0, p.strike! - spot)) / p.strike!) *
            (365 / Math.max(1, dte)),
      // ROC quy năm trên phần đã lời và số ngày đã giữ thật. Dữ liệu đồng bộ
      // không có ngày mở nên trường này luôn null - giữ lại cho ngày sau, nếu
      // có nguồn nào cho biết ngày mở thật.
      rocAnnual:
        pl === null || !heldLongEnough
          ? null
          : (pl / collateral) * (365 / (daysHeld as number)),
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

  return NextResponse.json({ rows, summary, skipped, cash });
}
