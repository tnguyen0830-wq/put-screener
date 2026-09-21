# Put Screener — S&P 500

Quét toàn bộ rổ S&P 500 và trả về những hợp đồng **cash-secured put** đáp ứng
tiêu chí của bạn, lấy dữ liệu trực tiếp từ tài khoản Charles Schwab.

App có chín tab, đi theo đúng vòng đời của một lệnh bán put:

| Tab | Trả lời câu hỏi |
|---|---|
| **Sell Put Screener** | Bán con gì, strike nào, kỳ nào |
| **Analyze** | Con này thực sự đang thế nào |
| **Heatmap** | Cả thị trường đang thế nào (kèm GEX của SPX/mã bất kỳ) |
| **My Portfolio** | Cái đang cầm có gì cần để ý |
| **Insider Trade** | Ai đang mua — nội bộ công ty, Quốc hội, quyền chọn bất thường, dark pool |
| **Đầu tư dài hạn** | Mã nào đang rớt về hỗ trợ mà công ty vẫn có lãi, vẫn tăng trưởng và chưa đắt |
| **Tin tức** | Hôm nay thị trường và chính trị-kinh tế có gì — tiêu đề 48 giờ, hai cột, một nút tóm tắt tiếng Việt |
| **Learn** | Đọc nến, mẫu hình, GEX, bề rộng thị trường, flow/dark pool/insider và cách app chấm bán put — bài song ngữ có hình vẽ, câu ôn tập, nút hỏi Claude |
| **Patterns** | Mã nào đang có mẫu hình nến / mẫu hình giá trên nến ngày — quét watchlist hoặc cả rổ, biểu đồ nến vẽ mẫu lên, nút hỏi Claude đọc mẫu |

> **Đang làm đến đâu / tài khoản Claude kia đang giữ PR nào:** đừng tin trí nhớ
> của một phiên chat cũ — luôn kiểm tra bằng `git log --oneline origin/main -15`
> và danh sách PR đang mở trên GitHub. `CLAUDE.md` (mục "Two Claude accounts
> share this repo") có hai nhật ký ngắn: **"In progress right now"** (việc
> đang làm dở, cập nhật ngay khi bắt đầu/giữa chừng/xong việc — không đợi có
> PR mới ghi) và **"Recent work"** (PR nào vừa merge xong). Cả hai chỉ là ảnh
> chụp nhanh do phiên nào đó nhớ ghi lại — không phải sự thật sống, git mới
> là sự thật sống.

---

## 1. Đăng ký app trên Schwab

1. Tạo tài khoản tại `developer.schwab.com` (khác với login schwab.com).
2. Dashboard → Apps → tạo app mới, chọn **Accounts and Trading Production** +
   **Market Data Production**.
3. Callback URL đăng ký **chính xác**: `https://127.0.0.1:3000/api/auth/callback`
4. Chờ app chuyển sang trạng thái **Ready for Use** (Schwab duyệt tay, thường
   vài ngày). Trước đó mọi request đều trả 401.
5. Ghi lại **App Key** và **App Secret**.

## 2. Cài đặt

```bash
npm install
cp .env.example .env      # điền App Key / Secret
npm run dev               # chạy HTTPS trên https://127.0.0.1:3000
```

Schwab bắt buộc callback phải là HTTPS, nên script `dev` dùng
`next dev --experimental-https`. Trình duyệt sẽ cảnh báo chứng chỉ tự ký —
bấm "Advanced → Proceed" là được.

## 3. Kết nối

Mở app → bấm **Kết nối Schwab** ở góc phải → đăng nhập bằng tài khoản
**schwab.com** (không phải tài khoản developer) → chọn tài khoản môi giới →
được redirect về app.

> **Refresh token của Schwab hết hạn cứng sau 7 ngày và không thể gia hạn tự
> động.** Thanh trạng thái hiển thị số ngày còn lại. Mỗi tuần phải bấm
> "Kết nối lại" một lần. Đây là giới hạn phía Schwab, không phải lỗi app.

---

## Cách screener chấm điểm

Quét theo hai tầng để tiết kiệm request (Schwab giới hạn 120 request/phút):

1. **Tầng rẻ** — một loạt request `/quotes` theo lô 100 mã. Loại ngay những mã
   có `giá × 100 > vốn tối đa`, vì không thể có strike nào vừa túi tiền.
2. **Tầng đắt** — với mã còn lại, gọi `/pricehistory` (tính SMA200 và HV20,
   cache theo ngày) và `/chains` giới hạn theo cửa sổ DTE.

Với mỗi mã, screener chọn hợp đồng có điểm cao nhất. Điểm là tổng có trọng số:

| Thành phần | Trọng số | Ý nghĩa |
|---|---|---|
| Lợi suất quy năm | 45 | premium ÷ vốn thế chấp, quy về năm |
| Đệm giá | 25 | khoảng cách từ giá hiện tại xuống strike |
| IV/HV | 15 | quyền chọn có đắt hơn biến động thực tế không |
| Thanh khoản | 15 | open interest và độ rộng spread |

Cột **Biên độ 52T** là thanh trực quan: vạch xám là biên độ 52 tuần, đoạn xanh
là vùng đệm từ strike lên giá hiện tại, vạch đứng là break-even. Nếu break-even
nằm dưới đáy 52 tuần, vạch chuyển đỏ.

## Hard gates — bảy điều kiện điểm số không cứu được

Ngoài các tiêu chí bạn tự chỉnh, screener còn bảy kiểm tra **đạt/không đạt** loại
thẳng hợp đồng ra khỏi kết quả. Bật/tắt cả cụm bằng ô **"Bật hard gates"** trong
panel lọc (mặc định bật), nhưng **ngưỡng thì không sửa được** — và điểm cao đến
mấy cũng không cứu nổi một lần trượt.

| Cổng | Ngưỡng |
|---|---|
| VRP | IV/HV20 ≥ 1.0 |
| Earnings | không có earnings trong kỳ hợp đồng |
| Thanh khoản | OI ≥ 500 **và** khối lượng ≥ 100 |
| Spread | ≤ 5% |
| Dao rơi | chưa rơi quá 20% trong 20 phiên |
| Term structure | IV60/IV30 ≥ 0.95 — chưa backwardation |
| Put skew | z-score ≤ 2 |

Đây là lời giải thích cho tình huống dễ hoang mang nhất: **một mã điểm đẹp nhưng
không thấy đâu trong bảng.** Gần như luôn là do trượt một cổng nào đó.

Hai điểm về cách cổng hành xử:

- **Thiếu dữ liệu thì cho qua, không đánh trượt.** Chưa đủ lịch sử để tính HV20,
  skew z-score chưa warm-up xong, chuỗi giá quá ngắn — tất cả đều tính là đạt.
  Không có dữ liệu không phải là bằng chứng có vấn đề.
- **Tắt cổng không làm mất phần đánh giá.** Kết quả cổng vẫn được tính cho mọi
  ứng viên, nên tắt đi thì checklist trong panel chi tiết biến thành phần chú
  giải ✓/✗ thật, chứ không phải biến mất.

---

## Ba giới hạn cần biết

**IV Rank và put skew đều cần thời gian khởi động.** Schwab trả về IV hiện tại
nhưng không có lịch sử IV, nên không thể tính IV Rank thật trong lần chạy đầu.
App ghi một điểm IV mỗi mã mỗi ngày vào `.cache/iv-history.json`, và một điểm
skew vào `.cache/skew-history.json`; cả hai chỉ trả về số khi đã tích được **60
phiên**, trước đó là `null`. Sau khoảng 3 tháng chạy đều thì hai cột này mới có
nghĩa. Trong lúc chờ, tỷ lệ **IV/HV20** đóng vai trò tương đương: trên 1.2 nghĩa
là quyền chọn đang được định giá đắt hơn biến động thực tế 20 phiên gần nhất.

Term structure thì không cần khởi động — nó là tỷ lệ trong cùng một ngày, có số
ngay từ lần quét đầu tiên.

**Ngày earnings không có trong Market Data API.** Chạy `node scripts/earnings-sync.js`
để dựng `data/earnings.json`. Script lấy theo ba nguồn ưu tiên giảm dần — Yahoo
Finance, lịch Nasdaq, rồi `lastEarningsDate` của Schwab cộng chu kỳ 91 ngày — và
**khi các nguồn lệch nhau thì lấy ngày sớm nhất**, vì đoán muộn hơn ngày thật là
hướng sai nguy hiểm. Cần mạng, phải chạy tay, không tự động.

> Script chỉ lấy earnings cho **các mã có trong `data/watchlist.json`**. Một vị
> thế đang giữ mà symbol chưa từng được thêm vào watchlist thì không có dữ liệu
> earnings và **không thể cảnh báo được** — đây chính là cách CRWD từng lọt lưới
> dù earnings chỉ còn hai ngày. App giờ nói thẳng chỗ thiếu ra và liệt kê đúng
> những mã bị hụt dữ liệu, thay vì để trống: một ô trống rất dễ đọc nhầm thành
> "không có gì sắp tới".

**Delta là delta của Schwab.** Chuỗi quyền chọn trả greeks tính theo mô hình
của Schwab, có thể lệch nhẹ so với thinkorswim hay broker khác. Dùng nó để
xếp hạng tương đối, đừng coi là con số tuyệt đối.

---

## Tài khoản cho người nhà

Mặc định app chỉ có một tài khoản, và ai có mật khẩu là thấy mọi thứ — kể cả
tab My Portfolio, tức vị thế thật trong tài khoản Schwab của bạn.

Đăng nhập gõ **tên + mật khẩu**. Tên của bạn là `owner` (đổi được bằng
`APP_OWNER_USER`), mật khẩu là `APP_PASSWORD`.

### Tạo tài khoản ngay trong app

Menu ⚙️ → **Quản lý tài khoản** (chỉ chủ app thấy mục này). Ở đó thêm người,
đổi mật khẩu cho họ, hoặc xoá — không phải sửa biến môi trường, không phải
deploy lại. Tài khoản lưu trên ổ đĩa của app, **mật khẩu đã băm scrypt với
salt riêng từng người**, nên mở file ra cũng không đọc được mật khẩu của ai.

