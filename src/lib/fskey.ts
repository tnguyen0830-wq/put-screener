/**
 * Biến một mã cổ phiếu thành một TÊN FILE an toàn cho các cache trên đĩa
 * đặt tên theo mã (`history.ts`, `md-fmp.ts`).
 *
 * Vì sao tồn tại: mã đi vào mấy cache đó không phải lúc nào cũng qua
 * `normalizeSymbol()` — `/api/longterm/why` chuyển thẳng `row.symbol` từ
 * body client vào `technicalSnapshot()`, và người nhà cũng gọi được route
 * đó. Cách cũ `symbol.replace('/', '_')` chỉ thay dấu gạch chéo ĐẦU TIÊN
 * (mẫu chuỗi, không phải regex toàn cục), nên `A/B/../../x` thành
 * `A_B/../../x` và `path.join` đi ra ngoài thư mục cache. Nếu Schwab trả
 * 200 rỗng cho mã lạ (chưa đo — Schwab bị chặn từ sandbox), cache sẽ GHI
 * `{d, bars: []}` vào đúng đường dẫn client chọn — ví dụ đè lên
 * `/var/data/token.json`. Không lộ dữ liệu, nhưng phá được phiên Schwab
 * của chủ app từ một tài khoản người nhà.
 *
 * Sửa ở CHÍNH điểm chạm đĩa chứ không ở từng route, cùng lý do middleware
 * gác `OWNER_ONLY` ở một chỗ: route thêm sau này mà quên `normalizeSymbol`
 * thì vẫn không đi ra ngoài thư mục cache được.
 *
 * Bất biến phải giữ: tên file của mã HỢP LỆ KHÔNG ĐỔI so với trước —
 * `BRK/B` vẫn là `BRK_B`, `$SPX` vẫn là `$SPX` — nếu không mọi cache đang
 * có trên đĩa thành mồ côi và lượt quét kế tiếp tốn lại toàn bộ request.
 */
export function symbolFileKey(symbol: string): string {
  const key = String(symbol).replace(/[^A-Za-z0-9$-]/g, '_');
  // Toàn dấu `_` (mã chỉ gồm ký tự lạ) hoặc rỗng: vẫn là MỘT tên file trong
  // thư mục cache, không bao giờ là `..` hay rỗng làm `path.join` rơi về
  // chính thư mục cha.
  return key || '_';
}
