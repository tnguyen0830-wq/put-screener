import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { OWNER, currentUser, isValidName, type Role } from './users';

/**
 * Kho tài khoản người nhà: file trên đĩa, mật khẩu đã BĂM.
 *
 * #119 khai tài khoản bằng biến môi trường `APP_USERS="ten:matkhau,..."`.
 * Cách đó chạy được nhưng có hai điểm chủ app không chịu được lâu: thêm một
 * người là phải vào Render sửa biến rồi deploy lại, và mật khẩu nằm thô
 * trong bảng điều khiển Render. File này thay thế cả hai - quản lý ngay
 * trong app, và trên đĩa chỉ còn chuỗi băm.
 *
 * **Chỉ chạy được ở Node runtime.** `node:crypto` và `fs` đều không có trong
 * Edge, mà `middleware.ts` thì chạy Edge - nên middleware KHÔNG import file
 * này. Hệ quả quan trọng, xem chú thích ở `listUsers` bên dưới.
 *
 * Chủ app CỐ TÌNH không nằm trong file này. `APP_PASSWORD` vẫn là mật khẩu
 * của chủ app, vì nó là đường thoát hiểm: file hỏng, đĩa mất, hay một lỗi
 * trong chính màn hình quản lý tài khoản đều không được phép khoá chủ app
 * ra khỏi app của chính mình. Một hệ thống mà quản trị viên tự nhốt mình
 * được là một hệ thống sai.
 */

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

const FILE = () =>
  path.resolve(process.env.USERS_PATH || './.cache/users.json');

/** Tham số scrypt. N=16384 tốn ~16MB mỗi lần băm - đủ chậm để dò mật khẩu
 *  hàng loạt là vô vọng, đủ nhanh để đăng nhập không thấy độ trễ. */
const KEYLEN = 64;
const SALT_BYTES = 16;

export type StoredUser = {
  name: string;
  /** hex. Mỗi người một salt riêng, nên hai người trùng mật khẩu vẫn ra hai
   *  chuỗi băm khác nhau - nhìn vào file không suy ra được điều đó. */
  salt: string;
  /** hex của scrypt(password, salt). Mật khẩu thô KHÔNG bao giờ được ghi. */
  hash: string;
  createdAt: string;
  updatedAt: string;
  /** Mã đặt lại đang treo, nếu có. Xem `createResetCode`. */
  reset?: StoredReset;
};

/**
 * Mã đặt lại một lần, lưu y như mật khẩu: BĂM, salt riêng, không bao giờ
 * ghi mã thô. Một người cầm được file này vẫn không đặt lại được cho ai.
 */
export type StoredReset = {
  salt: string;
  hash: string;
  /** Epoch ms. Hết hạn là vô dụng, kể cả khi gõ đúng. */
  expiresAt: number;
  createdAt: string;
};

type Store = { users: StoredUser[] };

async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE(), 'utf8'));
    if (parsed && Array.isArray(parsed.users)) return parsed as Store;
  } catch {
    /* chưa có file, hoặc file hỏng - cả hai đều coi như chưa có ai */
  }
  return { users: [] };
}

async function writeStore(store: Store): Promise<void> {
  const file = FILE();
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Ghi ra file tạm rồi đổi tên: nửa chừng mất điện sẽ để lại file cũ
  // nguyên vẹn thay vì một file JSON cụt làm mọi người nhà mất tài khoản.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const buf = await scrypt(password, salt, KEYLEN);
  return buf.toString('hex');
}

/**
 * Đọc `APP_USERS` (định dạng của #119) để MỒI file lần đầu.
 *
 * Chạy đúng một lần: ngay khi file được ghi ra, `readStore()` có dữ liệu và
 * hàm này không bao giờ chạy lại. Nhờ vậy cấu hình sẵn có của chủ app tự
 * chuyển sang kho mới mà không phải gõ lại mật khẩu của ai, và từ đó trở đi
 * `APP_USERS` bị bỏ qua hoàn toàn - một nguồn sự thật, không phải hai.
 */
