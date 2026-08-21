/**
 * Logo do người dùng cung cấp: con bò tót đang nhảy vọt qua đường biểu đồ
 * tăng dần, kết mũi tên. File gốc là ảnh nền trắng "Tyler Investment Tool";
 * đã tách riêng phần icon (bò + biểu đồ), loại nền trắng thành trong suốt
 * bằng flood-fill (chỉ xoá vùng nền liên thông với rìa ảnh, không đụng các
 * nét trắng chi tiết bên trong con bò), rồi đặt vào khung nền trắng cố định
 * bo góc — xem assets/process_logo.py.
 *
 * Khung nền TRẮNG cố định, không đổi theo theme: bò nâu và biểu đồ navy đậm
 * gần như chìm vào nền tối của theme dark nếu để trong suốt hoàn toàn, nên
 * giữ khung sáng cố định để cả hai phần luôn nổi rõ ở mọi theme.
 */
export default function Logo({ height = 32 }: { height?: number }) {
  // Ảnh gốc (assets/header-mark.png) có tỉ lệ 480:400.
  const width = Math.round((height * 480) / 400);
  return (
    <img
      src="/brand-bull.png"
      alt="Tyler Investment Tool"
      height={height}
      width={width}
      className="brandmark"
    />
  );
}
