/**
 * Tài khoản đăng nhập của chính trang này.
 *
 * App vốn một người dùng: một `APP_PASSWORD`, ai gõ đúng thì thấy mọi thứ -
 * kể cả tab My Portfolio, tức là vị thế thật trong tài khoản Schwab của chủ
 * app. Chủ app muốn người nhà dùng được phần công cụ thị trường (Screener,
 * Analyze, Heatmap, Insider Trade) mà KHÔNG nhìn thấy danh mục của mình.
 *
 * Đăng nhập gõ **tên + mật khẩu**. Bản đầu (#119) chỉ có ô mật khẩu và suy ra
 * danh tính từ mật khẩu nào khớp; cách đó có một cái bẫy im lặng: hai người
 * vô tình đặt trùng mật khẩu thì người sau lặng lẽ đăng nhập thành người
 * trước. Có ô tên thì lỗi đó không tồn tại được.
 *
 *   APP_PASSWORD=...  → tài khoản chủ (role 'owner'), tên đăng nhập `owner`
 *   người nhà         → nằm trong kho tài khoản trên đĩa, xem lib/userstore.ts
 *
 * **File này phải luôn chạy được ở Edge runtime** - `middleware.ts` import nó,
 * và Edge không có `fs` lẫn `node:crypto`. Nên ở đây chỉ có logic thuần: hợp
 * lệ hoá tên, vai trò, và danh sách đường chỉ chủ app được đi. Mọi thứ đụng
 * tới đĩa hay băm mật khẩu nằm ở `userstore.ts` (Node-only).
 *
 * CẢNH BÁO cho người đọc sau: đây là phân tách theo VAI TRÒ trên cùng MỘT
 * phiên Schwab, không phải đa người dùng thật. Người nhà không có token
 * Schwab riêng, và mọi thứ họ xem đều đi qua hạn mức 100 request/phút chung
 * với chủ app. Muốn thật sự tách biệt thì phải deploy một bản riêng.
 */

export type Role = 'owner' | 'member';

/** Tên tài khoản của chủ app. Dành riêng - `APP_USERS` không được dùng lại. */
export const OWNER = 'owner';

/**
 * Header mà middleware gắn vào request sau khi xác thực xong, để route đọc
 * được người đang gọi mà không phải tự xác thực lại.
 *
 * An toàn vì middleware LUÔN ghi đè header này trên mọi request đi qua, kể
 * cả khi nó tự đặt giá trị mặc định - nên một header cùng tên gửi từ ngoài
 * vào không bao giờ sống sót. Tuyệt đối không được thêm nhánh nào bỏ qua
 * việc ghi đè đó.
 */
export const USER_HEADER = 'x-ps-user';

/** Tên tài khoản: đủ chặt để nhét được vào cookie và header mà không cần
 *  thoát ký tự, và cố tình KHÔNG cho dấu chấm - cookie ngăn cách bằng dấu
 *  chấm nên một cái tên có chấm sẽ làm hỏng việc tách chuỗi. */
const NAME_RE = /^[a-z0-9_-]{1,20}$/;

export function isValidName(name: string): boolean {
  return NAME_RE.test(name);
}

/**
 * Tên này có còn hiệu lực không - **chỉ trả lời được cho chủ app**.
 *
 * #119 có một hàm `knownUser()` đọc `APP_USERS` để một tài khoản bị gỡ mất
 * quyền ngay lập tức dù cookie 30 ngày của họ còn hạn. Từ khi tài khoản
 * chuyển sang file trên đĩa, middleware KHÔNG đọc được nữa (Edge không có
 * `fs`), nên phép kiểm tra đó không thể ở lại đây.
 *
 * Bù lại bằng ba thứ, ghi ra để người sau không tưởng là bỏ quên:
 *   1. Cổng theo VAI TRÒ ở middleware vẫn nguyên vẹn - vai trò suy ra từ
 *      tên nằm trong cookie ĐÃ KÝ, nên người nhà bị xoá vẫn không bao giờ
 *      chạm được vào danh mục.
 *   2. `requireUser()` (userstore.ts, phía Node) kiểm tra tài khoản còn tồn
 *      tại, và mọi route cần biết danh tính đều đi qua nó.
 *   3. Phiên của người nhà ngắn hơn của chủ app (xem SESSION_MS ở
 *      session.ts), nên cùng lắm quyền đọc dữ liệu thị trường của một tài
 *      khoản đã xoá chỉ sống thêm ngần ấy.
 */
export function isOwnerName(name: string): boolean {
  return name === OWNER;
}

export function roleOf(name: string): Role {
  return name === OWNER ? 'owner' : 'member';
}

/**
 * Những đường chỉ chủ app được đi.
 *
 * Ba nhóm, mỗi nhóm một lý do khác nhau:
 *   - danh mục / P/L đã chốt / kiểm tra quyền Trader API: đây là tiền và vị
 *     thế thật của chủ app, đúng thứ cần giấu.
 *   - cảnh báo: đăng ký web push ở đây sẽ nhận thông báo về danh mục của
 *     CHỦ APP (put vào ITM, sizing vượt trần...) - rò rỉ đúng dữ liệu vừa
 *     giấu ở trên, chỉ qua một đường khác.
 *   - OAuth Schwab: người nhà mà bấm kết nối thì hoặc ghi đè token của chủ
 *     app, hoặc nối tài khoản Schwab của chính họ vào server này. Cả hai
 *     đều sai. `/api/auth/status` KHÔNG nằm đây - nó chỉ nói phiên còn hay
 *     hết, không lộ số nào, và Render dùng nó làm health check.
 */
