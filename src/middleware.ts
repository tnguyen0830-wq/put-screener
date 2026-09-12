import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, verifySession } from '@/lib/session';
import { OWNER, USER_HEADER, isOwnerOnly, knownUser, roleOf } from '@/lib/users';

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
const OPEN = ['/login', '/api/session', '/api/auth/status'];

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
    return strip(req);

  const user = await verifySession(req.cookies.get(COOKIE)?.value, password);
  // `knownUser` là chỗ một tài khoản bị gỡ khỏi APP_USERS thật sự mất quyền:
  // chữ ký của họ vẫn đúng suốt 30 ngày, chỉ cái tên là không còn tồn tại.
  if (user && knownUser(user)) {
    if (roleOf(user) !== 'owner' && isOwnerOnly(pathname)) {
      return NextResponse.json({ error: 'OWNER_ONLY' }, { status: 403 });
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
   */
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|webmanifest)$).*)',
  ],
};
