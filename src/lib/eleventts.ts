import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { cleanForSpeech } from './tts';

/**
 * ElevenLabs — giọng đọc AI cho bản tóm tắt tab Tin tức.
 *
 * Chủ app: "Giọng đọc không tự nhiên, tôi muốn giọng thiệt hơn" — giọng của
 * trình duyệt (#182) là giọng máy đời cũ, code không sửa được; giọng tự
 * nhiên phải là giọng neural từ một dịch vụ có key, tính tiền theo KÝ TỰ.
 * Chủ app chọn ElevenLabs trong ba lựa chọn (OpenAI, Google, ElevenLabs).
 *
 * ============================================================
 * CHƯA ĐO. `api.elevenlabs.io` bị proxy từ chối ở CONNECT từ sandbox
 * (đo 2026-09-19), nên mọi tên endpoint/trường ở đây là tài liệu NHỚ ĐƯỢC —
 * và tài liệu nhớ được đã sai ba lần ở repo này (#130, #106, tastytrade
 * header). Hai chốt chặn: `/api/ttsprobe` in HÌNH DẠNG thật (khoá, hạn mức,
 * danh sách giọng) để sửa theo cái đo được; và mọi lỗi mang theo mã trạng
 * thái + 200 ký tự đầu thân, đứng trước (#102).
 * ============================================================
 *
 * Ba quyết định về TIỀN, vì ElevenLabs tính theo ký tự và gói miễn phí chỉ
 * 10.000 ký tự/tháng (~5 bản tóm tắt):
 *  - **Cache audio trên đĩa theo băm (văn bản + giọng + model)**. Bản tóm
 *    tắt đã cache 20 phút phía server (#181) nên cùng văn bản quay lại rất
 *    thường; hai người trong nhà cùng bấm Nghe là MỘT lần trả tiền, bấm lại
 *    là 0. `.cache/` mất được khi deploy — đúng tài liệu repo, chấp nhận.
 *  - **Trần 8.000 ký tự mỗi lượt (sau khi đã dọn Markdown)** — SỬA từ 4.000
 *    sau khi chủ app đo được trần cũ SAI ngay trong ngày đầu: prompt xin
 *    "300-450 từ" nhưng một bản tóm tắt thật (hai cột 80/70 tiêu đề) dễ dàng
 *    vượt 4.000 ký tự với đủ tiêu đề Tổng quan/Thị trường/Chính trị/Cần để
 *    ý — HTTP 413 trên chính nút Nghe, đúng con số "~2.500" ghi ở đây trước
 *    đó là một phỏng đoán không đo, không phải sự thật. Văn bản DÀI HƠN trần
 *    vẫn bị TỪ CHỐI chứ không cắt lặng lẽ (một bản đọc thiếu đoạn cuối trông
 *    y hệt bản đủ) — chỉ con số trần được sửa theo bằng chứng thật, và
 *    trần được đo trên văn bản ĐÃ QUA `cleanForSpeech()` (xem ngay dưới),
 *    không phải trên bản còn nguyên `**`/`##`/gạch đầu dòng.
 *  - **KHÔNG tự phát**: chỉ tổng hợp khi người dùng BẤM Nghe.
 *
 * Giọng: KHÔNG chôn một voice_id nhớ được vào code — id sai là 404 trông
 * như "dịch vụ hỏng". Thứ tự: `ELEVENLABS_VOICE_ID` (chủ app đặt) → giọng
 * người dùng chọn trên màn hình (từ CHÍNH danh sách `/v1/voices` của tài
 * khoản) → giọng đầu tiên trong danh sách đó. Model mặc định
 * `eleven_flash_v2_5` — xem `NO_VIETNAMESE` bên dưới: model mặc định cũ
 * `eleven_multilingual_v2` KHÔNG có tiếng Việt, và đọc văn bản Việt bằng
 * nó ra giọng "không giống tiếng Việt" (chủ app nghe ở production, #252).
 * `ELEVENLABS_MODEL` vẫn đổi được model mà không deploy.
 *
 * Không có `ELEVENLABS_API_KEY` thì tự tắt như UW/X/Telegram: màn hình rơi
 * về giọng trình duyệt và NÓI ra là đang dùng đường lùi.
 */

