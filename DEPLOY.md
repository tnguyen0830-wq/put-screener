# Đưa Pro Sell Put Scanner lên mạng

Mục tiêu: mở app từ điện thoại ở bất cứ đâu, không cần laptop bật.

Có 2 phần phải deploy: **backend** (thư mục này) và **giao diện web** (`ProSellPutScanner`).

---

## Trước khi bắt đầu — 3 điều cần biết

**1. Vẫn phải đăng nhập Schwab lại mỗi 7 ngày.** Schwab giới hạn cứng refresh token
7 ngày và không gia hạn khi refresh (`src/lib/schwab.ts`). Deploy không xoá được điều
này. Nhưng sau khi deploy bạn bấm đăng nhập lại **ngay trên điện thoại trong 30 giây**,
thay vì phải mở laptop.

**2. Token bảo vệ nằm trong bundle của app.** `EXPO_PUBLIC_BACKEND_TOKEN` bị đóng gói
vào file JS, ai mở devtools trên bản web đều đọc được. Nó chặn được bot và người dò
URL ngẫu nhiên, **không** thay thế được hệ thống đăng nhập thật. Chỉ dùng cho deploy
cá nhân — đừng chia sẻ URL rộng rãi.

**3. Tôi không thể tự tạo tài khoản Render/GitHub giúp bạn.** Bạn phải tự đăng ký và
tự bấm nút deploy. Các bước dưới đây ghi rõ chỗ nào bạn làm.

---

## Bước 1 — Code trên GitHub ✅ đã xong

Render deploy từ GitHub. Repo đã có sẵn:

```
https://github.com/tnguyen0830-wq/put-screener
```

**Giữ repo ở chế độ Private.** Repo này không chứa secret (xem bên dưới), nhưng URL
backend và cấu trúc API nằm hết trong đây.

Từ giờ vòng lặp cập nhật là: sửa code → commit → `git push` → **Render tự build và
deploy lại**. Không phải bấm gì thêm trên dashboard.

### Kiểm tra secret trước mỗi lần commit

`.gitignore` đã chặn sẵn `.env`, `.tokens.json`, `.cache`, `certificates`. Vẫn nên
liếc `git status` trước khi commit:

```bash
git add -A && git status
```

Nếu thấy `.env` hoặc `.tokens.json` trong danh sách thì **dừng lại**, đừng commit —
nghĩa là `.gitignore` đã bị sửa hỏng ở đâu đó.

---

## Bước 2 — Deploy backend lên Render

1. Đăng ký tại render.com, kết nối tài khoản GitHub.
2. **New → Blueprint**, chọn repo vừa push. Render đọc `render.yaml` có sẵn.
3. Render sẽ hỏi 5 giá trị (đã đánh dấu `sync: false` nên không nằm trong file):

   | Biến | Lấy từ đâu |
   |---|---|
   | `SCHWAB_APP_KEY` | file `.env` hiện tại |
   | `SCHWAB_APP_SECRET` | file `.env` hiện tại |
   | `FMP_API_KEY` | file `.env` hiện tại — thiếu thì mô tả doanh nghiệp trong tab Analyze để trống, phần còn lại vẫn chạy |
   | `MD_API_TOKEN` | bấm nút **Generate** của Render |
   | `SCHWAB_CALLBACK_URL` | điền sau khi biết URL — xem bước 3 |

4. Deploy. Render cấp URL — service hiện tại là `https://put-screener-y2hw.onrender.com`
   (đuôi `y2hw` là ngẫu nhiên; deploy lại từ đầu sẽ ra đuôi khác).

> Gói `starter` là bắt buộc vì cần ổ đĩa lưu token. Gói free không có ổ đĩa,
> token sẽ mất mỗi lần server ngủ dậy và bạn phải đăng nhập Schwab liên tục.

---

## Bước 3 — Thêm callback URL bên Schwab

Ô **Callback URL(s)** trong Schwab Developer Portal nhận **nhiều URL**. Nên đây là
*thêm một dòng*, không phải *thay thế*: giữ nguyên URL local và thêm URL Render vào
bên cạnh.

```
https://127.0.0.1:3000/api/auth/callback                   ← laptop, GIỮ NGUYÊN
https://put-screener-y2hw.onrender.com/api/auth/callback   ← thêm dòng này
```

Nhờ vậy laptop và bản deploy **dùng chung một app Schwab** — không cần đăng ký app
thứ hai. `.env` ở laptop vẫn để URL `127.0.0.1`, còn trên Render thì biến
`SCHWAB_CALLBACK_URL` để URL `onrender.com`; cùng một `SCHWAB_APP_KEY` chạy được cả hai.

