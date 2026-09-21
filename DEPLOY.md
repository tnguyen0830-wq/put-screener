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
URL ngẫu nhiên, **không** thay thế được hệ thống đăng nhập thật.

Đó là chuyện của app điện thoại gọi `/api/md/*`. Còn **giao diện web thì đã có đăng
nhập thật** bằng `APP_PASSWORD` — xem Bước 2c. Bắt buộc phải đặt, vì tab My Portfolio
hiện vị thế thật.

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

> **URL này đã tắt hẳn (24/08/2026).** App chạy trên
> `https://app.tylerinvestment.com`; địa chỉ `onrender.com` giờ trả về `Not Found`.
> Xem Bước 2b để biết vì sao và cách bật lại nếu cần.

### Một biến nữa phải có, nếu không watchlist sẽ biến mất

Render dựng lại thư mục mã nguồn mỗi lần deploy, nên bất cứ thứ gì ghi vào đó đều
không sống qua lần deploy kế tiếp. Watchlist là dữ liệu do bạn nhập, nên phải nằm
trên ổ đĩa gắn thêm cùng chỗ với token:

| Biến | Giá trị |
|---|---|
| `WATCHLIST_PATH` | `/var/data/watchlist.json` |

Biến này có trong `render.yaml`, nhưng **Render không tự thêm biến mới vào service
đã tạo sẵn** — phải vào Environment thêm tay, rồi Save. Thiếu nó thì app vẫn chạy
bình thường và lỗi chỉ lộ ra sau lần deploy sau, lúc watchlist trống trơn.

> Tab **My Portfolio** không cần biến nào ở đây: vị thế đọc thẳng từ tài khoản
> Schwab (quyền Accounts and Trading), không lưu file, không có gì để mất giữa
> hai lần deploy.

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

**Đã làm xong ngày 24/08/2026** — phần dưới đây giữ lại để biết cần kiểm tra gì nếu
phải dựng lại từ đầu.

Render → Settings → **Render Subdomain** → tắt. Render bắt gõ đúng chuỗi
`sudo subdomain web service put-screener` để xác nhận, nên không có chuyện bấm nhầm.
Trước khi tắt, kiểm tra đủ ba thứ đã trỏ về tên miền mới:

- `SCHWAB_CALLBACK_URL` trên Render
- Đăng nhập Schwab đã thành công **trên tên miền mới**
- `EXPO_PUBLIC_BACKEND_URL` trong `ProSellPutScanner` (Bước 5) — biến này nằm trong
  cấu hình build của app điện thoại, KHÔNG phải trên Render, nên đừng tìm nó ở tab
  Environment. Nếu app đó còn gọi thẳng vào `onrender.com` thì tắt subdomain là app
  chết

Tắt sớm hơn là tự khoá đường đăng nhập lại của chính mình.

Tắt rồi vẫn bật lại được ngay bằng chính công tắc đó — đây là thao tác đảo ngược
được, không phải xoá. Nên nếu nghi ngờ, cứ tắt rồi thử; hỏng thì gạt về.

Trạng thái sau khi tắt, để đối chiếu: khối **Custom Domains** liệt kê đúng một tên
miền `app.tylerinvestment.com` với `Certificate Issued` và `Verified`; phần **Render
Subdomain** ghi `Disabled` và dòng "Your service is **not** reachable at
https://put-screener-y2hw.onrender.com."; mở địa chỉ đó trên trình duyệt ra trang đen
chữ trắng `Not Found`.

### Google đã gỡ cờ chưa

Cảnh báo "Deceptive site" từng chặn cả `onrender.com` lẫn tên miền riêng lúc mới dựng.
Sau khi thêm đoạn tự khai báo không liên kết với Charles Schwab vào trang đăng nhập và
gửi yêu cầu xem xét lại, Google đã gỡ — xác nhận ngày 24/08/2026 ở cả hai nguồn:

- Search Console → Security & Manual Actions → Security Issues: `No issues detected`
- https://transparencyreport.google.com/safe-browsing/search?url=app.tylerinvestment.com:
  `No unsafe content found`

Kiểm tra lại ở đúng hai chỗ đó nếu sau này lại bị chặn.

---

## Bước 2c — Khoá trang bằng mật khẩu

Trang chạy trên một URL công khai. Chừng nào trên đó chỉ có giá thị trường thì mở cũng
được, nhưng từ lúc tab My Portfolio hiện vị thế thật thì không.

Đặt trên Render → Environment:

| Biến | Giá trị |
|---|---|
| `APP_PASSWORD` | mật khẩu bạn tự đặt, dài, không trùng mật khẩu Schwab |
| `APP_OWNER_USER` | *(tuỳ chọn)* tên đăng nhập của bạn. Bỏ trống = `owner` |
| `USERS_PATH` | `/var/data/users.json` — kho tài khoản người nhà, xem mục dưới |
| `APP_USERS` | *(tuỳ chọn, chỉ để chuyển tiếp từ bản cũ)* — xem mục dưới |