const BASE = 'https://api.elevenlabs.io/v1';
const UA = 'put-screener/1.0 (news brief reader)';

export const elevenConfigured = () => !!process.env.ELEVENLABS_API_KEY;
export const DEFAULT_MODEL = 'eleven_flash_v2_5';
export const modelId = () => process.env.ELEVENLABS_MODEL?.trim() || DEFAULT_MODEL;

export type SpeechLang = 'vi' | 'en';

/** Model ĐÃ BIẾT là không có tiếng Việt. Theo bảng model trong tài liệu
 *  ElevenLabs (đọc 2026-10-15, chưa đo bằng một lượt gọi): `vi` có ở họ
 *  v2.5 (flash/turbo — "mọi ngôn ngữ của multilingual_v2 cộng hu, no, vi")
 *  mà KHÔNG có trong danh sách của `eleven_multilingual_v2`; các model đời
 *  v1 chỉ tiếng Anh hoặc ít ngôn ngữ hơn nữa. Danh sách CẤM chứ không phải
 *  danh sách cho phép: model mới hơn (v3…) không bị chặn vì app chưa biết
 *  tên nó. */
export const NO_VIETNAMESE = new Set([
  'eleven_multilingual_v2',
  'eleven_multilingual_v1',
  'eleven_monolingual_v1',
  'eleven_english_sts_v2',
  'eleven_turbo_v2',
  'eleven_flash_v2',
]);

/** Model THẬT dùng cho một lượt đọc. Văn bản tiếng Việt mà model đang đặt
 *  (env) không có tiếng Việt thì dùng mặc định — đọc tiếng Việt bằng model
 *  không biết tiếng Việt là ra âm thanh trông như chạy được mà nghe không
 *  ra chữ; model thật được trả trong header `X-TTS-Model` và in lên màn
 *  hình nên việc thay không im lặng. */
export function modelFor(lang: SpeechLang): string {
  const m = modelId();
  return lang === 'vi' && NO_VIETNAMESE.has(m) ? DEFAULT_MODEL : m;
}

/** `language_code` ép ngôn ngữ đọc — theo tài liệu nhớ được chỉ họ v2.5
 *  nhận (model khác trả lỗi nếu gửi). Ép ngôn ngữ giữ cho giọng clone không
 *  trôi sang giọng Anh ở mã cổ phiếu và con số. */
export const acceptsLanguageCode = (model: string) => /^eleven_(flash|turbo)_v2_5$/.test(model);

/** Trần ký tự một lượt, đo TRÊN văn bản đã dọn Markdown (`cleanForSpeech`).
 *  Tài liệu nhớ được nói multilingual_v2 nhận tới 10.000/request — 8.000 là
 *  trần CỦA APP, đủ thấp để còn khoảng lùi dưới con số đó (chưa đo, xem
 *  đầu file), đủ cao để không chặn một bản tóm tắt thật bình thường như
 *  4.000 đã chặn (#188). Nếu ElevenLabs vẫn từ chối ở 8.000 thì lỗi thật
 *  của họ sẽ hiện ra qua `classifyEleven()` — đúng hơn một trần tự đoán
 *  chặn trước cả khi chưa hỏi. */
export const MAX_CHARS = 8000;

export type ElevenFailure =
  | 'not-configured'
  | 'bad-key'
  | 'quota'
  /* Giọng này gói hiện tại KHÔNG dùng được qua API (gói free + giọng lấy từ
     Voice Library). Khác hẳn `quota`, và tách ra vì ĐO ĐƯỢC ở production —
     xem chú thích dài ở `classifyEleven`. */
  | 'voice-plan'
  | 'bad-voice'
  | 'edge'
  | 'unavailable';

export class ElevenError extends Error {
  constructor(
    message: string,
    readonly kind: ElevenFailure,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ElevenError';
  }
}

const clip = (s: string, n = 200) => s.replace(/\s+/g, ' ').slice(0, n);