async function seedFromEnv(): Promise<StoredUser[]> {
  const raw = process.env.APP_USERS;
  if (!raw) return [];

  const now = new Date().toISOString();
  const seeded: StoredUser[] = [];
  const seen = new Set<string>();
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    const i = trimmed.indexOf(':');
    if (i < 1) continue;
    const name = trimmed.slice(0, i).trim().toLowerCase();
    const password = trimmed.slice(i + 1);
    if (!password || !isValidName(name) || name === OWNER || seen.has(name)) continue;
    seen.add(name);
    const salt = randomBytes(SALT_BYTES).toString('hex');
    seeded.push({
      name,
      salt,
      hash: await hashPassword(password, salt),
      createdAt: now,
      updatedAt: now,
    });
  }
  if (seeded.length) await writeStore({ users: seeded });
  return seeded;
}

async function load(): Promise<StoredUser[]> {
  const store = await readStore();
  if (store.users.length) return store.users;
  return seedFromEnv();
}

/**
 * Danh sách tài khoản người nhà, KHÔNG kèm mật khẩu hay chuỗi băm.
 *
 * Lưu ý cho người đọc sau: `middleware.ts` không gọi được hàm này (Edge,
 * không có fs). Nên cổng ở middleware chỉ xác thực chữ ký cookie và chặn
 * theo VAI TRÒ - cả hai đều suy ra được từ chính cookie đã ký. Việc kiểm
 * tra "tài khoản này còn tồn tại không" nằm ở `requireUser()` phía Node.
 */
export type ListedUser = {
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Đang có mã đặt lại còn hạn hay không. Chỉ CÓ/KHÔNG và hạn dùng -
   *  không bao giờ kèm mã hay chuỗi băm, kể cả cho chủ app. */
  resetExpiresAt?: number;
};