`USERS_PATH` có trong `render.yaml`, nhưng **Render không tự thêm biến mới vào
service đã tạo sẵn** (cùng cái bẫy với `WATCHLIST_PATH` ở Bước 1) — phải vào
Environment thêm tay. Thiếu nó thì tài khoản người nhà rơi vào thư mục build và
lần deploy sau là mất sạch, trong khi app vẫn chạy như không có gì.

Đặt xong deploy lại. Vào trang sẽ thấy ô **tên đăng nhập** và ô **mật khẩu**; đăng
nhập một lần, phiên chủ app giữ **30 ngày** trên máy đó (người nhà **7 ngày**).
Đăng xuất nằm trong menu ⚙️.

**Không đặt thì trang mở cho tất cả.** Để không ai vô tình chạy như vậy mà không biết,
`/api/auth/status` trả về `locked: false` và menu ⚙️ hiện chấm đỏ kèm dòng cảnh báo.
Ở máy nhà thì không cần đặt — không đặt là không có cổng, tiện cho lúc phát triển.

### Tài khoản cho người nhà

Mặc định chỉ có một tài khoản: ai biết `APP_PASSWORD` là thấy mọi thứ, **kể cả
tab My Portfolio** — tức vị thế thật trong tài khoản Schwab của bạn. Muốn người
nhà dùng được phần công cụ thị trường mà không thấy danh mục, tạo tài khoản cho
họ **ngay trong app**: menu ⚙️ → **Quản lý tài khoản** (mục này chỉ chủ app
thấy, và `/accounts` lẫn `/api/users` đều bị chặn theo vai trò ở middleware,
nên gõ thẳng địa chỉ cũng không vào được).

Ở đó thêm người, đổi mật khẩu, hoặc xoá. Không phải sửa biến môi trường, không
phải deploy lại. Tên chỉ gồm `a-z 0-9 _ -`, mật khẩu tối thiểu 8 ký tự.

**Mật khẩu được băm bằng scrypt, salt riêng cho từng người**, lưu ở `USERS_PATH`
(`/var/data/users.json` trên Render). Mật khẩu thô không bao giờ được ghi ra
đĩa — mở file ra cũng không đọc lại được mật khẩu của ai, kể cả của bạn. Vì nằm
trên ổ đĩa gắn thêm nên tài khoản sống qua mọi lần deploy; để trong thư mục
build thì mỗi lần deploy là cả nhà mất tài khoản.

Mật khẩu của **chủ app** cố tình KHÔNG nằm trong file đó — nó vẫn là
`APP_PASSWORD`. Nghĩa là file tài khoản có hỏng, có bị xoá, thì bạn vẫn đăng
nhập được và tạo lại; không có đường nào tự khoá mình ra ngoài.

| | Chủ app | Người nhà |
|---|---|---|
| Tên đăng nhập | `owner` (hoặc `APP_OWNER_USER`) | tên bạn đặt trong app |
| Mật khẩu nằm ở | `APP_PASSWORD` | `USERS_PATH`, đã băm |
| Sell Put Screener, Analyze, Heatmap, Insider Trade | ✓ | ✓ |
| Watchlist | riêng | riêng |
| My Portfolio, P/L đã chốt, cảnh báo | ✓ | **không** (403) |
| Kết nối / ngắt Schwab | ✓ | **không** (403) |
| Quản lý tài khoản (`/accounts`) | ✓ | **không** (403) |
| Phiên đăng nhập | 30 ngày | 7 ngày |

Bốn điều phải biết trước khi bật:

- **Dùng CHUNG phiên Schwab và chung mọi hạn mức.** Người nhà quét cả rổ là
  tiêu vào đúng 100 request/phút của bạn, và bấm "Nhờ Claude phân tích" là tiêu
  tiền trên `ANTHROPIC_API_KEY` của bạn. Đây là phân tách theo vai trò, không
  phải đa người dùng thật — muốn tách hẳn thì deploy một bản riêng.
- **Mỗi lần chỉ một người quét được.** Hai lần quét song song sẽ giành nhau hạn
  mức Schwab; người thứ hai nhận thông báo "đang có người quét" thay vì kết quả
  của người kia.
- **Xoá một người: mất ngay mọi thứ riêng tư, và mất luôn quyền đăng nhập
  lại.** Cổng theo vai trò đọc tên từ cookie ĐÃ KÝ, nên họ không bao giờ chạm
  được vào danh mục; và mọi route cần biết danh tính đều kiểm tra tài khoản còn
  tồn tại, nên `/api/me`, watchlist, quét đều trả 401 và giao diện đẩy họ ra
  trang đăng nhập. Cái còn sót lại là mấy route dữ liệu thị trường thuần tuý,
  không hỏi danh tính: cookie cũ còn đọc được tới khi hết hạn. Đó là lý do
  phiên của người nhà chỉ 7 ngày — middleware chạy ở Edge runtime, không đọc
  được file trên đĩa, nên phép kiểm tra "còn tài khoản không" buộc phải nằm ở
  phía Node.
