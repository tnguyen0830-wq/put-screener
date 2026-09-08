import { fullChainAdaptive, type ChainWindow } from './schwab';
import { chainStatusFailed, computeGex, gexDiagnosis, usableContractCount, type GexProfile } from './gex';
import { fetchCboeChain, isIndexSymbol } from './cboe';

/**
 * Một bậc thang lấy chuỗi quyền chọn cho GEX, dùng chung cho /api/gex và
 * /api/tradebrief: Schwab (mọi cách viết ký hiệu) → CBOE (feed công khai
 * trễ 15 phút). Chỉ khi cả hai cùng không ra chuỗi thì ném GexChainError,
 * mang theo lý do THẬT của từng nguồn - tầng trên (route) quyết định tiếp:
 * mức UW, bản đọc trên đĩa, hay báo lỗi.
 *
 * Vì sao phải gom vào một chỗ: #96/#99 đã cho thấy hai nhánh "Schwab văng
 * lỗi" và "Schwab trả chuỗi vô dụng" mà đi hai đường riêng là sẽ lệch nhau.
 * Thêm CBOE mà nhét vào route /api/gex thì /api/tradebrief (phân tích AI)
 * vẫn đi thẳng Schwab và vẫn 404 với SPX - trong khi lý do duy nhất để
 * thêm CBOE là để SPX có lại biểu đồ VÀ phân tích AI.
 */

/**
 * Xác nhận thật trên production (#86's error detail): Schwab /chains trả
 * 400 "Check Param Values" cho đúng ký hiệu "$SPX", trong khi "$VIX" và
 * "QQQ" chạy bình thường qua cùng một đoạn code - nên không phải lỗi chung
 * cho mọi mã có tiền tố $, mà là Schwab từ chối riêng "$SPX" cho endpoint
 * /chains (dù /quotes chấp nhận nó, TickerTape/volatility route đã dùng ổn).
 *
 * Chưa biết chắc Schwab muốn ký hiệu nào - "$SPX.X" (quy ước index option
 * kiểu TD Ameritrade cũ) và "SPX" (root option trần trụi, không tiền tố)
 * đều là khả năng hợp lý. Thay vì đoán đúng 1 lần rồi lại phải chờ người
 * dùng báo lỗi lần nữa, thử LẦN LƯỢT vài cách viết hợp lý - còn mã thường
 * (không có $) thì chỉ có đúng 1 lựa chọn nên không tốn thêm request nào.
 *
 * (Cập nhật #108: với SPX thì KHÔNG PHẢI ký hiệu - cả ba cách viết đều
 * trả 200 với OI = 0. Giữ vòng thử vì nó rẻ và vì nó chính là bằng chứng
 * cho kết luận đó; đừng mở lại cuộc săn cách viết.)
 */
function indexSymbolCandidates(symbol: string): string[] {
  const bare = symbol.startsWith('$') ? symbol.slice(1) : symbol;
  // Nhận ra mã chỉ số kể cả khi người dùng gõ tay KHÔNG có "$" - chuyện đã
  // xảy ra thật: gõ "SPX" vào ô tìm mã chỉ thử đúng một cách viết rồi báo
  // lỗi, trong khi bấm nút preset ("$SPX") mới chạy đủ ba. Cùng một mã thì
  // phải cùng một hành vi, bất kể gõ kiểu nào.
  if (!isIndexSymbol(bare)) return [symbol];
  return [`$${bare}`, `$${bare}.X`, bare];
}

export type Attempt = { symbol: string; error: string };

