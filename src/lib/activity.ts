import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tab } from './tabs';

/**
 * Nhật ký hoạt động: ai đang mở app, và đã dùng những gì.
 *
 * Chủ app đặt hàng sau khi tạo tài khoản cho người nhà: "tôi muốn có thêm
 * phần thông báo để coi member đang sử dụng và đã sử dụng gì trong app".
 * Hai câu hỏi khác nhau nên có HAI kho khác nhau, không gộp:
 *
 *  - `activity-presence.json` — ĐANG dùng. Một Ô cho mỗi người: lần cuối
 *    thấy mặt và tab đang mở, GHI ĐÈ. Trình duyệt tự báo nhịp.
 *  - `activity.log` — ĐÃ dùng. Một dòng JSON cho mỗi việc, NỐI THÊM vào
 *    cuối file.
 *
 * Gộp hai thứ này vào một danh sách là sai ở chỗ: nhịp báo "vẫn đang mở tab
 * Heatmap" xảy ra hàng chục lần một giờ và sẽ nhấn chìm những việc thật sự
 * đáng đọc (quét cả rổ, gọi Claude, tổng hợp giọng nói) — đúng hình dạng
 * Form 4 nhấn chìm 8-K ở #148, chỉ khác nguồn.
 *
 * ## Vì sao NỐI THÊM chứ không giữ trong RAM — một phép ĐO, không phải sở thích
 *
 * Bản đầu giữ cả nhật ký trong RAM và ghi đĩa có giãn nhịp. Nó SAI, và đo
 * ra được: `next start` đóng gói MỖI route thành một bundle riêng, và
 * webpack NHÉT HẲN một bản sao của module này vào từng bundle (kiểm bằng
 * cách grep chuỗi "activity.log" trong các file route.js dưới
 * `.next/server/app/api` — nó nằm trong bundle của cả `api/activity`,
 * `api/users/activity` lẫn `api/watchlist`, mỗi nơi một bản). Tức trạng thái
 * cấp module KHÔNG dùng chung giữa các route: mỗi route có kho RAM riêng,
 * và một lượt ghi cả file từ route này sẽ ĐÈ MẤT sự kiện route kia vừa ghi.
 * Triệu chứng bắt được: xoá tài khoản (route `/api/users`) rồi đọc nhật ký
 * (route `/api/users/activity`) vẫn thấy người đó "đang mở app".
 *
 * Cách chữa là bỏ hẳn kho RAM: mỗi sự kiện là một lần `appendFile` (cờ
 * `O_APPEND`, nên nhiều route cùng ghi vẫn nối đuôi nhau chứ không giẫm lên
 * nhau), và phép GỘP/CẮT chuyển sang lúc ĐỌC. Cùng lối `scan-store.ts`,
 * `lt-store.ts`, `userstore.ts`, `watchlist.ts` — đọc-sửa-ghi từng lượt,
 * không ai giữ trạng thái cấp module qua nhiều route.
 *
 * Trạng thái cấp module CHỈ còn dùng ở những chỗ mà mọi lượt gọi đi qua
 * ĐÚNG MỘT route (`loginPingDue` — chỉ `/api/session` gọi). Đó là chỗ nó
 * đúng; đừng mở rộng.
 *
 * **Ghi ở SERVER, không tin client.** Mọi sự kiện tốn tiền/hạn mức đều được
 * ghi trong chính route làm việc đó, và danh tính lấy từ header middleware
 * gắn (`currentUser`), không phải từ body. Client chỉ được phép nói đúng
 * một thứ: nó đang mở tab nào — và tab đó phải nằm trong danh sách cho phép
 * (`lib/tabs.ts`).
 *
 * **Không có biến môi trường mới**: đường dẫn suy ra từ THƯ MỤC của
 * `SCAN_PATH`, đúng lối `lt-store.ts`. Render KHÔNG tự thêm biến mới vào
 * service đã tạo, nên một biến mới là một bước tay dễ quên — quên thì nhật
 * ký rơi vào thư mục build và biến mất sau mỗi lần deploy, trong khi màn
 * hình vẫn hiện một danh sách trống trông y như "người nhà chưa dùng gì".
 */

const DIR = () => path.dirname(process.env.SCAN_PATH || './.cache/last-scan.json');
const LOG_FILE = () => path.join(DIR(), 'activity.log');
const PRESENCE_FILE = () => path.join(DIR(), 'activity-presence.json');

