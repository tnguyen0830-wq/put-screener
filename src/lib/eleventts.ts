import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

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
 *  - **Trần 4.000 ký tự mỗi lượt** — một bản tóm tắt ~300-450 từ là
 *    ~2.500 ký tự; client gửi văn bản DÀI HƠN trần bị từ chối chứ không cắt
 *    lặng lẽ (một bản đọc thiếu đoạn cuối trông y hệt bản đủ).
 *  - **KHÔNG tự phát**: chỉ tổng hợp khi người dùng BẤM Nghe.
 *
 * Giọng: KHÔNG chôn một voice_id nhớ được vào code — id sai là 404 trông
 * như "dịch vụ hỏng". Thứ tự: `ELEVENLABS_VOICE_ID` (chủ app đặt) → giọng
 * người dùng chọn trên màn hình (từ CHÍNH danh sách `/v1/voices` của tài
 * khoản) → giọng đầu tiên trong danh sách đó. Model mặc định
 * `eleven_multilingual_v2` (chất lượng cao nhất cho tiếng Việt theo tài
 * liệu nhớ được); `ELEVENLABS_MODEL` để đổi sang `eleven_flash_v2_5` (rẻ
 * một nửa) mà không deploy.
 *
 * Không có `ELEVENLABS_API_KEY` thì tự tắt như UW/X/Telegram: màn hình rơi
 * về giọng trình duyệt và NÓI ra là đang dùng đường lùi.
 */

const BASE = 'https://api.elevenlabs.io/v1';
const UA = 'put-screener/1.0 (news brief reader)';

export const elevenConfigured = () => !!process.env.ELEVENLABS_API_KEY;
export const DEFAULT_MODEL = 'eleven_multilingual_v2';
export const modelId = () => process.env.ELEVENLABS_MODEL?.trim() || DEFAULT_MODEL;

/** Trần ký tự một lượt. Tài liệu nhớ được nói multilingual_v2 nhận tới
 *  10.000/request; 4.000 là trần CỦA APP để một cú bấm không bao giờ đốt
 *  nửa gói miễn phí. */
export const MAX_CHARS = 4000;

export type ElevenFailure =
  | 'not-configured'
  | 'bad-key'
  | 'quota'
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
 * key sai (đặt lại key) ≠ hết ký tự (chờ tháng sau / mua thêm) ≠ voice_id
 * không có trong tài khoản (đổi ELEVENLABS_VOICE_ID) ≠ bị chặn ở rìa (HTML,
 * request chưa tới API — #130) ≠ hỏng tạm.
 *
 * ElevenLabs trả lỗi dạng `{detail: {status: "quota_exceeded", message}}`
 * (nhớ được) — đọc `detail.status` nếu có, không thì đọc theo mã HTTP, và
 * KHÔNG khớp gì thì `unavailable` chứ không đoán.
 */
export function classifyEleven(status: number, body: string): ElevenFailure {
  const b = (body ?? '').trim();
  const looksHtml = /^\s*<(!doctype|html)/i.test(b);
  if (looksHtml) return 'edge';
  let detailStatus = '';
  try {
    const j = JSON.parse(b);
    detailStatus = String(j?.detail?.status ?? j?.detail?.code ?? j?.status ?? '').toLowerCase();
  } catch {
    /* không phải JSON */
  }
  if (/quota|character_limit|insufficient|exceeded|payment/.test(detailStatus)) return 'quota';
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

export async function listVoices(force = false): Promise<ElevenVoice[]> {
  if (!force && voicesCache && Date.now() - voicesCache.at < VOICES_MS) return voicesCache.voices;
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
export async function synthesize(text: string, voiceId: string): Promise<Synth> {
  const t = text.trim();
  if (!t) throw new ElevenError('văn bản rỗng', 'unavailable');
  if (t.length > MAX_CHARS) throw new ElevenError(`văn bản ${t.length} ký tự vượt trần ${MAX_CHARS}`, 'unavailable');
  const model = modelId();
  const key = cacheKey(t, voiceId, model);
  const hit = await readCached(key);
  if (hit) return { audio: hit, cached: true, voiceId, model, chars: t.length };

  const r = await elevenFetch(`/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: t, model_id: model }),
  });
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
