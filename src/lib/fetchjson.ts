/**
 * Đọc một câu trả lời `fetch` như JSON — và khi nó KHÔNG phải JSON thì nói
 * ra nó là gì, thay vì để `r.json()` ném "Unexpected token '<'".
 *
 * Câu đó là thứ duy nhất chủ app thấy khi tab MM Exposure hỏng ở
 * production (2026-09-23): server đã trả một trang HTML chứ không phải
 * JSON, và câu lỗi nuốt mất cả MÃ HTTP lẫn TIÊU ĐỀ trang — tức đúng hai thứ
 * phân biệt được "route chết giữa chừng (502 của Render)", "bị chuyển về
 * /login" và "trang lỗi của Next". Ba cách sửa khác nhau, một câu lỗi.
 *
 * Thuần, không import gì, để test đứng riêng được.
 */
export type JsonOrText =
  | { ok: true; status: number; json: any }
  | { ok: false; status: number; summary: string };

/** Tóm tắt một thân không phải JSON: mã HTTP trước (cắt ngắn không được ăn
 *  mất nó — #102), rồi `<title>` nếu có, không thì 120 ký tự đầu đã gỡ thẻ. */
export function summarizeBody(status: number, body: string): string {
  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim();
  const text =
    title ||
    body
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  return `HTTP ${status} · ${text || '(thân rỗng)'}`;
}

export async function readJsonOrText(r: Response): Promise<JsonOrText> {
  const body = await r.text();
  try {
    return { ok: true, status: r.status, json: JSON.parse(body) };
  } catch {
    return { ok: false, status: r.status, summary: summarizeBody(r.status, body) };
  }
}
