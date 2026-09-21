import { ttConfigured, ttGet, TtError } from './tastytrade';

/**
 * Xin token streamer của tastytrade (`/api-quote-tokens`) - bước 1 của MỌI
 * phép đo DXLink.
 *
 * Tách ra vì đã có HAI nơi cần nó (`/api/breadthprobe` và
 * `/api/dxtapeprobe`), và hai bản chép của cùng một phép bóc trường là hai
 * bản sẽ trôi lệch - cùng lý do `ratelimit.ts` và `cleanForSpeech()` được
 * tách. Ở đây trôi lệch có giá thật: tên trường (`token` hay
 * `streamer-token`, `dxlink-url` hay `websocket-url`) là CHƯA ĐO CHẮC, nên
 * sửa một chỗ phải là sửa cả hai.
 *
 * TOKEN KHÔNG BAO GIỜ ĐI RA NGOÀI: `info` chỉ mang boolean, tên khoá, kiểu
 * và độ dài. Chính token nằm ở trường riêng, nơi gọi dùng để bắt tay rồi
 * bỏ, không bao giờ đưa vào câu trả lời HTTP.
 */

export const dxTokenConfigured = ttConfigured;

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

export type DxTokenResult =
  | { ok: true; token: string; url: string; info: Record<string, unknown> }
  /** 200 nhưng thiếu trường - tên trường tôi nhớ có thể sai; `info.bodyKeys`
   *  là tên THẬT, tức câu trả lời nằm ngay trong chính lỗi này. */
  | { ok: false; kind: 'missing'; missing: 'token' | 'dxlink-url'; info: Record<string, unknown> }
  /** Gọi hỏng hẳn. 404 (tài khoản không có đường này) khác 403 (có nhưng
   *  chưa được cấp quyền) khác 401 (giấy tờ sai) - ba việc phải làm khác
   *  nhau, nên giữ nguyên lời thật của tastytrade. */
  | { ok: false; kind: 'failed'; info: Record<string, unknown> };

export async function fetchDxQuoteToken(): Promise<DxTokenResult> {
  try {
    const { data, status } = await ttGet<any>('/api-quote-tokens');
    const body = data?.data ?? data;
    const rawToken = body?.token ?? body?.['streamer-token'] ?? null;
    const token = typeof rawToken === 'string' && rawToken ? rawToken : null;
    const rawUrl = body?.['dxlink-url'] ?? body?.['websocket-url'] ?? body?.url ?? null;
    const url = typeof rawUrl === 'string' && rawUrl ? rawUrl : null;

    const info: Record<string, unknown> = {
      ok: true,
      status,
      topLevelKeys: Object.keys(data ?? {}),
      bodyKeys: Object.keys(body ?? {}),
      types: Object.fromEntries(Object.entries(body ?? {}).map(([k, v]) => [k, typeOf(v)])),
      // Token KHÔNG đi ra ngoài - chỉ nói có hay không và dài bao nhiêu.
      hasToken: token !== null,
      tokenLength: token ? token.length : 0,
      dxlinkUrl: url,
      level: body?.level ?? null,
    };

    if (!token) return { ok: false, kind: 'missing', missing: 'token', info };
    if (!url) return { ok: false, kind: 'missing', missing: 'dxlink-url', info };
    return { ok: true, token, url, info };
  } catch (e: any) {
    return {
      ok: false,
      kind: 'failed',
      info: {
        ok: false,
        status: e instanceof TtError ? e.status ?? null : null,
        error: String(e?.message ?? e).slice(0, 200),
        body: e instanceof TtError ? (e.body ?? null)?.slice(0, 200) ?? null : null,
      },
    };
  }
}