/**
 * Phân loại lỗi — hàm THUẦN, test được. Mỗi loại một cách sửa khác nhau:
 * key sai (đặt lại key) ≠ hết ký tự (chờ tháng sau / mua thêm) ≠ GIỌNG NÀY
 * gói hiện tại không dùng được qua API (đổi giọng, hoặc nâng gói) ≠ voice_id
 * không có trong tài khoản (đổi ELEVENLABS_VOICE_ID) ≠ bị chặn ở rìa (HTML,
 * request chưa tới API — #130) ≠ hỏng tạm.
 *
 * ElevenLabs trả lỗi dạng `{detail: {status, code, message}}`.
 *
 * ## `voice-plan` được tách ra sau MỘT PHÉP ĐO ở production (#195)
 *
 * Chủ app bấm Nghe và màn hình nói "Hết ký tự ElevenLabs của tháng này" —
 * trong khi `/api/ttsprobe` đo được hạn mức còn NGUYÊN 0/10.000 (#185). Thân
 * lỗi thật ElevenLabs trả về:
 *
 *   402 {"detail":{"type":"payment_required","code":"paid_plan_required",
 *        "message":"Free users cannot use library voices via the API.
 *                   Please upgrade your subscription to use this voice.",
 *        "status":"payment_required"}}
 *
 * Tức KHÔNG phải hết ký tự: giọng "Tram" là giọng lấy từ **Voice Library**,
 * và gói free của ElevenLabs cho dùng giọng đó trên TRANG WEB của họ nhưng
 * KHÔNG cho gọi qua API. Bản cũ đọc `detail.status` = "payment_required",
 * khớp `/payment/` rồi rơi vào `quota` — app khẳng định một điều SAI về tài
 * khoản của chủ app, và còn khuyên "mua thêm ký tự", đúng cách sửa KHÔNG
 * giải quyết được gì.
 *
 * Hai chi tiết của phép đo là lý do phải đọc nhiều trường chứ không một:
 *  - `detail.status` và `detail.code` NÓI HAI CHUYỆN KHÁC NHAU cùng lúc
 *    ("payment_required" vs "paid_plan_required"), mà bản cũ dùng `??` nên
 *    thấy `status` là thôi, không bao giờ đọc tới `code`.
 *  - Câu phân biệt rõ nhất nằm trong `message` ("library voices"), một
 *    trường bản cũ không đọc.
 */
export function classifyEleven(status: number, body: string): ElevenFailure {
  const b = (body ?? '').trim();
  const looksHtml = /^\s*<(!doctype|html)/i.test(b);
  if (looksHtml) return 'edge';
  let detailStatus = '';
  let detailMessage = '';
  try {
    const j = JSON.parse(b);
    /* GỘP status + code + type chứ không `??`: ở chính thân lỗi đo được,
       `status` nói "payment_required" (nghe như hết tiền) còn `code` nói
       "paid_plan_required" (giọng đòi gói trả phí) — lấy cái đầu là bỏ mất
       cái nói đúng chuyện. */
    detailStatus = [j?.detail?.status, j?.detail?.code, j?.detail?.type, j?.status, j?.code]
      .filter((x) => typeof x === 'string')
      .join(' ')
      .toLowerCase();
    detailMessage = String(j?.detail?.message ?? j?.message ?? '').toLowerCase();
  } catch {
    /* không phải JSON */
  }
  /* Thứ tự ở bốn dòng dưới là CÓ CHỦ Ý, và đảo một dòng là đẻ lại đúng con
     bug vừa vá, chỉ theo chiều ngược:

     1. MÃ nói thẳng "đòi gói trả phí" thắng trước mọi thứ.
     2. MÃ nói thẳng "hết hạn mức" đứng thứ hai — và cố ý KHÔNG còn chữ
        "payment" ở đây, vì chính `payment_required` là thứ đã kéo lỗi giọng
        vào nhánh này.
     3. Chỉ tới lúc mã không nói gì rõ ràng mới đọc tới CÂU VĂN, và chỉ nhận
        đúng cụm "library voice" — cụm chỉ có ở lỗi giọng. Cố ý KHÔNG bắt
        "upgrade your subscription": lỗi hết ký tự thật cũng mời nâng gói
        bằng đúng câu đó, nên bắt nó là biến một lỗi hết hạn mức thành lỗi
        giọng — cùng một kiểu chẩn đoán sai, chỉ đổi chiều.
     4. `payment` trơ trọi, không kèm mã nào rõ hơn, mới rơi về hết ký tự. */
  if (/paid_plan_required|subscription_required|plan_required/.test(detailStatus)) return 'voice-plan';
  if (/quota|character_limit|insufficient|exceeded/.test(detailStatus)) return 'quota';
  if (/library voice/.test(detailMessage)) return 'voice-plan';
  if (/payment/.test(detailStatus)) return 'quota';
  if (/voice_not_found|voice/.test(detailStatus) && status === 404) return 'bad-voice';
  if (/invalid_api_key|unauthorized|missing_permissions|api_key/.test(detailStatus)) return 'bad-key';
  if (status === 401 || status === 403) return 'bad-key';
  if (status === 402 || status === 429) return 'quota';
  if (status === 404) return 'bad-voice';
  return 'unavailable';
}