- **Đổi `APP_PASSWORD` thì MỌI người phải đăng nhập lại**, vì nó là khoá ký
  phiên. Tài khoản người nhà thì không mất, chỉ phải đăng nhập lại.

#### Quên mật khẩu

**Người nhà** — bạn tạo mã đặt lại trong ⚙️ → Quản lý tài khoản, đọc cho họ,
họ tự đặt mật khẩu mới ở trang đăng nhập (nút **Quên mật khẩu?**). Mã sống 30
phút, dùng một lần, trên đĩa chỉ lưu bản băm. Không cần deploy, không cần
nhắn mật khẩu qua tin nhắn.

Cửa nhập mã (`/api/password-reset`) **mở cho cả Internet** — bắt buộc, vì
người quên mật khẩu chưa đăng nhập được. Ba thứ giữ nó an toàn: mã ngẫu nhiên
8 ký tự trong bảng 31 chữ (~8.5×10¹¹ tổ hợp) hết hạn sau 30 phút; bộ đếm khoá
sau 5 lần sai trong 15 phút, xô riêng với xô của trang đăng nhập; và quan
trọng nhất — **không tồn tại mã đặt lại cho chủ app**, nên đường này không bao
giờ chạm tới danh mục.

**Chủ app** — không có mã, và đó là chủ ý. Khôi phục thế này:

1. Render → service → **Environment** → sửa `APP_PASSWORD` thành mật khẩu mới.
2. **Save**, chờ deploy lại xong.
3. Đăng nhập với tên `owner` (hoặc `APP_OWNER_USER`) + mật khẩu mới.

Hai hệ quả phải biết trước khi làm: `APP_PASSWORD` là **khoá ký phiên**, nên
đổi nó là **mọi người** — cả nhà — bị đăng xuất và phải đăng nhập lại; và tài
khoản người nhà thì **không mất**, mật khẩu của họ vẫn nguyên, chỉ phải đăng
nhập lại một lần. Phiên Schwab, watchlist, danh mục đều không ảnh hưởng.

#### Chuyển tiếp từ `APP_USERS` (bản cũ)

Bản trước giữ tài khoản người nhà trong biến `APP_USERS="ten:matkhau,..."`, dạng
chữ thường. Biến đó vẫn còn đọc được, nhưng **chỉ đúng một lần**: lần chạy đầu
tiên mà file `USERS_PATH` chưa tồn tại, app chuyển mọi tài khoản trong đó sang
kho đã băm rồi thôi. Sau đó sửa `APP_USERS` không có tác dụng gì nữa.

Đó là chủ ý, không phải thiếu sót: xoá một người trong app rồi thì một biến môi
trường bỏ quên không được phép hồi sinh họ. Chuyển xong thì **xoá `APP_USERS`
đi** — mật khẩu thô nằm trong bảng Environment của Render không có lý do gì để
ở lại.

Một việc phải làm thủ công sau lần deploy này: **mọi người đăng nhập lại một
lần**, và lần này có thêm ô tên. Cookie phiên bản cũ bị từ chối thẳng chứ không
được đoán là của chủ app.

### tastytrade (tuỳ chọn): earnings + IV rank cho screener

Schwab không cho ngày earnings và IV rank. Hệ quả thật: hard gate "không có
earnings trong kỳ hợp đồng" đang **đi qua mọi mã ngoài watchlist chỉ vì không
có dữ liệu**. tastytrade có cả hai thứ đó miễn phí cho người có tài khoản, chỉ
đọc dữ liệu thị trường — không đặt lệnh, không đọc vị thế.

**Bước 1 — lấy OAuth (ưu tiên), không dùng mật khẩu.** Vào tastytrade →
`my.tastytrade.com/app.html#/manage/api` → **New OAuth Client**.

> ### Tick ĐÚNG `read`. Không tick `trade`.
>
> Đây là quyết định một lần và là ranh giới an toàn quan trọng nhất của cả
> phần tastytrade — code không kiểm soát được nó.
>
> | Scope | Tick | Vì sao |
> |---|---|---|
> | `read` | ✅ | Đủ để đọc `/market-metrics`. Scope tối thiểu để token dùng được |
> | `trade` | ❌ | **Quyền đặt lệnh thật.** App không bao giờ đặt lệnh |
> | `openid` | ❌ | Chỉ cho đăng nhập liên kết danh tính, app không cần |
>
> Token sống trong bảng Environment của Render. Lộ một token chỉ có `read`
> là lộ vài con số thị trường; lộ token có `trade` là **người lạ giao dịch
> được trên tài khoản môi giới thật**. Quyền tối thiểu ở đây đổi hậu quả tệ
> nhất từ mất tiền thành lộ dữ liệu.

**Redirect URI** bắt buộc điền dù luồng `refresh_token` không dùng tới nó.
Đặt một URL https thuộc về bạn, ví dụ
`https://<app>.onrender.com/api/auth/tastytrade/callback`. Sửa lại sau được.

