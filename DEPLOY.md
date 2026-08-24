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

> **URL này không còn là địa chỉ chính.** Xem Bước 2b: app chạy trên
> `https://app.tylerinvestment.com`. URL `onrender.com` vẫn còn bật để làm đường lui,
> nhưng Chrome đã gắn cờ nó — đó chính là lý do có tên miền riêng.

### Hai biến nữa phải có, nếu không dữ liệu bạn nhập sẽ biến mất

Render dựng lại thư mục mã nguồn mỗi lần deploy, nên bất cứ thứ gì ghi vào đó đều
không sống qua lần deploy kế tiếp. Vị thế trong tab My Portfolio và watchlist là dữ
liệu do bạn nhập, nên phải nằm trên ổ đĩa gắn thêm cùng chỗ với token:

| Biến | Giá trị |
|---|---|
| `POSITIONS_PATH` | `/var/data/positions.json` |
| `WATCHLIST_PATH` | `/var/data/watchlist.json` |

Hai biến này có trong `render.yaml`, nhưng **Render không tự thêm biến mới vào service
đã tạo sẵn** — phải vào Environment thêm tay, rồi Save. Thiếu chúng thì app vẫn chạy
bình thường và lỗi chỉ lộ ra sau lần deploy sau, lúc danh mục trống trơn.

> Gói `starter` là bắt buộc vì cần ổ đĩa lưu token. Gói free không có ổ đĩa,
> token sẽ mất mỗi lần server ngủ dậy và bạn phải đăng nhập Schwab liên tục.

---

## Bước 2b — Tên miền riêng

**Vì sao cần.** Ngày 23/08/2026 Google Safe Browsing gắn cờ
`put-screener-y2hw.onrender.com` là trang lừa đảo. Đó là báo động nhầm — máy quét thấy
một tên miền phụ ngẫu nhiên trên một dịch vụ hosting dùng chung, nội dung đầy chữ
"Schwab", có nút chuyển sang trang đăng nhập ngân hàng và một đường dẫn
`/api/auth/callback`; đúng hình dạng của một trang giả mạo. Chrome chặn nguyên trang
bằng màn đỏ.

Báo nhầm cho Google thì gỡ được, nhưng chừng nào còn ở `*.onrender.com` thì còn có thể
bị gắn cờ lại, vì tiếng xấu là dùng chung với mọi trang khác trên đó. Tên miền riêng
khoảng 10 đô một năm là xong hẳn.

**Đặt tên.** Không được có chữ "schwab" trong tên miền — vừa là nhãn hiệu của người ta,
vừa là thứ khiến máy quét gắn cờ lần nữa. Tránh luôn các đuôi rẻ tiền `.xyz` `.top`,
chúng có tiếng xấu sẵn với bộ lọc. Tên đang dùng: `tylerinvestment.com`, mua ở
Cloudflare Registrar (bán đúng giá gốc, không phụ phí).

**Dùng tên miền phụ, không dùng tên miền gốc.** `app.tylerinvestment.com` chỉ cần một
bản ghi CNAME; tên miền gốc phải dùng bản ghi A với địa chỉ IP, phiền hơn và dễ hỏng khi
Render đổi hạ tầng.

### Các bước

1. **Render** → service → Settings → Custom Domains → Add Custom Domain →
   `app.tylerinvestment.com`. Render hiện ra bản ghi cần tạo.
2. **Cloudflare** → DNS → Records → Add record:

   | Ô | Giá trị |
   |---|---|
   | Type | `CNAME` |
   | Name | `app` |
   | Target | `put-screener-y2hw.onrender.com` |
   | Proxy status | **DNS only** — đám mây **xám** |
   | TTL | Auto |

   ⚠️ **Proxy phải tắt.** Cloudflare mặc định bật (đám mây cam), và khi bật thì Render
   không xin được chứng chỉ HTTPS — Certificate Status kẹt ở Pending mãi mãi. Cloudflare
   sẽ hiện dải vàng khuyên bật proxy; bỏ qua nó.
3. Quay lại Render, bấm làm mới cạnh tên miền. `Verified` mất khoảng một phút,
   `Certificate Issued` thêm vài phút nữa.
4. **Schwab portal** → Modify App → **thêm** callback mới vào cuối, **giữ nguyên** các
   dòng cũ:

   ```
   https://app.tylerinvestment.com/api/auth/callback
   ```

   App chuyển sang `Modification Pending`. Schwab xử lý thay đổi Callback URL **sau giờ
   giao dịch**, nên phải chờ qua đêm. Trong lúc đó URL cũ vẫn đăng nhập được.