export type ElevenVoice = { id: string; name: string; labels: Record<string, string>; category?: string };

/** Bóc `/v1/voices` dung thứ — `{voices: [{voice_id, name, labels, category}]}`
 *  theo tài liệu nhớ được; có dòng mà không bóc được dòng nào thì NÉM kèm
 *  khoá thật (khuôn `parseUwNews`). */
export function parseVoices(payload: any): ElevenVoice[] {
  const rows: any[] = Array.isArray(payload?.voices) ? payload.voices : Array.isArray(payload) ? payload : [];
  const out: ElevenVoice[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const id = typeof r.voice_id === 'string' ? r.voice_id : typeof r.id === 'string' ? r.id : null;
    const name = typeof r.name === 'string' ? r.name : null;
    if (!id || !name) continue;
    const labels: Record<string, string> = {};
    if (r.labels && typeof r.labels === 'object') {
      for (const [k, v] of Object.entries(r.labels)) if (typeof v === 'string') labels[k] = v;
    }
    out.push({ id, name, labels, category: typeof r.category === 'string' ? r.category : undefined });
  }
  if (rows.length && !out.length) {
    const first = rows.find((r) => r && typeof r === 'object');
    throw new Error(`ElevenLabs voices: ${rows.length} dòng nhưng không bóc được - khoá: ${first ? Object.keys(first).join(',') : '?'}`);
  }
  return out;
}

/** Giọng mặc định: env → giọng đã chọn (nếu còn trong danh sách — một giọng
 *  đã xoá khỏi tài khoản không sống dậy từ bộ nhớ, #174) → giọng đầu. */
export function pickElevenVoice(voices: ElevenVoice[], envId: string | undefined, chosenId: string | null | undefined): ElevenVoice | null {
  if (!voices.length) return null;
  if (chosenId) {
    const c = voices.find((v) => v.id === chosenId);
    if (c) return c;
  }
  if (envId) {
    const e = voices.find((v) => v.id === envId);
    if (e) return e;
  }
  return voices[0];
}

export function cacheKey(text: string, voiceId: string, model: string): string {
  return crypto.createHash('sha256').update(`${model}\n${voiceId}\n${text}`).digest('hex').slice(0, 32);
}

/* ------------------------------------------------------------------ *
 *  Mạng. Không log key. Mọi lỗi mang trạng thái + thân, đứng trước.
 * ------------------------------------------------------------------ */

