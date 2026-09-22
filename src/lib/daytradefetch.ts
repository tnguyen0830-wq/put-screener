import { fullChain, sessionHistory } from './schwab';
import { indexSymbolCandidates, loadGexChain, type ChainSource } from './gexchain';
import { fetchUwChain, uwChainConfigured, uwDiagLine } from './uwchain';
import { buildRow, parseCandles, type DaytradeRow, type IntraBar } from './daytrade';
import { buildExposure, type ExposureProfile } from './mmexposure';
import {
  buildLadder,
  expectedMove,
  expiryDate,
  nyToday,
  underlyingPrice,
  usableQuoteCount,
  nearestRows,
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
  /** Nguồn thật sự cho bảng này. Ba mức tươi khác nhau nên màn hình PHẢI
   *  nói ra cái nào — xem `ZERODTE_NO_CBOE` về việc vì sao không có CBOE. */
  source: 'schwab' | 'uw';
  /** Chỉ khi source = 'uw': giao dịch gần nhất trên tape UW, và một dòng
   *  đếm hợp đồng thực sự lấy được. */
  uwAsOf?: string | null;
  uwDiag?: string;
  /** Vì sao chuỗi UW không dùng được (khi đã phải rơi về bảng rỗng của
   *  Schwab). 'chưa cấu hình' khi không có khoá. */
  uwDetail?: string;
  /** Số strike bị cắt khỏi bảng vì ở xa giá. 0 trên đường Schwab. */
  trimmed: number;
  /** Mọi cách viết đã thử và lý do thất bại — cùng lối `attempts` của
   *  `fetchSchwabChainWithFallback`, vì "không cách viết nào chạy" và
   *  "chạy nhưng rỗng" là hai chuyện. */
  attempts: { symbol: string; error: string }[];
};

/** Trần số dòng của bảng, áp cho CẢ HAI nguồn (xem `nearestRows`).
 *
 *  81 = `ZERODTE_STRIKES` × 2 + 1, và con số đó là CÓ LÝ DO: tham số
 *  `strikeCount` của Schwab được hiểu là số strike TRÊN VÀ DƯỚI giá, nên
 *  một request `strikeCount: 40` có thể trả tới ~81 dòng. Đặt trần thấp
 *  hơn là lặng lẽ cắt bớt đường Schwab vốn đang chạy đúng — tức đổi hành vi
 *  cũ trong một PR chỉ định THÊM một nguồn. */
const MAX_LADDER_ROWS = ZERODTE_STRIKES * 2 + 1;

/** CỐ Ý không có nấc CBOE ở đây, dù `loadGexChain()` có.
 *
 *  Feed CBOE trễ 15 phút, và với GEX điều đó gần như vô hại vì open
 *  interest chỉ đổi một lần mỗi ngày. Bảng này thì ngược lại: nó tồn tại
 *  để hiện BID/ASK và giá straddle của quyền chọn ĐÁO HẠN HÔM NAY — thứ
 *  biến động nhanh nhất trên màn hình. Một giá chào 0DTE cũ 15 phút không
 *  phải "hơi cũ", nó là một con số không giao dịch được mà trông y hệt một
 *  con số giao dịch được. Thà nói không có còn hơn. */