Người nhà dùng được Sell Put Screener, Analyze, Heatmap, Insider Trade, Đầu tư
dài hạn, và có
**watchlist riêng**. Họ **không** thấy My Portfolio, P/L đã chốt, cảnh báo,
và không bấm được nút kết nối Schwab — gọi thẳng vào địa chỉ đó cũng bị từ
chối, không chỉ ẩn nút đi.

Xoá một người là họ mất quyền **ngay lập tức** với mọi thứ riêng tư (danh mục,
P/L, cảnh báo) và mất luôn quyền đăng nhập lại. Phần công cụ thị trường thuần
tuý thì cookie cũ của họ còn đọc được tới khi hết hạn — phiên của người nhà
cố tình chỉ **7 ngày** (của chủ app là 30) để khoảng đó không kéo dài.

### Quên mật khẩu

Người nhà quên thì **không cần anh đặt hộ mật khẩu rồi nhắn cho họ** — nhắn
mật khẩu qua tin nhắn là mật khẩu nằm lại trong lịch sử chat mãi mãi.

1. Anh vào ⚙️ → **Quản lý tài khoản**, bấm **Tạo mã đặt lại** ở dòng của họ.
2. Một mã kiểu `ABCD-EFGH` hiện lên **đúng một lần**. Đọc cho họ nghe.
3. Họ vào trang đăng nhập, bấm **Quên mật khẩu?**, nhập tên + mã + mật khẩu
   mới **do chính họ chọn**. Anh không bao giờ biết mật khẩu của họ.

Mã sống **30 phút**, dùng **một lần**, và trên đĩa chỉ lưu bản băm — mở file
ra cũng không đọc lại được mã. Bảng tài khoản hiện dấu "đang có mã" kèm giờ
hết hạn, và có nút huỷ nếu anh đổi ý.

**Mã đặt lại cố tình KHÔNG áp dụng cho tài khoản của anh.** Cửa nhập mã mở
cho cả Internet (người quên mật khẩu thì chưa đăng nhập được), nên nếu một
mã đặt lại được mật khẩu chủ app thì một mã lọt ra ngoài không chỉ mất một
tài khoản phụ — nó trao cả tab My Portfolio, tức vị thế Schwab thật. Anh
quên mật khẩu thì đổi `APP_PASSWORD` trên Render, xem `DEPLOY.md`.

### Hoạt động — ai đang mở app, và đã dùng những gì

Cùng chỗ: ⚙️ → **Quản lý tài khoản**, phần **Hoạt động** nằm ngay trên danh
sách tài khoản. Chỉ chủ app đọc được (người nhà gõ thẳng địa chỉ sẽ bị đưa về
trang chủ).

- **Đang mở app** — ai đang ngồi đó ngay lúc này và đang mở tab nào. Trình
  duyệt báo nhịp hai phút một lần, và **chỉ khi tab đang hiện**: một cửa sổ bỏ
  quên trong nền tính là đã rời đi. Không thấy nhịp trong 5 phút là biến mất
  khỏi danh sách.
- **Đã dùng gần đây** — nhật ký, mới nhất trước, giữ 14 ngày.

Chỉ ghi những việc **tốn hạn mức hoặc tốn tiền** (quét Sell Put, quét
Long-term, Analyze một mã, hỏi Claude, "Tại sao rớt?", tóm tắt tin, dịch tiêu
đề, giọng đọc AI, sửa watchlist) cộng với đăng nhập, đăng xuất và đổi tab. Xem
bảng, cuộn trang hay bấm tab con thì không — chúng không tốn gì và sẽ nhấn chìm
phần đáng đọc. Những việc giống hệt nhau xảy ra sát nhau được gộp thành một
dòng kèm số lần.

Nhật ký ghi **ở máy chủ, ngay trong đoạn mã làm việc đó** — không phải do trình
duyệt tự khai — nên người nhà không tắt được, và cũng không báo thay người khác
được. Thứ duy nhất trình duyệt được phép nói là "tôi đang mở tab nào", và tên
tab phải nằm trong danh sách cho phép.