async function elevenFetch(pathname: string, init: RequestInit = {}): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new ElevenError('ELEVENLABS_API_KEY chưa đặt', 'not-configured');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60_000);
  try {
    return await fetch(`${BASE}${pathname}`, {
      ...init,
      headers: { 'xi-api-key': key, 'User-Agent': UA, ...(init.headers ?? {}) },
      cache: 'no-store',
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function failFrom(r: Response, what: string): Promise<never> {
  const body = await r.text().catch(() => '');
  const kind = classifyEleven(r.status, body);
  throw new ElevenError(`ElevenLabs ${what} ${r.status} ${kind}${body ? ` - ${clip(body)}` : ''}`, kind, r.status);
}

/** Danh sách giọng của TÀI KHOẢN, cache 1 giờ trong RAM — người dùng đổi
 *  giọng qua ô chọn không được tốn một request mỗi lần mở tab.
 *
 * `force: true` BỎ QUA cache — chỉ `/api/ttsprobe` dùng. Một công cụ ĐO
 * mà phục vụ dữ liệu cũ là tự phản bội lý do nó tồn tại: chủ app vừa thêm
 * một giọng mới bên trang ElevenLabs, bấm probe để KIỂM, mà probe lại trả
 * đúng bản chụp từ trước khi thêm — vì cùng tiến trình Node trên Render
 * chạy liên tục nên cache 1 giờ hoàn toàn có thể còn hiệu lực. Chủ app khi
 * đó thấy "giọng chưa thêm được" trong khi nó đã nằm trong tài khoản, và đi
 * tìm sai chỗ (nghi lại thao tác Add to my voices thay vì nghi cái cache).
 * Route phục vụ ô chọn giọng của tab (`/api/tts/voices`) và route tổng hợp
 * (`/api/tts`) vẫn dùng cache mặc định — đó là đường nóng, không phải công
 * cụ chẩn đoán. */
let voicesCache: { at: number; voices: ElevenVoice[] } | null = null;
const VOICES_MS = 60 * 60_000;

/** Khi một giọng được HỎI ĐÍCH DANH (ELEVENLABS_VOICE_ID, hoặc giọng người
 *  dùng chọn) mà không có trong bản đang giữ, hỏi lại ElevenLabs — nhưng
 *  không quá một lần mỗi phút. Thiếu chốt này thì chủ app thêm giọng bên
 *  ElevenLabs xong phải chờ tới MỘT GIỜ mới thấy nó trong ô chọn giọng, và
 *  trông y hệt "thêm không được". Một phút là trần chi phí: `/v1/voices`
 *  không tốn ký tự, nhưng env trỏ vào giọng không tồn tại thì mỗi lần mở
 *  trang đều sẽ hỏi lại. */
export const MISS_REFRESH_MS = 60_000;

export function voicesListedAt(): number | null {
  return voicesCache?.at ?? null;
}

export async function listVoices(force = false, maxAgeMs = VOICES_MS): Promise<ElevenVoice[]> {
  if (!force && voicesCache && Date.now() - voicesCache.at < maxAgeMs) return voicesCache.voices;
  const r = await elevenFetch('/voices');
  if (!r.ok) await failFrom(r, '/voices');
  const voices = parseVoices(await r.json());
  voicesCache = { at: Date.now(), voices };
  return voices;
}

/** Hạn mức ký tự của tài khoản — cho probe và cho dòng "còn N ký tự" trên
 *  màn hình. Đọc dung thứ; thiếu trường thì `null`, KHÔNG phải 0 ("không
 *  biết còn bao nhiêu" và "đã hết" cần hai hành động ngược nhau). */
export type Subscription = { used: number | null; limit: number | null; tier: string | null; resetAt: string | null; keys: string[] };

export async function subscription(): Promise<Subscription> {
  const r = await elevenFetch('/user/subscription');
  if (!r.ok) await failFrom(r, '/user/subscription');
  const j: any = await r.json();
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const reset = num(j?.next_character_count_reset_unix);
  return {
    used: num(j?.character_count),
    limit: num(j?.character_limit),
    tier: typeof j?.tier === 'string' ? j.tier : null,
    resetAt: reset ? new Date(reset * 1000).toISOString() : null,
    keys: j && typeof j === 'object' ? Object.keys(j).slice(0, 40) : [],
  };
}

const CACHE_DIR = path.resolve('.cache/tts');
/** Giữ tối đa bấy nhiêu file audio (~300 KB mỗi bản); cũ nhất bị xoá. */
const CACHE_FILES = 40;

async function readCached(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(CACHE_DIR, `${key}.mp3`));
  } catch {
    return null;
  }
}

async function writeCached(key: string, buf: Buffer): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const tmp = path.join(CACHE_DIR, `${key}.${process.pid}.tmp`);
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, path.join(CACHE_DIR, `${key}.mp3`));
    // Cắt bớt: cũ nhất trước.
    const names = (await fs.readdir(CACHE_DIR)).filter((n) => n.endsWith('.mp3'));
    if (names.length > CACHE_FILES) {
      const stats = await Promise.all(names.map(async (n) => ({ n, t: (await fs.stat(path.join(CACHE_DIR, n))).mtimeMs })));
      stats.sort((a, b) => a.t - b.t);
      for (const s of stats.slice(0, names.length - CACHE_FILES)) await fs.unlink(path.join(CACHE_DIR, s.n)).catch(() => {});
    }
  } catch {
    /* cache hỏng không được làm hỏng lượt đọc này */
  }
}

