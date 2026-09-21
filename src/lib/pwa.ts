/**
 * Phần THUẦN của nút "Cài app" — không import gì, để test độc lập được
 * (cùng lý do `internals-pure.ts` và `daytrade.ts` tồn tại).
 *
 * ============================================================
 * VÌ SAO TRƯỚC ĐÓ KHÔNG CÓ CHỮ "CÀI APP" NÀO
 * ============================================================
 *
 * Chủ app báo: mở trang web không thấy đâu chữ install app. Đo lại repo thì
 * nguyên nhân rõ ràng và không phải chuyện giao diện:
 *
 *   1. **KHÔNG có web app manifest.** Không một trình duyệt nào coi trang
 *      này là cài được, nên không đời nào có lời mời cài. Đây là điều kiện
 *      TIÊN QUYẾT, thiếu nó thì mọi thứ khác vô nghĩa.
 *   2. **Service worker chỉ được đăng ký bên trong `AlertSettings`** — panel
 *      nằm trong tab My Portfolio của riêng chủ app — nên phần lớn lượt mở
 *      trang không đăng ký gì cả.
 *   3. Và ngay cả khi đủ điều kiện, **iOS KHÔNG BAO GIỜ tự mời**: Safari
 *      không có `beforeinstallprompt`, người dùng phải tự vào nút Chia sẻ.
 *
 * ============================================================
 * BỐN TRẠNG THÁI, VÀ KHÔNG CÁI NÀO ĐƯỢC TRÔNG GIỐNG CÁI NÀO
 * ============================================================
 *
 * Một cái nút "Cài app" bấm vào không ra gì là đúng thứ repo này cấm: nó
 * hiện y hệt một cái nút hỏng. Nên `verdictOf()` tách ra sáu kết luận, mỗi
 * cái ứng với một câu trả lời khác nhau cho người đọc:
 *
 *   `ready`       trình duyệt ĐÃ mời — bấm là cài, không cần chỉ dẫn gì.
 *   `insecure`    trang không chạy trên HTTPS — không trình duyệt nào cài.
 *   `no-manifest` manifest không tải được — lỗi của app, kèm mã HTTP thật.
 *   `ios`         iPhone/iPad: cài được nhưng phải tự bấm, chỉ đúng đường.
 *   `no-sw`       service worker chưa đăng ký.
 *   `browser`     đủ điều kiện nhưng trình duyệt này chưa/không mời.
 *
 * `browser` là cái quan trọng nhất và cũng là cái dễ bỏ qua nhất: Firefox
 * trên máy tính không hỗ trợ, Safari trên macOS dùng menu khác hẳn
 * (File → Add to Dock), còn Chrome đôi khi chờ người dùng ở lại trang một
 * lúc mới mời. Ba chuyện đó KHÔNG phải lỗi, nhưng nếu gộp hết vào một câu
 * "không cài được" thì người đọc đi sửa nhầm chỗ.
 */

export type Platform = 'ios' | 'android' | 'desktop';

/**
 * iPadOS từ bản 13 KHAI BÁO MÌNH LÀ MACINTOSH trong user agent — nên chỉ
 * tìm chữ "ipad" là bỏ sót toàn bộ iPad đời mới, và chúng lại đúng là loại
 * máy cần chỉ dẫn thủ công nhất. Dấu hiệu tách nó khỏi máy Mac thật là số
 * điểm chạm: Mac trả 0.
 */
export function platformOf(ua: string, maxTouchPoints = 0): Platform {
  const s = ua.toLowerCase();
  if (/iphone|ipod/.test(s)) return 'ios';
  if (/ipad/.test(s)) return 'ios';
  if (/macintosh/.test(s) && maxTouchPoints > 1) return 'ios';
  if (/android/.test(s)) return 'android';
  return 'desktop';
}

/**
 * Đang chạy như một app đã cài hay đang trong tab trình duyệt.
 *
 * Hai phép đo vì hai hệ nói hai kiểu: chuẩn là `display-mode: standalone`,
 * còn Safari trên iOS có `navigator.standalone` riêng và KHÔNG trả lời
 * `display-mode`. Thiếu vế thứ hai thì người dùng iPhone đã cài app rồi vẫn
 * thấy nút mời cài — một lời mời làm cái việc họ vừa làm xong.
 */
export function isStandalone(displayModeMatch: boolean, navStandalone?: boolean): boolean {
  return displayModeMatch || navStandalone === true;
}

/** Ba tiền đề, đo bằng chính trình duyệt đang mở. `null` = chưa đo xong. */
export type InstallChecks = {
  /** `window.isSecureContext`. */
  secure: boolean;
  /** `/manifest.webmanifest` tải được VÀ bóc ra được icon. */
  manifest: boolean;
  /** Lý do thật khi manifest hỏng (mã HTTP, lỗi bóc JSON). */
  manifestDetail: string | null;
  /** Đã có đăng ký service worker cho scope này chưa. */
  sw: boolean;
  swDetail: string | null;
};

export type InstallVerdict = 'ready' | 'insecure' | 'no-manifest' | 'ios' | 'no-sw' | 'browser';

/**
 * Thứ tự xét là phần load-bearing, không phải chi tiết.
 *
 * - `ready` đứng đầu vì trình duyệt ĐÃ tự kết luận là cài được; lúc đó mọi
 *   phép đo của ta chỉ là ý kiến thứ hai, và nói "thiếu service worker"
 *   trong khi nút cài đang hoạt động là nói dối.
 * - `insecure` đứng trước tất cả phần còn lại: không có HTTPS thì sửa
 *   manifest hay SW cũng vô ích.
 * - `ios` đứng TRƯỚC `no-sw` vì "Thêm vào MH chính" của iOS không cần
 *   service worker — báo thiếu SW ở đó là đẩy người đọc đi sửa một thứ
 *   không liên quan.
 */
export function verdictOf(opts: {
  hasPrompt: boolean;
  platform: Platform;
  checks: InstallChecks | null;
}): InstallVerdict {
  if (opts.hasPrompt) return 'ready';
  const c = opts.checks;
  if (c && !c.secure) return 'insecure';
  if (c && !c.manifest) return 'no-manifest';
  if (opts.platform === 'ios') return 'ios';
  if (c && !c.sw) return 'no-sw';
  return 'browser';
}

/**
 * Manifest có dùng được không, đọc từ chính thân file đã tải.
 *
 * Không chỉ nhìn HTTP 200: một trang đăng nhập trả về 200 kèm HTML cũng là
 * 200 (đúng hình dạng bẫy #130 ở vendor khác). Đòi bóc được JSON, có `name`
 * và có ít nhất một icon — ba thứ trình duyệt thật sự cần.
 */
export function manifestUsable(json: unknown): { ok: boolean; detail: string | null } {
  if (!json || typeof json !== 'object') return { ok: false, detail: 'không phải JSON' };
  const m = json as Record<string, unknown>;
  const name = typeof m.name === 'string' && m.name ? m.name : null;
  const icons = Array.isArray(m.icons) ? m.icons : [];
  if (!name) return { ok: false, detail: 'thiếu "name"' };
  if (!icons.length) return { ok: false, detail: 'thiếu "icons"' };
  const start = typeof m.start_url === 'string' ? m.start_url : null;
  if (!start) return { ok: false, detail: 'thiếu "start_url"' };
  const display = typeof m.display === 'string' ? m.display : '';
  if (!['standalone', 'fullscreen', 'minimal-ui'].includes(display)) {
    return { ok: false, detail: `display="${display || '(trống)'}" — trình duyệt chỉ cài khi standalone/fullscreen/minimal-ui` };
  }
  return { ok: true, detail: null };
}