**Telegram:** mỗi lần người nhà đăng nhập, bạn nhận một dòng kèm giờ New York
và địa chỉ IP — nhiều nhất một tin mỗi người mỗi 30 phút, để một cái điện thoại
xoay vòng đăng nhập không biến kênh cảnh báo danh mục thành chỗ ồn. Chưa đặt
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` thì phần này tự tắt, nhật ký trong app
vẫn chạy. Đăng nhập của **chính bạn** cố ý không nhắn: báo cho bạn biết bạn vừa
đăng nhập là tiếng ồn.

Nhật ký nằm cạnh `SCAN_PATH` trên đĩa (`/var/data/activity.log`, cộng
`activity-presence.json`), **không có biến môi trường mới** và không có bước
deploy nào. File tự dọn khi vượt 512 KB. Nó bắt đầu từ lần deploy đưa
tính năng này lên — việc làm trước đó không có ở đây.

### Ba điều cần biết

Mọi người **dùng chung phiên Schwab và chung hạn mức** của bạn (người nhà quét
cả rổ là tiêu vào 100 request/phút của bạn, bấm "Nhờ Claude phân tích" là tiêu
tiền API của bạn); **mỗi lần chỉ một người quét được**, người thứ hai được báo
chờ thay vì nhận nhầm kết quả của người kia; và muốn tách hẳn thì phải deploy
một bản riêng chứ không phải thêm tài khoản.

Nếu bạn từng dùng biến `APP_USERS` (cách cũ): lần chạy đầu tiên sau khi cập
nhật, app đọc nó **đúng một lần** để chuyển các tài khoản đó sang kho đã băm,
rồi thôi. Từ đó sửa `APP_USERS` không còn tác dụng — quản lý trong app.

## Watchlist

Nút gạt ở đầu panel lọc chuyển giữa hai phạm vi quét:

- **Cả S&P 500** — 503 mã, 4–8 phút, dùng để đi tìm ý tưởng mới.
- **Watchlist** — chỉ những mã bạn tự chọn, vài chục giây, chạy lại thoải mái
  trong phiên.

Watchlist là tính năng quan trọng hơn vẻ ngoài của nó. Bán put nghĩa là cam kết
mua 100 cổ phiếu; quét cả rổ rồi chọn theo điểm số dễ dẫn tới việc bán put trên
một công ty chỉ vì premium đẹp. Lọc trong danh sách bạn đã tự duyệt sẽ loại bỏ
hẳn cái bẫy đó.

Thêm mã bằng cách gõ vào ô — dán nhiều mã một lúc cũng được (`AAPL MSFT NVDA`).
Trong panel chi tiết có nút **Lưu watchlist**, tiện khi quét toàn rổ và bắt gặp
một cái tên đáng theo dõi. Danh sách lưu ở `data/watchlist.json`, tự ghi mỗi lần
thay đổi.

Watchlist không giới hạn trong rổ S&P 500 — mã nào Schwab có quyền chọn đều quét
được, chỉ là không hiển thị tên công ty và ngành.

## GEX tự tính — không cần membership

Bấm vào bất kỳ dòng kết quả nào để mở panel chi tiết bên phải.

Gamma exposure **không phải dữ liệu độc quyền của ai**. Nó là phép tính trên
gamma và open interest — hai thứ chuỗi quyền chọn Schwab đã trả về sẵn. App tự
tính tại chỗ (`src/lib/gex.ts`), không cần đăng ký dịch vụ GEX nào.

Công thức: với mỗi strike, cộng dồn `gamma × open interest × spot² × 0.01 × 100`
qua toàn bộ kỳ đáo hạn trong 60 ngày. Call cộng dương, put cộng âm — theo giả
định dealer long call / short put mà mọi biểu đồ GEX công khai đều dùng.

- **Put wall** — strike có **gamma ròng** (call + put) **âm nhất**, tức put trội
  hơn call nhiều nhất. Dealer phải mua vào để hedge ở đây, nên thường hành xử
  như hỗ trợ. Bán put ở hoặc dưới put wall thì cấu trúc quyền chọn đứng về phía
  bạn.
- **Call wall** — đối xứng: strike có gamma ròng **dương nhất**, thường là
  kháng cự.

  Hai mức này tính trên gamma **ròng**, không phải trên một chiều (kiểu "strike
  có gamma call lớn nhất"). Lý do rất cụ thể: strike sát giá thường lớn nhất ở
  *cả hai* chiều, nên cách một chiều đẩy put wall, call wall và gamma tuyệt đối
  dồn vào **cùng một strike ngay tại giá** — ba vạch chồng lên nhau, không chỉ
  ra được hỗ trợ dưới hay kháng cự trên. Gamma ròng tách được hai bên vì một
  strike chỉ có thể ròng dương *hoặc* ròng âm. Cách này cũng khớp với Tạp Chí
  Phố Wall khi đối chiếu trên cùng một mã (xem cuối mục).

  Chuỗi không có strike nào ròng dương thì **không có call wall** và ô đó hiện
  `—`, chứ không chọn đại strike ít âm nhất — một vạch kháng cự không tồn tại
  trông y hệt một vạch thật.
- **Zero gamma** — nơi GEX luỹ kế đổi dấu. Trên mức này dealer làm dịu biến
  động; dưới mức này họ khuếch đại.

### Cách đọc biểu đồ

Bố cục dựng theo đúng biểu đồ GEX của Tạp Chí Phố Wall (trang tham chiếu ở cuối
mục này), nhưng số liệu là app tự tính từ chuỗi Schwab của chính tài khoản bạn:

- **Cột đỏ lên trên = call, cột xanh dương xuống dưới = put.** Đây là màu PHÂN
  LOẠI (call vs put), không phải luật xanh-lá/đỏ theo dấu con số dùng ở chỗ
  khác trong app. Hai nửa chung một thang, nên cột call và cột put so được
  trực tiếp với nhau.
- **Trục dọc có nhãn theo triệu đô mỗi 1% biến động** — biết cột lớn hơn *bao
  nhiêu*, không chỉ biết cột nào lớn hơn.
- **Trục ngang là các strike có thật, xếp đều nhau**, không phải thang giá
  tuyến tính: strike thưa dần khi ra xa giá, để thang tuyến tính sẽ toàn
  khoảng trống. Các vạch mức (wall, giá hiện tại, strike của bạn) được nội suy
  vào đúng vị trí giữa hai strike kề nó.
- **Vạch đứt**: put wall (xanh dương), call wall (đỏ), gamma tuyệt đối (cam) —
  strike ôm nhiều gamma nhất tính cả hai chiều, có thể không trùng wall nào.
  Kèm vạch giá hiện tại và vạch strike của bạn (nếu đang xem một hợp đồng cụ
  thể). Mức nào rơi ngoài khoảng đang hiện thì **không vẽ**, chứ không ép vào
  mép — một vạch sai chỗ trông y hệt một vạch thật.
- Rê chuột (hoặc chạm) vào một cột để xem số call/put của đúng strike đó.

Dưới biểu đồ vẫn là một dòng kết luận thẳng: strike của bạn đang nằm trên hay
dưới put wall.

Route `/api/gex?symbol=X` chỉ chạy khi bạn mở panel, tốn đúng 1 request, nên
không làm chậm lần quét toàn rổ.

**Đối chiếu với Tạp Chí Phố Wall (TSLA, 2026-09-05):** put wall 355, gamma
tuyệt đối 355 và giá hiện tại khớp **tuyệt đối** giữa hai bên, từ hai nguồn dữ
liệu khác nhau (Schwab vs CBOE). Call wall ban đầu lệch 355 vs 400 — nguyên
nhân là định nghĩa, không phải dữ liệu, và đã sửa bằng cách chuyển sang gamma
ròng ở trên. Độ lớn thì vẫn khác nhau vì đơn vị: app quy về **mỗi 1% biến
động**, nơi khác có thể quy về mỗi $1 — chênh nhau đúng bằng `giá/100`.

### Khi Schwab từ chối trả cả chuỗi (SPX)

Cổng API của Schwab chặn phản hồi quá lớn (`502 Body buffer overflow`). SPX có
kỳ đáo hạn gần như **mỗi ngày giao dịch**, nên xin 60 ngày × mọi strike là hàng
chục nghìn hợp đồng — mã thường không bao giờ chạm ngưỡng đó.

App thu hẹp dần: 60 ngày → 21 ngày/120 strike → 7 ngày/60 strike. Nếu **cả ba**
vẫn bị từ chối, nó chuyển sang **xin từng kỳ đáo hạn một rồi ghép lại** — đơn vị
nhỏ nhất mà `/chains` còn nhận, nên kích thước mỗi phản hồi bị chặn cứng bất kể
chuỗi to đến đâu. Cách này giữ được **biểu đồ cột và phân tích AI**, thứ mà
phương án UW không bao giờ có.

Đổi lại: chỉ lấy **12 kỳ gần nhất** (SPX 60 ngày là hơn 40 kỳ — lấy hết sẽ bắt
bạn chờ hàng chục giây), và màn hình nói rõ đã ghép bao nhiêu kỳ. Tường tính
trên 12 kỳ đó, không phải cả chuỗi — không nói ra thì hai con số trông y hệt
nhau.

**Riêng SPX: Schwab gửi chuỗi rỗng ruột, nên app lấy chuỗi từ CBOE.** Đo trên
production ngày 2026-09-06, cả ba cách viết ký hiệu (`$SPX`, `$SPX.X`, `SPX`)
đều trả về hàng nghìn hợp đồng với **`gamma = 0` và `openInterest = 0` ở mọi
hợp đồng** — Schwab gửi danh sách hợp đồng nhưng không kèm dữ liệu thị trường.
Đây là **lỗi API phía Schwab** cho quyền chọn chỉ số, không phải thiếu quyền
dữ liệu: thinkorswim cùng tài khoản hiển thị open interest thật trên đúng các
hợp đồng đó (đã báo `traderapi@schwab.com`). GEX là `gamma × OI`, hai số 0 thì
không ra được gì, nên chừng nào Schwab chưa sửa thì chuỗi SPX phải đến từ nơi
khác.

Nơi khác đó là **CBOE** — sàn niêm yết SPX — qua feed công khai trễ 15 phút
(`cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json`), không cần key,
không có quota. Đây cũng chính là nguồn mà Tạp Chí Phố Wall đọc, nên khi đối
chiếu SPX với họ là so cùng một chuỗi. App chuyển file đó sang đúng hình dạng
chuỗi Schwab rồi tính bằng đúng công thức, nên SPX có lại **biểu đồ cột và
phân tích AI** như mọi mã khác. Màn hình ghi rõ nguồn và dấu giờ của CBOE; trễ
15 phút gần như không ảnh hưởng đến tường vì open interest chỉ đổi mỗi ngày
một lần, nhưng giá bid/ask trong phần phân tích AI thì có thể đã dịch — kiểm
tra lại trên Schwab trước khi đặt lệnh.

Phía Unusual Whales cũng đã đo (2026-09-06): không endpoint nào của gói hiện tại
có gamma **theo từng strike**. `greek-exposure` là chuỗi 251 ngày theo `date`,
`spot-exposures` là 564 mốc thời gian mỗi mốc đúng một mức giá (tức chuỗi thời
gian, không phải đường cong theo giá), còn `gex-levels` chỉ có 4 mức tổng hợp.
Nên UW chỉ là bậc dự phòng **sau** CBOE: 4 con số, không có biểu đồ.

### Hai nguồn cùng lúc: app tự tính (Schwab) và Unusual Whales

Mỗi lần mở màn hình có GEX, app gọi **cả hai** nguồn song song:

- **App (Schwab)** — nguồn chính, tự tính từ chuỗi quyền chọn. Đây là thứ vẽ ra
  biểu đồ cột và nuôi phần phân tích AI.
- **Unusual Whales** — các mức của họ (`gex-levels`), hiện ở bảng đối chiếu
  ngay dưới biểu đồ, ánh xạ bốn mức: put wall, call wall, zero gamma ↔ gamma
  flip, gamma tuyệt đối ↔ gamma magnet, kèm mức lệch tuyệt đối và phần trăm.

Bảng này **không tô xanh/đỏ và không phán đúng/sai** — hai bên tính theo hai mô
hình khác nhau trên hai nguồn dữ liệu khác nhau, nên lệch là bình thường và ở
đây không có bên nào là chuẩn. Nó nằm thường trực trên màn hình vì đúng một lần
đối chiếu tay đã tìm ra lỗi định nghĩa call wall; để sẵn thì lần lệch sau tự lộ.

**Bốn mức xuống cấp, bốn cách hiển thị khác nhau** — cố tình không cho chúng
trông giống nhau:

1. Schwab chạy → biểu đồ đầy đủ + bảng đối chiếu. UW hỏng thì thay bảng bằng
   đúng lý do hỏng, không im lặng bỏ bảng đi.
2. Schwab hỏng hoặc trả chuỗi rỗng ruột (SPX), CBOE chạy → **vẫn biểu đồ đầy đủ
   và phân tích AI**, tính bằng cùng công thức trên chuỗi CBOE trễ 15 phút; cột
   trái bảng đối chiếu đổi thành "App (CBOE)" và có dòng nói vì sao Schwab
   không dùng được.
3. Cả Schwab lẫn CBOE hỏng, UW chạy → chỉ còn các mức của UW, **không có biểu
   đồ cột và không có phân tích AI** (cả hai cần chuỗi quyền chọn sống), màn
   hình nói rõ đang xem số của ai và vì sao cả hai nguồn kia hỏng.
4. Cả ba cùng hỏng → hiện **bản đọc gần nhất lưu trên đĩa**, kèm một băng đỏ
   ghi giờ đọc và "đừng giao dịch theo bảng này". Chưa có lịch sử thì báo lỗi
   thật của cả ba bên.

Riêng **hết phiên Schwab** thì luôn báo đúng là hết phiên, không hỏi CBOE, kể cả
khi UW vẫn trả số — lấy số nơi khác lúc đó sẽ che mất việc cả app đang mất kết nối.

Lịch sử ghi tối đa **15 phút một lần cho mỗi mã** và giữ **30 ngày**
(`GEX_HISTORY_PATH`, mặc định `./.cache/gex-history.json`, trên Render trỏ vào
đĩa bền). Chi phí quota UW nhỏ: `/api/gex` chỉ chạy khi bạn mở màn hình có GEX,
panel Heatmap tự làm mới 10 phút/lần — xấu nhất khoảng 144 request/ngày trên
hạn mức 30.000.

**Cảnh báo về mô hình:** GEX công khai suy ra từ open interest chứ không phải
sổ vị thế thật của dealer. Spread, covered call, sản phẩm cấu trúc đều làm lệch
con số. Mỗi nhà cung cấp lại dùng giả định khác nhau nên số sẽ không khớp nhau.
Dùng nó như bản đồ cấu trúc để chọn vùng strike, không phải tín hiệu vào lệnh.

## TradingView

TradingView không mở API dữ liệu cho tài khoản cá nhân, nhưng widget nhúng thì
miễn phí và **không cần tài khoản** — chỉ cần giữ link attribution theo điều
khoản của họ:

- *Advanced Chart* — biểu đồ 6 tháng kèm SMA.
- *Technical Analysis* — đồng hồ đánh giá kỹ thuật đa khung, dùng để kiểm tra
  chéo chứ không phải tín hiệu.

Symbol dựng từ sàn niêm yết Schwab trả về (`NASDAQ:AAPL`, `NYSE:XOM`…). Logic
ánh xạ ở `src/lib/links.ts`, gặp mã lạ thì sửa đúng một chỗ đó.

Trước đây panel còn có hai link sang trang GEX của một trang ngoài để đối
chiếu. Chủ app yêu cầu bỏ mọi thứ mang tên trang đó khỏi màn hình, nên cả hai
link lẫn hàm dựng URL đã xoá hẳn — hàng "Đối chiếu ngoài" giờ chỉ còn link mở
chart đầy đủ trên TradingView.

---

## Analyze — soi kỹ một mã

Gõ một mã (hoặc bấm từ Heatmap) để gom về một chỗ: chỉ báo kỹ thuật tự tính từ
lịch sử giá Schwab, hồ sơ công ty, tin tức, và biểu đồ TradingView nhúng. Route
`/api/analyze` nói rõ **nguồn nào trả lời được, nguồn nào không** thay vì lặng lẽ
để trống — một mục trống vì API lỗi trông y hệt một mục trống vì không có tin gì.

Nút **"Nhờ Claude phân tích"** đọc **toàn bộ** chỉ số trên trang trong một lượt:
kỹ thuật (SMA, RSI, MACD, ATR, Bollinger, HV), biến động ngụ ý, cơ bản, **và
cấu trúc gamma** lấy từ đúng biểu đồ GEX cuối trang (put wall, call wall, zero
gamma, net GEX, các strike gamma lớn nhất, nguồn chuỗi). Claude chỉ được dùng
đúng những con số đang hiện, không có tin tức hay dữ liệu ngoài, và phải nói
thẳng khi GEX thiếu, cũ, hay chỉ có mức của Unusual Whales — một mục vắng mặt
rất dễ đọc thành "không có gì đáng nói". Mỗi lần bấm tốn vài cent API.

**Hồ sơ công ty tự dịch sang tiếng Việt.** Lĩnh vực, ngành, quốc gia (Finviz)
và mô tả doanh nghiệp (FMP) chỉ có nguyên văn tiếng Anh — mọi nhãn khác trên
trang đều đã có bản tiếng Việt. Khi bật giao diện tiếng Việt, app tự gọi Claude
dịch bốn trường này, kết quả lưu cache theo mã nên chỉ tốn một lượt gọi **mỗi
mã, mãi mãi** chứ không phải mỗi lần mở trang. Dịch xong thì có dòng chú thích
nhỏ nhắc đây là bản dịch tự động, có thể chưa chính xác 100%.

Dịch hỏng thì hiện lại nguyên văn tiếng Anh — không chặn phần còn lại của
trang — nhưng **có dòng nói rõ vì sao**: thiếu `ANTHROPIC_API_KEY`, khoá bị từ
chối, hay Anthropic đang giới hạn tần suất là ba lý do khác nhau, sửa khác
nhau. Trước đây cả ba trông giống hệt "chưa dịch xong" — không có gì để phân
biệt "chưa chạy" với "chạy rồi mà hỏng luôn" — nên nếu bạn từng thấy phần này
vẫn tiếng Anh dù đã bật tiếng Việt, hãy tìm dòng chữ cam bên dưới đoạn mô tả:
nó nói đúng lý do và cách sửa.

## Heatmap — nhìn cả thị trường

Bản đồ nhiệt toàn rổ theo nhiều khung thời gian, kèm biểu đồ **RRG** (xoay vòng
sức mạnh tương đối theo ngành) và đồng hồ Fear & Greed. Bấm vào một ô sẽ nhảy
thẳng sang tab Analyze của mã đó.

## My Portfolio — chỉ đọc, đồng bộ thẳng từ Schwab

Không nhập tay gì cả, cũng không đặt lệnh được. App đọc vị thế đang mở từ Schwab
và tự tính lại mọi con số thay vì tin vào trường P/L mà Schwab trả về.

Bốn loại vị thế được nhận: **put bán**, **call bán**, **put mua**, **cổ phiếu**.
Call mua bị bỏ qua có chủ ý — đó là đặt cược một chiều, không thuộc vòng đời bán
put. Ba bảng tách riêng vì phép tính thật sự khác nhau, không phải để cho đẹp:
call bán sợ giá **lên** xuyên strike còn put bán sợ giá **xuống**, nên "trong
tiền" và "đệm giá" đảo ngược; put mua là bảo hiểm, trong tiền là tin **tốt** nên
hiện màu xanh và không bị tính vào số cảnh báo ITM.

Panel còn có:

- **Giới hạn kích thước vị thế** — bốn trần so với giá trị tài khoản: 5% mỗi mã,
  20% mỗi ngành, 50% tổng tiền thế chấp, 30% cho cụm mã tương quan. Cụm là phần
  tính nặng nhất: 60 phiên giá để tính tương quan từng cặp. Tương quan giữ
  **nguyên dấu**, nên một vị thế phòng hộ làm giảm con số thay vì bị bỏ qua.
- **Theo dõi vol trên vị thế đang giữ** — đúng hai kiểm tra term structure và
  skew mà screener dùng làm cổng, nhưng chĩa vào cái đang cầm: thị trường có
  đang bắt đầu định giá rắc rối vào thứ bạn đã bán put không.
- **P/L đã chốt** — đọc từ file CSV `data/realized/*.csv` xuất từ Schwab, **không
  phải dữ liệu sống**. Ngày chốt sổ được in ra màn hình đúng vì lý do đó: để một
  ảnh chụp cũ không bao giờ lặng lẽ trông như số mới.

### Cảnh báo đẩy

Vòng lặp nền 15 phút — thứ duy nhất trong app tự chạy mà không cần trình duyệt —
đẩy thông báo qua **Telegram** và **web push**. Nó cảnh báo những thứ bạn buộc
phải xử lý: phiên Schwab còn 2/1/0 ngày, put đã vào trong tiền, earnings rơi
trước ngày đáo hạn, backwardation hoặc skew cao, giới hạn kích thước bị vượt.

**Lãi/lỗ trong ngày bị loại trừ có chủ ý** — thứ báo liên tục là thứ người ta học
được cách phớt lờ, kể cả vào đúng ngày nó nói đúng.

Chống spam quan trọng hơn bản thân luật báo: mỗi loại cảnh báo chỉ gửi tối đa một
lần mỗi phiên giao dịch New York, trạng thái lưu xuống đĩa nên deploy lại không
bắn lại từ đầu, và chỉ đánh dấu đã gửi khi kênh thật sự nhận — kênh chết thì lần
sau thử lại chứ không nuốt mất.

**Ngoài giờ giao dịch, cảnh báo danh mục tạm nghỉ nhưng cảnh báo sự kiện thì
không** — và đó là chủ đích, không phải sơ suất. Giá và greek ngoài giờ chỉ lặp
lại con số đóng cửa, nhưng **8-K phần lớn nộp SAU khi sàn đóng**, nên gắn chúng
vào cổng giờ giao dịch là bỏ lỡ đúng thứ cần bắt.

Không cấu hình biến môi trường thì cả hai kênh **tự tắt**, app chạy y như cũ chứ
không báo lỗi. Xem `DEPLOY.md` cho `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` và
cặp khoá `VAPID_*`.

> Điểm yếu của một vòng lặp nền là nó vô hình. Vì thế My Portfolio in giờ chạy
> gần nhất ra màn hình — một cái đồng hồ chết đọc thành một con số đứng yên, chứ
> không đọc thành "mọi thứ đều ổn".

#### Cảnh báo sự kiện: có chuyện gì đang xảy ra với mã của bạn

Mọi cảnh báo ở trên đều tính từ **giá, greek và ngày tháng**. Không cái nào đọc
được sự kiện doanh nghiệp — nên app từng không thể nói với bạn rằng CEO vừa nghỉ
hay công ty vừa tuyên bố báo cáo tài chính cũ không còn đáng tin.

Theo dõi **vị thế đang nắm + watchlist**, ba loại sự kiện — xếp theo **độ mạnh
của bằng chứng**:

| Sự kiện | Nguồn | Khi nào | Nhịp |
|---|---|---|---|
| **Hồ sơ 8-K trọng yếu** | SEC EDGAR | bất kể giờ nào | 15 phút |
| **Giá chạy quá 7%** (12% là khẩn) | Schwab | chỉ trong giờ giao dịch | 15 phút |
| **Tiêu đề báo chí** | Yahoo Finance | bất kể giờ nào | ~60 phút |
| **Bài đăng trên X** | X (Twitter) | bất kể giờ nào | mỗi 15 phút |

**8-K là nguồn gốc, không phải bài viết về nguồn gốc** — đó là chính công ty bị
luật bắt buộc phải khai một sự kiện trọng yếu. Miễn phí, không cần key. Bốn mục
được xếp **khẩn**: phá sản (1.03), **báo cáo tài chính cũ không còn đáng tin
(4.02)**, sự cố an ninh mạng (1.05), thông báo huỷ niêm yết (3.01).

Mục thủ tục **cố ý không báo** — 5.07 (kết quả bỏ phiếu), 9.01 (phụ lục), 7.01
và 8.01 (hai cái sọt rác rộng nhất của biểu mẫu). Mã mục app **chưa biết** cũng
không báo, nhưng **hiện ra thành một con số** trên màn hình cảnh báo chứ không
biến mất im lặng — "yên tĩnh" không bao giờ được trông giống "hỏng".

> **Một request cho cả thị trường.** SEC có feed 8-K mới nhất của *mọi* công ty,
> nên app lấy một lần rồi lọc ra mã của bạn — đúng khuôn tab Quốc hội, và rẻ hơn
> hẳn việc hỏi SEC từng mã một. Đo thật: 100 dòng phủ 17,5 giờ, nhịp kiểm 15
> phút nên thừa biên an toàn; nếu có ngày feed không phủ hết thì màn hình **nói
> ra** rằng có thể đã bỏ sót.

##### Tiêu đề báo chí — nhanh hơn 8-K, nhưng yếu hơn hẳn

Phóng viên không phải chờ hết hạn nộp hồ sơ, nên báo chí thường kể chuyện trước
SEC. Đổi lại đó là **bên thứ ba viết về công ty, chưa kiểm chứng** — có thể là
tin đồn, có thể là bài suy diễn. Nên nó là một **tầng riêng**: mỗi cảnh báo mang
nhãn `[Báo chí]` ngay đầu tiêu đề và thân nói thẳng đây không phải công ty tự
khai.

Mặc định của tin tức là **ồn**, nên có ba cổng lọc, và chúng là phần đáng đọc
nhất của tính năng này:

1. **Chỉ bài riêng về một mã.** Yahoo tự gắn danh sách mã cho mỗi bài, nên đây
   là số *đo được* chứ không phải phỏng đoán. Bài gắn nhiều mã gần như luôn là
   bản tin thị trường — đúng thứ tiếng ồn cần chặn.
2. **Danh sách từ khoá CHO PHÉP**, không phải loại trừ — cùng cách làm với mã
   mục 8-K. Khẩn là đúng bốn chuyện mà 8-K cũng xếp khẩn (phá sản, khai lại báo
   cáo tài chính, sự cố an ninh mạng, huỷ niêm yết) cộng thêm **ngừng giao
   dịch**. Cố ý **không** có: `plunge`/`soar` (tầng giá đã báo rồi — cho vào là
   rung điện thoại hai lần cho cùng một chuyện), `upgrade`/`downgrade` (nhà phân
   tích đổi khuyến nghị gần như mỗi ngày).
3. **Trần 5 cảnh báo mỗi lượt, mỗi mã nhiều nhất một.** Một ngày tin dữ thật sự
   thì 5 dòng là đúng; 40 dòng là một hộp thư bị tắt thông báo.

Bài bị các cổng này chặn đều **được đếm và hiện lên màn hình** — cùng lý do với
mã mục 8-K lạ: "yên tĩnh có chủ đích" không bao giờ được trông giống "hỏng". Và
màn hình phân biệt rõ **"lượt này chưa hỏi tin"** với **"đã hỏi và không có
gì"** — hai chuyện khác nhau, mà nếu gộp thì mấy con số 0 sẽ nói dối.

> **Vì sao chỉ Yahoo, trong khi nút "Tại sao rớt?" đọc ba nguồn.** Hồ sơ SEC thì
> tầng 8-K đã đọc rồi, bằng một feed chung rẻ hơn hẳn. Google News thì **không
> gắn mã cho bài**, nên cổng số 1 ở trên không áp được — một tiêu đề khớp từ
> khoá mà không ai xác nhận nó nói về công ty *này* là một thông báo có thể báo
> nhầm công ty.
>
> **Nhịp ~60 phút, không phải 15.** Yahoo tốn một request cho *mỗi* mã, và app
> này từng đốt sạch hạn mức của một nhà cung cấp khác đúng vì gọi từng mã ở nhịp
> 15 phút. Cửa sổ cảnh báo là 90 phút nên nhịp giãn này **không bỏ sót bài nào**.

##### X (Twitter) — tầng thứ TƯ, nhanh nhất

Chủ app đặt hàng tin từ X cho mã đang nắm, và **đây đúng là chỗ X đáng tiền**:
ưu thế duy nhất của X là nhanh hơn báo chí vài chục phút, thứ không đổi được
quyết định mua-và-giữ nhưng đổi được quyết định trên một vị thế đang mở.

**Đo xong ở production 2026-09-19, cả ba câu quyết định kiến trúc đều trả lời
CÓ**: toán tử `$AAPL` (cashtag) dùng được — hỏi thẳng theo mã, không cần bám
danh sách tài khoản; `since_id` được tôn trọng; trần câu truy vấn thật đúng là
512 ký tự, khớp con số đã đặt sẵn. Từ đó tầng X hoạt động thật.

**Một câu truy vấn cho NHIỀU mã, không phải một request mỗi mã.** X cho gộp
`$A OR $B OR $C` trong một request, nên cả watchlist chỉ tốn vài lô — khác hẳn
tầng báo chí, nơi Yahoo bắt hỏi từng mã. `since_id` là **một con số toàn cục**
(ID của X tăng dần theo thời gian trên toàn nền tảng), lưu ở đĩa để lượt hỏi
lại không trả tiền đọc lại bài cũ; mất file đó (redeploy) chỉ khiến lượt kế
tiếp bị coi là lượt đầu — an toàn, vì cửa sổ 90 phút vẫn chặn không cho tràn
bài cũ dù không có since_id.

**Cùng bảng từ khoá với tầng báo chí (`pressSeverity()`), không viết bảng
mới** — bảng đó đã được đo và sửa ba lỗi im lặng (chia động từ, rụng `e` câm,
từ đệm), viết một bảng riêng cho X là lặp lại đúng ba lỗi đó từ đầu.

**Yếu hơn cả tầng báo chí, và màn hình nói ra điều đó.** 8-K là công ty tự
khai bắt buộc; báo chí là người ngoài viết, có biên tập; một bài trên X là
người dùng bất kỳ gõ, không ai kiểm chứng trước khi đăng — nên mỗi cảnh báo
mang nhãn `[X]` và thân nói thẳng đây là bài đăng chưa kiểm chứng.

Token **phải** là app-only (chỉ đọc, không đăng được bài) — lộ token người
dùng là người lạ đăng bài dưới tên bạn. Cách lấy token nằm ở `DEPLOY.md`. Bỏ
trống `X_BEARER_TOKEN` thì tầng này tự tắt, y như UW/Telegram/web push.


---

## Đầu tư dài hạn — mua lúc rớt, nhưng chỉ mua công ty còn tốt

Tab này trả lời một câu khác hẳn phần còn lại của app: **mã nào đang rớt về một
vùng hỗ trợ mà công ty vẫn làm ăn có lãi và định giá chưa đắt.** Không liên quan
gì tới bán put — nó dành cho tiền mua và giữ.

**Vùng hỗ trợ được TỰ TÍNH, không lấy từ đâu cả.** Lấy 3 năm nến ngày, tìm các
*đáy xoay* (nến có đáy thấp hơn 5 nến mỗi bên), rồi gom những đáy nằm trong 2.5%
của nhau thành một vùng. Ba luật đáng biết vì chúng quyết định con số bạn nhìn:

- **Một đáy đơn độc không phải là hỗ trợ.** Vùng phải có ít nhất **2 lần chạm** —
  hỗ trợ là nơi giá đã quay đầu *nhiều lần*, không phải nơi nó xuống một lần.
- **5 nến cuối không bao giờ thành đáy xoay**, vì chưa có nến sau xác nhận. Đáy
  của tuần này chưa được tính — đó là giới hạn thật của phép đo, không phải sót.
- **"Đang tới hỗ trợ" và "đã thủng hỗ trợ" không bao giờ hiện giống nhau.** Trên
  biểu đồ cả hai đều là giá nằm cạnh một đường kẻ, nhưng việc phải làm thì ngược
  nhau, nên màn hình tách hẳn và gắn cờ ⚠ cho vùng đã thủng.

**Chín cổng cứng.** Xu hướng dài hạn còn hướng lên (độ dốc SMA200 dương) · đang ở
trong 8% phía trên một vùng hỗ trợ · đã rớt ≥10% từ đỉnh 52 tuần · còn cao hơn
đáy 52 tuần ≥5% · công ty đang có lãi (EPS và biên lợi nhuận đều dương) · P/E dự
phóng ≤ 30 · **doanh thu không co lại** (CAGR 3 năm ≥ 0) · **dòng tiền tự do
dương** năm gần nhất · **không pha loãng nặng** (số cổ phiếu tăng ≤ 5%/năm).

Ba cổng cuối đọc từ **10-K trên SEC EDGAR** (API XBRL `companyfacts`, miễn phí,
không cần key) — thứ Finviz không trả lời được, vì Finviz là ảnh chụp một thời
điểm còn ba câu này cần *chuỗi nhiều năm*. Ngăn chi tiết in bảng 5 năm gần nhất
(doanh thu, EPS pha loãng, FCF, số cổ phiếu), CAGR 3 và 5 năm, kèm **ngày nộp và
thẻ XBRL đã dùng** ngay cạnh số. Câu đáng giá nhất ở đây: *EPS tăng mà số cổ phiếu
cũng tăng mạnh thì phần "tăng" đó của ai?* — mua lại cho CAGR âm và đi qua, pha
loãng trên 5%/năm bị loại. ETF và công ty nước ngoài (IFRS) không có 10-K: ba
cổng này hiện `?` và màn hình nói rõ vì sao (không có CIK / có hồ sơ nhưng không
bóc được / lỗi mạng), ba lý do ba cách sửa.

Một bẫy đo được trên chính Apple: **10-K chỉ điều chỉnh chia tách cổ phiếu
ngược 3 năm**, nên số cổ phiếu và EPS của các năm xa hơn là số *chưa* điều
chỉnh (Apple 2017 = 5.25 tỷ cổ phiếu, 2018 = 20 tỷ — split 4:1, không phải phát
hành). CAGR của EPS và số cổ phiếu vắt qua chỗ gãy đó được **để trống và nói
lý do** thay vì in "pha loãng +300%"; doanh thu và FCF là tổng nên không bị.

Cổng xu hướng cố ý **không** đòi giá nằm trên SMA200 — mã rớt đủ sâu để đáng nhìn
thì thường đã thủng SMA200 rồi. Cái được giữ là *độ dốc* của SMA200, tức xu hướng
dài hạn, cộng với chốt chặn "còn cách đáy 52 tuần" để không bắt dao rơi.

**Bốn nút dòng tiền ngành (RRG): Tụt lại · Đang hồi · Dẫn đầu · Đuối dần.**
Muốn *"ngành đang uptrend mạnh"* thì bấm **Dẫn đầu** — ngành mạnh hơn thị trường
và còn đang mạnh lên. **Đang hồi** là ngành còn yếu hơn thị trường nhưng đã quay
đầu lên, thường là chỗ những mã vừa rớt về hỗ trợ nằm. Số dùng đúng bằng số biểu
đồ RRG bên tab Heatmap đang vẽ (11 quỹ ngành so với SPY) — một phép tính, hai
chỗ đọc, nên bảng và biểu đồ không bao giờ cãi nhau.

Một điều phải nhớ khi đọc cột này: **đây là góc phần tư của NGÀNH, không phải của
mã**. Toạ độ RRG là vị trí so với 10 ngành còn lại trong cùng tuần, nên không
tồn tại toạ độ RRG cho riêng một cổ phiếu — một mã yếu vẫn có thể nằm trong ngành
đang hồi, và ngược lại. Mã không tra được ngành (ngoài rổ S&P 500) vẫn đi qua và
được đánh dấu `?`.

**Ba nút vốn hoá: Mega ≥200 tỷ · Big 10–200 tỷ · Mid 2–10 tỷ.** Bấm được nhiều
nút cùng lúc; **không bấm nút nào là không lọc** (mã nhỏ hơn 2 tỷ vẫn vào) chứ
không phải loại sạch — màn hình nói thẳng câu đó, vì ba nút tối thui trông y hệt
một bộ lọc đang chặn hết. Vốn hoá tính từ dữ liệu Schwab (giá × số cổ phiếu lưu
hành) nên là số sống, và nó đi kèm sẵn trong lượt lấy giá gộp lô — tức lọc theo
vốn hoá **không tốn thêm request nào** và cắt trước cả nến, Finviz lẫn SEC. Mã
Schwab không trả số cổ phiếu thì vẫn đi qua và được đánh dấu `?`. Ba nút này có
ở **cả tab Sell Put Screener**, nằm dưới ô chọn ngành.

**Muốn chặt hơn thì có ô tích "Chỉ lấy mã còn trên SMA200".** Bật là bỏ hẳn mọi mã
đã thủng SMA200. Cái giá phải trả được nói ngay cạnh ô tích chứ không giấu: bảng sẽ
ngắn hơn nhiều, có lúc trống. Và khi nó thật sự làm trống bảng thì màn hình in **số
mã bị loại vì đúng lý do đó** — không có con số ấy thì "ô tích làm trống bảng" trông
y hệt "không mã nào đạt", mà hai thứ đó cần hai hành động ngược nhau.

Như mọi nơi khác trong app, **thiếu dữ liệu thì đi qua cổng nhưng hiện dấu `?`
chứ không phải ✓** — loại một mã chỉ vì một lần cào Finviz hụt thì sai, mà vẽ
dấu ✓ lên thứ chưa ai xét thì còn sai hơn.

**Định giá có hai vế.** Vế một là bội số Finviz (P/E, P/E dự phóng, PEG) — có
ngay. Vế hai là **P/E so với chính lịch sử của mã đó**, và vế này phải tự tích
luỹ: không nguồn nào cho sẵn chuỗi P/E quá khứ, nên app ghi một dòng mỗi lần
quét và cần ~30 lần đọc mới nói được gì. Tới lúc đó màn hình ghi thẳng *còn
thiếu bao nhiêu lần đọc* — đó là **chưa biết**, không phải "ở mức bình thường",
và nó không kéo điểm lên hay xuống.

**Giá mục tiêu của giới phân tích được hiện nhưng KHÔNG làm cổng lọc.** Nó gần
như luôn nằm trên giá hiện tại, nên lấy nó làm cổng là giao quyền lọc cho sự lạc
quan nghề nghiệp của người khác.

**Nút "Tại sao rớt?"** lấy tin gần nhất của mã, cộng thêm một ảnh chụp kỹ
thuật/biến động **CÙNG con số tab Analyze đang hiện cho mã đó** (RSI, MACD,
Bollinger, ATR, biến động thực tế và ẩn ý — thứ mà bản thân tab Đầu tư dài hạn
không tính, nó chỉ có SMA200 và vùng hỗ trợ), rồi để Claude đọc cùng TA và FA
đang hiện. Mọi con số vẫn do code tính, Claude chỉ diễn giải, và được dặn dùng
phần kỹ thuật làm **màu sắc bổ sung chứ không phải nguyên nhân** — tin tức và
nền tảng doanh nghiệp mới là bằng chứng chính cho câu "vì sao rớt". Claude được
dặn phải **nói thẳng khi tin tức không giải thích được cú rớt**, vì bịa một lý
do nghe lọt tai thì dễ hơn nhiều so với thừa nhận không biết. Nút này chỉ chạy
khi bấm, không tự chạy cho cả bảng, và **không** dùng lại Finviz/tin tức đã có
sẵn trên hàng đó — gọi lại chỉ tốn thêm và có thể ra một con số lệch với con số
đang hiện trên bảng.

Tin đến từ **ba nguồn miễn phí, không cần key, và hỏng độc lập nhau**:

| Nguồn | Là gì | Gắn mã cổ phiếu? |
|---|---|---|
| Yahoo Finance | tìm kiếm tin tài chính | có, nên biết chắc bài nào riêng về mã |
| Hồ sơ SEC (EDGAR) | 8-K, 10-Q/10-K, phát hành thêm cổ phiếu, SC 13D | theo định nghĩa là của đúng công ty đó |
| Google News | bộ gom tin của hàng trăm toà báo | **không** — nên app ghi "chưa rõ" chứ không ghi "riêng mã này" |

> **Google News đang trả 503 từ production.** Một cái 503 của Google có hai
> nghĩa dẫn tới hai cách sửa ngược nhau: Google sập tạm (thử lại là xong) hay
> Google chặn dải IP trung tâm dữ liệu (thử lại vô ích vĩnh viễn). App **đọc
> thân phản hồi và tự phân loại**, vì trang chặn của Google tự xưng tên bằng
> những chữ rất đặc trưng ("unusual traffic from your computer network"). Đo
> được là *bị chặn* thì nó nghỉ hỏi 6 tiếng và nói thẳng trên màn hình rằng đó
> là quyết định của app chứ không phải câu trả lời của Google — một dòng lỗi lặp
> lại vô hạn là một dòng lỗi bị bỏ qua. Không khớp chữ nào thì vẫn coi là hỏng
> tạm và vẫn thử lại; app **không đoán**. Hai nguồn kia không bị ảnh hưởng.

Một nguồn chết **không** xoá hai nguồn kia, và prompt nói rõ nguồn nào trả lời
nguồn nào hỏng — "không có tin" và "một nửa số nguồn chết" dẫn tới hai kết luận
ngược nhau về việc cú rớt đã được giải thích hay chưa. Bài về trùng từ hai nguồn
được gộp làm một, giữ lại bản đã xác nhận gắn mã.

**X/Twitter và Reddit cố ý không có mặt.** X cần gói API trả phí. Reddit còn bậc
miễn phí nhưng phải đăng ký app lấy client id + secret, và quan trọng hơn: nó là
**bàn tán sau khi giá đã rớt**, không phải tin — trộn vào đây là mời đúng cái
bịa đặt mà nút này sinh ra để chặn.

> **Chi phí quét, và vì sao nó chạy nổi.** Finviz là một lần cào HTML *mỗi mã*,
> nên quét 503 mã kiểu thẳng là không dùng được. Lọc đi ba tầng theo giá: sáu
> request `/quotes` gộp lô cho cả rổ (đã có sẵn đỉnh/đáy 52 tuần, cắt được phần
> lớn rổ miễn phí) → nến ngày cho số sống sót (cache theo ngày) → Finviz chỉ cho
> số còn lại. Lần quét thứ hai trong ngày gần như tức thì.

> **Bảng trống là một câu trả lời, không phải lỗi.** Phần lớn thời gian không có
> mã nào vừa rớt đủ sâu, vừa còn trên hỗ trợ, vừa còn lãi và chưa đắt.

**Kết quả quét được LƯU, mở lại tab là có ngay.** Lưu ở phía server nên quét trên
máy tính rồi mở điện thoại vẫn thấy, và lưu riêng theo từng phạm vi — một lượt
watchlist vài chục giây không xoá mất lượt cả rổ vừa chạy. Bảng khôi phục luôn in
**giờ quét kèm câu "đây là ảnh chụp, giá đã cũ"**: một bảng số nhìn y hệt nhau dù
nó là số sống hay ảnh chụp bốn tiếng trước. Gạt sang phạm vi khác thì bảng đổi
theo phạm vi đó chứ không giữ lại bảng cũ. Đóng tab *giữa lúc đang quét* thì vẫn
mất lượt quét — tab này cố ý không có bộ máy chạy nền như tab Screener.

---

## Tin tức — thị trường | chính trị-kinh tế

Tab thứ bảy trả lời một câu đơn giản: *hôm nay có gì đang diễn ra*. Hai cột
đặt cạnh nhau — **Thị trường** (cổ phiếu, earnings, lãi suất, số liệu vĩ mô)
và **Chính trị - kinh tế** (chính phủ, Fed, thuế quan, ngân sách, những thứ
từ chính trị chạm vào thị trường). Tiêu đề 48 giờ gần nhất, mới nhất trước,
để **nguyên tiếng Anh** của toà báo; bấm vào dòng nào là mở bài gốc.

**Bốn loại nguồn, mỗi loại một tư thế:**

| Nguồn | Cần gì | Ghi chú |
|---|---|---|
| RSS báo lớn (CNBC, MarketWatch, WSJ, Yahoo, Bloomberg, Politico, The Hill, NPR, Fed) | không gì cả | miễn phí, cache 5 phút |
| Google News theo chủ đề | không gì cả | nguồn PHỤ — Google từng trả 503 ở production; đo được là bị chặn thì app tự nghỉ 6 tiếng |
| X theo danh sách tài khoản | `X_BEARER_TOKEN` + `X_NEWS_ACCOUNTS` / `X_NEWS_POLITICS_ACCOUNTS` | trả theo lượng đọc, nên cache riêng 15 phút mà nút Làm mới không vượt qua |
| Unusual Whales `news/headlines` | `UW_API_KEY` | chưa đo hình dạng — chạy `/api/uwprobe` một lần rồi đọc bước `news-headlines` |

Reuters và AP **không có** trong danh sách RSS dù là hai hãng lớn nhất:
Reuters đã ngừng RSS công khai từ 2020, AP không có RSS chính thức. Bài của
họ về qua Google News, vốn gom lại hàng trăm báo.

**Không nguồn nào ở đây kiểm được từ môi trường phát triển** (mọi host tin
tức đều bị chặn ở đó, kể cả Yahoo và Google News — hai nguồn đang chạy thật).
Nên phần **Nguồn** dưới hai cột chính là phép đo: từng nguồn hiện ✓ kèm số
bài, ✗ kèm mã HTTP và 160 ký tự đầu của thứ thật sự nhận được, hoặc · khi
tắt vì thiếu key / đang nghỉ. Một cột trống nói rõ vì sao trống — mọi nguồn
hỏng, hay nguồn sống mà 48 giờ không có bài — vì hai chuyện đó cần hai cách
sửa khác nhau, và một cột trống câm trông y hệt "hôm nay không có tin".

**"Tóm tắt tiếng Việt" là một nút, không tự chạy.** Bấm là Claude đọc cả hai
cột trong MỘT lượt gọi (tối đa 60 tiêu đề) và viết bản tóm tắt bốn phần:
tổng quan, thị trường, chính trị-kinh tế, cần để ý — chỉ từ tiêu đề, không
có thân bài, không có dữ liệu ngoài, và được dặn gọi tên toà báo thay vì
nói như sự thật đã kiểm. Bản viết xong được giữ 20 phút theo bộ tiêu đề,
nên hai người trong nhà cùng bấm là một lượt gọi. Không dịch từng dòng: 60
tiêu đề mỗi lần mở tab là 60 lượt gọi cho thứ người đọc lướt trong 10 giây.

**Nghe bản tóm tắt.** Dưới bản tóm tắt có nút **Nghe** (kèm Tạm dừng / Dừng)
với hai máy đọc chọn được. **Giọng AI (ElevenLabs)** — giọng neural tự nhiên,
cần `ELEVENLABS_API_KEY`, tính tiền theo ký tự; app cache audio theo nội dung
nên bấm lại hay người thứ hai bấm là 0 ký tự, từ chối văn bản quá 4.000 ký tự,
và in ra mỗi lần "đã dùng N ký tự" hay "bản đã tạo trước". Chọn giọng ngay
trong ô giọng (danh sách lấy từ chính tài khoản của bạn); hết ký tự, key sai,
giọng bị xoá — mỗi lỗi một câu riêng vì cách sửa khác nhau. **Giọng trình
duyệt** là đường lùi khi chưa có key hoặc ElevenLabs hỏng: đọc bằng **giọng có
sẵn của chính trình duyệt** (Web Speech API) — không key, không tốn tiền,
không gửi văn bản đi đâu. Vì vậy giọng tiếng Việt tuỳ máy:
iPhone/iPad và Mac có sẵn, Android có Google TTS, Chrome máy tính có giọng
Google trực tuyến, Windows phải cài thêm gói tiếng Việt. Máy có nhiều giọng
tiếng Việt thì có ô chọn, và app nhớ giọng đã chọn. Máy **không có** giọng
tiếng Việt thì nút tắt và app nói thẳng máy đang có những giọng nào cùng
cách cài thêm — cố ý không đọc tiếng Việt bằng giọng Anh, vì thứ đó không
nghe được mà trông y như đang chạy. Văn bản được chia thành đoạn ngắn theo
câu vì Chrome ngừng giữa chừng một đoạn dài quá ~15 giây mà không báo lỗi.
Hàng nút **0.75× / 1× / 1.25× / 1.5× / 2×** chỉnh tốc độ đọc, nhớ lựa chọn,
đổi giữa chừng thì áp từ đoạn kế tiếp. Không có 0.5× vì ở tốc độ đó một
đoạn 150 ký tự dài quá 15 giây và lại rơi vào đúng lỗi ngắt của Chrome.

## Learn — học đọc đúng những màn hình bên cạnh

Tab thứ tám, cho người nhà mới dùng app (và cho chính chủ app khi quên một
định nghĩa). Bốn phần, 22 bài, mỗi bài song ngữ Việt/Anh theo đúng cờ ngôn
ngữ của app:

| Phần | Bài |
|---|---|
| **Nến & mẫu hình** | Cấu tạo nến · doji · búa/người treo cổ · nhấn chìm + sao mai/sao hôm · vùng hỗ trợ (đúng cách tab Đầu tư dài hạn tính: đáy xoay 5 nến mỗi bên, gom 2,5%, tối thiểu 2 lần chạm) · vai-đầu-vai + hai đỉnh/hai đáy · tam giác + cờ |
| **GEX & bề rộng TT** | GEX là gì · đọc biểu đồ (put wall / call wall / abs gamma / zero gamma — tính trên gamma RÒNG, và vì sao zero gamma có thể trống) · gamma dương/âm · TICK ±600, ADD, VOLD, put/call · Fear & Greed + RRG |
| **Flow · Dark pool · Insider** | Options flow (KL/OI > 1, và vì sao flow KHÔNG cho biết ai mua ai bán) · dark pool (≥ 1 triệu đô, 14 ngày) · Form 4 (chỉ mã P, loại 10b5-1, đếm NGƯỜI mua) · Quốc hội (khoảng tiền, độ trễ đo được ~116 ngày) · footprint — và thứ gần nhất app đang có |
| **Bán put có bảo đảm** | Cash-secured put là gì · công thức điểm 45/25/15/15 · bảy hard gate và dấu `?` · IV so với HV · quản lý vị thế (21 DTE, sizing 5/20/50/30) |

Mỗi bài có:

- **Hình vẽ** — SVG vẽ bằng code, dùng đúng màu theme của app (nến xanh/đỏ,
  call/put của GEX, đường tham chiếu màu cảnh báo). Không có ảnh tải từ ngoài,
  nên không có ảnh vỡ, và đổi theme là hình đổi theo.
- **Bẫy thường gặp** — vài câu, mỗi câu một cách đọc sai đã thấy thật.
- **Nút "Xem thật"** — nhảy sang đúng tab (và tab con) đang có dữ liệu sống:
  bài GEX mở Heatmap → GEX, bài Form 4 mở Insider Trade → Insiders.
- **Ôn tập** — 2–3 câu trắc nghiệm, chấm ngay, hiện lời giải cho cả câu đúng
  lẫn câu sai. Điểm lưu **theo tài khoản, phía server** (mở ở máy khác vẫn
  thấy), chỉ giữ điểm cao nhất + số lần làm; dấu ✓ cạnh tên bài khi đã đúng
  hết. Lưu hỏng thì màn hình nói HTTP thật, không im.
- **Hỏi Claude về bài này** — hộp câu hỏi ≤ 500 ký tự. Claude chỉ thấy ĐÚNG
  bài đang mở, không thấy giá hay dữ liệu sống, và được dặn: chỉ giải thích
  khái niệm, không khuyến nghị mua bán, dùng đúng định nghĩa của app. Mỗi câu
  hỏi là một lượt gọi API trả tiền và được ghi vào Hoạt động như mọi nút tốn
  tiền khác.

Định nghĩa trong bài là **đúng cách app này tính**, không phải sách giáo khoa
chung: tường GEX trên gamma ròng, dấu `?` là chưa có dữ liệu chứ không phải ✓,
một đáy đơn không phải hỗ trợ. Đọc xong bài là đọc được chính màn hình bên
cạnh — đó là lý do tab này nằm trong app thay vì là một trang web riêng.

**Hai chế độ trong tab**: **Bài học** (đọc một lần, ở trên) và **Tra cứu
nhanh** — một trang có đủ 22 kiểu nến và mẫu hình để xem lại sau khi học
xong: mỗi thẻ một hình vẽ đứng riêng, một câu nó là gì, **xác nhận khi nào**
(đúng luật máy dò ở tab Patterns: búa chỉ ✓ khi nến sau đóng cao hơn, hai
đáy chỉ ✓ khi đóng trên đường cổ), **bẫy hay gặp**, bài học nói kỹ, và app
có tự dò kiểu đó ở tab Patterns không. Lọc theo nhóm (nến / đảo chiều /
tiếp diễn / mức giá) hoặc tìm theo tên.

Nhãn tab "Learn" giữ tiếng Anh ở cả hai ngôn ngữ, cùng luật với bảy tab kia.

## Patterns — mẫu hình nến và mẫu hình giá, dò trên nến ngày Schwab

Tab thứ chín. Quét **watchlist** hoặc **cả rổ S&P 500**, liệt kê mã nào đang
có mẫu, bấm một dòng (hoặc gõ mã bất kỳ) để mở **biểu đồ nến ngày** có vẽ mẫu
lên, và một nút để Claude **diễn giải** đúng những mẫu app đã dò.

Nến là nến ngày Schwab, 3 năm, cache theo ngày — **cùng file cache tab Đầu tư
dài hạn dùng**, và vùng hỗ trợ/kháng cự cũng tính bằng đúng phép của tab đó
(đỉnh/đáy xoay 5 nến mỗi bên, gom 2,5%, ≥ 2 lần chạm). Quét cả rổ lần đầu
trong ngày là ~503 lượt nến (vài phút, giới hạn 100 request/phút của Schwab);
lần sau trong ngày gần như tức thì.

**Mẫu nến** (chỉ 3 nến cuối): doji · búa / người treo cổ · búa ngược / sao
băng · nhấn chìm tăng/giảm · sao mai / sao hôm. Cùng một hình, bối cảnh quyết
định tên: râu dưới dài sau đợt GIẢM là búa, sau đợt TĂNG là người treo cổ;
không có xu hướng trước thì app không gọi tên. Một nến đơn chỉ **✓ xác nhận**
khi nến sau đóng đúng hướng; nến cuối chuỗi luôn là **… đang chờ**.

**Mẫu giá** (xác nhận trong 15 nến, hoặc đang hình thành với đỉnh/đáy cuối
trong 25 nến): hai đáy / hai đỉnh · vai-đầu-vai và ngược · tam giác tăng /
giảm / cân · cờ tăng / giảm · phá kháng cự / thủng hỗ trợ (kèm khối lượng so
với trung bình 20 phiên). Mỗi mẫu mang đường cổ và **mục tiêu đo** — phép
chiếu theo quy ước (chiều cao mẫu cộng từ điểm phá), không phải dự báo.

Ba điều cố ý:

- **"Đang hình thành" và "đã xác nhận" không bao giờ hiện giống nhau.** Hai
  đáy chưa vượt đường cổ chỉ là hai cái đáy; chip ghi `…`, biểu đồ vẽ đường
  cổ để biết mức nào mới là xác nhận. Một mẫu đã xác nhận lâu hơn 15 nến là
  lịch sử, không hiện.
- **Thiếu khối lượng ra "không có dữ liệu", không ra 0.** Một cú phá vỡ
  không đo được khối lượng là một cú phá vỡ yếu hơn về bằng chứng, không phải
  một cú phá vỡ "không ai giao dịch".
- **Claude chỉ nhận danh sách mẫu và mức giá app đã tính** — không nhận nến,
  không có tin tức — và được dặn chỉ diễn giải: cái gì sẽ xác nhận, cái gì sẽ
  phủ nhận, mẫu nào đang mâu thuẫn nhau. Không khuyến nghị.

Kết quả quét lưu theo tài khoản và phạm vi (mở lại tab là có), kèm câu "ảnh
chụp, giá đã cũ" như hai tab quét kia. Bài học về từng mẫu nằm ở tab Learn;
các bài nến ở đó có nút nhảy thẳng sang tab này.

## Daytrade — giao dịch trong ngày, bằng Schwab

Tab thứ MƯỜI, và nó là câu trả lời cho đúng thứ đường NinjaTrader không cho
được: **cổ phiếu và 0DTE SPX trong ngày**. Hai tab con.

**Cổ phiếu** — tối đa 10 mã tự chọn, nến 5 phút Schwab, phiên chính thức
09:30–16:00 New York:

| Chỉ báo | Cách tính |
|---|---|
| **VWAP** + độ lệch | Cộng dồn trong phiên, giá điển hình (H+L+C)/3 |
| **Mốc phiên trước** | Đỉnh/đáy/đóng cửa phiên liền trước + khoảng gap |
| **Khoảng mở cửa** 15 hoặc 30 phút | Đỉnh/đáy N phút đầu, và cú phá vỡ |
| **Khối lượng tương đối** | So với **trung vị** cùng vị trí nến của 10 phiên trước |

**Cả bốn đến từ MỘT request mỗi mã.** `periodType=day&period=10&frequency=5`
trả cả phiên hôm nay lẫn mười phiên trước, nên mốc hôm qua và nền khối lượng
không tốn thêm lượt gọi nào. 10 mã = 10 request/phút, dưới hẳn trần 100/phút
mà lượt quét Screener đang dùng chung — và đó cũng là lý do có trần 10 mã.

Bốn luật số học, mỗi luật là một chỗ "thà không nói còn hơn nói sai":

- **Khoảng mở cửa chưa đủ nến thì không dựng.** Lúc 9:40 mà in "khoảng 30
  phút" từ hai nến là in một con số sẽ đổi trong hai mươi phút nữa, trong
  khi nó trông y hệt con số cuối cùng.
- **Phá vỡ tính trên giá ĐÓNG, không phải râu nến** — đúng quy ước
  `confirmed` mà tab Patterns đã đặt, nên hai tab không nói hai nghĩa khác
  nhau cho cùng chữ "phá vỡ".
- **Khối lượng tương đối dùng TRUNG VỊ và cần ≥3 phiên nền.** Một ngày
  earnings trong mười phiên kéo lệch trung bình chứ không kéo lệch trung vị;
  dưới 3 phiên thì ra `—` kèm số phiên đang có, không đoán.
- **Nến thiếu khối lượng làm VWAP dừng tại đó**, không coi như 0 — coi là 0
  sẽ vẽ ra một đường VWAP trông hoàn toàn bình thường mà sai.

VWAP ở đây là **xấp xỉ** và màn hình nói ra: VWAP thật tính trên từng giao
dịch, mà `/pricehistory` chỉ cho OHLCV — đúng câu `learn/flow.ts` đã ghi khi
giải thích vì sao app không có footprint.

**0DTE** — chuỗi quyền chọn đáo hạn HÔM NAY, hỏi theo ngày giao dịch New
York (hỏi theo ngày UTC thì sau 20:00 ET sẽ trả chuỗi rỗng trông y như "hôm
nay không có kỳ đáo hạn"). Hiện giá straddle ATM làm biên dao động thị
trường đang định giá — **cố ý không nhân hệ số nào**: nhiều nơi nhân 0,85
cho "chính xác hơn", nhưng đó là một MÔ HÌNH, và luật của repo là code chỉ
tính từ số thật.

**Nửa 0DTE cũng LÀ một phép đo.** #103/#108 đo được Schwab trả chuỗi SPX đủ
3600 hợp đồng với `openInterest: 0` và `gamma: 0` ở tất cả — lỗi API với chỉ
số, không phải chuyện quyền dữ liệu (thinkorswim cùng tài khoản có OI thật).
Nhưng hai phép đo đó chỉ soi gamma và OI, vì GEX = gamma × OI; **chưa ai
nhìn `bid`/`ask`, mà bảng 0DTE chỉ cần bid/ask**. Nên phép kiểm "chuỗi này
dùng được không" ở đây đếm theo **báo giá**, không theo OI — dùng lại
`usableContractCount()` của `gex.ts` sẽ loại sạch SPX vì một lý do bảng này
không quan tâm, và loại một cách im lặng. Khối chẩn đoán dưới bảng đếm RIÊNG
ba thứ (có giá chào / có OI / có gamma) nên một lần mở tab là biết nửa này
sống hay chết, và biết vì sao; chuỗi rỗng vẫn được TRẢ VỀ kèm chẩn đoán thay
vì ném lỗi, vì chẩn đoán mới là thứ cần đọc. Không có OI thì màn hình chỉ
thẳng sang SPY/QQQ (ETF, đo được là chạy bình thường).

## NinjaTrader web / Tradovate — ĐANG DỪNG, probe giữ lại

Chủ app đăng nhập được `web.ninjatrader.com` (nền Tradovate) và muốn một tab
daytrade (cổ phiếu + 0DTE SPX, luồng thời gian thực, footprint). Theo đúng
luật của repo với host có key, việc đầu tiên là **đo**: `/api/ntprobe` (chỉ
chủ app) lấy token, gọi ba endpoint đọc và bắt tay WebSocket dữ liệu thị
trường cho một hợp đồng, rồi in **hình dạng** — tên khoá, kiểu, số dòng,
nguyên văn hai chiều đã che token. Cách đặt biến và cách đọc kết quả:
`DEPLOY.md`.

**Probe chưa từng chạy, và không cần chạy nữa lúc này.** Đo 2026-09-21 từ
chính màn hình NinjaTrader web:

- **Dữ liệu trễ 10 phút.** Nguyên văn hộp thoại Tradovate: *"NQZ6 data is
  delayed by 10 minutes. To get real-time data, please subscribe to a CME
  data package."* Khớp với `Subscriptions → Market Data` in **"No rows"** —
  hai bề mặt độc lập nói cùng một điều. Một footprint dựng trên dữ liệu trễ
  10 phút là thứ **sai mà trông y hệt đúng**.
- **Footprint đã có sẵn và đã trả tiền**: add-on **Order Flow +** đang ACTIVE
  ở **$59/tháng** (Bid/Ask chart type, Volume Profile, Cumulative Delta),
  cộng **Advanced Charting** miễn phí có "bid/ask volume candles".
- **Không có tài khoản demo** (chỉ một tài khoản `LIVE`), nên không đo được
  an toàn — token Tradovate đặt lệnh được.
- **Tradovate là sàn futures**, nên không bao giờ có cổ phiếu hay 0DTE SPX —
  đúng nửa quan trọng của yêu cầu ban đầu. Nửa đó nằm ở Schwab, đã nối sẵn.

Một thứ đo được và đáng giữ: **tên hợp đồng viết MỘT chữ số năm** (`NQZ6`,
`ESZ6`), tức phỏng đoán trong probe là đúng — cách viết mã là thứ đã tốn sáu
PR ở chuyện SPX của Schwab.

Code giữ nguyên, không xoá: mua gói dữ liệu CME + gói API Access, đặt 4 biến
env, mở `/api/ntprobe` là chạy lại được ngay.

## Cấu trúc

`src/lib` có 28 file, liệt kê hết ra thì thành mục lục chứ không thành hiểu
biết. Dưới đây là năm nhóm chức năng, mỗi nhóm kèm chỗ nên mở ra đọc trước.

**Hạ tầng** — `schwab.ts` là cửa duy nhất ra ngoài: OAuth, rate limiter 100
request/phút, và bọc **cả hai** API của Schwab — Market Data cho báo giá và
chuỗi quyền chọn, Trader cho tài khoản và vị thế. Hai thứ này được Schwab duyệt
**riêng biệt**: tab My Portfolio cần sản phẩm "Accounts and Trading Production"
ở bước 1, và app duyệt xong Market Data vẫn sẽ trả 401 cho toàn bộ phần vị thế
nếu thiếu nó. `session.ts` giữ cookie phiên ký
HMAC bằng Web Crypto để chạy được trong middleware; `middleware.ts` dựng hai
cổng riêng biệt — mật khẩu app cho toàn bộ giao diện, token riêng cho
`/api/md/*` mà app điện thoại gọi vào. `history.ts` là nến ngày dùng chung, cache
theo ngày nên nhiều nơi cùng hỏi một mã cũng chỉ tốn một request.

**Quét và chấm điểm** — `screener.ts` chứa toàn bộ phần tính: HV, SMA, IV rank,
skew, bảy cổng cứng, và việc chọn ra hợp đồng tốt nhất cho mỗi mã. `scan-job.ts`
là thứ đáng đọc nhất nhóm này: một lần quét sống trong tiến trình server chứ
không nằm trong luồng HTTP, nên đóng tab không giết nó. `scan-store.ts` lưu kết
quả, tách riêng theo từng phạm vi quét.

**Danh mục và vị thế** — `positions.ts` ánh xạ dữ liệu thô của Schwab thành bốn
loại vị thế; `portfolio.ts` là **một bộ luật dùng chung** cho cả màn hình lẫn
cảnh báo, cố ý gộp vào một chỗ để điện thoại và màn hình không bao giờ nói khác
nhau về cùng một vị thế. `exposure.ts` giữ bốn trần kích thước và phần tính
tương quan từng cặp; `realized.ts` đọc P/L đã chốt từ CSV Schwab xuất ra.

**Cảnh báo** — `alert-runner.ts` là vòng lặp nền duy nhất trong toàn bộ codebase;
`alerts.ts` giữ luật báo và phần chống spam theo phiên New York; `notify.ts` gửi
đi Telegram và web push, tự tắt khi chưa cấu hình. `volwatch.ts` là term
structure và skew chĩa vào vị thế đang giữ thay vì vào ứng viên mới.

**Phân tích và thị trường** — `gex.ts` tính gamma exposure; `rrg.ts` dựng vòng
xoay sức mạnh tương đối; `indicators.ts` là chỉ báo kỹ thuật tự tính; `treemap.ts`
dựng bản đồ nhiệt. Các file còn lại trong nhóm này (`news`, `profile`, `finviz`,
`links`) đều là bọc một nguồn ngoài, hỏng một cái không kéo sập cái nào khác.

**Dữ liệu** nằm ở `data/`: `sp500.json` (503 mã), `watchlist.json`,
`earnings.json` dựng bằng `scripts/earnings-sync.js`, và `realized/*.csv` bạn tự
xuất từ Schwab. Thứ phải sống qua mỗi lần deploy — token OAuth, watchlist, lần
quét cuối, trạng thái chống spam cảnh báo, danh sách đăng ký push — nằm trên đĩa
gắn ngoài, xem `DEPLOY.md`. Mọi thứ ghi ở chỗ khác, kể cả `.cache/*`, đều coi như
mất được và dựng lại được.

---

Công cụ sàng lọc, không phải khuyến nghị đầu tư. Bán put nghĩa là cam kết mua
100 cổ phiếu tại giá strike — chỉ lọc trong nhóm mã bạn thực sự muốn sở hữu.
