/**
 * Đọc bản tóm tắt thành tiếng — phần THUẦN (không đụng `window`), để test được.
 *
 * Chủ app: "trong mục tóm tắt ai claude có giọng đọc để nghe được". Dùng giọng
 * đọc CÓ SẴN của trình duyệt (Web Speech API, `speechSynthesis`) chứ không
 * gọi một dịch vụ TTS có key: không tốn tiền, không thêm biến môi trường,
 * không thêm host phải probe — và chạy ở đúng chỗ đo được (máy của chủ app).
 * Đổi lại, CHẤT LƯỢNG và SỰ TỒN TẠI của giọng tiếng Việt tuỳ máy: iPhone/Mac
 * có "Linh" (vi-VN) sẵn, Android có Google TTS, Chrome desktop có giọng
 * Google trực tuyến, còn Windows phải cài thêm gói tiếng Việt. Vì vậy màn
 * hình phải NÓI RA khi không có giọng tiếng Việt thay vì đọc tiếng Việt bằng
 * giọng Anh — thứ đó không phải "kém", nó là vô nghĩa mà trông như đang chạy.
 *
 * Hai luật đã biết của `speechSynthesis`, cả hai đều im lặng nếu bỏ qua:
 *  - Chrome NGỪNG GIỮA CHỪNG một utterance dài quá ~15 giây và không báo
 *    lỗi (lỗi lâu năm của Chrome). Nên văn bản được CHIA thành đoạn ngắn
 *    theo câu và xếp hàng lần lượt — `ttsChunks()`.
 *  - `getVoices()` trả `[]` ở lần gọi đầu trên Chrome cho tới khi
 *    `voiceschanged` bắn; phải nghe sự kiện đó chứ không kết luận "máy không
 *    có giọng" từ lần đọc đầu.
 */

/**
 * Trần ký tự mỗi đoạn. Chrome ngắt utterance dài quá ~15 giây; tiếng Việt đọc
 * ~15 ký tự/giây ở tốc độ 1, nên 150 ký tự ở tốc độ CHẬM NHẤT cho chọn
 * (0.75×) vẫn dưới ~13 giây. Đây là lý do 0.5× KHÔNG có trong `RATES`: ở
 * 0.5× thì 150 ký tự là 20 giây, tức lại rơi vào đúng lỗi ngắt giữa chừng.
 */
export const CHUNK_MAX = 150;

/** Tốc độ cho chọn. Danh sách CHO PHÉP: giá trị lạ trong bộ nhớ (bản cũ,
 *  sửa tay) rơi về 1 chứ không thành `rate: NaN` — Chrome im lặng không đọc
 *  khi rate không hợp lệ. */
export const RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export type Rate = (typeof RATES)[number];

export function parseRate(raw: string | null | undefined): Rate {
  const n = Number(raw);
  return (RATES as readonly number[]).includes(n) ? (n as Rate) : 1;
}

export const fmtRate = (r: number) => `${String(r).replace(/\.0+$/, '')}×`;

/**
 * Bỏ ký hiệu trình bày (gạch đầu dòng, `**`, `#`) khỏi văn bản trước khi đọc
 * — dùng CHUNG cho cả hai máy đọc, giọng trình duyệt (`ttsChunks()` dưới
 * đây) LẪN giọng AI (`synthesize()` trong `lib/eleventts.ts`). Một bản chép
 * thứ hai của cùng phép dọn là bản sẽ trôi lệch (đúng lý do `ratelimit.ts`
 * tách riêng) — và ở đây trôi lệch có giá thật: ElevenLabs tính tiền theo
 * KÝ TỰ, nên gửi nguyên `**`/`##`/gạch đầu dòng là trả tiền đọc những ký tự
 * không ai nghe thấy (mà ElevenLabs có thể đọc thành "hai sao" hoặc im lặng
 * tuỳ giọng — không sạch dù thế nào). Hàm THUẦN, không đụng `window`, nên
 * gọi được từ cả file phía server (`eleventts.ts`).
 */
export function cleanForSpeech(text: string): string {
  return (text ?? '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Chia theo câu / xuống dòng thành đoạn ≤ CHUNK_MAX, sau khi đã dọn ký hiệu
 * trình bày qua `cleanForSpeech()`. Một câu dài hơn trần thì cắt ở dấu
 * phẩy, rồi ở khoảng trắng — không bao giờ cắt giữa một từ.
 */
export function ttsChunks(text: string, max = CHUNK_MAX): string[] {
  const clean = cleanForSpeech(text);
  if (!clean) return [];

  const units: string[] = [];
  for (const line of clean.split(/\n+/)) {
    const l = line.trim();
    if (!l) continue;
    // Tách câu theo . ! ? … kèm khoảng trắng phía sau; giữ dấu câu ở câu trước.
    for (const s of l.split(/(?<=[.!?…])\s+/)) if (s.trim()) units.push(s.trim());
  }

  const out: string[] = [];
  let cur = '';
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  };
  for (const u of units) {
    if (u.length > max) {
      push();
      for (const piece of splitLong(u, max)) out.push(piece);
      continue;
    }
    if (cur && cur.length + 1 + u.length > max) push();
    cur = cur ? `${cur} ${u}` : u;
  }
  push();
  return out;
}

function splitLong(s: string, max: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(', ', max);
    if (cut < max / 3) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).replace(/^[,\s]+/, '');
  }
  if (rest.trim()) out.push(rest.trim());
  return out;
}

export type VoiceInfo = { name: string; lang: string; localService?: boolean; default?: boolean };

/** Giọng nói được ngôn ngữ đích không: `vi` khớp `vi-VN`, `vi_VN`, `vi`. */
export function voiceMatches(v: VoiceInfo, lang: string): boolean {
  return (v.lang ?? '').toLowerCase().replace('_', '-').split('-')[0] === lang.toLowerCase();
}

/**
 * Chọn giọng: (1) giọng người dùng đã chọn, nếu vẫn còn trên máy — một giọng
 * đã bị gỡ không được sống dậy từ bộ nhớ (#174); (2) giọng đầu tiên cùng
 * ngôn ngữ; (3) `null` = máy KHÔNG có giọng cho ngôn ngữ này. Cố ý không rơi
 * về giọng ngôn ngữ khác: đọc tiếng Việt bằng giọng Anh là rác trông như
 * đang chạy.
 */
export function pickVoice<V extends VoiceInfo>(voices: V[], lang: string, rememberedName: string | null): V | null {
  const same = voices.filter((v) => voiceMatches(v, lang));
  if (!same.length) return null;
  const kept = rememberedName ? same.find((v) => v.name === rememberedName) : undefined;
  return kept ?? same[0];
}
