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
 * Lý do một lượt dịch không ra kết quả - trả về CÙNG với `null` thay vì
 * chỉ mỗi `null`, sau khi chủ app báo lại ĐÚNG triệu chứng "chọn tiếng Việt
 * mà thông tin công ty vẫn tiếng Anh" một lần nữa dù bản vá trước (#112) đã
 * merge. Bản trước nuốt mọi lỗi thành `null` - thiếu key, key sai, hết hạn
 * mức, JSON Claude trả về không đọc được - đều lùi về tiếng Anh giống hệt
 * nhau, không cách nào phân biệt "chưa dịch" với "dịch hỏng vì X". Đúng cái
 * bẫy mà idiom tự chẩn đoán của repo này tồn tại để tránh (xem CLAUDE.md),
 * mà route AI khác (`/api/ai`) đã làm đúng - phân loại lỗi UY TÍN như dưới
 * đây chỉ là chép lại đúng cách route đó đã làm.
 */
export type TranslateReason = 'no-key' | 'bad-key' | 'rate-limited' | 'failed';

/** `reason` chỉ có mặt khi thật sự có lỗi. "Không có trường nào để dịch"
 *  không phải lỗi - trả `{ vi: null }` không kèm reason, để phía gọi biết
 *  KHÔNG cần hiện cảnh báo gì (không có gì để dịch thì đúng ra không có gì
 *  sai cả). */
export type TranslateResult =
  | { vi: ProfileFields; reason?: undefined }
  | { vi: null; reason?: TranslateReason };

/** Claude được dặn "không rào chắn markdown" nhưng đôi khi vẫn quấn
 *  ```json ... ``` quanh JSON - gỡ lớp đó trước khi parse thay vì để
 *  JSON.parse() văng lỗi vì một chuyện không liên quan tới bản dịch. */
function stripFence(s: string): string {
  const m = s.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : s;
}

/**
 * Dịch bốn trường profile của một mã sang tiếng Việt, có cache trên đĩa.
 * Trả về `{ vi: null }` khi không có trường nào để dịch (không có gì sai,
 * không cần lý do) hoặc `{ vi: null, reason }` khi có lỗi thật - phía gọi
 * dùng `reason` để nói đúng vì sao đang lùi về tiếng Anh, thay vì im lặng.
 */
export async function translateProfile(
  symbol: string,
  f: ProfileFields
): Promise<TranslateResult> {
  const fields = presentFields(f);
  if (!fields.length) return { vi: null };

  const key = symbol.toUpperCase();
  const hash = hashOf(f);
  const cache = await readCache();
  const hit = cache[key];
  // Cache trước, đọc key sau: một bản dịch đã lưu vẫn phải dùng được kể cả
  // khi ANTHROPIC_API_KEY sau này bị gỡ hay đổi - chỉ một bản dịch MỚI mới
  // thật sự cần key.
  if (hit && hit.hash === hash) return { vi: hit.vi };
  if (!process.env.ANTHROPIC_API_KEY) return { vi: null, reason: 'no-key' };

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
    if (!block) return { vi: null, reason: 'failed' };

    const parsed = JSON.parse(stripFence(block.text));
    const vi: ProfileFields = {};
    for (const [k] of fields) {
      const v = parsed?.[k];
      if (typeof v === 'string' && v.trim()) vi[k as keyof ProfileFields] = v;
    }
    if (!Object.keys(vi).length) return { vi: null, reason: 'failed' };

    cache[key] = { hash, at: new Date().toISOString(), vi };
    await writeCache(cache);
    return { vi };
  } catch (e) {
    // Cùng cách phân loại lỗi Anthropic SDK mà /api/ai/route.ts đã dùng cho
    // luồng "Nhờ Claude phân tích" - ba lý do sửa khác nhau (thêm biến môi
    // trường / đổi key / đợi rồi thử lại), gộp chung thành một câu là không
    // cho người đọc biết phải làm gì.
    const reason: TranslateReason =
      e instanceof Anthropic.AuthenticationError
        ? 'bad-key'
        : e instanceof Anthropic.RateLimitError
          ? 'rate-limited'
          : 'failed';
    return { vi: null, reason };
  }
}
