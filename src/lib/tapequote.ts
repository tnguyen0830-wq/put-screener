/**
 * Mức thay đổi trong ngày của một dòng trên thanh chỉ số (/api/tape).
 *
 * Chủ app báo: GC, CL, BTC hiện giá nhưng cột % "không thấy lên". Route cũ đọc
 * `netPercentChange ?? 0` - trường đó có ở cổ phiếu/chỉ số, còn quote HỢP ĐỒNG
 * TƯƠNG LAI của Schwab (theo tài liệu nhớ được, CHƯA đo) mang tên khác
 * (`futurePercentChange`, đơn vị chưa rõ). Thiếu trường thì `?? 0` biến
 * "không biết" thành "0.00%" - một con số trông y hệt "giá đứng yên", đúng thứ
 * repo này cấm.
 *
 * Thứ tự, và vì sao:
 *  1. `netPercentChange` khi Schwab gửi (cổ phiếu/chỉ số - đã chạy thật).
 *  2. TỰ TÍNH từ `lastPrice` và `closePrice` (giá chốt phiên trước). Không cần
 *     biết đơn vị của trường % nào, và cùng một phép tính cho mọi loại mã.
 *  3. Từ `netChange` và `lastPrice` (close = last − netChange).
 *  4. Không tính được thì `null` - màn hình in "—", không in 0.00%.
 *
 * `futurePercentChange` cố ý KHÔNG được đọc: đơn vị của nó (phân số hay phần
 * trăm) chưa ai đo, và đoán sai là lệch 100 lần mà vẫn trông hợp lý. Tên các
 * khoá thật của quote được trả kèm (`keys`) để lần sau đo được thay vì đoán.
 *
 * Thuần, không import gì - biên dịch và require() được độc lập để test.
 */

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export type PctFrom = 'schwab' | 'close' | 'netChange' | 'none';

export type TapeChange = {
  change: number | null;
  changePercent: number | null;
  pctFrom: PctFrom;
};

export function tapeChange(q: Record<string, unknown> | null | undefined): TapeChange {
  const quote = q ?? {};
  const last = num(quote.lastPrice);
  const close = num(quote.closePrice);
  const net = num(quote.netChange);
  const schwabPct = num(quote.netPercentChange);

  // Mức thay đổi tuyệt đối: Schwab gửi thì dùng, không thì tự tính từ close.
  const change = net ?? (last !== null && close !== null && close > 0 ? last - close : null);

  if (schwabPct !== null) return { change, changePercent: schwabPct, pctFrom: 'schwab' };

  if (last !== null && close !== null && close > 0) {
    return { change: change ?? last - close, changePercent: ((last - close) / close) * 100, pctFrom: 'close' };
  }

  if (last !== null && net !== null) {
    const prev = last - net;
    if (prev > 0) return { change: net, changePercent: (net / prev) * 100, pctFrom: 'netChange' };
  }

  return { change, changePercent: null, pctFrom: 'none' };
}