export async function fetchSchwabChainWithFallback(
  symbol: string
): Promise<{ chain: any; window: ChainWindow; attempts: Attempt[] }> {
  const candidates = indexSymbolCandidates(symbol);
  const attempts: Attempt[] = [];
  /* Chuỗi CÓ về nhưng rỗng ruột vẫn được giữ lại: nếu không cách viết nào
     cho dữ liệu thật thì vẫn trả cái này ra, để phần chẩn đoán nói được
     Schwab thực sự gửi gì thay vì chỉ báo "không cách viết nào chạy". */
  let empty: { chain: any; window: ChainWindow } | null = null;
  for (const candidate of candidates) {
    try {
      const { chain, window } = await fullChainAdaptive(candidate);
      /* 200 KHÔNG có nghĩa là có dữ liệu. Với $SPX, Schwab trả status=SUCCESS
         kèm 3600 hợp đồng qua 28 kỳ mà openInterest = 0 ở tất cả - đúng hình
         dạng một chuỗi đầy đủ, chỉ là rỗng ruột. Bản trước `return` ngay khi
         không văng lỗi, nên dừng luôn ở "$SPX" và KHÔNG BAO GIỜ thử "$SPX.X"
         hay "SPX" - hai cách viết vốn được thêm vào chính vì lý do này. Một
         chuỗi không dùng được cũng đáng thử cách viết tiếp theo y như một
         lỗi 400. */
      if (usableContractCount(chain) > 0) return { chain, window, attempts };
      if (!empty) empty = { chain, window };
      attempts.push({
        symbol: candidate,
        error: 'Schwab 200: chuỗi không có hợp đồng nào còn open interest',
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      attempts.push({ symbol: candidate, error: msg });
      // Chỉ đáng thử ký hiệu khác khi lỗi THẬT SỰ là "tham số sai" (400) -
      // REAUTH_REQUIRED hay lỗi mạng sẽ lặp lại y hệt cho mọi ký hiệu, thử
      // thêm chỉ tổ tốn request mà không đổi được gì.
      if (!/ 400:/.test(msg)) throw e;
    }
  }
  // Có chuỗi rỗng ruột thì trả nó ra chứ không ném lỗi: nhánh !profile sẽ
  // chạy gexDiagnosis() trên chính chuỗi đó và in ra con số thật (bao nhiêu
  // kỳ, bao nhiêu hợp đồng, bị loại vì gì) - thông tin đó mất hẳn nếu ném.
  if (empty) return { ...empty, attempts };
  const last: any = new Error(attempts[attempts.length - 1]?.error ?? 'unknown');
  last.attempts = attempts;
  throw last;
}

/**
 * Vì sao chuỗi Schwab (đã về, không văng lỗi) không dựng được GEX. Liệt kê
 * khoá cấp cao nhất là CHƯA ĐỦ - đã gặp đúng chuyện này với SPX: khoá có đủ
 * cả callExpDateMap lẫn underlyingPrice mà vẫn không ra hợp đồng nào, và
 * danh sách khoá không nói được vì sao. Đếm rõ số hợp đồng bị loại theo
 * TỪNG lý do, kèm nguyên văn một hợp đồng thật và KIỂU dữ liệu của từng
 * trường - chỉ có kiểu mới phân biệt được "Schwab không gửi gamma" với
 * "Schwab gửi gamma dưới dạng chuỗi".
 *
 * THỨ TỰ Ở ĐÂY LÀ CÓ CHỦ Ý. Chuỗi này bị cắt bớt khi hiển thị, nên phần
 * nào đứng sau là phần bị mất. Bản trước xếp "mẫu" (dài ~120 ký tự) TRƯỚC
 * "đã thử", và mức cắt 300 rơi đúng vào giữa khối JSON mẫu - nên danh sách
 * ký hiệu đã thử KHÔNG BAO GIỜ hiện ra, dù #100 đã thêm nó vào (xác nhận
 * trên ảnh chụp production: chuỗi đứt ở `"strikePrice":74`). Đúng loại lỗi
 * đã mắc ở #90: chỗ cắt lấy mất đúng phần cần đọc.
 *
 * Xếp theo giá trị thông tin giảm dần: ký hiệu đã thử (ngắn, quan trọng
 * nhất) → số đếm và lý do loại → cờ cấp cao của Schwab → mẫu nguyên văn
 * (dài nhất, ít cần nhất một khi đã có số đếm).
 */
export function schwabChainWhy(chain: any, attempts: Attempt[]): {
  why: string;
  failedStatus: string | null;
} {
  const d = gexDiagnosis(chain);
  /* Schwab nói thẳng là hỏng (HTTP 200 nhưng status != SUCCESS) thì đó là
     một LOẠI lỗi khác hẳn "chuỗi có mà không tính được", và cách sửa cũng
     khác: một bên là quyền dữ liệu/mã, bên kia là cách app đọc trường.
     Gộp chung thành một câu là tự làm mù mình. */
  const failedStatus = chainStatusFailed(chain);
  const tried = attempts.length ? `đã thử: ${attempts.map((a) => a.symbol).join(', ')} · ` : '';
  const why =
    tried +
    `${d.expirations} kỳ · ${d.contracts} hợp đồng · ` +
    `loại: gamma thiếu ${d.droppedNoGamma}, gamma=-999 ${d.droppedSentinelGamma}, ` +
    `OI=0 ${d.droppedNoOi}, strike thiếu ${d.droppedNoStrike} · ` +
    `spot=${d.spot ?? 'thiếu'} · status=${d.status ?? '?'}, ` +
    `numberOfContracts=${d.numberOfContracts ?? '?'}, isIndex=${d.isIndex ?? '?'}, ` +
    `isDelayed=${d.isDelayed ?? '?'}, truncated=${d.isChainTruncated ?? '?'}, ` +
    `assetMainType=${d.assetMainType ?? '?'}` +
    (d.sample ? ` · mẫu: ${d.sample}` : '');
  return { why, failedStatus };
}

/** `attempts` (khi có) liệt kê MỌI ký hiệu đã thử qua fetchSchwabChainWithFallback()
 *  và lỗi thật của từng cái - nếu cả 3 cách viết đều sai thì thấy ngay cả 3,
 *  không phải đoán tiếp lần 4. Gộp gọn: mỗi lần thử chỉ còn "KÝ_HIỆU→MÃ_LỖI",
 *  rồi kèm đúng MỘT lỗi thô đầy đủ ở cuối. Bản trước nối nguyên văn cả ba lỗi
 *  rồi cắt ở 500 ký tự - ba khối JSON gần giống hệt nhau nên phần bị cắt lại
 *  đúng là phần cần biết (ký hiệu thứ ba có chạy không). */
export function schwabErrorDetail(msg: string, attempts?: Attempt[]): string {
  if (!attempts) return msg.slice(0, 300);
  const statusOf = (err: string) => err.match(/ (\d{3}):/)?.[1] ?? '?';
  return `${attempts.map((a) => `${a.symbol}→${statusOf(a.error)}`).join(', ')} · ${
    attempts[attempts.length - 1]?.error ?? ''
  }`.slice(0, 400);
}

export type ChainSource = 'schwab' | 'cboe';

export type GexChainLoad = {
  source: ChainSource;
  chain: any;
  window: ChainWindow;
  profile: GexProfile;
  /** Chỉ có khi source = 'cboe': vì sao Schwab không dùng được, để màn hình
   *  nói rõ đây là đường vòng chứ không phải lựa chọn thiết kế. */
  schwabDetail?: string;
  /** Chỉ có khi source = 'cboe': giờ CBOE đóng dấu lên feed (trễ 15 phút). */
  cboeAsOf?: string | null;
  /** Chỉ có khi source = 'cboe': tên file CBOE thực sự trả lời ("_SPX"). */
  cboeSymbol?: string;
};

/** Cả Schwab lẫn CBOE đều không cho chuỗi dùng được. Hai lý do giữ RIÊNG,
 *  không gộp thành một câu: một bên là broker, một bên là sàn, sửa khác nhau. */
export class GexChainError extends Error {
  constructor(
    message: string,
    readonly schwabDetail: string,
    readonly cboeDetail: string,
    /** Phiên Schwab hết hạn - tầng trên PHẢI trả 401, không được che bằng
     *  nguồn khác (xem /api/gex). CBOE không được thử trong trường hợp này. */
    readonly reauth: boolean,
    /** Schwab trả 200 nhưng status != SUCCESS. */
    readonly failedStatus: string | null = null
  ) {
    super(message);
    this.name = 'GexChainError';
  }
}

export async function loadGexChain(symbol: string): Promise<GexChainLoad> {
  let schwabDetail: string;
  let failedStatus: string | null = null;
  try {
    const { chain, window, attempts } = await fetchSchwabChainWithFallback(symbol);
    // Luôn truyền lại đúng ký hiệu người dùng đã chọn (không phải biến thể
    // nội bộ như "$SPX.X" lỡ chạy được) - GexProfile.symbol chỉ để hiển thị,
    // lộ ra biến thể nội bộ sẽ làm nhãn trên UI trông sai/lạ.
    const profile = computeGex(chain, symbol);
    if (profile) return { source: 'schwab', chain, window, profile };
    const w = schwabChainWhy(chain, attempts);
    schwabDetail = w.why;
    failedStatus = w.failedStatus;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const detail = schwabErrorDetail(msg, e?.attempts);
    /* Hết phiên thì dừng NGAY: không hỏi CBOE, không để tầng trên hỏi UW.
       Người dùng cần bấm kết nối lại, không cần một biểu đồ trông vẫn bình
       thường trong khi cả app đã mất Schwab (#101). */
    if (msg.includes('REAUTH_REQUIRED')) {
      throw new GexChainError('Phiên Schwab hết hạn', detail, 'không thử (hết phiên Schwab)', true);
    }
    schwabDetail = detail;
  }

  /* Schwab không dùng được vì BẤT KỲ lý do gì (văng lỗi, hay trả chuỗi rỗng
     ruột như SPX): sang CBOE. Cùng một bậc cho cả hai nhánh - đúng bài học
     #99: hai nhánh mà đi hai đường riêng là sẽ lệch nhau. */
  let cboeDetail: string;
  try {
    const c = await fetchCboeChain(symbol, { days: 60 });
    const profile = computeGex(c.chain, symbol);
    if (profile) {
      return {
        source: 'cboe',
        chain: c.chain,
        window: { days: 60 },
        profile,
        schwabDetail,
        cboeAsOf: c.asOf,
        cboeSymbol: c.cboeSymbol,
      };
    }
    // Chuyển được hợp đồng mà computeGex vẫn không ra: in số đếm của CBOE.
    const d = gexDiagnosis(c.chain);
    cboeDetail =
      `${c.cboeSymbol}: chuyển được ${c.diag.kept} hợp đồng nhưng không tính được · ` +
      `loại: gamma thiếu ${d.droppedNoGamma}, OI=0 ${d.droppedNoOi}, spot=${d.spot ?? 'thiếu'}`;
  } catch (e: any) {
    cboeDetail = `${String(e?.message ?? e)}${e?.detail ? ` — ${String(e.detail)}` : ''}`;
  }

  throw new GexChainError(
    failedStatus
      ? `Schwab từ chối chuỗi quyền chọn (status ${failedStatus})`
      : 'Không lấy được chuỗi quyền chọn',
    schwabDetail,
    cboeDetail,
    false,
    failedStatus
  );
}
