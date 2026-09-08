import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Dịch phần "Thông tin công ty" (tab Analyze) sang tiếng Việt.
 *
 * Vì sao cần: `sector`/`industry`/`country` lấy nguyên văn từ trang quote
 * Finviz, `description` lấy nguyên văn từ FMP - cả hai đều là nguồn tiếng
 * Anh. Mọi nhãn khác trên trang đã qua `i18n.tsx`, nên khi UI ở chế độ
 * tiếng Việt, đúng bốn trường này là chỗ duy nhất còn hiện tiếng Anh -
 * không phải lỗi thiếu bản dịch, mà là chưa từng có bản dịch.
 *
 * Dịch bằng Claude thay vì để nguyên: tự viết từ điển tĩnh cho hàng trăm
 * ngành nghề Finviz liệt kê là việc tốn công mà vẫn thiếu, còn mô tả doanh
 * nghiệp là văn bản tự do - không thể tra từ điển. Kết quả lưu cache theo
 * mã trên đĩa (nội dung công ty gần như không đổi), nên chi phí gọi Claude
 * là MỘT LẦN cho mỗi mã từng được xem ở chế độ tiếng Việt, không phải mỗi
 * lần mở trang - khác hẳn kiểu "mỗi lần bấm tốn tiền" của nút Ask Claude,
 * vì nội dung ở đây tĩnh chứ không phải chỉ số sống.
 *
 * Đồng bộ model với `/api/ai` (cùng `claude-opus-5`) nhưng effort thấp -
 * dịch không cần suy luận sâu như đọc chỉ số. Không streaming: output ngắn
 * và phải đọc trọn vẹn thì cache mới ghi được, phát dần không có ý nghĩa.
 */

const CACHE_PATH = path.resolve('.cache/profile-translate.json');

export type ProfileFields = {
  sector?: string | null;
  industry?: string | null;
  country?: string | null;
  description?: string | null;
};

type CacheEntry = { hash: string; at: string; vi: ProfileFields };
type Cache = Record<string, CacheEntry>;

/** Chỉ băm những trường THẬT SỰ có - Finviz/FMP đổi mô tả hay đổi ngành thì
 *  hash đổi theo, cache tự biết phải dịch lại chứ không kẹt với bản cũ. */
function hashOf(f: ProfileFields): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([f.sector ?? '', f.industry ?? '', f.country ?? '', f.description ?? '']))
    .digest('hex');
}

async function readCache(): Promise<Cache> {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
  } catch {
    // Chưa có file hoặc file hỏng - cả hai đều coi như "chưa dịch" chứ
    // không làm chết đường dịch.
    return {};
  }
}

async function writeCache(c: Cache): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await fs.writeFile(CACHE_PATH, JSON.stringify(c), 'utf8');
  } catch {
    // Nuốt có chủ đích: cache hỏng thì lần sau gọi lại Claude là đủ, không
    // được kéo sập bản dịch của lượt này.
  }
}

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 3072;

/** Chỉ đưa vào prompt - và chỉ mong đợi trong JSON trả về - những trường
 *  THẬT SỰ có nội dung. Không được để Claude tự bịa ra một "industry" khi
 *  Finviz không trả trường đó. */
function presentFields(f: ProfileFields): [string, string][] {
  const out: [string, string][] = [];
  if (f.sector) out.push(['sector', f.sector]);
  if (f.industry) out.push(['industry', f.industry]);
  if (f.country) out.push(['country', f.country]);
  if (f.description) out.push(['description', f.description]);
  return out;
}

const SYSTEM = `Translate the given company-profile fields into Vietnamese. \
Preserve every fact exactly - company names, numbers, and dates never change. \
Use the standard Vietnamese finance terminology for sector and industry names \
(the kind used on Vietnamese financial news sites), so the same English term \
translates the same way every time it appears. \
Respond with ONLY a JSON object containing exactly the keys you were given, \
each mapped to its Vietnamese translation as a plain string. No markdown, no \
code fences, no commentary, no extra keys.`;

/**
 * Dịch bốn trường profile của một mã sang tiếng Việt, có cache trên đĩa.
 * Trả về `null` khi: không có trường nào để dịch, chưa cấu hình
 * ANTHROPIC_API_KEY, hoặc lượt gọi/parse hỏng - mọi trường hợp đó xử lý
 * giống nhau ở phía gọi: hiện nguyên văn tiếng Anh, không phải lỗi chặn cả
 * trang. Đây là phần phụ trợ hiển thị, không phải dữ liệu cốt lõi.
 */
export async function translateProfile(
  symbol: string,
  f: ProfileFields
): Promise<ProfileFields | null> {
  const fields = presentFields(f);
  if (!fields.length) return null;

  const key = symbol.toUpperCase();
  const hash = hashOf(f);
  const cache = await readCache();
  const hit = cache[key];
  // Cache trước, đọc key sau: một bản dịch đã lưu vẫn phải dùng được kể cả
  // khi ANTHROPIC_API_KEY sau này bị gỡ hay đổi - chỉ một bản dịch MỚI mới
  // thật sự cần key.
  if (hit && hit.hash === hash) return hit.vi;
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: JSON.stringify(Object.fromEntries(fields)) }],
    });
    const block = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!block) return null;

    const parsed = JSON.parse(block.text.trim());
    const vi: ProfileFields = {};
    for (const [k] of fields) {
      const v = parsed?.[k];
      if (typeof v === 'string' && v.trim()) vi[k as keyof ProfileFields] = v;
    }
    if (!Object.keys(vi).length) return null;

    cache[key] = { hash, at: new Date().toISOString(), vi };
    await writeCache(cache);
    return vi;
  } catch {
    // Lỗi API, JSON hỏng, bất cứ gì - dịch là phần phụ, hỏng thì trả null
    // để phía gọi lùi về tiếng Anh, không được kéo sập trang Analyze.
    return null;
  }
}