Render → Environment:

| Biến | Giá trị |
|---|---|
| `TT_CLIENT_ID` | client id (gửi kèm khi có; OAuth2 chuẩn đòi nó) |
| `TT_CLIENT_SECRET` | client secret vừa tạo |
| `TT_REFRESH_TOKEN` | refresh token vừa tạo |

Nếu tài khoản chưa mở được OAuth thì tạm dùng `TT_USERNAME` + `TT_PASSWORD` —
nhưng đó là **mật khẩu tài khoản môi giới** nằm trong bảng Environment, nên
chuyển sang OAuth ngay khi có thể và xoá hai biến kia đi.

**Bước 2 — chạy probe một lần, đọc kết quả, rồi mới có tính năng.** Sau khi
deploy, đăng nhập bằng tài khoản chủ app và mở:

```
https://<app>/api/ttprobe?symbols=AAPL,MSFT,SPY,TSLA,NVDA
```

Nó chỉ trả về **hình dạng** (tên khoá, kiểu dữ liệu, mã nào bị rơi), không
có token nào trong câu trả lời. Ba dòng đáng đọc:

- `auth.ok` + `marketMetrics.schemeAccepted` — xác thực chạy được chưa, và
  header kiểu nào được chấp nhận.
- `marketMetrics.found.earnings` — **rỗng nghĩa là không vá được gate
  earnings từ đây**, dừng lại.
- `marketMetrics.missing` — hỏi 5 mã mà về 4 thì phải biết trước khi tin.

Gửi nguyên khối JSON đó cho Claude; tính năng viết theo cái đo được, không
theo tài liệu.

### Probe tape DXLink — tastytrade có dựng được footprint không?

**Không cần thêm biến môi trường nào.** Dùng đúng tài khoản tastytrade đã
cấu hình ở trên. Mở, **trong giờ giao dịch** (09:30–16:00 New York):

```
https://<app>/api/dxtapeprobe
```

(`?symbols=AAPL,SPY,SPX` và `?seconds=20` đổi được; trần 5 mã / 30 giây.)

Chỉ trả **hình dạng**, không token, không số dư. Đọc theo thứ tự:

1. `footprintRoute` — `feed` (chính feed mang phía chủ động → dựng footprint
   thẳng), `infer` (phải suy phía từ bid/ask, kèm tỉ lệ suy được),
   `no-side` (có tape mà không ra được phía), `no-tape` (không có
   TimeAndSale nào).
2. `aggregationGranted` — **quan trọng nhất**. Xin `0` mà được cấp số > 0
   nghĩa là máy chủ GỘP NHỊP, tức tape đã bị làm mỏng và một footprint dựng
   trên nó **sai mà trông đúng** — đúng lý do đường NinjaTrader bị dừng.
3. `tape[].fieldKeys` và `tape[].sample` — tên trường THẬT và một sự kiện
   nguyên văn. Mọi tên trong `src/lib/dxtape.ts` là NHỚ, chưa xác nhận; đây
   là chỗ sửa theo.
4. `candlesReceived` — có nến 5 phút thời gian thực thì tab Daytrade thôi
   phải hỏi-đáp `/pricehistory` của Schwab.
5. `howToRead` — câu kết luận viết sẵn, gồm cả trường hợp bấm ngoài giờ
   (`marketOpen: false` + `lookbackWindowAllClosed: true` nghĩa là tape rỗng
   KHÔNG chứng minh được gì, phải bấm lại trong phiên).

Gửi nguyên khối JSON đó về; tính năng viết theo cái đo được.

### NinjaTrader web / Tradovate: ĐANG DỪNG (đo 2026-09-21) — probe vẫn còn, chưa có tính năng

