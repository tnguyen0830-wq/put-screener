# Put Screener — S&P 500

Quét toàn bộ rổ S&P 500 và trả về những hợp đồng **cash-secured put** đáp ứng
tiêu chí của bạn, lấy dữ liệu trực tiếp từ tài khoản Charles Schwab.

App có năm tab, đi theo đúng vòng đời của một lệnh bán put:

| Tab | Trả lời câu hỏi |
|---|---|
| **Sell Put Screener** | Bán con gì, strike nào, kỳ nào |
| **Analyze** | Con này thực sự đang thế nào |
| **Heatmap** | Cả thị trường đang thế nào (kèm GEX của SPX/mã bất kỳ) |
| **My Portfolio** | Cái đang cầm có gì cần để ý |
| **Insider Trade** | Ai đang mua — nội bộ công ty, Quốc hội, quyền chọn bất thường, dark pool |

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

Người nhà dùng được Sell Put Screener, Analyze, Heatmap, Insider Trade, và có
**watchlist riêng**. Họ **không** thấy My Portfolio, P/L đã chốt, cảnh báo,
và không bấm được nút kết nối Schwab — gọi thẳng vào địa chỉ đó cũng bị từ
chối, không chỉ ẩn nút đi.

Xoá một người là họ mất quyền **ngay lập tức** với mọi thứ riêng tư (danh mục,
P/L, cảnh báo) và mất luôn quyền đăng nhập lại. Phần công cụ thị trường thuần
tuý thì cookie cũ của họ còn đọc được tới khi hết hạn — phiên của người nhà
cố tình chỉ **7 ngày** (của chủ app là 30) để khoảng đó không kéo dài.

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

Panel còn có link sang trang GEX của Tạp Chí Phố Wall để đối chiếu — thuần tuý
deep-link, không cào dữ liệu, và app chạy đầy đủ mà không cần tới nó.

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
sau thử lại chứ không nuốt mất. Ngoài giờ giao dịch thì không kiểm tra.

Không cấu hình biến môi trường thì cả hai kênh **tự tắt**, app chạy y như cũ chứ
không báo lỗi. Xem `DEPLOY.md` cho `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` và
cặp khoá `VAPID_*`.

> Điểm yếu của một vòng lặp nền là nó vô hình. Vì thế My Portfolio in giờ chạy
> gần nhất ra màn hình — một cái đồng hồ chết đọc thành một con số đứng yên, chứ
> không đọc thành "mọi thứ đều ổn".

---

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