export async function listUsers(): Promise<ListedUser[]> {
  const now = Date.now();
  const users = await load();
  return users
    .map(({ name, createdAt, updatedAt, reset }) => ({
      name,
      createdAt,
      updatedAt,
      // Mã đã quá hạn coi như không có: hiện nó lên chỉ làm chủ app tưởng
      // người nhà vẫn dùng được, rồi ngồi chờ một cuộc gọi không tới.
      ...(reset && reset.expiresAt > now ? { resetExpiresAt: reset.expiresAt } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function userExists(name: string): Promise<boolean> {
  if (name === OWNER) return true;
  return (await load()).some((u) => u.name === name);
}

/**
 * Mật khẩu này có đúng của người này không.
 *
 * So bằng `timingSafeEqual` trên chuỗi băm: so bằng `===` sẽ dừng ở byte
 * đầu tiên khác nhau, và thời gian đó đo được từ bên ngoài.
 */
export async function verifyPassword(
  name: string,
  password: string
): Promise<boolean> {
  const user = (await load()).find((u) => u.name === name);
  if (!user) {
    // Vẫn băm một lần rồi mới trả false: thoát ngay sẽ khiến "tên không tồn
    // tại" trả lời nhanh hơn hẳn "tên đúng, mật khẩu sai", tức là lộ tên nào
    // có thật chỉ bằng đồng hồ bấm giờ.
    await hashPassword(password, 'khong-co-tai-khoan-nay');
    return false;
  }
  const expected = Buffer.from(user.hash, 'hex');
  const actual = Buffer.from(await hashPassword(password, user.salt), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export type UserWriteError =
  | 'invalid-name'
  | 'reserved-name'
  | 'duplicate-name'
  | 'weak-password'
  | 'not-found';

/** Ngắn hơn thì một người ngồi đoán cũng ra. Không ép ký tự đặc biệt: quy
 *  tắc rườm rà đẩy người ta đi viết mật khẩu ra giấy dán màn hình. */
const MIN_PASSWORD = 8;

export async function createUser(
  name: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: UserWriteError }> {
  const clean = name.trim().toLowerCase();
  if (!isValidName(clean)) return { ok: false, error: 'invalid-name' };
  if (clean === OWNER) return { ok: false, error: 'reserved-name' };
  if (password.length < MIN_PASSWORD) return { ok: false, error: 'weak-password' };

  const users = await load();
  if (users.some((u) => u.name === clean)) {
    return { ok: false, error: 'duplicate-name' };
  }

  const now = new Date().toISOString();
  const salt = randomBytes(SALT_BYTES).toString('hex');
  users.push({
    name: clean,
    salt,
    hash: await hashPassword(password, salt),
    createdAt: now,
    updatedAt: now,
  });
  await writeStore({ users });
  return { ok: true };
}

export async function setPassword(
  name: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: UserWriteError }> {
  if (password.length < MIN_PASSWORD) return { ok: false, error: 'weak-password' };

  const users = await load();
  const user = users.find((u) => u.name === name);
  if (!user) return { ok: false, error: 'not-found' };

  // Salt mới mỗi lần đổi mật khẩu, không dùng lại salt cũ.
  user.salt = randomBytes(SALT_BYTES).toString('hex');
  user.hash = await hashPassword(password, user.salt);
  user.updatedAt = new Date().toISOString();
  await writeStore({ users });
  return { ok: true };
}

export async function deleteUser(
  name: string
): Promise<{ ok: true } | { ok: false; error: UserWriteError }> {
  const users = await load();
  const next = users.filter((u) => u.name !== name);
  if (next.length === users.length) return { ok: false, error: 'not-found' };
  await writeStore({ users: next });
  return { ok: true };
}

/**
 * Tên + mật khẩu này là của ai? `null` nếu không khớp.
 *
 * Chủ app xử lý riêng và trước tiên: tên của chủ app lấy từ
 * `APP_OWNER_USER` (mặc định `owner`), mật khẩu là `APP_PASSWORD`.
 */
export async function authenticate(
  name: string,
  password: string
): Promise<{ name: string; role: Role } | null> {
  const clean = name.trim().toLowerCase();
  if (!clean || !password) return null;

  if (clean === ownerName()) {
    const expected = process.env.APP_PASSWORD;
    if (!expected) return null;
    const a = Buffer.from(await hashPassword(password, 'chu-app'), 'hex');
    const b = Buffer.from(await hashPassword(expected, 'chu-app'), 'hex');
    return timingSafeEqual(a, b) ? { name: OWNER, role: 'owner' } : null;
  }

  return (await verifyPassword(clean, password))
    ? { name: clean, role: 'member' }
    : null;
}

/* ------------------------------------------------------------------ *
 * Mã đặt lại mật khẩu
 * ------------------------------------------------------------------ */

/**
 * Bảng chữ cái của mã: KHÔNG có I, L, O, 0, 1.
 *
 * Mã này để chủ app đọc cho người nhà nghe qua điện thoại, hoặc nhắn qua
 * tin nhắn rồi gõ lại bằng tay. Cặp O/0 và I/1/l là nguồn gõ sai lớn nhất
 * trong việc đó, và một mã gõ sai thì không phân biệt được với mã bịa -
 * người dùng chỉ thấy "sai mã" và không hiểu vì sao.
 */
const RESET_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RESET_LEN = 8;

/**
 * 30 phút. Đủ để gọi một cuộc điện thoại rồi gõ, ngắn tới mức một mã lọt ra
 * ngoài (chụp màn hình, tin nhắn để quên) không còn giá trị vào hôm sau.
 */
const RESET_TTL_MS = 30 * 60 * 1000;

/**
 * Sinh mã ngẫu nhiên KHÔNG lệch phân phối.
 *
 * `randomBytes(n) % 31` nghe thì gọn nhưng 256 không chia hết cho 31, nên
 * các chữ cái đầu bảng sẽ ra thường xuyên hơn - mã mất entropy một cách
 * lặng lẽ. Lấy mẫu có loại bỏ (bỏ mọi byte >= 248 = 31*8) thì mỗi chữ cái
 * có xác suất bằng nhau, và vòng lặp gần như luôn dừng ngay.
 */
function randomCode(): string {
  const limit = Math.floor(256 / RESET_ALPHABET.length) * RESET_ALPHABET.length;
  let out = '';
  while (out.length < RESET_LEN) {
    for (const b of randomBytes(RESET_LEN)) {
      if (b >= limit) continue;
      out += RESET_ALPHABET[b % RESET_ALPHABET.length];
      if (out.length === RESET_LEN) break;
    }
  }
  return out;
}

/** Gõ sao cũng nhận: thường/hoa, có gạch hay không, thừa khoảng trắng. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Chia đôi cho dễ đọc: `ABCD-EFGH`. Chỉ để hiện lên màn hình. */
export const formatCode = (code: string) =>
  `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * Tạo mã đặt lại cho một người nhà. Trả về mã THÔ đúng một lần.
 *
 * Sau lời gọi này không ai đọc lại được nữa - trên đĩa chỉ còn chuỗi băm -
 * nên nếu chủ app làm mất mã thì tạo mã mới, chứ không có chỗ nào xem lại.
 * Đó là chủ ý: một mã xem lại được thì nó không còn là mã dùng một lần.
 *
 * **CHỦ APP KHÔNG BAO GIỜ CÓ MÃ ĐẶT LẠI.** Đây là ranh giới quan trọng
 * nhất của cả tính năng này. Cửa tiêu thụ mã (`/api/password-reset`) mở cho
 * cả Internet vì người quên mật khẩu thì chưa đăng nhập được. Nếu mã đó đặt
 * lại được mật khẩu chủ app, thì một mã lọt ra ngoài không chỉ mất một tài
 * khoản phụ - nó trao cả tab danh mục, tức vị thế Schwab thật. Chủ app quên
 * mật khẩu thì đổi `APP_PASSWORD` trên Render, xem DEPLOY.md.
 */
export async function createResetCode(
  name: string
): Promise<
  | { ok: true; code: string; expiresAt: number }
  | { ok: false; error: UserWriteError }
> {
  const clean = name.trim().toLowerCase();
  if (clean === OWNER) return { ok: false, error: 'reserved-name' };

  const users = await load();
  const user = users.find((u) => u.name === clean);
  if (!user) return { ok: false, error: 'not-found' };

  const code = randomCode();
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const expiresAt = Date.now() + RESET_TTL_MS;
  user.reset = {
    salt,
    hash: await hashPassword(code, salt),
    expiresAt,
    createdAt: new Date().toISOString(),
  };
  // KHÔNG đụng vào updatedAt: cột đó trên màn hình có nghĩa "lần đổi mật
  // khẩu gần nhất". Tạo mã chưa đổi gì cả - ghi vào đó là nói dối.
  await writeStore({ users });
  return { ok: true, code, expiresAt };
}

/** Gỡ mã đang treo. Dùng khi chủ app đổi ý, và sau khi mã đã tiêu thụ. */
export async function clearResetCode(
  name: string
): Promise<{ ok: true } | { ok: false; error: UserWriteError }> {
  const users = await load();
  const user = users.find((u) => u.name === name.trim().toLowerCase());
  if (!user) return { ok: false, error: 'not-found' };
  delete user.reset;
  await writeStore({ users });
  return { ok: true };
}

export type ResetError = 'bad-code' | 'expired' | 'weak-password';

/**
 * Dùng mã để đặt mật khẩu mới. Mã tiêu thụ luôn, đúng hay sai đều không
 * dùng lại được lần hai khi đã đúng.
 *
 * **Vì sao `expired` được nói thẳng, còn mọi thứ khác gộp vào `bad-code`.**
 * Cửa này ai cũng gọi được, nên nguyên tắc chung của app là không tiết lộ
 * tên nào có thật. Vì vậy: không có tên đó, tên đúng mà chưa phát mã, hay
 * mã sai - cả ba trả về đúng một câu. Nhưng nói "mã đã hết hạn" thì chỉ nói
 * được cho người ĐÃ gõ đúng mã, tức là người vốn đã cầm mã trong tay; họ
 * không biết thêm gì cả. Đổi lại, người nhà biết là mình gõ đúng và chỉ cần
 * xin mã mới, thay vì ngồi gõ lại mãi một mã đã chết.
 *
 * Tên không tồn tại vẫn chạy một lần băm giả, để thời gian trả lời không
 * tố cáo tên nào có thật - cùng lý do với `verifyPassword`.
 */
export async function redeemResetCode(
  name: string,
  code: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: ResetError }> {
  const clean = name.trim().toLowerCase();
  const given = normalizeCode(code);
  const users = await load();
  const user = clean === OWNER ? undefined : users.find((u) => u.name === clean);

  if (!user?.reset) {
    await hashPassword(given || 'x', 'khong-co-nguoi-nay');
    return { ok: false, error: 'bad-code' };
  }

  const expected = Buffer.from(user.reset.hash, 'hex');
  const actual = Buffer.from(await hashPassword(given, user.reset.salt), 'hex');
  const match =
    expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!match) return { ok: false, error: 'bad-code' };

  if (Date.now() > user.reset.expiresAt) {
    // Mã đúng nhưng đã chết: dọn đi luôn, đừng để nằm lại chờ đúng lúc
    // đồng hồ bị chỉnh hay ai đó thử lại.
    delete user.reset;
    await writeStore({ users });
    return { ok: false, error: 'expired' };
  }

  // Kiểm tra mật khẩu mới SAU khi mã đã đúng: sai độ dài thì mã vẫn còn
  // nguyên để gõ lại, chứ không mất mã vì một lỗi gõ của chính mình.
  if (password.length < MIN_PASSWORD) return { ok: false, error: 'weak-password' };

  user.salt = randomBytes(SALT_BYTES).toString('hex');
  user.hash = await hashPassword(password, user.salt);
  user.updatedAt = new Date().toISOString();
  delete user.reset;
  await writeStore({ users });
  return { ok: true };
}

/**
 * Tên đăng nhập của chủ app. Đổi được bằng `APP_OWNER_USER` cho ai không
 * muốn gõ "owner", nhưng bên trong hệ thống chủ app LUÔN là hằng `OWNER` -
 * nếu để tên tuỳ chỉnh chạy lẫn vào cookie và vào khoá watchlist thì đổi
 * biến môi trường sau này sẽ làm mất dữ liệu đang gắn với tên cũ.
 */
export function ownerName(): string {
  const custom = process.env.APP_OWNER_USER?.trim().toLowerCase();
  return custom && isValidName(custom) ? custom : OWNER;
}

/**
 * Danh tính của người đang gọi, ĐÃ kiểm tra tài khoản còn tồn tại.
 *
 * Thay cho `currentUser()` ở mọi route cần biết ai đang gọi. Lý do tách ra
 * chứ không sửa thẳng `currentUser()`: hàm đó nằm trong `users.ts`, phải
 * chạy được ở Edge cho `middleware.ts`, mà kiểm tra tồn tại thì phải đọc
 * đĩa - một thứ Edge không làm được.
 *
 * Đây chính là chỗ một tài khoản vừa bị xoá mất quyền: cookie của họ còn
 * chữ ký hợp lệ và middleware vẫn cho qua, nhưng route hỏi tới đây thì
 * không còn ai tên đó nữa.
 */
export async function requireUser(
  req: { headers: { get(name: string): string | null } }
): Promise<string | null> {
  const name = currentUser(req);
  return (await userExists(name)) ? name : null;
}
