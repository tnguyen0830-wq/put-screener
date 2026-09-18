import { uwGet, uwConfigured } from './unusualwhales';
import type { SeriesPoint } from './internals-pure';

/**
 * Hai chỉ báo TOÀN THỊ TRƯỜNG từ Unusual Whales, đo được ở production
 * 2026-09-18 qua `/api/breadthprobe` - không phải đọc tài liệu.
 *
 * ============================================================
 * VÌ SAO ĐÁNG NỐI, TRONG KHI ĐÃ CÓ KHUNG TRADINGVIEW
 * ============================================================
 *
 * Khung TradingView (#168) đẹp nhưng app KHÔNG ĐỌC ĐƯỢC con số bên trong.
 * Số từ UW thì đọc được: cảnh báo được, đưa vào "Hỏi Claude" được. Và
 * Put/Call Total là MỘT TRONG HAI ô mà #165 đo được Schwab không có mã nào
 * để quote - tức đây là lấp một lỗ hổng thật, không phải thêm màu mè.
 *
 * ============================================================
 * PHÉP ĐO ĐỐI CHIẾU: 0.73 KHỚP ĐÚNG VỚI ẢNH MẪU
 * ============================================================
 *
 * `/api/market/total-options-volume` trả call_volume 44.754.579 và
 * put_volume 32.607.233 → tỉ lệ 0,7286. Ảnh chụp TradingView của chủ app
 * cùng phiên hôm đó ghi PUT/CALL RATIO = 0,73. Khớp tới hai chữ số thập
 * phân.
 *
 * NHƯNG hai con số này KHÔNG phải một: CBOE tính trên khối lượng của riêng
 * sàn CBOE, UW tính trên feed quyền chọn của họ. Khớp một phiên là bằng
 * chứng mạnh rằng chúng rất sát nhau, KHÔNG phải bằng chứng chúng luôn
 * bằng nhau - nên màn hình gọi tên nguồn là UW, không dán nhãn CBOE.
 *
 * ============================================================
 * KIỂU DỮ LIỆU: SỐ VÀ CHUỖI LẪN LỘN, ĐÃ ĐO
 * ============================================================
 *
 * `call_volume`/`put_volume` là SỐ, còn `call_premium`/`put_premium` và
 * `net_call_premium`/`net_put_premium` là CHUỖI. Đúng cái bẫy `gex-levels`
 * (toàn chuỗi) đã ghi trong repo này, nên mọi chỗ đọc số ở đây đều đi qua
 * `num()` - `Number.isFinite('123')` là false, tin vào nó là mất cả chuỗi
 * dữ liệu một cách im lặng.
 */

/** Đọc số dung thứ: nhận cả số lẫn chuỗi số, từ chối chuỗi rỗng. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type TotalOptionsVolume = {
  date: string | null;
  callVolume: number | null;
  putVolume: number | null;
  /** put/call. null khi thiếu một vế hoặc call_volume = 0 (không chia được). */
  putCallRatio: number | null;
};

/**
 * Tỉ lệ put/call toàn thị trường, tính từ KHỐI LƯỢNG (số) chứ không từ
 * premium (chuỗi, và là tiền chứ không phải số hợp đồng - một tỉ lệ premium
 * là một đại lượng khác hẳn, không so được với Put/Call Ratio quen thuộc).
 *
 * Endpoint trả đúng MỘT dòng - ảnh chụp luỹ kế của phiên hôm nay, không
 * phải chuỗi trong ngày. Muốn có đường thì phải tự lấy mẫu định kỳ, đúng
 * khuôn ba chỉ báo Schwab-chỉ-có-số trong internals.ts.
 */
export async function uwTotalOptionsVolume(): Promise<TotalOptionsVolume | null> {
  if (!uwConfigured()) return null;

  const payload = await uwGet<any>('/api/market/total-options-volume');
  const body = payload?.data ?? payload;
  const row = Array.isArray(body) ? body[0] : body;
  if (!row || typeof row !== 'object') return null;

  const callVolume = num(row.call_volume);
  const putVolume = num(row.put_volume);
  /* Không đọc được VẾ NÀO thì coi như không có bản ghi, trả `null`. Trả về
     một object toàn null nghĩa là "có bản ghi, mọi trường chưa biết" - hai
     chuyện khác nhau, và nơi gọi không phân biệt được nếu gộp chúng. */
  if (callVolume === null && putVolume === null) return null;

  return {
    date: typeof row.date === 'string' ? row.date : null,
    callVolume,
    putVolume,
    // Chia cho 0 ra Infinity, không phải "không biết" - chặn hẳn ở đây.
    putCallRatio: callVolume !== null && putVolume !== null && callVolume > 0 ? putVolume / callVolume : null,
  };
}

/**
 * "Market tide" của UW: premium ròng vào call trừ premium ròng vào put,
 * theo từng nhịp TRONG NGÀY.
 *
 * Khác hẳn cái trên ở chỗ đắt giá nhất: một lượt gọi trả về CẢ CHUỖI (đo
 * được 81 dòng, bắt đầu 09:30 giờ New York), nên không cần tự lấy mẫu -
 * mở trang là có đủ đường, đúng như bốn chỉ báo nến thật của Schwab.
 *
 * Dấu có nghĩa: dương = tiền ròng chảy vào call (thiên lệch tăng), âm =
 * vào put. Nên đây là một HIỆU SỐ, tô xanh/đỏ theo dấu là đúng luật
 * ColorLegend, khác với Put/Call Ratio vốn là một độ lớn.
 */
export async function uwMarketTide(): Promise<SeriesPoint[]> {
  if (!uwConfigured()) return [];

  const payload = await uwGet<any>('/api/market/market-tide');
  const body = payload?.data ?? payload;
  const rows: any[] = Array.isArray(body) ? body : [];

  const out: SeriesPoint[] = [];
  for (const r of rows) {
    const t = Date.parse(r?.timestamp ?? '');
    const call = num(r?.net_call_premium);
    const put = num(r?.net_put_premium);
    // Thiếu một vế thì BỎ điểm đó, không coi vế thiếu là 0 - một điểm 0 giả
    // nằm giữa đường là một cú sụt trông y như thật.
    if (!Number.isFinite(t) || call === null || put === null) continue;
    out.push({ t, v: call - put });
  }
  // UW trả cũ trước hay mới trước thì chưa đo được; sắp lại cho chắc, vì
  // biểu đồ vẽ theo thứ tự mảng.
  return out.sort((a, b) => a.t - b.t);
}