> ## ⛔ Đọc trước: đường này đã dừng, đừng đặt env rồi mới biết
>
> **Đo 2026-09-21 từ màn hình chủ app, chưa từng chạy probe.** Sáu phát
> hiện, và ba câu hỏi của probe đã có đáp án miễn phí:
>
> | Đo được | Nguồn |
> |---|---|
> | **Dữ liệu TRỄ 10 PHÚT** — *"NQZ6 data is delayed by 10 minutes. To get real-time data, please subscribe to a CME data package."* | Hộp thoại của chính Tradovate |
> | `Subscriptions → Market Data` = **"No rows"** — không có gói dữ liệu nào | Ảnh chụp, khớp với dòng trên |
> | Tên hợp đồng là **`NQZ6`** — MỘT chữ số năm, tức `ESZ6` đoán đúng | Màn hình hợp đồng |
> | **Order Flow + đang ACTIVE, $59,00/tháng** — đã có Bid/Ask chart (footprint), Volume Profile, Cumulative Delta | Tab `Add-Ons` |
> | **Không có tài khoản demo** — chỉ một tài khoản, nhãn `LIVE` | Tab `Accounts` |
> | Net Liquidity **$200**, NQ day margin **$1.000** | Tab `Accounts` + màn hình hợp đồng |
> | Giá gói **API Access** | Tab `Add-Ons` của chủ app **KHÔNG có card nào** — và trang hỗ trợ của hãng (2026-09-21) nói vì sao: gói đó đòi tài khoản **LIVE đã nạp tối thiểu $1.000**, giá **$25/tháng**. Net Liquidity đang là **$200**, nên card không hiện là ĐÚNG chứ không phải lỗi giao diện. |
>
> **Vì sao dừng:** không có dữ liệu real-time thì luồng md giỏi lắm cũng trễ
> 10 phút, và một biểu đồ footprint dựng trên dữ liệu trễ 10 phút là thứ
> **sai mà trông y hệt đúng**. Thêm nữa footprint đã có sẵn trong chính
> NinjaTrader web (đang trả $59/tháng), không có tài khoản demo để đo an
> toàn, và Tradovate là sàn **futures** nên không bao giờ cho cổ phiếu hay
> 0DTE SPX — đúng nửa quan trọng của thứ chủ app đặt hàng.
>
> **Code KHÔNG bị xoá.** `src/lib/ninjatrader.ts` và `/api/ntprobe` vẫn
> đúng. Bật lại bằng cách mua gói dữ liệu CME + gói API Access, đặt 4 biến
> env, mở `/api/ntprobe`. Mọi bước dưới đây vẫn dùng được nguyên.

Chủ app đăng nhập được `web.ninjatrader.com`. Nền tảng web của NinjaTrader
chính là **Tradovate** (NinjaTrader mua Tradovate năm 2022), và đây là host
có key nên luật của repo là **đo trước, code sau**: `/api/ntprobe` in hình
dạng thật của API rồi tab daytrade (nếu làm) viết theo cái đo được.

> ### Mật khẩu đăng nhập nằm trong env — và quyền của key do chủ app chọn
>
> Khác tastytrade, Tradovate không có OAuth: token lấy bằng ĐÚNG tên +
> mật khẩu đăng nhập cộng cặp khoá API, nên **mật khẩu nằm trong bảng
> Environment của Render là mật khẩu vào được tài khoản đó**. Đó là rủi ro
> lớn nhất ở đây và code không giảm được.
>
> **Sửa một câu đã viết sai:** trang hỗ trợ của hãng (đọc 2026-09-21) nói
> màn hình tạo key có bước **chọn quyền cho key** trước khi bấm Generate —
> tức KHÔNG phải "token luôn đặt lệnh được, không có đường nào khác" như
> file này từng khẳng định. Danh sách quyền cụ thể **chưa đo được** (tài
> khoản chưa mở được gói), nên khi tạo key hãy **tick đúng phần đọc dữ
> liệu và bỏ mọi ô liên quan tới đặt lệnh**, rồi chụp màn hình danh sách
> quyền gửi về để ghi lại cho chính xác.
>
> Hai cách giảm rủi ro còn lại, cả hai đều là quyết định của chủ app:
>
> - Đặt `NT_ENV=demo` (mặc định) nếu tài khoản có bản demo — probe chạy y
>   hệt trên demo, và mọi thứ tab daytrade cần (quote, chart, DOM) đều đo
>   được ở đó. Chỉ đổi `live` khi cần đúng tài khoản thật.
>   **⚠ Đo 2026-09-21: tài khoản của chủ app KHÔNG có bản demo** (tab
>   `Accounts` chỉ có một tài khoản, nhãn `LIVE`), nên mặc định `demo` không
>   bảo vệ được gì ở đây — muốn chạy probe là phải `NT_ENV=live` và để mật
>   khẩu tài khoản thật trên Render. Cân nhắc kỹ trước khi làm.
> - Xoá `NT_USER`/`NT_PASSWORD` khỏi Render ngay khi đo xong nếu chưa quyết
>   làm tính năng.
>
> App **không có** hàm đặt lệnh nào; probe chỉ gọi endpoint đọc.

**Bước 1 — lấy cặp khoá API.** Các bước dưới đây đọc từ trang hỗ trợ của
chính hãng (`support.ninjatrader.com` / `support.tradovate.com`, bài
*Tradovate API Access*, đọc 2026-09-21) — **chưa đi hết được bằng tài khoản
của chủ app**, vì điều kiện cần chưa đủ (xem ngay bên dưới).

*Điều kiện cần, và đây là chỗ đang tắc:*

- Tài khoản **LIVE đã nạp tiền, số dư tối thiểu $1.000**. Đo được: Net
  Liquidity đang là **$200** → chưa đủ.
- Gói **API Access** đang hoạt động, **$25/tháng**, mua trong app. Đo được:
  tab `Add-Ons` của chủ app không hiện card nào — khớp với điều kiện trên.

*Các bước khi đã đủ điều kiện:*

1. **Application Settings → tab `Add-Ons`** → kéo tìm **API Access** → mua
   gói.
2. Vẫn trong Application Settings → **tab `API Access`** → bấm
   **`Generate API Key`**.
