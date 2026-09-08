/**
 * Ghi nhớ trạng thái giao diện nhỏ (tab đang mở, mã đang xem, thanh trượt)
 * trong localStorage của trình duyệt.
 *
 * Vì sao có: chủ app dùng trên điện thoại, và mỗi lần thoát ra rồi mở lại
 * là app quay về tab Sell Put Screener, tab Heatmap về bản đồ nhiệt, panel
 * GEX về mặc định - "SPX bị mất". Không phải lỗi dữ liệu, chỉ là app không
 * nhớ gì cả giữa hai lần mở. Cùng cách i18n.tsx đã nhớ ngôn ngữ.
 *
 * Mọi đọc/ghi bọc try/catch: chế độ riêng tư chặn localStorage, và một ô
 * nhớ hỏng không được làm hỏng màn hình. Đọc trong useEffect (sau khi
 * hydrate), KHÔNG trong useState initializer: server không có localStorage,
 * đọc lúc render đầu sẽ lệch với HTML đã dựng sẵn.
 */
const PREFIX = 'put-screener:';

export function readRemembered(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/** Đọc và chỉ nhận giá trị nằm trong danh sách cho phép - một giá trị cũ
 *  từ bản trước (tab đã đổi tên) mà lọt vào state là màn hình trắng. */
export function readRememberedOneOf<T extends string>(
  key: string,
  allowed: readonly T[]
): T | null {
  const v = readRemembered(key);
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export function remember(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* riêng tư / đầy / bị chặn: chạy tiếp, chỉ không nhớ */
  }
}
