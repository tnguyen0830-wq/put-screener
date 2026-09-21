import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, verifySession } from '@/lib/session';
import { OWNER, USER_HEADER, isOwnerOnly, isOwnerOnlyPage, roleOf } from '@/lib/users';

/**
 * Hai cái cổng, hai loại khách.
 *
 * `/api/md/*` là cửa cho app điện thoại, gác bằng MD_API_TOKEN như cũ - app đó
 * gửi token trong header, nó không có cookie nào.
 *
 * Mọi thứ còn lại là cửa cho trình duyệt, gác bằng mật khẩu của chính bạn. Từ
 * lúc tab danh mục hiện vị thế thật thì trang này không còn là thứ để ai mở
 * cũng được, mà nó đang nằm trên một URL công khai.
 *
 * Cả hai cổng đều chỉ đóng khi biến môi trường tương ứng được đặt. Máy ở nhà
 * không đặt gì thì chạy y như trước - nhưng bản deploy mà quên đặt thì trang
 * mở toang, nên /api/auth/status nói rõ trang đã khoá hay chưa và giao diện
 * cảnh báo bằng chữ đỏ.
 *
 * Từ khi người nhà có tài khoản riêng (lib/users.ts), cổng trình duyệt làm
 * thêm hai việc: nói cho route biết AI đang gọi (qua `USER_HEADER`), và chặn
 * thẳng những đường chỉ chủ app được đi. Chặn ở đây chứ không phải trong
 * từng route là có chủ ý - thêm một route danh mục mới mà quên tự kiểm tra
 * quyền thì nó vẫn được gác, thay vì lặng lẽ để lọt.
 */

const TOKEN_HEADER = 'x-md-token';

function hasMdToken(req: NextRequest, expected: string): boolean {
  const bearer = req.headers.get('authorization');
  if (bearer?.startsWith('Bearer ') && bearer.slice(7) === expected) return true;
  return req.headers.get(TOKEN_HEADER) === expected;
}

/**
 * Những đường được đi qua khi chưa đăng nhập.
 *
 * Chỉ có ba: trang nhập mật khẩu, chỗ nhận mật khẩu, và trạng thái kết nối -
 * cái cuối vì Render dùng nó làm health check, và vì nó chỉ nói phiên Schwab
 * còn hay hết, không nói một con số tài khoản nào.
 *
 * Callback của Schwab cố tình KHÔNG nằm ở đây. Để ngỏ nó thì người lạ có thể
 * đăng nhập tài khoản Schwab của họ vào server này và ghi đè token của bạn.
 */
const OPEN = [
  '/login',
  '/api/session',
  '/api/auth/status',
  /* Đổi mật khẩu bằng mã đặt lại. Bắt buộc phải mở: người quên mật khẩu
     thì chưa đăng nhập được, nên không thể gác bằng cookie. Thứ giữ cửa
     này an toàn nằm ở chính route đó và ở `createResetCode()` - đọc chú
     thích ở cả hai trước khi sửa gì quanh đây. Riêng việc PHÁT mã thì
     ngược lại: `/api/users/reset-code` nằm dưới `/api/users`, tức chỉ chủ
     app. */
  '/api/password-reset',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/md')) {
    const expected = process.env.MD_API_TOKEN;
    // App điện thoại là của chính chủ app, nên mọi request qua cổng này đi
    // tiếp dưới danh nghĩa chủ app.
    if (!expected) return pass(req, OWNER);
    // CORS preflight không mang được thông tin xác thực, phải để route tự trả lời.
    if (req.method === 'OPTIONS') return strip(req);
    if (hasMdToken(req, expected)) return pass(req, OWNER);

    const res = NextResponse.json({ error: 'MD_TOKEN_INVALID' }, { status: 401 });
    res.headers.set('Access-Control-Allow-Origin', '*');
    return res;
  }

  const password = process.env.APP_PASSWORD;
  // Chưa đặt mật khẩu: cổng mở, và chỉ có một người - chính là chủ máy.
  if (!password) return pass(req, OWNER);
  if (OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return noStore(strip(req), pathname);

  const user = await verifySession(req.cookies.get(COOKIE)?.value, password);
  /* KHÔNG kiểm tra "tài khoản còn tồn tại" ở đây được: từ khi tài khoản
     chuyển sang file trên đĩa, Edge runtime không đọc nổi. Phép kiểm tra đó
     nằm ở `requireUser()` phía Node - xem chú thích dài ở users.ts. Cổng
     theo vai trò dưới đây vẫn nguyên vẹn, vì vai trò suy ra từ cái tên nằm
     trong cookie ĐÃ KÝ. */
  if (user) {
    if (roleOf(user) !== 'owner') {
      if (isOwnerOnly(pathname, req.method)) {
        return NextResponse.json({ error: 'OWNER_ONLY' }, { status: 403 });
      }
      // Trang (không phải API): đưa về trang chủ, đừng ném JSON vào mặt.
      if (isOwnerOnlyPage(pathname)) {
        return NextResponse.redirect(new URL('/', req.nextUrl.origin));
      }
    }
    return pass(req, user);
  }

  // Trình duyệt thì đưa tới trang đăng nhập, và nhớ chỗ đang định tới. Còn
  // request dữ liệu thì trả 401 gọn - để giao diện biết mà đưa người dùng đi
  // đăng nhập lại, thay vì nhận về một trang HTML rồi vỡ khi parse JSON.
  if (pathname.startsWith('/api/'))
    return NextResponse.json({ error: 'LOGIN_REQUIRED' }, { status: 401 });

  const to = new URL('/login', req.nextUrl.origin);
  if (pathname !== '/') to.searchParams.set('next', pathname);
  return NextResponse.redirect(to);
}