export type ActKind =
  /* Ra vào */
  | 'login'
  | 'logout'
  | 'tab'
  /* Tốn hạn mức Schwab */
  | 'scan'
  | 'ltscan'
  | 'patscan'
  | 'daytrade'
  | 'analyze'
  /* Tốn tiền Anthropic */
  | 'why'
  | 'ai'
  | 'brief'
  | 'translate'
  | 'learn'
  | 'patai'
  /* Tốn ký tự ElevenLabs */
  | 'tts'
  /* Đổi trạng thái */
  | 'watchlist';

export type ActEvent = {
  /** ISO. Lần GẦN NHẤT của cụm, nếu đã gộp. */
  at: string;
  user: string;
  kind: ActKind | string;
  /** Mã cổ phiếu, phạm vi quét, số ký tự... tuỳ loại. */
  detail?: string;
  /** Số lần đã gộp. Chỉ có khi > 1 — một dòng không có `n` là đúng một lần. */
  n?: number;
};

export type Presence = { at: string; tab: Tab | null };

export type ActivitySnapshot = {
  events: ActEvent[];
  presence: Record<string, Presence>;
};

/* Gộp hai sự kiện GIỐNG HỆT nhau (cùng người, cùng loại, cùng chi tiết) xảy
   ra sát nhau thành một dòng có số đếm. Mở tab Analyze rồi bấm lại cùng một
   mã năm lần trong ba phút là MỘT việc, không phải năm — và năm dòng giống
   nhau đẩy bốn việc khác ra khỏi màn hình. */
const MERGE_MS = 10 * 60_000;

/* Trần theo TỪNG NGƯỜI trước, rồi mới tới trần tổng: chủ app dùng app cả
   ngày, nên một trần tổng đơn độc sẽ để hoạt động của chủ app đẩy sạch hoạt
   động của người nhà ra ngoài — đúng thứ màn hình này sinh ra để xem. */
const MAX_PER_USER = 200;
const MAX_TOTAL = 800;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** File nối thêm mãi thì phải có lúc dọn. Dọn ở đường GHI (một lệnh `stat`,
 *  rẻ) chứ không chỉ ở đường ĐỌC: chủ app có thể không mở màn hình Hoạt động
 *  hàng tuần, và một file lớn dần vô hạn trên đĩa /var/data là một quả bom
 *  hẹn giờ im lặng. */
const MAX_BYTES = 512 * 1024;

/** Nhịp báo dày hơn mức này bị bỏ qua khi tab KHÔNG đổi — một tab mở suốt
 *  ngày không đáng ghi lại mỗi lần. Đổi tab thì luôn được ghi ngay. */
const PRESENCE_MIN_MS = 20_000;

/** Bao lâu không thấy nhịp thì coi là đã rời đi. */
export const ONLINE_MS = 5 * 60_000;

/* ------------------------------ phần thuần ------------------------------ */

/**
 * Gộp những cụm GIỐNG HỆT nhau nằm LIỀN NHAU. Đầu vào phải đã xếp MỚI NHẤT
 * TRƯỚC.
 *
 * Chỉ gộp khi liền nhau, cố ý: có một việc khác chen vào giữa thì hai cụm
 * cùng loại phải là hai dòng, nếu không thứ tự thời gian trên màn hình nói
 * dối.
 */
export function collapseRuns(events: readonly ActEvent[], mergeMs = MERGE_MS): ActEvent[] {
  const out: ActEvent[] = [];
  for (const e of events) {
    const head = out[out.length - 1];
    if (
      head &&
      head.user === e.user &&
      head.kind === e.kind &&
      head.detail === e.detail &&
      new Date(head.at).getTime() - new Date(e.at).getTime() < mergeMs
    ) {
      head.n = (head.n ?? 1) + 1;
      continue;
    }
    out.push({ ...e });
  }
  return out;
}

/** Cắt theo tuổi, rồi theo từng người, rồi theo tổng. Giữ nguyên thứ tự. */
export function pruneEvents(events: readonly ActEvent[], now = Date.now()): ActEvent[] {
  const perUser = new Map<string, number>();
  const kept: ActEvent[] = [];
  for (const e of events) {
    const t = new Date(e.at).getTime();
    /* Dấu thời gian hỏng (NaN) bị loại: để lại thì nó sống mãi vì mọi phép
       so sánh với NaN đều false, và nó chiếm chỗ của một dòng thật. */
    if (!Number.isFinite(t) || now - t > MAX_AGE_MS) continue;
    const n = (perUser.get(e.user) ?? 0) + 1;
    if (n > MAX_PER_USER) continue;
    perUser.set(e.user, n);
    kept.push(e);
    if (kept.length >= MAX_TOTAL) break;
  }
  return kept;
}