const OWNER_ONLY = [
  '/api/positions',
  '/api/realized',
  '/api/trader-check',
  '/api/alerts',
  '/api/auth/login',
  '/api/auth/callback',
  // Quản lý tài khoản: đọc được danh sách người nhà đã đủ đáng giấu, còn
  // ghi thì là tự phong quyền. Cả GET lẫn POST/PATCH/DELETE đều chặn ở đây.
  '/api/users',
  // Probe tastytrade: kích hoạt lượt gọi trên TÀI KHOẢN MÔI GIỚI của chủ
  // app. Chỉ trả hình dạng, không trả số - nhưng người nhà vẫn không được
  // là người bấm nút trên tài khoản đó.
  '/api/ttprobe',
  // Probe X: chỉ trả hình dạng, nhưng mỗi lượt bấm ĂN VÀO HẠN MỨC THÁNG mà
  // chủ app trả tiền cho X. Cùng lý do với ttprobe - người nhà không được là
  // người bấm nút tiêu tiền trên tài khoản của chủ app.
  '/api/xprobe',
  // Probe bề rộng thị trường: gọi cả UW (hạn mức trả phí) LẪN tài khoản môi
  // giới tastytrade, và còn mở hẳn một phiên streaming trên tài khoản đó.
  // Cùng lý do với ttprobe/xprobe.
  '/api/breadthprobe',
  // Probe ElevenLabs: đọc hạn mức ký tự và danh sách giọng của tài khoản
  // TRẢ PHÍ của chủ app. Chỉ hình dạng, không key — nhưng vẫn là tài khoản
  // của chủ app, cùng lý do với ttprobe/xprobe.
  '/api/ttsprobe',
  // Probe Unusual Whales: bốn lượt gọi trên hạn mức TRẢ PHÍ của chủ app.
  // Ra đời (#105) TRƯỚC khi có tài khoản người nhà (#119) nên bị bỏ sót khi
  // lập danh sách này — bốn probe kia đều đã nằm đây với đúng lý do đó.
  '/api/uwprobe',
  // Probe NinjaTrader/Tradovate: token Tradovate KHÔNG có scope chỉ-đọc —
  // là token của tài khoản môi giới (có thể đặt lệnh). Chỉ trả hình dạng,
  // nhưng người nhà không được là người bấm nút trên tài khoản đó.
  '/api/ntprobe',
  // Probe tape DXLink: mở một phiên streaming trên TÀI KHOẢN MÔI GIỚI
  // tastytrade của chủ app, cùng lý do với breadthprobe/ttprobe.
  '/api/dxtapeprobe',
];

/**
 * Những đường mà chỉ phần GHI (POST/PUT/PATCH/DELETE) là của riêng chủ app,
 * còn ĐỌC (GET) thì người nhà vẫn được.
 *
 * Ba tab của Unusual Whales: đọc kho đã đồng bộ là miễn phí, nhưng nút
 * "Đồng bộ ngay" gọi UW với `force: true` — bỏ qua cả cổng giờ giao dịch
 * lẫn nhịp giãn 1-trong-4-tick, mà chính đường dark pool từng đốt sạch hạn
 * mức 30.000/ngày (#78). Hạn mức đó là của chủ app, và khi cạn thì MỌI tính
 * năng UW của chủ app cùng chết (Quốc hội, Options Flow, so sánh GEX, tin
 * UW). Cùng luật với các probe ở trên: người nhà không được là người bấm
 * nút tiêu tiền trên tài khoản của chủ app. Tách danh sách riêng chứ không
 * nhét vào OWNER_ONLY vì GET phải mở — người nhà vẫn xem được tab.
 *
 * `/api/insiders?force=1` cố ý KHÔNG ở đây: đó là SEC, miễn phí, không hạn
 * mức trả tiền.
 */
const OWNER_ONLY_WRITES = ['/api/darkpool', '/api/optionflow', '/api/congress'];

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Trang (không phải API) chỉ chủ app được mở. Người nhà bị đưa về trang
 *  chủ chứ không nhận JSON 403 - một trang trắng in chữ JSON đọc như app
 *  hỏng, trong khi đây là chuyện bình thường. */
const OWNER_ONLY_PAGES = ['/accounts'];

const under = (list: string[], pathname: string) =>
  list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * `method` mặc định GET để nơi gọi cũ không đổi; middleware truyền
 * `req.method` thật. Chữ hoa/thường không quan trọng — chuẩn hoá ở đây, vì
 * một cái `post` viết thường mà lọt qua là lọt thật.
 */
export function isOwnerOnly(pathname: string, method = 'GET'): boolean {
  if (under(OWNER_ONLY, pathname)) return true;
  if (READ_METHODS.has(method.toUpperCase())) return false;
  return under(OWNER_ONLY_WRITES, pathname);
}

export function isOwnerOnlyPage(pathname: string): boolean {
  return OWNER_ONLY_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Ai đang gọi route này.
 *
 * Mặc định về `owner` khi thiếu header, vì chỉ có đúng một trường hợp thiếu:
 * `APP_PASSWORD` chưa đặt, tức máy ở nhà và cổng đang mở toang - lúc đó
 * không có ai khác để nhầm. Mọi request đi qua middleware với mật khẩu đã
 * đặt đều được gắn header thật.
 */
export function currentUser(req: { headers: { get(name: string): string | null } }): string {
  const raw = req.headers.get(USER_HEADER);
  return raw && isValidName(raw) ? raw : OWNER;
}