/**
 * Cho request đi tiếp, và LUÔN ghi đè `USER_HEADER` bằng tên đã xác thực.
 *
 * Ghi đè là phần quan trọng nhất của hàm này: nếu có nhánh nào để nguyên
 * header của client, người nhà chỉ cần tự gửi `x-ps-user: owner` là thành
 * chủ app.
 */
/**
 * Cấm mọi bộ nhớ đệm giữ lại trang đăng nhập.
 *
 * ĐO ĐƯỢC, không phải phòng xa: `next start` trả `/login` kèm
 * `Cache-Control: s-maxage=31536000, stale-while-revalidate` vì đó là trang
 * tĩnh dựng sẵn lúc build. `s-maxage` nói riêng với các bộ đệm CHUNG - và
 * app này chạy sau proxy của Render - rằng giữ một năm cũng được.
 *
 * Hệ quả thật, chính là lỗi chủ app gặp sau #120: HTML cũ (một ô mật khẩu)
 * được phục vụ lại trong khi server đã là bản mới cần hai ô. Trang cũ gửi
 * `{password}` không kèm tên, server mới từ chối, và vì mã lỗi mới
 * (`WRONG_LOGIN`) không nằm trong danh sách trang cũ biết, nó rơi vào nhánh
 * mặc định và in ra đúng chữ của bản cũ: "Sai mật khẩu." Mật khẩu đúng,
 * người dùng bị khoá ngoài, còn màn hình thì đổ lỗi cho họ.
 *
 * Trang đăng nhập là trang DUY NHẤT không được phép cũ: nó là cái cửa, và
 * hình dạng dữ liệu nó gửi đi phải khớp với server đang chạy. Nó cũng không
 * có gì đáng để đệm - không ảnh nặng, không dữ liệu, mỗi lần vào một lần.
 *
 * Đặt ở middleware chứ không phải trong page: `export const dynamic` không
 * dùng được trong file `'use client'`, và làm ở đây thì mọi đường trong
 * `OPEN` đều được che cùng một lúc, kể cả đường thêm sau này.
 */
function noStore(res: NextResponse, pathname: string) {
  // `/api/session` là POST nên vốn không bị đệm; chặn thêm cũng vô hại, và
  // để một chỗ thì không có đường nào bị bỏ sót.
  if (pathname.startsWith('/api/')) return res;
  res.headers.set('Cache-Control', 'no-store, must-revalidate');
  return res;
}

function pass(req: NextRequest, user: string) {
  const headers = new Headers(req.headers);
  headers.set(USER_HEADER, user);
  return NextResponse.next({ request: { headers } });
}

/**
 * Cho đi tiếp nhưng XOÁ hẳn `USER_HEADER` - dùng cho những nhánh không xác
 * thực ai cả (trang đăng nhập, `/api/session`, `/api/auth/status`, và CORS
 * preflight).
 *
 * Các route đó hiện không đọc danh tính, nên đây chưa phải lỗ hổng - nhưng
 * để nguyên thì header do client tự gửi sẽ đi thẳng tới route, và ngày nào
 * có người thêm `currentUser()` vào một trong số đó thì nó thành đường leo
 * thang quyền, im lặng và không ai nhớ vì sao. Bất biến cần giữ là: KHÔNG
 * nhánh nào chuyển tiếp header của client.
 */
function strip(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete(USER_HEADER);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  /*
   * Mọi thứ trừ file tĩnh: bundle của Next, và bất cứ đường dẫn nào có đuôi
   * file. Chặn chúng thì chính trang đăng nhập cũng gãy - lần đầu viết cái
   * cổng này tôi chỉ chừa favicon với icon, và logo trên trang đăng nhập hiện
   * ra thành ô ảnh vỡ.
   *
   * Chặn theo đuôi file cũng an toàn hơn liệt kê từng tên: thêm một ảnh mới
   * vào public/ sau này sẽ không âm thầm làm hỏng trang đăng nhập nữa. Không có
   * route API nào mang đuôi file, nên chúng vẫn được gác đầy đủ.
   *
   * `js` có trong danh sách vì `/sw.js`, và đây là một lỗi ĐO ĐƯỢC chứ không
   * phải phòng xa: chưa đăng nhập thì `/sw.js` trả 307 về `/login`, mà một
   * script service worker bị CHUYỂN HƯỚNG là một lượt nạp HỎNG theo đúng đặc
   * tả — trình duyệt có thể gỡ luôn bản đăng ký. Đăng ký lần đầu thì vẫn
   * chạy (lúc đó có cookie), nên hỏng chỉ lộ ra ở lượt trình duyệt TỰ kiểm
   * tra bản mới sau khi phiên hết hạn: đăng ký biến mất và thông báo đẩy
   * lặng lẽ chết. Bundle của Next nằm dưới `_next/static` vốn đã được chừa,
   * và không route API nào có đuôi `.js`, nên đây không nới cổng cho thứ gì
   * khác. `public/sw.js` không mang bí mật nào (chỉ vẽ thông báo).
   */
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|webmanifest|js)$).*)',
  ],
};
