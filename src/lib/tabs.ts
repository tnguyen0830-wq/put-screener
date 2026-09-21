/**
 * Danh sách chín tab chính — thuần, không đụng đĩa, để CẢ HAI phía dùng chung.
 *
 * Trước đây danh sách này nằm trong `page.tsx`. Từ khi có nhịp báo "đang mở
 * tab nào" (`/api/activity`), server phải kiểm tên tab client gửi lên dựa
 * trên một DANH SÁCH CHO PHÉP — và hai bản chép của cùng một danh sách là
 * hai bản sẽ trôi lệch: thêm tab thứ tám mà quên sửa bản của server thì nhịp
 * báo bị từ chối lặng lẽ, màn hình Hoạt động ghi "không rõ tab" cho một
 * người đang dùng app bình thường. Một nguồn duy nhất, không có đường tính
 * thứ hai.
 *
 * File này KHÔNG được import `node:fs` hay bất cứ thứ gì chỉ chạy ở Node:
 * `page.tsx` là client component, kéo theo `fs` là vỡ bundle.
 *
 * THỨ TỰ ở đây không quyết định thứ tự hiển thị (các nút trong `page.tsx`
 * mới quyết định, xem #189) — đây chỉ là tập hợp tên hợp lệ.
 */
export const TABS = [
  'news',
  'longterm',
  'screener',
  'analyze',
  'heatmap',
  'insider',
  'learn',
  'patterns',
  'daytrade',
  'portfolio',
] as const;

export type Tab = (typeof TABS)[number];

export function isTab(v: unknown): v is Tab {
  return typeof v === 'string' && (TABS as readonly string[]).includes(v);
}
