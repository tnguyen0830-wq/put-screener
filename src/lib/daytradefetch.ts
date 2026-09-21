import { fullChain, sessionHistory } from './schwab';
import { indexSymbolCandidates } from './gexchain';
import { buildRow, type DaytradeRow } from './daytrade';
import {
  buildLadder,
  expectedMove,
  expiryDate,
  nyToday,
  underlyingPrice,
  usableQuoteCount,
  zeroDteDiagnosis,
  type ExpectedMove,
  type LadderRow,
  type ZeroDteDiagnosis,
} from './zerodte';

/**
 * Tầng MẠNG của tab Daytrade. Phần tính nằm ở `daytrade.ts` và `zerodte.ts`
 * (cả hai thuần, không import gì, test độc lập được).
 */

/* ------------------------------------------------------------------ *
 * Nửa cổ phiếu
 * ------------------------------------------------------------------ */

/**
 * 5 phút mỗi nến, và con số này là một quyết định có lý do chứ không phải
 * mặc định tuỳ tiện.
 *
 * `intradayHistory()` đang CHẠY THẬT ở production cho tab Bề rộng TT với
 * đúng `periodType=day, frequencyType=minute, frequency=5`. Thứ duy nhất
 * file này đổi so với lượt gọi đã được chứng minh đó là `period` (1 → 10),
 * nên bề mặt chưa-đo-được co lại còn đúng một tham số. Nến 1 phút sẽ mở
 * thêm một tổ hợp tham số chưa ai thử, và repo này đã bị bỏng nhiều lần vì
 * code theo tài liệu nhớ được thay vì theo phép đo.
 *
 * 15 và 30 phút đều chia hết cho 5, nên khoảng mở cửa là đúng 3 hoặc 6
 * nến — không có nến nào bị cắt đôi.
 */
export const BAR_MINUTES = 5;

/** 10 phiên: đủ cho một trung vị khối lượng chịu được một ngày earnings,
 *  và vẫn là MỘT request. */
export const BASELINE_DAYS = 10;

/** Trần số mã mỗi lượt. Nến trong ngày tốn 1 request MỖI MÃ và không cache
 *  được (dữ liệu đổi từng phút), nên đây là thứ giữ cho tab này không ăn
 *  vào hạn mức 100/phút mà lượt quét Screener/Long-term đang dùng chung. */
export const MAX_SYMBOLS = 10;

export type DaytradeResult =
  | { symbol: string; ok: true; row: DaytradeRow }
  /** Lỗi của RIÊNG mã này. Một mã hỏng không được làm hỏng chín mã kia —
   *  cùng khuôn `allSettled` mà `collectEventAlerts()` dùng. */
  | { symbol: string; ok: false; error: string };

export async function loadDaytrade(
  symbols: string[],
  openRangeMinutes: number
): Promise<DaytradeResult[]> {
  const list = symbols.slice(0, MAX_SYMBOLS);
  const settled = await Promise.allSettled(
    list.map(async (symbol) => {
      const payload = await sessionHistory(symbol, BASELINE_DAYS, BAR_MINUTES);
      return buildRow(symbol, payload, { barMinutes: BAR_MINUTES, openRangeMinutes });
    })
  );
  return settled.map((r, i) =>
    r.status === 'fulfilled'
      ? { symbol: list[i], ok: true as const, row: r.value }
      : {
          symbol: list[i],
          ok: false as const,
          // Nguyên văn lỗi Schwab, cắt ngắn — một dòng "không tải được" thì
          // không ai sửa được gì (#102: mã trạng thái đứng trước).
          error: String(r.reason?.message ?? r.reason).slice(0, 200),
        }
  );
}

/* ------------------------------------------------------------------ *
 * Nửa 0DTE
 * ------------------------------------------------------------------ */

/** Số strike mỗi bên quanh giá hiện tại. Một kỳ đáo hạn × 40 strike là một
 *  payload nhỏ, nên KHÔNG chạm tới lỗi 502 `TooBigBody` vốn hành SPX suốt
 *  #92-#96 (cái đó đến từ 60 ngày × mọi strike). */