3. Đọc và xác nhận loạt **self-attestation** (hãng bắt tự cam kết là hiểu
   giao dịch futures và hiểu hậu quả khi dùng API).
4. **Chọn quyền cho key** — tick tối thiểu, bỏ mọi ô liên quan tới đặt lệnh;
   chụp màn hình danh sách quyền để ghi lại vào file này.
5. Bấm **`Generate`**. Key hiện **ĐÚNG MỘT LẦN** → chép ngay `cid` (một số)
   và `sec` (chuỗi) và cất chỗ an toàn. Đóng cửa sổ là mất, phải tạo key mới.

Nếu tài khoản chưa có gói thì probe sẽ in **nguyên văn lời từ chối của
Tradovate** — đó là câu trả lời, không phải lỗi của probe.

Render → Environment:

| Biến | Giá trị |
|---|---|
| `NT_USER` | tên đăng nhập web.ninjatrader.com |
| `NT_PASSWORD` | mật khẩu đăng nhập (xem hộp cảnh báo trên) |
| `NT_CID` | `cid` của API key |
| `NT_SEC` | `sec` của API key |
| `NT_ENV` | `demo` (mặc định) hoặc `live` |

**Bước 2 — chạy probe một lần, đọc kết quả.** Đăng nhập bằng tài khoản chủ
app và mở:

```
https://<app>/api/ntprobe
```

(thêm `?t=NQ` để hỏi gợi ý hợp đồng khác, `?symbol=ESZ6` để ép mã đăng ký).
Nó chỉ trả về **hình dạng** — tên khoá, kiểu, số dòng, và nguyên văn hai
chiều của WebSocket đã che token; không có mật khẩu/khoá/token nào trong câu
trả lời. Năm dòng đáng đọc, theo thứ tự:

- `auth.ok` — nếu `false`, `auth.body` là lời thật của Tradovate:
  `errorText` (thiếu gói API Access? sai cid/sec?), `p-ticket` (đăng nhập
  quá dày, chờ `p-time` giây), `p-captcha: true` (phải giải captcha trên
  web — không tự động hoá được từ server).
- `auth.hasMdAccessToken` — có token dữ liệu thị trường riêng không.
- `contracts.picked` — tên hợp đồng THẬT. **Đã đo 2026-09-21: một chữ số
  năm (`NQZ6`), tức `ESZ6` là đúng** — dùng dòng này để xác nhận lại thôi.
- `md.authorized` + `md.observation.mdFrames` — luồng md có chạy không;
  `md.observation.quoteEntryKeys` phải có Bid/Offer/Trade.
- `md.observation.chartBarKeys` — thanh Tick có `bidVolume`/`offerVolume`
  (hay tương đương) thì **footprint làm được**; chỉ có OHLC thì không.

Gửi nguyên khối JSON đó cho Claude; tính năng viết theo cái đo được, không
theo tài liệu.

## X (Twitter) — đọc tin cho mã đang nắm

**Đo xong ở production ngày 2026-09-19, tầng cảnh báo đã CHẠY THẬT.** X là
host CÓ KEY, nên luật của repo là đo ở production trước rồi mới viết code -
và probe đã trả lời đủ ba câu quyết định (cashtag dùng được, since_id được
tôn trọng, trần 512 ký tự đúng như đoán) nên tính năng viết theo đúng những
con số đó, không phải theo tài liệu nhớ được.

**Bước 0 — biết mình mua gì trước khi trả tiền.**

Chủ app gửi ảnh chụp `developer.x.com` (2026-09-18) và **nó khác hẳn thứ tôi
nhớ** — chỗ này là phép đo, không phải trí nhớ. Trang đó hiện bán đúng hai
thứ:

| Sản phẩm | Cách tính tiền |
|---|---|
| **X API — Pay-per-use** | **tín dụng, không cam kết**, trả theo đúng phần đã dùng |
| **X API — Enterprise** | lưu lượng lớn, hạn mức riêng, có người quản lý tài khoản |

**Đây là tin tốt và nó đổi hẳn cách quyết định.** Bản cũ bán theo THÁNG, nên
câu hỏi là "có đáng bỏ tiền hằng tháng không" và phải trả lời TRƯỚC khi đo
được gì. Trả theo lượng dùng thì không còn câu đó: nạp một ít tín dụng, chạy
probe, đọc chi phí thật, rồi mới quyết mở rộng. Rủi ro lớn nhất của cả việc
này biến mất.

> **Một con số trên trang đó RẤT dễ đọc nhầm, và đọc nhầm là tốn tiền.** Ô
> "Pay Per Use Pricing Changes" ghi **$0.001 mỗi tài nguyên** — nhưng đó là
> giá của **Owned Reads**, tức đọc **dữ liệu của CHÍNH BẠN** (bài mình đăng,
> bookmark, follower, like), và chính trang đó gọi nó là giá **giảm**. Thứ
> tính năng này cần là đọc bài của **NGƯỜI KHÁC** nói về mã mình nắm — một
> mức giá KHÁC, và cao hơn. Đừng lấy $0.001 làm cơ sở tính toán.

