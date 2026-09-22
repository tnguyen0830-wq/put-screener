import { fullChain, sessionHistory } from './schwab';
import { indexSymbolCandidates, loadGexChain, type ChainSource } from './gexchain';
import { buildRow, parseCandles, type DaytradeRow, type IntraBar } from './daytrade';
import { buildExposure, type ExposureProfile } from './mmexposure';
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

/* ------------------------------------------------------------------ *
 * Phơi nhiễm nhà tạo lập (ba panel kiểu Unusual Whales)
 * ------------------------------------------------------------------ */

/* Cửa sổ quanh giá KHÔNG cắt ở server. Route trả về MỌI strike (SPX đo
   được là ~498 strike, vài chục KB) và phía màn hình tự cắt, nên đổi bề
   rộng là tức thì và không tốn thêm một request nào. Quan trọng hơn: một
   con số bề rộng ở server cộng một con số ở client là hai nguồn sẽ trôi
   lệch — màn hình ghi ±1% trong khi dữ liệu đã bị cắt ở ±2% thì không gì
   nói ra được. Một chủ sở hữu duy nhất, và đó là phía vẽ. */

export type ExposureResult = {
  symbol: string;
  /** Nguồn chuỗi thật sự trả lời: Schwab, UW (thời gian thực) hay CBOE
   *  (trễ 15 phút). Ba mức tươi khác nhau, nên màn hình phải nói ra cái
   *  nào — một bảng số trễ 15 phút trông y hệt một bảng sống. */
  source: ChainSource;
  /** Chỉ khi source != 'schwab'. */
  schwabDetail?: string;
  cboeAsOf?: string | null;
  /** Chỉ khi source = 'uw'. */
  uwAsOf?: string | null;
  uwDiag?: string;
  /** Chỉ khi source = 'cboe': vì sao chuỗi UW cũng không dùng được. */
  uwDetail?: string;
  spot: number;
  /** Gamma theo OI và theo khối lượng — HAI bảng, vì đó là hai câu hỏi
   *  khác nhau (vị thế đang tồn tại vs. giao dịch hôm nay), và panel 2 vẽ
   *  cả hai chồng lên nhau. */
  oi: ExposureProfile;
  volume: ExposureProfile;
  /** Delta cho MỘT kỳ đáo hạn (panel 3). */
  byExpiration: ExposureProfile | null;
  expiration: string | null;
  expirations: string[];
  /** Nến 5 phút của phiên hôm nay cho panel 1. Rỗng KHÔNG phải lỗi — xem
   *  `candlesError`. */
  bars: IntraBar[];
  /** Vì sao không có nến, nguyên văn. `/pricehistory` cho một mã CHỈ SỐ là
   *  thứ CHƯA ĐO ĐƯỢC từ sandbox: $VIX chạy thật ở tab Bề rộng TT, nhưng
   *  $SPX thì chưa ai thử. Nên panel 1 vẫn vẽ được dải cột gamma khi không
   *  có nến, và NÓI RA lý do thay vì hiện một khung trống trông như hỏng. */
  candlesError: string | null;
  candleSymbol: string | null;
};

/**
 * Ba panel chỉ tốn MỘT chuỗi quyền chọn.
 *
 * `loadGexChain()` được dùng lại nguyên vẹn, không viết thang mới: nó đã
 * mang sẵn Schwab → CBOE, và CBOE là thứ DUY NHẤT đo được là có OI thật cho
 * SPX (#143) trong khi Schwab trả OI = 0 ở mọi hợp đồng (#108). Một thang
 * thứ hai ở đây là một thang sẽ trôi lệch với `/api/gex` ngay bên cạnh.
 *
 * Nến chạy SONG SONG và hỏng ĐỘC LẬP: một chuỗi quyền chọn hoàn hảo không
 * được biến mất chỉ vì `/pricehistory` từ chối một mã chỉ số, và ngược lại.
 */
export async function loadExposure(
  symbol: string,
  opts: { expiration?: string | null } = {}
): Promise<ExposureResult> {
  const [chainR, barsR] = await Promise.allSettled([
    loadGexChain(symbol),
    loadExposureCandles(symbol),
  ]);

  // Chuỗi hỏng là hỏng cả ba panel, nên lỗi này được NÉM — khác hẳn nến.
  if (chainR.status === 'rejected') throw chainR.reason;
  const load = chainR.value;

  const oi = buildExposure(load.chain, symbol, { basis: 'oi' });
  const volume = buildExposure(load.chain, symbol, { basis: 'volume' });
  if (!oi || !volume) {
    throw new Error(`Chuỗi ${symbol} không dựng được bảng phơi nhiễm`);
  }

  const expirations = oi.expirations;
  // Kỳ được chọn phải CÓ THẬT trong chuỗi. Một kỳ client gửi lên mà chuỗi
  // không có sẽ ra bảng rỗng trông y hệt "kỳ này không có hợp đồng nào".
  const wanted = opts.expiration && expirations.includes(opts.expiration)
    ? opts.expiration
    : expirations[0] ?? null;
  const byExpiration = wanted
    ? buildExposure(load.chain, symbol, { basis: 'oi', expiration: wanted })
    : null;

  const bars = barsR.status === 'fulfilled' ? barsR.value.bars : [];
  const candlesError =
    barsR.status === 'rejected'
      ? String(barsR.reason?.message ?? barsR.reason).slice(0, 200)
      : barsR.value.error;

  return {
    symbol,
    source: load.source,
    schwabDetail: load.schwabDetail,
    cboeAsOf: load.cboeAsOf,
    uwAsOf: load.uwAsOf,
    uwDiag: load.uwDiag,
    uwDetail: load.uwDetail,
    spot: oi.spot,
    oi,
    volume,
    byExpiration,
    expiration: wanted,
    expirations,
    bars,
    candlesError,
    candleSymbol: barsR.status === 'fulfilled' ? barsR.value.symbol : null,
  };
}

/**
 * Nến phiên hôm nay cho panel 1, thử lần lượt các cách viết mã chỉ số.
 *
 * Dùng chung `indexSymbolCandidates()` với chuỗi quyền chọn — bản chép thứ
 * hai là bản sẽ dừng ở cách viết đầu tiên, đúng con bug #100. Không bao giờ
 * ném: người gọi nhận `{bars: [], error}` và panel vẫn vẽ phần gamma.
 */
async function loadExposureCandles(
  symbol: string
): Promise<{ symbol: string | null; bars: IntraBar[]; error: string | null }> {
  const attempts: string[] = [];
  for (const candidate of indexSymbolCandidates(symbol)) {
    try {
      const payload = await sessionHistory(candidate, 1, BAR_MINUTES);
      const bars = parseCandles(payload);
      if (bars.length) return { symbol: candidate, bars, error: null };
      attempts.push(`${candidate}: 200 nhưng 0 nến`);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      attempts.push(`${candidate}: ${msg.slice(0, 80)}`);
      // Hết phiên thì mọi cách viết đều hỏng y hệt — dừng ngay.
      if (msg.includes('REAUTH_REQUIRED')) break;
    }
  }
  return { symbol: null, bars: [], error: attempts.join(' · ').slice(0, 200) || 'không có nến' };
}