const ZERODTE_NO_CBOE = true;

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
      /* Hết phiên thì DỪNG NGAY và để 401 nổi lên: người dùng cần bấm kết
         nối lại, không cần một bảng 0DTE trông vẫn bình thường trong khi cả
         app đã mất Schwab (#101). UW KHÔNG được che chỗ này. */
      if (msg.includes('REAUTH_REQUIRED')) throw e;
      /* Chỉ "tham số sai" (400) mới đáng đổi CÁCH VIẾT — lỗi mạng lặp lại y
         hệt cho mọi cách viết. Nhưng nó KHÔNG còn ném ra ngoài: rơi xuống
         nấc UW bên dưới, đúng như `loadGexChain()` làm. Bản trước ném, nên
         một cú hụt mạng tới Schwab giết cả bảng trong khi UW phục vụ được —
         hai cái thang cho cùng một việc mà hành xử khác nhau, đúng thứ
         #96/#99 dạy là sẽ trôi lệch. */
      if (!/ 400:/.test(msg)) break;
      continue;
    }
    if (usableQuoteCount(chain) > 0) {
      return shape(candidate, symbol, day, chain, attempts, { source: 'schwab' });
    }
    if (!fallback) fallback = { sym: candidate, chain };
    attempts.push({ symbol: candidate, error: 'Schwab 200: không hợp đồng nào có giá chào' });
  }

  /* Schwab không cho chuỗi CÓ GIÁ CHÀO: sang Unusual Whales.
     Phép kiểm vẫn là `usableQuoteCount()`, KHÔNG phải open interest — đó là
     cả lý do bảng này không gọi `loadGexChain()`, và nó không được đổi chỉ
     vì nguồn đổi. Với SPX, Schwab trả OI = 0 ở mọi hợp đồng (#108) nhưng
     `bid`/`ask` thì CHƯA AI ĐO; nên nấc này là đường cứu khi phép đo đó
     hoá ra cũng rỗng, chứ không phải phép thay thế Schwab. */
  let uwDetail = uwChainConfigured() ? undefined : 'chưa cấu hình UW_API_KEY';
  if (uwChainConfigured()) {
    try {
      /* `days: 0` giữ ĐÚNG kỳ đáo hạn hôm nay. Nó cũng cho `fetchUwChain`
         một ô cache riêng (khoá gồm `days`), nên bảng này và tab GEX không
         giẫm lên nhau dù cùng một mã. */
      const u = await fetchUwChain(symbol, { days: 0, today: day });
      if (usableQuoteCount(u.chain) > 0) {
        return shape(symbol, symbol, day, u.chain, attempts, {
          source: 'uw',
          uwAsOf: u.asOf,
          uwDiag: uwDiagLine(u.diag),
        });
      }
      uwDetail = `UW trả ${u.diag.kept} hợp đồng nhưng không cái nào có giá chào · ${uwDiagLine(u.diag)}`;
    } catch (e: any) {
      uwDetail = `${String(e?.message ?? e)}${e?.detail ? ` — ${String(e.detail)}` : ''}`;
    }
  }

  // Không nguồn nào cho chuỗi có giá: vẫn TRẢ VỀ cái rỗng kèm chẩn đoán,
  // thay vì ném lỗi. Màn hình cần nói được Schwab thật sự gửi gì — đó chính
  // là phép đo mà bảng này tồn tại để lấy.
  if (fallback) {
    return shape(fallback.sym, symbol, day, fallback.chain, attempts, {
      source: 'schwab',
      uwDetail,
    });
  }
  return {
    symbol,
    requested: symbol,
    expiry: null,
    asked: day,
    spot: null,
    rows: [],
    move: null,
    diagnosis: zeroDteDiagnosis(null),
    source: 'schwab',
    uwDetail,
    trimmed: 0,
    attempts,
  };
}

function shape(
  used: string,
  requested: string,
  day: string,
  chain: any,
  attempts: { symbol: string; error: string }[],
  meta: { source: 'schwab' | 'uw'; uwAsOf?: string | null; uwDiag?: string; uwDetail?: string }
): ZeroDteResult {
  const spot = underlyingPrice(chain);
  const all = buildLadder(chain, spot);
  const { rows, trimmed } = nearestRows(all, spot, MAX_LADDER_ROWS);
  const diagnosis = zeroDteDiagnosis(chain);
  return {
    symbol: used,
    requested,
    asked: day,
    expiry: diagnosis.expirations.length ? expiryDate(diagnosis.expirations[0]) : null,
    spot,
    rows,
    /* Biên dao động tính trên bảng ĐÃ CẮT, không phải bảng đầy đủ — và đó
       là đúng: straddle ATM lấy strike gần giá nhất, thứ không bao giờ bị
       cắt. Tính trên bảng đầy đủ rồi hiện cạnh một bảng đã cắt sẽ là một
       con số không tra ngược được từ chính mấy dòng bên dưới nó. */
    move: expectedMove(rows, spot),
    diagnosis,
    trimmed,
    attempts,
    ...meta,
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
