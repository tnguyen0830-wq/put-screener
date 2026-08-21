"""
Xử lý logo do người dùng cung cấp:
  1. Loại nền trắng bằng flood-fill từ 4 góc — chỉ xoá vùng nền LIÊN THÔNG với
     rìa ảnh, không đụng tới các nét trắng chi tiết (vân lông) nằm cô lập bên
     trong hình con bò, vì flood-fill dừng lại ở biên khác màu.
  2. Cắt theo bounding box của riêng phần icon (bò + biểu đồ), bỏ phần chữ
     "Tyler Investment Tool" phía dưới vì header đã có wordmark chữ riêng.
  3. Xuất hai bản: PNG nền trong suốt cho header, và bản vuông nền navy bo góc
     cho favicon.
"""
import sys
from PIL import Image, ImageDraw

SRC = "assets/Your paragraph text.png"
im = Image.open(SRC).convert("RGBA")
W, H = im.size
px = im.load()

# --- 1. flood-fill nền trắng thành trong suốt, xuất phát từ 4 góc ---
def flood_transparent(img, seeds, tol=18):
    px = img.load()
    w, h = img.size
    seen = bytearray(w * h)
    stack = list(seeds)
    ref = px[seeds[0]]

    def close(p):
        return all(abs(p[i] - ref[i]) <= tol for i in range(3))

    while stack:
        x, y = stack.pop()
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        idx = y * w + x
        if seen[idx]:
            continue
        seen[idx] = 1
        p = px[x, y]
        if not close(p):
            continue
        px[x, y] = (p[0], p[1], p[2], 0)
        stack.append((x + 1, y))
        stack.append((x - 1, y))
        stack.append((x, y + 1))
        stack.append((x, y - 1))

flood_transparent(im, [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)])

# --- 2. tìm bounding box của icon, GIỚI HẠN nửa trên ảnh để loại chữ phía dưới ---
# Chữ "Tyler Investment Tool / Tool" nằm ở phần dưới ảnh; icon (bò + biểu đồ)
# nằm ở phần trên. Cắt cứng ở y=1260 (ước lượng từ ảnh gốc 2016px cao) rồi lấy
# bbox của phần alpha>0 trong vùng đó để không dính chữ.
CUT_Y = 1210  # giữa khoảng trống thật giữa đáy biểu đồ (~1185) và đỉnh chữ (~1250)
icon_region = im.crop((0, 0, W, CUT_Y))
bbox = icon_region.getbbox()
print("bbox tho:", bbox)

pad = 24
x0, y0, x1, y1 = bbox
x0 = max(0, x0 - pad)
y0 = max(0, y0 - pad)
x1 = min(W, x1 + pad)
y1 = min(CUT_Y, y1 + pad)
icon = im.crop((x0, y0, x1, y1))
print("icon size:", icon.size)
icon.save("assets/icon-transparent.png")

# --- 3. bản favicon: vuông, nền TRẮNG cố định bo góc, icon căn giữa ---
# Nền trắng chứ không phải navy: bò nâu và biểu đồ navy đậm gần như chìm vào
# nền navy hoặc nền tối của theme dark — nền sáng cố định thì cả hai phần đều
# nổi rõ, bất kể trình duyệt/app đang ở theme nào.
S = 256
white = (255, 255, 255, 255)
fav = Image.new("RGBA", (S, S), (0, 0, 0, 0))
mask = Image.new("L", (S, S), 0)
d = ImageDraw.Draw(mask)
r = 64
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
bg = Image.new("RGBA", (S, S), white)
fav = Image.composite(bg, fav, mask)

iw, ih = icon.size
scale = min((S - 40) / iw, (S - 40) / ih)
nw, nh = int(iw * scale), int(ih * scale)
icon_small = icon.resize((nw, nh), Image.LANCZOS)
fav.alpha_composite(icon_small, ((S - nw) // 2, (S - nh) // 2))
fav.save("assets/favicon-256.png")

# --- 4. bản header: chữ nhật bo góc nền trắng cố định (cùng lý do như favicon),
# icon căn giữa với lề mỏng hơn vì header không cần bo tròn gắt như favicon ---
HW, HH = 480, 400
hd = Image.new("RGBA", (HW, HH), (0, 0, 0, 0))
hmask = Image.new("L", (HW, HH), 0)
hd_draw = ImageDraw.Draw(hmask)
hd_draw.rounded_rectangle([0, 0, HW - 1, HH - 1], radius=48, fill=255)
hbg = Image.new("RGBA", (HW, HH), white)
header_icon = Image.composite(hbg, hd, hmask)

pad2 = 28
scale2 = min((HW - pad2 * 2) / iw, (HH - pad2 * 2) / ih)
nw2, nh2 = int(iw * scale2), int(ih * scale2)
icon_small2 = icon.resize((nw2, nh2), Image.LANCZOS)
header_icon.alpha_composite(icon_small2, ((HW - nw2) // 2, (HH - nh2) // 2))
header_icon.save("assets/header-mark.png")

print("done")