export const ZERODTE_STRIKES = 40;

export type ZeroDteResult = {
  /** Cách viết mã THẬT SỰ trả ra chuỗi dùng được. */
  symbol: string;
  requested: string;
  expiry: string | null;
  /** Ngày giao dịch New York đã dùng để hỏi. */
  asked: string;
  spot: number | null;
  rows: LadderRow[];
  move: ExpectedMove | null;
  diagnosis: ZeroDteDiagnosis;
  /** Mọi cách viết đã thử và lý do thất bại — cùng lối `attempts` của
   *  `fetchSchwabChainWithFallback`, vì "không cách viết nào chạy" và
   *  "chạy nhưng rỗng" là hai chuyện. */
  attempts: { symbol: string; error: string }[];
};

/**
 * Chuỗi quyền chọn ĐÁO HẠN HÔM NAY.
 *
 * Hai chỗ khác hẳn `fetchSchwabChainWithFallback()` của GEX, và cả hai đều
 * cố ý:
 *
 * 1. **Cửa sổ là MỘT ngày**, không phải 60 — nên dùng thẳng `fullChain()`
 *    chứ không `fullChainAdaptive()`. Bộ thu hẹp kia sinh ra để né 502
 *    `TooBigBody`, một vấn đề của cửa sổ 60 ngày mà bảng này không có.
 * 2. **Phép kiểm "dùng được" là BÁO GIÁ, không phải open interest.** SPX
 *    trả OI = 0 ở mọi hợp đồng (lỗi API Schwab, #108), nên dùng
 *    `usableContractCount()` của `gex.ts` ở đây sẽ loại sạch SPX vì một lý
 *    do bảng này không quan tâm. Xem đầu `zerodte.ts`.
 */
export async function loadZeroDte(symbol: string, now = new Date()): Promise<ZeroDteResult> {
  const day = nyToday(now);
  const attempts: { symbol: string; error: string }[] = [];
  let fallback: { sym: string; chain: any } | null = null;

  for (const candidate of indexSymbolCandidates(symbol)) {
    let chain: any;
    try {
      chain = await fullChain(candidate, day, day, { strikeCount: ZERODTE_STRIKES });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      attempts.push({ symbol: candidate, error: msg });
      // Chỉ "tham số sai" mới đáng đổi cách viết. REAUTH_REQUIRED hay lỗi
      // mạng sẽ lặp lại y hệt cho mọi cách viết.
      if (!/ 400:/.test(msg)) throw e;
      continue;
    }
    if (usableQuoteCount(chain) > 0) return shape(candidate, symbol, day, chain, attempts);
    if (!fallback) fallback = { sym: candidate, chain };
    attempts.push({ symbol: candidate, error: 'Schwab 200: không hợp đồng nào có giá chào' });
  }

  // Không cách viết nào cho chuỗi có giá: vẫn TRẢ VỀ cái rỗng kèm chẩn đoán,
  // thay vì ném lỗi. Màn hình cần nói được Schwab thật sự gửi gì — đó chính
  // là phép đo mà bảng này tồn tại để lấy.
  if (fallback) return shape(fallback.sym, symbol, day, fallback.chain, attempts);
  return {
    symbol,
    requested: symbol,
    expiry: null,
    asked: day,
    spot: null,
    rows: [],
    move: null,
    diagnosis: zeroDteDiagnosis(null),
    attempts,
  };
}

function shape(
  used: string,
  requested: string,
  day: string,
  chain: any,
  attempts: { symbol: string; error: string }[]
): ZeroDteResult {
  const spot = underlyingPrice(chain);
  const rows = buildLadder(chain, spot);
  const diagnosis = zeroDteDiagnosis(chain);
  return {
    symbol: used,
    requested,
    asked: day,
    expiry: diagnosis.expirations.length ? expiryDate(diagnosis.expirations[0]) : null,
    spot,
    rows,
    move: expectedMove(rows, spot),
    diagnosis,
    attempts,
  };
}