Vẫn phải tìm đúng hai dòng này trước khi nạp tiền:

1. **Endpoint `recent search`** (`/2/tweets/search/recent`) có dùng được
   không. Không có nó thì không đọc được gì.
2. **Toán tử `$AAPL` (cashtag)** có dùng được không. Đây là câu QUYẾT ĐỊNH
   kiến trúc chứ không phải chi tiết: có thì tìm thẳng theo mã; không có thì
   phải bám theo DANH SÁCH TÀI KHOẢN (`from:`) rồi lọc mã trong app — vẫn làm
   được, nhưng là một tính năng khác và cần bạn chọn danh sách tài khoản.

Ngoài hai dòng đó tôi **không** ghi con số giá nào ở đây, cố ý — và lần này
có bằng chứng cho chính luật đó: bảng giá X đã đổi hẳn mô hình so với thứ tôi
nhớ, nên một con số chép vào runbook sẽ trông y hệt một con số đã kiểm trong
khi nó đã chết từ lâu.

**Bước 1 — token.** Tạo App ở cổng developer rồi lấy **App-only Bearer
Token**.

> **PHẢI là token app-only, KHÔNG phải token theo ngữ cảnh người dùng.**
>
> | Loại token | Dùng | Vì sao |
> |---|---|---|
> | App-only Bearer | ✅ | Chỉ đọc. **Không đăng được bài** |
> | OAuth 2.0 user context | ❌ | Đọc được, nhưng **đăng bài được dưới tên bạn** |
>
> Token sống trong bảng Environment của Render. Lộ token app-only là lộ vài
> dòng tin vốn đã công khai; lộ token người dùng là **người lạ đăng bài dưới
> tên bạn**. Cùng lập luận đã dùng cho scope `read` của tastytrade.

Render → Environment: `X_BEARER_TOKEN`.

**Bước 2 — chạy probe một lần, đọc kết quả, rồi mới có tính năng.** Đăng nhập
bằng tài khoản chủ app và mở:

```
https://<app>/api/xprobe
```

Nó chỉ trả **hình dạng** và **con số mức dùng**; không có token trong câu trả
lời. Bốn dòng đáng đọc, theo thứ tự:

- `cashtag.ok` — toán tử `$AAPL` có dùng được không. `false` kèm 403 **không
  phải lỗi của probe, nó chính là câu trả lời**, và quyết định làm tiếp kiểu
  nào. Đây là dòng quan trọng nhất.
- `sinceId.honoured` — `since_id` có được tôn trọng không. Đây là **cơ chế**
  giữ chi phí xuống: hỏi lại mà không có bài mới thì phải ra 0 bài. **Với
  cách tính theo lượng dùng thì dòng này còn quan trọng hơn trước**: hạn mức
  tháng cạn thì tính năng chỉ ngừng chạy, còn trả-theo-lượng-dùng thì mỗi
  lượt đọc lại cùng đống bài cũ là tiền thật chảy ra liên tục, không có trần
  nào tự chặn lại.
- `queryLimit` — trần độ dài câu truy vấn, tức bao nhiêu mã nhét vừa một
  lượt hỏi.
- `usage` — probe hỏi `/2/usage/tweets`, endpoint của **mô hình cũ tính theo
  tháng**. Với gói trả-theo-lượng-dùng nó **có thể trả 404 hoặc 403, và đó
  không phải lỗi** — probe in nguyên trạng thái thật để ta biết cần đọc số dư
  tín dụng ở đâu khác. Số dư thật thì xem trên chính cổng developer.

Gửi nguyên khối JSON đó cho Claude; tính năng viết theo cái đo được, không
theo tài liệu.

**Bước 3 — không cần làm gì thêm.** Tầng cảnh báo X tự bật ngay khi thấy
`X_BEARER_TOKEN`, chạy chung nhịp với hồ sơ 8-K (mỗi 15 phút, bất kể giờ giao
dịch) — khác tầng báo chí (Yahoo) vốn phải giãn nhịp vì tốn một request MỖI
MÃ, X gộp cả watchlist vào vài lô trong một request nên không cần giãn. Đặt
thêm `X_SINCE_PATH` là tuỳ chọn: bỏ trống thì rơi vào `.cache/x-since.json`,
mất được và dựng lại được — không cần `/var/data`.

**Tab Tin tức (tuỳ chọn):** muốn cột tin có bài từ X thì đặt thêm
`X_NEWS_ACCOUNTS` (cột Thị trường) và/hoặc `X_NEWS_POLITICS_ACCOUNTS` (cột
Chính trị-kinh tế) — danh sách handle cách nhau bằng dấu phẩy, ví dụ
`Reuters,CNBC,DeItaone`. Đây là danh sách CỦA BẠN: app không tự chọn ai đáng
tin. Bỏ trống thì nguồn X trong tab tự tắt, hai cột vẫn chạy bằng RSS và
Google News. Vì X trả theo lượng đọc, tab giữ cache riêng 15 phút cho X mà nút
"Làm mới" không vượt qua được — bấm làm mới liên tục không tốn thêm tiền X.
Nguồn Unusual Whales của tab dùng lại `UW_API_KEY` sẵn có, nhưng hình dạng
endpoint `news/headlines` CHƯA đo: mở `/api/uwprobe` một lần, đọc bước
`news-headlines`, và gửi cho Claude nếu dòng Unusual Whales trong phần Nguồn
của tab báo "không bóc được dòng nào - khoá: …".

