/**
 * Lọc theo vốn hoá, dùng CHUNG cho tab Sell Put Screener và tab Đầu tư dài hạn.
 *
 * Một module chứ không phải hai bản sao: hai tab đều hỏi đúng một câu ("mã
 * này thuộc cỡ nào"), và nếu mỗi bên tự chia mốc thì đúng cái bên ít ai nhìn
 * sẽ trôi lệch - rồi hai tab nói hai chuyện khác nhau về cùng một mã. Cùng
 * lý do `ratelimit.ts` được tách ra dùng chung thay vì chép sang.
 *
 * Thuần logic, không đọc mạng và không đọc đĩa, nên chạy được bằng script
 * Node độc lập (và an toàn cả nếu sau này có ai import từ middleware).
 *
 * VỐN HOÁ LẤY TỪ SCHWAB, không lấy từ Finviz. `quotes()` đã trả sẵn
 * `fundamental.sharesOutstanding` trong CHÍNH lượt gọi gộp lô mà cả hai tab
 * đều đang thực hiện ở tầng 0, nên phép lọc này KHÔNG tốn thêm một request
 * nào - và đó là điều quyết định: cắt được ở tầng 0 nghĩa là cắt trước khi
 * tốn chuỗi quyền chọn (Screener) hay lần cào Finviz + file SEC (Đầu tư dài
 * hạn). Tab Heatmap đã tính vốn hoá đúng cách này từ trước.
 */

export type CapTier = 'mega' | 'big' | 'mid' | 'small';

/** Cận DƯỚI của từng bậc, đô la. Mốc quy ước của thị trường Mỹ. */
export const CAP_FLOOR: Record<Exclude<CapTier, 'small'>, number> = {
  mega: 200e9,
  big: 10e9,
  mid: 2e9,
};

/** Ba nút hiện trên màn hình. `small` là một bậc THẬT nhưng không có nút. */
export const CAP_BUTTONS: CapTier[] = ['mega', 'big', 'mid'];

const ALL: CapTier[] = ['mega', 'big', 'mid', 'small'];

/**
 * Đọc số dung thứ, cùng lý do `num()` của gex.ts tồn tại: `Number.isFinite`
 * KHÔNG ép kiểu chuỗi, nên một API trả "1234" sẽ bị vứt sạch mà không ai
 * biết. `Number('')` lại ra 0, nên chuỗi rỗng phải chặn riêng - không thì ô
 * trống thành số 0 trông như thật.
 */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Vốn hoá từ một bản ghi `quotes()` của Schwab: giá × số cổ phiếu lưu hành.
 *
 * Thiếu một trong hai vế thì trả `null` - KHÔNG trả 0. Số 0 sẽ được `capTier`
 * đọc thành "small cap", tức biến CHƯA BIẾT thành một lời khẳng định về cỡ
 * công ty; còn `null` đi tiếp thành cờ `unknown` và hiện dấu `?`. Đúng cái
 * bẫy số-cổ-phiếu-bằng-0 đã gặp ở secfacts (#142), chỉ khác nguồn.
 */
export function marketCapOf(row: any): number | null {
  const px = num(row?.quote?.lastPrice);
  const sh = num(row?.fundamental?.sharesOutstanding);
  if (px === null || sh === null) return null;
  if (px <= 0 || sh <= 0) return null;
  return px * sh;
}

/** Bậc của một con số vốn hoá. `null` = không biết, không phải "nhỏ". */
export function capTier(cap: number | null | undefined): CapTier | null {
  if (cap === null || cap === undefined || !Number.isFinite(cap) || cap <= 0)
    return null;
  if (cap >= CAP_FLOOR.mega) return 'mega';
  if (cap >= CAP_FLOOR.big) return 'big';
  if (cap >= CAP_FLOOR.mid) return 'mid';
  return 'small';
}

/**
 * Mã này có qua bộ lọc vốn hoá không.
 *
 * KHÔNG bấm nút nào = KHÔNG lọc, chứ không phải "loại sạch". Đó là trạng thái
 * mặc định và nó phải rộng nhất: một bộ lọc chưa ai chạm vào mà lại âm thầm
 * loại mã là đúng thứ repo này gọi là bộ lọc NGẦM.
 *
 * Không biết vốn hoá thì ĐI QUA kèm cờ `unknown`, đúng luật chung (#131):
 * thiếu dữ liệu không phải bằng chứng có vấn đề. Loại nó đi là để Schwab
 * thiếu một trường mà quyết định thay người dùng.
 */
export function capPasses(
  cap: number | null | undefined,
  selected: readonly CapTier[]
): { passed: boolean; unknown: boolean } {
  if (!selected.length) return { passed: true, unknown: false };
  const tier = capTier(cap);
  if (tier === null) return { passed: true, unknown: true };
  return { passed: selected.includes(tier), unknown: false };
}

/**
 * Đọc tham số `caps=mega,big` thành danh sách đã làm sạch.
 *
 * Giá trị lạ bị BỎ chứ không làm hỏng cả lượt quét, và thứ tự được chuẩn hoá
 * theo `ALL` để `caps=big,mega` và `caps=mega,big` sinh ra cùng một khoá kho
 * lưu - nếu không thì cùng một bộ lọc lại nằm ở hai ô nhớ khác nhau.
 */
export function parseCaps(raw: string | null | undefined): CapTier[] {
  if (!raw) return [];
  const want = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  const out = ALL.filter((t) => want.has(t));
  /* Chọn đủ CẢ BỐN bậc là không lọc gì cả - trả mảng rỗng để nó đi đúng
     nhánh "không lọc" ở trên, và để khoá kho lưu không mọc thêm hậu tố cho
     một phép lọc không loại ai. */
  return out.length === ALL.length ? [] : out;
}

/** Chuỗi ổn định để ghép vào khoá kho lưu. Rỗng khi không lọc. */
export function capsKey(selected: readonly CapTier[]): string {
  if (!selected.length) return '';
  return ALL.filter((t) => selected.includes(t)).join('+');
}