/** Bóc từng dòng JSONL. Dòng hỏng bị BỎ QUA chứ không làm chết cả file: một
 *  lượt ghi bị cắt giữa chừng (server bị giết) không được phép xoá sạch
 *  lịch sử của mọi người. */
export function parseLog(text: string): ActEvent[] {
  const out: ActEvent[] = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const e = JSON.parse(s);
      if (e && typeof e.at === 'string' && typeof e.user === 'string' && typeof e.kind === 'string') {
        out.push(e as ActEvent);
      }
    } catch {
      /* dòng cụt hoặc rác — bỏ */
    }
  }
  return out;
}

/* ------------------------------ ghi ------------------------------------- */

async function appendEvent(ev: ActEvent): Promise<void> {
  const file = LOG_FILE();
  await fs.mkdir(path.dirname(file), { recursive: true });
  /* `appendFile` mở với cờ 'a' (O_APPEND): nhiều route cùng ghi thì hệ điều
     hành nối đuôi nhau, không ai đè ai. Đây chính là thứ kho RAM không làm
     được — xem phép đo ở đầu file. */
  await fs.appendFile(file, JSON.stringify(ev) + '\n');
  await compactIfBig(file);
}

async function compactIfBig(file: string): Promise<void> {
  try {
    const st = await fs.stat(file);
    if (st.size <= MAX_BYTES) return;
    const events = parseLog(await fs.readFile(file, 'utf8'));
    /* Xếp mới nhất trước để cắt, rồi ghi lại theo thứ tự CŨ TRƯỚC — file
       này là nhật ký nối thêm, thứ tự trên đĩa phải luôn là thứ tự thời
       gian. KHÔNG gộp lúc dọn: gộp là việc của lúc đọc, và gộp rồi ghi
       xuống sẽ làm mất dấu thời gian của từng lần. */
    const kept = pruneEvents([...events].reverse()).reverse();
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, kept.map((e) => JSON.stringify(e)).join('\n') + '\n');
    await fs.rename(tmp, file);
  } catch {
    /* Dọn hỏng thì lần sau dọn lại; không được làm chết lượt ghi. */
  }
}

/**
 * Ghi một việc đã làm.
 *
 * Không bao giờ ném: mọi nơi gọi đều là đường đi chính của một tính năng
 * thật, và một cái nhật ký hỏng không đáng làm hỏng tính năng đó.
 */
export async function logActivity(
  user: string,
  kind: ActKind,
  detail?: string
): Promise<void> {
  try {
    const ev: ActEvent = { at: new Date().toISOString(), user, kind };
    if (detail) ev.detail = detail.slice(0, 80);
    await appendEvent(ev);
  } catch {
    /* im lặng, có chủ ý — xem trên */
  }
}

async function readPresence(): Promise<Record<string, Presence>> {
  try {
    const j = JSON.parse(await fs.readFile(PRESENCE_FILE(), 'utf8'));
    return j && typeof j === 'object' ? (j as Record<string, Presence>) : {};
  } catch {
    return {};
  }
}

async function writePresence(p: Record<string, Presence>): Promise<void> {
  const file = PRESENCE_FILE();
  await fs.mkdir(path.dirname(file), { recursive: true });
  /* Ghi tạm rồi đổi tên, cùng lý do `lt-store.ts`/`userstore.ts`: sập giữa
     chừng thì file cũ còn nguyên, chứ không để lại JSON cụt mà lượt đọc sau
     sẽ hiểu thành "không có ai đang mở app". */
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(p));
  await fs.rename(tmp, file);
}

/**
 * Nhịp báo "tôi đang mở tab X".
 *
 * Ghi một dòng vào nhật ký CHỈ KHI tab thật sự đổi. Nhịp lặp lại trên cùng
 * một tab chỉ dời `at` — đó là thứ trả lời câu "đang dùng", và nó là một ô
 * ghi đè chứ không phải một dòng mới.
 */
