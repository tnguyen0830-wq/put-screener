import { uwGet, UwError } from './unusualwhales';

/**
 * Mức GEX (put wall / call wall / gamma flip / gamma magnet) lấy từ
 * Unusual Whales, dùng làm PHƯƠNG ÁN DỰ PHÒNG khi Schwab không trả được
 * chuỗi quyền chọn cho một mã.
 *
 * Vì sao cần: Schwab /chains trả 400 "Check Param Values" cho SPX ở MỌI
 * cách viết đã thử ("$SPX", "$SPX.X", "SPX" - xem #86/#88/#90), trong khi
 * "$VIX" và "QQQ" chạy bình thường. Đây không phải lỗi ký hiệu nữa; hoặc
 * là tài khoản không có quyền dữ liệu quyền chọn chỉ số, hoặc Schwab từ
 * chối một tham số nào đó riêng cho chỉ số. Cả hai đều không sửa được từ
 * phía app - nên với đúng những mã Schwab từ chối, lấy số của UW còn hơn
 * để bảng trống.
 *
 * ĐÁNH ĐỔI, phải nói rõ trên giao diện chứ không giấu: endpoint này CHỈ
 * trả về các mức chính, KHÔNG có gamma theo từng strike - nên không vẽ
 * được biểu đồ cột như phần Schwab tự tính. Và đây là số của UW tính
 * theo mô hình của họ, không phải app tự tính từ chuỗi quyền chọn - hai
 * con số cùng tên có thể khác nhau, người đọc cần biết mình đang xem cái
 * nào.
 *
 * Hình dạng response lấy từ ví dụ trong tài liệu UW (mọi giá trị là CHUỖI
 * số, không phải number):
 *   { "data": { "call_wall": "600", "put_wall": "550", "gamma_flip": "560",
 *               "gamma_magnet": "575", "nearby_flips": ["560","561.5"],
 *               "source": "vol", "date": "...", "time": "..." } }
 * CHƯA từng thấy một lượt gọi 200 thật (lần thử trước dính 429 hết hạn
 * mức ngày), nên mọi thứ ở đây đọc theo kiểu chấp nhận cả chuỗi lẫn số,
 * và khi không khớp thì trả về `rawKeys` để nhìn thấy UW thật sự trả gì
 * thay vì hiện bốn dấu gạch không rõ lý do.
 */

export type UwGexLevels = {
  ticker: string;
  callWall: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  gammaMagnet: number | null;
  nearbyFlips: number[];
  /** 'vol' hay 'oi' - UW tính mức theo khối lượng hay theo open interest. */
  basis: string | null;
  date: string | null;
  time: string | null;
  /** Chỉ có khi KHÔNG đọc được mức nào: các khoá thật UW trả về, để chẩn
   *  đoán thay vì đoán. Cùng idiom với insiders.ts's rawKeys. */
  rawKeys?: string[];
};

/** UW dùng ký hiệu trần cho chỉ số ("SPX", "VIX", "XSP", "NANOS" - đúng
 *  nguyên văn tài liệu websocket của họ), không có tiền tố "$" như Schwab
 *  dùng cho /quotes, cũng không có đuôi ".X". */
export function uwTicker(symbol: string): string {
  return symbol.replace(/^\$/, '').replace(/\.X$/i, '').toUpperCase();
}

const num = (v: unknown): number | null => {
  // Chuỗi rỗng phải thành null, KHÔNG phải 0: Number('') === 0 trong
  // JavaScript, nên bỏ qua chỗ này thì một trường UW để trống sẽ hiện lên
  // màn hình thành "0.00" như một mức giá thật. Test đã bắt đúng lỗi này.
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export async function uwGexLevels(
  symbol: string,
  basis?: 'vol' | 'oi'
): Promise<UwGexLevels> {
  const ticker = uwTicker(symbol);
  const res = await uwGet<any>(`/api/stock/${encodeURIComponent(ticker)}/gex-levels`, {
    source: basis,
  });
  // Tài liệu bọc trong { data: ... }; chấp nhận cả trường hợp trả thẳng
  // object, cùng cách phòng thủ như darkpool.ts/optionflow.ts.
  const d = res?.data ?? res ?? {};

  const levels: UwGexLevels = {
    ticker,
    callWall: num(d.call_wall),
    putWall: num(d.put_wall),
    gammaFlip: num(d.gamma_flip),
    gammaMagnet: num(d.gamma_magnet),
    nearbyFlips: Array.isArray(d.nearby_flips)
      ? d.nearby_flips.map(num).filter((n: number | null): n is number => n !== null)
      : [],
    basis: typeof d.source === 'string' ? d.source : null,
    date: typeof d.date === 'string' ? d.date : null,
    time: typeof d.time === 'string' ? d.time : null,
  };

  const gotNothing =
    levels.callWall === null &&
    levels.putWall === null &&
    levels.gammaFlip === null &&
    levels.gammaMagnet === null;
  if (gotNothing) {
    levels.rawKeys = Object.keys(d ?? {});
  }
  return levels;
}

export { UwError };