### Những gì cổng này gác, và không gác

- **Gác:** mọi trang và mọi `/api/*`, kể cả `/api/auth/callback` của Schwab. Để ngỏ
  callback thì người lạ có thể đăng nhập tài khoản Schwab **của họ** vào server này và
  ghi đè token của bạn.
- **Không gác:** `/api/md/*` — cửa riêng của app điện thoại, vẫn dùng `MD_API_TOKEN`
  trong header như cũ. App đó không có cookie nào để gửi.
- **Mở sẵn:** trang `/login`, chỗ nhận mật khẩu `/api/session`, và `/api/auth/status`.
  Cái cuối vì Render dùng nó làm health check — nó chỉ nói phiên Schwab còn hay hết và
  trang đã khoá hay chưa, không một con số tài khoản nào.
- File tĩnh (ảnh, icon) cũng mở, nếu không thì chính trang đăng nhập không tải nổi logo.

### Vài điều đáng biết

- Cookie phiên được **ký bằng HMAC**, không phải một cờ bật/tắt, nên không tự chế ra
  được. Khoá ký mặc định chính là mật khẩu, nên **đổi mật khẩu là mọi phiên cũ chết
  ngay** — kể cả phiên trên cái điện thoại vừa mất.
- Sai mật khẩu 8 lần trong 15 phút thì IP đó bị khoá tạm. Bộ đếm nằm trong RAM, server
  khởi động lại là hết — nhưng người dò cũng phải bắt đầu lại từ đầu.
- Muốn tách khoá ký khỏi mật khẩu thì đặt thêm `SESSION_SECRET`; khi đó đổi mật khẩu
  không làm rơi phiên đang có.

---

## ElevenLabs (tuỳ chọn) — giọng đọc AI cho bản tóm tắt tin

Giọng của trình duyệt là giọng máy; muốn giọng tự nhiên thì cần một dịch vụ
neural có key. Chủ app chọn ElevenLabs.

1. Đăng ký ở elevenlabs.io, vào **Profile → API Keys**, tạo key. Gói miễn
   phí 10.000 ký tự/tháng (một bản tóm tắt ~2.000–2.500 ký tự); gói Starter
   $5/tháng 30.000 ký tự. Con số này là NHỚ, không phải đo — xem trang giá
   của họ trước khi trả tiền.
2. Render → Environment: `ELEVENLABS_API_KEY`. Không cần gì khác để chạy.
3. Mở `/api/ttsprobe` (chỉ chủ app) một lần: nó in ký tự đã dùng/hạn mức
   tháng và danh sách giọng của tài khoản kèm nhãn ngôn ngữ. Chọn một giọng
   hợp tiếng Việt rồi đặt `ELEVENLABS_VOICE_ID`, hoặc chọn thẳng trong ô
   giọng trên tab Tin tức (app nhớ lựa chọn).
4. Tuỳ chọn `ELEVENLABS_MODEL=eleven_flash_v2_5` nếu muốn rẻ một nửa.

App giữ chi phí xuống bằng ba cách: cache audio trên đĩa theo nội dung +
giọng (bấm lại hoặc người thứ hai bấm là 0 ký tự; `.cache/` mất khi deploy),
trần 4.000 ký tự mỗi lượt (dài hơn thì từ chối chứ không cắt lặng lẽ), và
chỉ tổng hợp khi bấm Nghe. Hết ký tự thì màn hình nói thẳng và nút "Giọng
trình duyệt" vẫn còn.

`api.elevenlabs.io` không gọi được từ môi trường phát triển, nên tên trường
trong code là nhớ từ tài liệu: nếu probe báo `subscription.used: null` hay
dòng giọng trống dù tài khoản có giọng, gửi JSON của probe cho Claude sửa
theo hình dạng thật.

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

Xuất bản web tĩnh — **bắt buộc có `--clear`**:

```bash
npx expo export --platform web --clear
```

⚠️ Thiếu `--clear` là Metro dùng lại bản dịch cũ của `src/config/env.ts` trong cache, và
bundle sẽ mang **giá trị `.env` cũ** dù `.env` đã sửa. Không có cảnh báo nào cả — dấu hiệu
duy nhất là file bundle sinh ra trùng y hệt mã băm với lần build trước. Đã mắc lỗi này ngày
2026-08-21: bundle vẫn trỏ về `192.168.1.52` sau khi `.env` đã đổi sang URL Render.

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