export async function touchPresence(user: string, tab: Tab): Promise<void> {
  try {
    const all = await readPresence();
    const prev = all[user];
    const now = Date.now();
    const changed = prev?.tab !== tab;
    if (!changed && prev && now - new Date(prev.at).getTime() < PRESENCE_MIN_MS) return;
    all[user] = { at: new Date(now).toISOString(), tab };
    await writePresence(all);
    if (changed) {
      await appendEvent({ at: new Date(now).toISOString(), user, kind: 'tab', detail: tab });
    }
  } catch {
    /* như trên */
  }
}

/** Đăng xuất hoặc bị xoá tài khoản: xoá ô "đang dùng" để màn hình không giữ
 *  người đã đi. LỊCH SỬ giữ nguyên — việc họ đã làm vẫn là việc đã xảy ra. */
export async function clearPresence(user: string): Promise<void> {
  try {
    const all = await readPresence();
    if (!(user in all)) return;
    delete all[user];
    await writePresence(all);
  } catch {
    /* như trên */
  }
}

/* ------------------------------ đọc ------------------------------------- */

export async function readActivity(): Promise<ActivitySnapshot> {
  let raw: ActEvent[] = [];
  try {
    raw = parseLog(await fs.readFile(LOG_FILE(), 'utf8'));
  } catch {
    /* Chưa có file = chưa ghi được gì. Màn hình nói rõ "nhật ký bắt đầu từ
       lần deploy này" nên một danh sách rỗng ở đây không bị đọc thành
       "người nhà chưa dùng gì". */
  }
  /* File là CŨ TRƯỚC; màn hình cần MỚI TRƯỚC. Gộp trước rồi mới cắt, để
     một cụm 50 lần giống hệt nhau chỉ chiếm ĐÚNG MỘT chỗ trong trần chứ
     không ăn hết 50. */
  const events = pruneEvents(collapseRuns(raw.reverse()));
  return { events, presence: await readPresence() };
}

/* ------------------------------ báo Telegram ---------------------------- */

/**
 * Dòng chữ gửi sang Telegram khi người nhà đăng nhập. Thuần, để kiểm được
 * bằng test — phần gửi đi thì không (api.telegram.org bị chặn từ sandbox).
 *
 * TÊN ĐẶT TRONG DẤU NHÁY NGƯỢC, và đó không phải chuyện thẩm mỹ: Telegram
 * đọc `_` là in nghiêng ở chế độ Markdown, nên một tên hợp lệ như `vo_1`
 * (dấu gạch dưới nằm trong `NAME_RE`) sẽ để lại một thực thể không đóng và
 * Telegram TỪ CHỐI CẢ TIN NHẮN — tức mất thông báo một cách im lặng, đúng
 * kiểu hỏng mà cả repo này chống. Trong dấu nháy ngược thì mọi ký tự là
 * chữ thường.
 *
 * Giờ in theo New York, cùng múi giờ mọi thứ khác trong app tính theo phiên
 * giao dịch: server Render chạy UTC, nên in giờ máy chủ là in một con số
 * không khớp đồng hồ nào chủ app đang nhìn.
 */
export function loginNotice(user: string, ip: string, at = Date.now()): string {
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(at));
  return `👤 *Người nhà đăng nhập*\n\`${user}\` · ${hhmm} giờ New York · IP ${ip}`;
}

/**
 * Có nên nhắn Telegram cho lần đăng nhập này không.
 *
 * Phiên của người nhà sống 7 ngày nên đăng nhập vốn hiếm — nhưng một cái
 * điện thoại xoay vòng đăng nhập vì lỗi nào đó sẽ biến kênh Telegram (kênh
 * CHÍNH của cảnh báo danh mục) thành chỗ ồn, và một hộp thư kêu suốt là một
 * hộp thư bị bỏ qua.
 *
 * Nhớ trong RAM, và ở ĐÂY thì điều đó ĐÚNG: mọi lượt đăng nhập đều đi qua
 * đúng một route (`/api/session`), nên chỉ có một bản sao module này được
 * dùng — khác hẳn nhật ký, thứ bị nhiều route cùng ghi (xem phép đo ở đầu
 * file). Server khởi động lại thì cùng lắm nhắn thừa một cái.
 */
const LOGIN_PING_MS = 30 * 60_000;
const lastLoginPing = new Map<string, number>();

export function loginPingDue(user: string, now = Date.now()): boolean {
  const prev = lastLoginPing.get(user);
  if (prev !== undefined && now - prev < LOGIN_PING_MS) return false;
  lastLoginPing.set(user, now);
  return true;
}
