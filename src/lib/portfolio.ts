import { quotes, traderGet } from '@/lib/schwab';
import { loadEarnings } from '@/lib/screener';
import { daysBetween, mapCashBalances, mapSchwabPositions, osiSymbol, type Position } from '@/lib/positions';
import { computePositionSizing } from '@/lib/exposure';
import { readVolWatch } from '@/lib/volwatch';

/**
 * Danh mục: đọc thẳng từ tài khoản Schwab, định giá lại bằng báo giá Schwab.
 *
 * Chỉ đọc - không có PUT. Bản đầu tiên cho nhập tay vì app chưa được duyệt
 * quyền tài khoản; giờ đã duyệt, vị thế lấy từ nguồn thật, không giữ song
 * song một bản gõ tay có thể lệch với tài khoản.
 *
 * Không nằm dưới /api/md/*, vốn bị MD_API_TOKEN chặn cho app điện thoại.
 */
/** Dưới ngần này ngày thì quy ra năm chỉ khuếch đại nhiễu, không nói lên gì. */
const MIN_DAYS_FOR_ANNUAL = 5;

/**
 * Cửa sổ cảnh báo earnings cho cổ phiếu đang giữ.
 *
 * Put có sẵn một mốc tự nhiên - ngày đáo hạn của chính hợp đồng đó, nên
 * earnings chỉ tính khi rơi trước ngày đó. Cổ phiếu không có mốc nào tương
 * tự - giữ vô thời hạn - nên phải chọn một cửa sổ cố định. 14 ngày đủ để
 * chuẩn bị (tăng/giảm vị thế trước khi biến động) mà không cảnh báo quá sớm
 * tới mức mất tác dụng.
 */
const STOCK_EARNINGS_WINDOW_DAYS = 14;

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


/** Phiên Schwab hết hạn, hay app chưa được duyệt quyền Accounts and Trading -
 *  hai chuyện cần hai cách sửa ngược nhau, nên mang theo kiểu để nơi gọi phân biệt. */
export class PortfolioLoadError extends Error {
  constructor(
    readonly kind: 'SCHWAB_SESSION_EXPIRED' | 'NO_TRADER_ACCESS',
    readonly status: number | null
  ) {
    super(kind);
  }
}

/**
 * Đọc và dựng toàn bộ ảnh chụp danh mục.
 *
 * Tách khỏi route để bộ kiểm tra cảnh báo chạy ngầm (lib/alerts.ts) dùng
 * ĐÚNG một bộ luật với trang web - nếu nhân bản, hai bên sẽ trôi khác nhau
 * và thông báo sẽ nói một đằng, màn hình hiện một nẻo.
 */