5. Hôm sau, khi app về `Ready For Use`: Render → Environment → đổi
   `SCHWAB_CALLBACK_URL` thành `https://app.tylerinvestment.com/api/auth/callback` →
   Save.
6. Mở tên miền mới → Cài đặt → **Kết nối lại** → đăng nhập Schwab.

### Chỉ tắt URL cũ sau khi tất cả đã chuyển xong

Render → Settings → **Render Subdomain** → tắt. Trước khi tắt, kiểm tra đủ ba thứ đã
trỏ về tên miền mới:

- `SCHWAB_CALLBACK_URL` trên Render
- Đăng nhập Schwab đã thành công **trên tên miền mới**
- `EXPO_PUBLIC_BACKEND_URL` trong `ProSellPutScanner` (Bước 5) — app điện thoại vẫn
  đang gọi thẳng vào `onrender.com`, tắt subdomain trước khi build lại là app đó chết

Tắt sớm hơn là tự khoá đường đăng nhập lại của chính mình.

---

## Bước 3 — Thêm callback URL bên Schwab

Ô **Callback URL(s)** trong Schwab Developer Portal nhận **nhiều URL**. Nên đây là
*thêm một dòng*, không phải *thay thế*: giữ nguyên URL local và thêm URL Render vào
bên cạnh.

```
https://127.0.0.1:3000/api/auth/callback                   ← laptop, GIỮ NGUYÊN
https://put-screener-y2hw.onrender.com/api/auth/callback   ← bản deploy đầu tiên
https://app.tylerinvestment.com/api/auth/callback          ← tên miền riêng (Bước 2b)
```

Nhờ vậy laptop và bản deploy **dùng chung một app Schwab** — không cần đăng ký app
thứ hai. `.env` ở laptop vẫn để URL `127.0.0.1`, còn trên Render thì biến
`SCHWAB_CALLBACK_URL` để tên miền riêng; cùng một `SCHWAB_APP_KEY` chạy được cả hai.

Giữ luôn cả ba dòng. Một callback thừa không gây hại gì, còn xoá nhầm là mất một đêm
chờ đồng bộ mới thêm lại được.

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
https://app.tylerinvestment.com
```
Bấm nút kết nối Schwab, đăng nhập. Token được ghi vào `/var/data/.tokens.json` trên ổ đĩa
và sống qua các lần deploy.

Kiểm tra:
```bash
curl -H "x-md-token: <MD_API_TOKEN>" https://app.tylerinvestment.com/api/md/volatility
```
Phải trả về VIX và chỉ số S&P. Nếu trả `MD_TOKEN_INVALID` là token sai; nếu trả
`REAUTH_REQUIRED` là chưa đăng nhập Schwab xong.

---

## Bước 5 — Deploy giao diện web

Trong `ProSellPutScanner`, sửa `.env`:

```
EXPO_PUBLIC_MARKET_DATA_PROVIDER=schwab
EXPO_PUBLIC_BACKEND_URL=https://app.tylerinvestment.com
EXPO_PUBLIC_BACKEND_TOKEN=<đúng giá trị MD_API_TOKEN ở bước 2>
```

Xuất bản web tĩnh:

```bash
npx expo export --platform web
```

**Luôn kiểm tra biến đã được nhúng vào bundle trước khi deploy:**

```bash
grep -c "app.tylerinvestment.com" dist/_expo/static/js/web/*.js
```

Phải ra `1`. Nếu ra `0` thì biến chưa vào bundle và app sẽ chạy DEMO DATA mà **không
báo lỗi gì cả**. Khi thêm biến `EXPO_PUBLIC_*` mới, phải khai thêm một dòng trong
`RAW_ENV` ở `src/config/env.ts`, chứ sửa mỗi `.env` là không đủ.

Thư mục `dist/` sinh ra đem thả vào Netlify Drop hoặc Vercel là xong (miễn phí, không
cần server vì đây chỉ là file tĩnh).

> `resolveBackendUrl()` trong `src/config/env.ts` chỉ tự đổi host khi backend nằm trong
> mạng nội bộ. Với một URL công khai như `https://app.tylerinvestment.com` nó giữ nguyên
> như bạn khai báo — đúng như mong muốn.

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
