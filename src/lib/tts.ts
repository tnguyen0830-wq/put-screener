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

/** Trần ký tự mỗi đoạn: ~200 ký tự tiếng Việt đọc dưới 15 giây ở tốc độ 1. */
export const CHUNK_MAX = 200;

/**
 * Bỏ ký hiệu trình bày (gạch đầu dòng, `**`, `#`) và chia theo câu / xuống
 * dòng thành đoạn ≤ CHUNK_MAX. Một câu dài hơn trần thì cắt ở dấu phẩy, rồi
 * ở khoảng trắng — không bao giờ cắt giữa một từ.
 */
export function ttsChunks(text: string, max = CHUNK_MAX): string[] {
  const clean = (text ?? '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
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