1. Portal → app của bạn → thêm dòng vào **Callback URL(s)** → **Save**.
2. **Thay đổi chỉ có hiệu lực sau khi Schwab đồng bộ qua đêm.** Xác nhận từ Schwab
   Trader API Support (22/08/2026): *"This is expected behavior while the back end
   syncs, which happens overnight. In the meantime, you are able to use the previous
   callback URL."* Sau khi lưu, app ở trạng thái **Approved - Pending**; sáng hôm sau
   phải chuyển thành **Ready For Use**.
3. **Trong lúc chờ, URL cũ vẫn chạy bình thường** — laptop vẫn đăng nhập Schwab được
   như thường, không mất gì trong đêm đó.
4. Quay lại Render, điền vào `SCHWAB_CALLBACK_URL` đúng URL Render, **khớp từng ký
   tự**: không thừa dấu `/` ở cuối, không dùng `http`. Copy-paste thẳng từ portal cho
   chắc — Schwab so khớp chuỗi tuyệt đối và chỉ báo `invalid redirect_uri` chứ không
   nói sai ở đâu.

⚠️ Ngay tối vừa đổi mà đăng nhập trên Render báo `invalid redirect_uri` thì **đừng đi
sửa code** — gần như chắc chắn là chưa tới lượt sync. Sáng hôm sau thử lại.

> Mỗi lần đổi callback tốn một đêm. Nên **deploy Render trước để biết URL thật** rồi mới
> đổi đúng một lần (URL Render có đuôi ngẫu nhiên, đoán trước gần như chắc sai). Đó là
> lý do bước này nằm sau Bước 2.

---

## Bước 4 — Đăng nhập Schwab lần đầu

Mở trên điện thoại hoặc máy tính:
```
https://put-screener-y2hw.onrender.com
```
Bấm nút kết nối Schwab, đăng nhập. Token được ghi vào `/var/data/.tokens.json` trên ổ đĩa
và sống qua các lần deploy.

Kiểm tra:
```bash
curl -H "x-md-token: <MD_API_TOKEN>" https://put-screener-y2hw.onrender.com/api/md/volatility
```
Phải trả về VIX và chỉ số S&P. Nếu trả `MD_TOKEN_INVALID` là token sai; nếu trả
`REAUTH_REQUIRED` là chưa đăng nhập Schwab xong.

---

## Bước 5 — Deploy giao diện web

Trong `ProSellPutScanner`, sửa `.env`:

```
EXPO_PUBLIC_MARKET_DATA_PROVIDER=schwab
EXPO_PUBLIC_BACKEND_URL=https://put-screener-y2hw.onrender.com
EXPO_PUBLIC_BACKEND_TOKEN=<đúng giá trị MD_API_TOKEN ở bước 2>
```

Xuất bản web tĩnh:

```bash
npx expo export --platform web
```

**Luôn kiểm tra biến đã được nhúng vào bundle trước khi deploy:**

```bash
grep -c "put-screener-y2hw.onrender.com" dist/_expo/static/js/web/*.js
```

Phải ra `1`. Nếu ra `0` thì biến chưa vào bundle và app sẽ chạy DEMO DATA mà **không
báo lỗi gì cả**. Khi thêm biến `EXPO_PUBLIC_*` mới, phải khai thêm một dòng trong
`RAW_ENV` ở `src/config/env.ts`, chứ sửa mỗi `.env` là không đủ.

Thư mục `dist/` sinh ra đem thả vào Netlify Drop hoặc Vercel là xong (miễn phí, không
cần server vì đây chỉ là file tĩnh).

> `resolveBackendUrl()` trong `src/config/env.ts` chỉ tự đổi host khi backend nằm trong
> mạng nội bộ. Với URL `https://...onrender.com` nó giữ nguyên như bạn khai báo — đúng
> như mong muốn.

Xong: mở URL web đó trên điện thoại, **Add to Home Screen** để thành icon như app thật.

---

## Bảo trì hàng tuần

App sẽ **tự cảnh báo trước 2 ngày** bằng banner vàng ở màn hình Home, kèm nút
**"Kết nối lại Schwab"**. Bấm nút đó → đăng nhập → xong. Khoảng 30 giây, không cần laptop.

Nếu lỡ để hết hạn, banner chuyển sang màu đỏ và mọi màn hình dữ liệu sẽ báo lỗi rõ ràng
(không còn hiện trơ trọi "Scan failed" như trước).

---

## Lưu ý khi chạy ở máy local

**Đừng chạy `npm run build` trong khi `npm run dev:http` đang chạy.** Cả hai dùng chung
thư mục `.next`, bản build production sẽ ghi đè chunks của dev server và làm nó hỏng với
lỗi khó hiểu kiểu `Cannot find module './chunks/vendor-chunks/next.js'`, hoặc route bỗng
nhiên trả 404 dù file vẫn còn.

Cách sửa khi gặp: dừng dev server, xoá `.next`, chạy lại.

```bash
rm -rf .next && npm run dev:http
```
