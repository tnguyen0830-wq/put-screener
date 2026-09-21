"""
Bộ icon cho PWA (nút "Cài app").

Nguồn là `assets/icon-transparent.png` (823x817, nền trong suốt) — bản đã
tách nền do `process_logo.py` xuất ra. KHÔNG phóng to từ `src/app/icon.png`
(256px): phóng lên 512 là kéo giãn, còn ở đây có sẵn bản gốc lớn hơn.

Ba khác biệt CÓ CHỦ Ý so với favicon trong `process_logo.py`:

1. **Không bo góc.** Android và iOS tự cắt icon theo khuôn của chính chúng.
   Một PNG đã bo góc nằm trong khuôn bo góc của hệ điều hành cho ra góc bo
   HAI LẦN kèm viền trắng lẹm. Favicon thì ngược lại — trình duyệt vẽ
   nguyên ảnh nên nó phải tự bo.

2. **Nền TRẮNG ĐẶC, không trong suốt.** Cùng lý do đã ghi ở `Logo.tsx`: bò
   nâu và biểu đồ navy chìm vào nền tối. Trên màn hình chính điện thoại,
   hình nền là bất kỳ thứ gì, nên nền trong suốt là icon vô hình. iOS còn
   biến alpha thành ĐEN, nên `apple-touch-icon` bắt buộc phải đặc.

3. **Một bản `maskable` riêng.** Android cắt icon theo khuôn (tròn, squircle,
   giọt nước…) và chỉ bảo đảm giữ phần nằm trong ĐƯỜNG TRÒN AN TOÀN đường
   kính bằng 80% cạnh. Hình vuông nội tiếp đường tròn đó có cạnh
   0.8/√2 ≈ 56.6% cạnh icon — nên bản maskable thu hình về 56% và để phần
   còn lại là nền trắng. Không có bản này thì Android lấy bản thường, tự vẽ
   thêm nền và icon trông như một miếng sticker vuông dán lệch.
"""
from PIL import Image

SRC = "assets/icon-transparent.png"
art = Image.open(SRC).convert("RGBA")
WHITE = (255, 255, 255, 255)


def square(size: int, art_fraction: float, out: str) -> None:
    canvas = Image.new("RGBA", (size, size), WHITE)
    box = size * art_fraction
    iw, ih = art.size
    scale = min(box / iw, box / ih)
    nw, nh = max(1, round(iw * scale)), max(1, round(ih * scale))
    small = art.resize((nw, nh), Image.LANCZOS)
    canvas.alpha_composite(small, ((size - nw) // 2, (size - nh) // 2))
    # RGB, không alpha: một icon PWA không cần trong suốt, và iOS đọc alpha
    # thành đen.
    canvas.convert("RGB").save(out, optimize=True)
    print(out, canvas.size)


square(192, 0.80, "public/icons/icon-192.png")
square(512, 0.80, "public/icons/icon-512.png")
square(512, 0.56, "public/icons/icon-512-maskable.png")
square(180, 0.80, "public/apple-touch-icon.png")