export async function loadPortfolio() {
  let accounts: any[];
  try {
    accounts = await traderGet('/accounts', { fields: 'positions' });
    if (!Array.isArray(accounts)) accounts = [];
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('REAUTH_REQUIRED')) {
      throw new PortfolioLoadError('SCHWAB_SESSION_EXPIRED', null);
    }
    // 401/403 ở đây là thiếu quyền Accounts and Trading, khác với phiên hết
    // hạn - hai chuyện đó cần hai cách sửa ngược nhau, nên tách riêng.
    throw new PortfolioLoadError('NO_TRADER_ACCESS', statusFrom(msg));
  }

  // Gộp vị thế của mọi tài khoản nhìn thấy được thành một danh sách, không
  // tách riêng theo tài khoản.
  const { positions, skipped } = mapSchwabPositions(accounts);
  const cash = mapCashBalances(accounts);

  if (!positions.length) {
    return {
      rows: [],
      summary: null,
      skipped,
      cash,
      positionSizing: null,
      positionSizingError: null,
    };
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
       * Giá trị hiện tại lấy từ marketValue Schwab tự tính khi có (khớp app
       * của họ), rơi về spot × số cổ phiếu khi không có. Lời/lỗ luôn tự tính
       * từ (giá trị hiện tại − p.cost × số cổ phiếu) - p.cost giờ đã là
       * averageLongPrice ("Trade Price"), field đối chiếu khớp app Schwab
       * thật, không phải averagePrice/longOpenProfitLoss như hai lần đoán
       * trước (xem ghi chú ở lib/positions.ts).
       */
      const value = p.schwabValue !== undefined ? p.schwabValue : spot === null ? null : spot * p.shares!;
      const costTotal = p.cost! * p.shares!;
      const pl = value === null ? null : value - costTotal;
      // schwabValue là nguyên liệu nội bộ để tính value ở trên, không cần lộ
      // ra response. `raw` thì giữ lại, đi thẳng ra response - xem ghi chú ở
      // lib/positions.ts.
      const { schwabValue: _sv, ...pClean } = p;
      // Cùng một cảnh báo earnings như put, nhưng cửa sổ cố định 14 ngày
      // thay vì "trước ngày đáo hạn" - cổ phiếu không có ngày đáo hạn.
      const stockEarningsWindow = new Date(now);
      stockEarningsWindow.setUTCDate(stockEarningsWindow.getUTCDate() + STOCK_EARNINGS_WINDOW_DAYS);
      const nextEarnings =
        (earnings[p.symbol] || []).find(
          (d) => d >= now && d <= stockEarningsWindow.toISOString().slice(0, 10)
        ) ?? null;
      return {
        ...pClean,
        cost: p.cost,
        spot,
        changePct: under?.netPercentChange ?? null,
        value,
        costTotal,
        pl,
        plPct: pl === null || !costTotal ? null : pl / costTotal,
        daysHeld: p.openedAt ? daysBetween(p.openedAt, now) : null,
        nextEarnings,
        // Không có mã này trong data/earnings.json - "không sắp earnings" và
        // "chưa có dữ liệu để biết" là hai chuyện khác nhau, và im lặng đúng
        // là lý do CRWD từng bị bỏ sót dù chỉ còn 2 ngày.
        earningsUnknown: !(p.symbol in earnings),
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
    const earningsUnknown = !(p.symbol in earnings);

    return {
      ...p,
      earningsUnknown,
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

  /**
   * Vol-surface watch on the puts already open: the same term-structure and
   * put-skew checks the screener runs as hard gates, pointed at what is
   * held rather than at what is being shopped for. Served from a 15-minute
   * cache and refreshed in the background, so this adds no latency here
   * (see lib/volwatch.ts for why its clock differs from the panel's 60s).
   */
  const vol = readVolWatch(putRows.map((r) => r.symbol));
  for (const r of putRows) {
    const v = vol.bySymbol[r.symbol];
    r.tsSlope = v?.tsSlope ?? null;
    r.skewZ = v?.skewZ ?? null;
    r.backwardation = v?.backwardation ?? false;
    r.skewElevated = v?.skewElevated ?? false;
    r.volAt = v?.at ?? null;
  }

  const summary = {
    putCount: putRows.length,
    stockCount: stockRows.length,
    collateral: sum(putRows.map((r) => r.collateral)),
    creditTotal: sum(putRows.map((r) => r.creditTotal)),
    openPl: sum(rows.map((r: any) => r.pl)),
    // Lời/lỗ hôm nay, Schwab tự tính cho từng vị thế - null nếu không vị thế
    // nào trả về trường đó, để không hiện $0 giả cho một ngày thật sự có biến
    // động.
    dayPl: rows.some((r: any) => typeof r.dayPl === 'number')
      ? sum(rows.map((r: any) => (typeof r.dayPl === 'number' ? r.dayPl : null)))
      : null,
    stockValue: sum(stockRows.map((r) => r.value)),
    itmCount: putRows.filter((r) => r.itm).length,
    // Đếm cả cổ phiếu lẫn put - trước đây chỉ tính put, nên một mã đang
    // giữ dạng cổ phiếu sắp earnings không hiện cảnh báo dù chỉ còn vài
    // ngày.
    earningsCount:
      putRows.filter((r) => r.nextEarnings).length +
      stockRows.filter((r) => r.nextEarnings).length,
    nearestDte: putRows.length ? Math.min(...putRows.map((r) => r.dte)) : null,
    // Put đang giữ mà bề mặt vol đang cảnh báo: backwardation (thị trường
    // định giá một sự kiện gần) hoặc skew bất thường cao (thị trường trả
    // giá cao bất thường cho bảo hiểm chiều giảm ở đúng mã đó).
    volAlertCount: putRows.filter((r) => r.backwardation || r.skewElevated).length,
    // "Chưa tính xong" khác hẳn "không có cảnh báo" - lần tải đầu sau khi
    // cache hết hạn sẽ trả về rỗng trong lúc làm mới ngầm, và im lặng ở đây
    // đọc thành "mọi thứ ổn" trong khi thật ra là chưa biết.
    volWarmingUp: vol.warmingUp,
    volErrors: vol.errors,
    quoteError,
    // Mã đang giữ vị thế mà data/earnings.json hoàn toàn không có - "Cần để
    // ý" không thể cảnh báo earnings cho những mã này, không phải vì chúng
    // không sắp earnings, mà vì không có dữ liệu để biết. Chính đây là lý do
    // CRWD từng bị bỏ sót dù chỉ còn 2 ngày - CRWD chưa từng nằm trong
    // watchlist nên script đồng bộ chưa bao giờ lấy ngày của nó.
    earningsDataGap: [...new Set(rows.filter((r: any) => r.earningsUnknown).map((r: any) => r.symbol))],
  };

  // Cluster exposure needs one price-history fetch per held put symbol on
  // top of everything else this route already does - a failure here (rate
  // limit, a symbol Market Data can't price) should not take down the rest
  // of the portfolio page, so it's caught and reported on its own.
  let positionSizing: Awaited<ReturnType<typeof computePositionSizing>> | null = null;
  let positionSizingError: string | null = null;
  if (putRows.length > 0) {
    try {
      positionSizing = await computePositionSizing(
        putRows.map((r) => ({ symbol: r.symbol, collateral: r.collateral })),
        cash.accountValue
      );
    } catch (e: any) {
      positionSizingError = String(e?.message ?? e);
    }
  }

  return { rows, summary, skipped, cash, positionSizing, positionSizingError };
}
