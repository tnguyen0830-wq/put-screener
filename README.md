# Put Screener — S&P 500

Quét toàn bộ rổ S&P 500 và trả về những hợp đồng **cash-secured put** đáp ứng
tiêu chí của bạn, lấy dữ liệu trực tiếp từ tài khoản Charles Schwab.

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

---

## Ba giới hạn cần biết

**IV Rank chưa dùng được ngay.** Schwab trả về IV hiện tại nhưng không có lịch
sử IV, nên không thể tính IV Rank thật trong lần chạy đầu. App ghi lại một
điểm IV mỗi mã mỗi ngày vào `.cache/iv-history.json`; sau khoảng 3 tháng chạy
đều, cột IV Rank sẽ có nghĩa. Trong lúc chờ, tỷ lệ **IV/HV20** đóng vai trò
tương đương: trên 1.2 nghĩa là quyền chọn đang được định giá đắt hơn biến động
thực tế 20 phiên gần nhất.

**Ngày earnings phải nhập tay.** Market Data API không có lịch earnings. Điền
vào `data/earnings.json` theo dạng `{"AAPL": ["2026-10-29"]}`. Nếu bật
"Loại hợp đồng vắt qua earnings" mà file rỗng thì không có gì bị loại — hãy
tự kiểm tra trước khi vào lệnh.

**Delta là delta của Schwab.** Chuỗi quyền chọn trả greeks tính theo mô hình
của Schwab, có thể lệch nhẹ so với thinkorswim hay broker khác. Dùng nó để
xếp hạng tương đối, đừng coi là con số tuyệt đối.

---

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

- **Put wall** — strike có gamma put lớn nhất. Dealer phải mua vào để hedge ở
  đây, nên thường hành xử như hỗ trợ. Bán put ở hoặc dưới put wall thì cấu trúc
  quyền chọn đứng về phía bạn.
- **Call wall** — đối xứng, thường là kháng cự.
- **Zero gamma** — nơi GEX luỹ kế đổi dấu. Trên mức này dealer làm dịu biến
  động; dưới mức này họ khuếch đại.

Biểu đồ đánh dấu sẵn strike của bạn cạnh put wall, kèm một dòng kết luận thẳng:
strike đang nằm trên hay dưới wall.

Route `/api/gex?symbol=X` chỉ chạy khi bạn mở panel, tốn đúng 1 request, nên
không làm chậm lần quét toàn rổ.

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

## Cấu trúc

```
src/lib/schwab.ts        OAuth + rate limiter 100 req/phút + 3 endpoint market data
src/lib/screener.ts      HV, SMA, IV rank snapshot, chọn hợp đồng, chấm điểm
src/app/api/screen       Stream NDJSON, kết quả hiện dần từng mã
src/lib/gex.ts           Tính gamma exposure, put/call wall, zero gamma
src/app/api/gex          Route tính GEX theo yêu cầu, 1 request mỗi mã
src/lib/links.ts         Ánh xạ symbol sang TradingView + deep link
src/components           Bảng kết quả, thanh đệm giá SVG, panel chi tiết
data/sp500.json          503 mã, cập nhật lại khi rổ thay đổi
data/earnings.json       Lịch earnings tự nhập
data/watchlist.json      Danh sách mã tự chọn
```

---

Công cụ sàng lọc, không phải khuyến nghị đầu tư. Bán put nghĩa là cam kết mua
100 cổ phiếu tại giá strike — chỉ lọc trong nhóm mã bạn thực sự muốn sở hữu.