export type Synth = { audio: Buffer; cached: boolean; voiceId: string; model: string; chars: number };

/**
 * Tổng hợp một đoạn văn. Cache trước, mạng sau. `text` đã được route kiểm
 * trần; ở đây kiểm lại vì đây là chỗ TIÊU TIỀN.
 */
export async function synthesize(text: string, voiceId: string, lang: SpeechLang = 'vi'): Promise<Synth> {
  // Dọn Markdown TRƯỚC khi đếm/gửi/cache: `**`/`##`/gạch đầu dòng không ai
  // nghe thấy nhưng vẫn tính vào ký tự trả tiền và vào trần MAX_CHARS —
  // đếm trên bản còn nguyên ký hiệu là tự cộng thêm vào đúng con số đã gây
  // ra HTTP 413 ở #188. Idempotent nên gọi lại ở đây an toàn dù route đã
  // dọn một lần (`/api/tts` route) — chỗ TIÊU TIỀN tự bảo vệ mình, không
  // tin tưởng ngầm rằng nơi gọi đã dọn đúng.
  const t = cleanForSpeech(text.trim());
  if (!t) throw new ElevenError('văn bản rỗng', 'unavailable');
  if (t.length > MAX_CHARS) throw new ElevenError(`văn bản ${t.length} ký tự vượt trần ${MAX_CHARS}`, 'unavailable');
  const model = modelFor(lang);
  const withLang = acceptsLanguageCode(model);
  // Ngôn ngữ nằm trong khoá: cùng chữ đọc ép `vi` và không ép là hai file khác.
  const key = cacheKey(t, voiceId, withLang ? `${model}:${lang}` : model);
  const hit = await readCached(key);
  if (hit) return { audio: hit, cached: true, voiceId, model, chars: t.length };

  const send = (lc: boolean) =>
    elevenFetch(`/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(lc ? { text: t, model_id: model, language_code: lang } : { text: t, model_id: model }),
    });
  let r = await send(withLang);
  /* `language_code` là tham số NHỚ ĐƯỢC chứ chưa đo: bị từ chối (400/422)
     thì hỏi lại đúng một lần không kèm nó, thay vì làm hỏng cả lượt đọc vì
     một tham số phụ. Lỗi khác (khoá, hạn mức, giọng) giữ nguyên. */
  if (withLang && (r.status === 400 || r.status === 422)) r = await send(false);
  if (!r.ok) await failFrom(r, `/text-to-speech`);
  const ct = r.headers.get('content-type') ?? '';
  const buf = Buffer.from(await r.arrayBuffer());
  /* Một cái 200 mang JSON/HTML thay vì audio là "hỏng" chứ không phải "đã
     đọc xong": phát một file rỗng là nghe im lặng rồi tưởng máy câm. */
  if (!/audio|mpeg|octet-stream/i.test(ct) || buf.length < 200) {
    throw new ElevenError(`ElevenLabs 200 nhưng không phải audio (${ct || 'không có content-type'}, ${buf.length} byte) - ${clip(buf.toString('utf8', 0, 300))}`, 'unavailable', 200);
  }
  await writeCached(key, buf);
  return { audio: buf, cached: false, voiceId, model, chars: t.length };
}

/** Chỉ để test. */
export function _resetElevenCache() {
  voicesCache = null;
}
