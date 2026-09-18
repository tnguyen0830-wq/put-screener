import manifest from '../../data/congress-photos.json';

/**
 * Ảnh chân dung nghị sĩ do CHỦ APP cung cấp (#179): 33 ảnh Bioguide (public
 * domain) gửi dạng zip, thu về 225×275 vào `public/congress/<BIOGUIDE>.jpg`,
 * kèm `data/congress-photos.json` (Bioguide ID → tên như trong zip).
 *
 * Vì sao cần bộ ảnh cục bộ khi đã có `politicianPhoto()` trỏ tới
 * unitedstates/images: đường đó CHỈ dựng được khi `politician_id` của UW
 * đúng dạng Bioguide, và màn hình "Theo nghị sĩ" của chủ app vẫn toàn vòng
 * tròn chữ cái (#134) - tức id UW trả không phải Bioguide, hoặc kho ảnh
 * không tới được. Bộ ảnh cục bộ tra được bằng CẢ HAI: Bioguide ID (nếu UW
 * có trả) và TÊN (thứ UW chắc chắn có).
 *
 * Tra tên phải chặt, vì một ảnh gắn nhầm người trông y hệt ảnh đúng - và
 * đây là mặt người thật. Hai mức, không mức nào đoán:
 *   1. Toàn bộ tên chuẩn hoá trùng nhau (bỏ dấu, bỏ chấm phẩy, bỏ hậu tố
 *      Jr/Sr/II/III/IV).
 *   2. Cùng TÊN ĐẦU và cùng HỌ (bỏ tên đệm): "James A Himes" ↔ "James Himes".
 * KHÔNG khớp theo họ đơn lẻ ("Kelly" là họ của Mike Kelly và tên của Kelly
 * Morrison), KHÔNG khớp biệt danh ("Jim" ≠ "James") - thà thiếu ảnh còn hơn
 * gắn nhầm; tên không khớp được in ra màn hình để chủ app bổ sung.
 */
export type PhotoManifest = Record<string, string>;

export const PHOTOS: PhotoManifest = (manifest as { photos: PhotoManifest }).photos;

const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

export function nameTokens(name: string): string[] {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,'’"()]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !SUFFIX.has(w));
}

const BIOGUIDE_RE = /^[A-Z]\d{6}$/;

/** Bảng tra tên → Bioguide, dựng một lần từ manifest. Hai người cùng khoá
 *  (không xảy ra trong 33 ảnh này, nhưng phải đúng khi thêm ảnh) thì khoá đó
 *  bị LOẠI khỏi bảng: mơ hồ thì không tra, không chọn bừa người đầu. */
function buildIndex(m: PhotoManifest) {
  const full = new Map<string, string | null>();
  const firstLast = new Map<string, string | null>();
  const put = (map: Map<string, string | null>, k: string, id: string) =>
    map.set(k, map.has(k) && map.get(k) !== id ? null : id);
  for (const [id, name] of Object.entries(m)) {
    const t = nameTokens(name);
    if (!t.length) continue;
    put(full, t.join(' '), id);
    if (t.length >= 2) put(firstLast, `${t[0]} ${t[t.length - 1]}`, id);
  }
  return { full, firstLast };
}

let cached: { m: PhotoManifest; idx: ReturnType<typeof buildIndex> } | null = null;

/** Bioguide ID trong bộ ảnh cục bộ khớp với nghị sĩ này, hoặc null. */
export function localPortraitId(
  politicianId: string,
  name: string,
  m: PhotoManifest = PHOTOS
): string | null {
  if (!cached || cached.m !== m) cached = { m, idx: buildIndex(m) };
  const id = String(politicianId ?? '').trim().toUpperCase();
  if (BIOGUIDE_RE.test(id) && id in m) return id;
  const t = nameTokens(name);
  if (!t.length) return null;
  const byFull = cached.idx.full.get(t.join(' '));
  if (byFull) return byFull;
  if (t.length >= 2) {
    const byFl = cached.idx.firstLast.get(`${t[0]} ${t[t.length - 1]}`);
    if (byFl) return byFl;
  }
  return null;
}

/** Đường dẫn ảnh cục bộ (phục vụ từ `public/`), hoặc null. */
export function localPortrait(politicianId: string, name: string, m: PhotoManifest = PHOTOS): string | null {
  const id = localPortraitId(politicianId, name, m);
  return id ? `/congress/${id}.jpg` : null;
}
