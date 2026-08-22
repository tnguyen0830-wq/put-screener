/**
 * Hồ sơ công ty: công ty này làm gì, thuộc ngành nào, lớn cỡ nào.
 *
 * Schwab chỉ trả về tên công ty và vài con số cơ bản, không có một dòng nào mô
 * tả doanh nghiệp. Phần này ghép hai nguồn đã có sẵn trong app:
 *
 *   - FMP (`FMP_API_KEY`) — API có hợp đồng ổn định, cho mô tả, CEO, số nhân
 *     viên, ngày IPO, website. Đây là nguồn chính.
 *   - Finviz — trang quote vốn đã được đọc cho phần "Giới phân tích", nên lấy
 *     thêm ngành/lĩnh vực/quốc gia từ đó không tốn thêm một request nào.
 *
 * Mọi trường đều có thể null và mọi lỗi đều nuốt: hồ sơ công ty là phần phụ,
 * hỏng thì phần phân tích vẫn phải chạy. Bù lại, `sources` nói rõ nguồn nào đã
 * trả lời và nguồn nào không — nhìn một lần vào /api/analyze là biết vì sao
 * trống, thay vì phải đoán.
 */

export type CompanyProfile = {
  sector: string | null;
  industry: string | null;
  country: string | null;
  website: string | null;
  ceo: string | null;
  employees: number | null;
  ipoDate: string | null;
  exchange: string | null;
  description: string | null;
  /** 'ok' | 'no-key' | 'empty' | 'http 403' | 'shape: …' — lý do, không phải cờ. */
  sources: { fmp: string; finviz: string };
};

/** Phần Finviz góp vào, do finvizQuote() bóc từ HTML. */
export type FinvizProfile = {
  sector: string | null;
  industry: string | null;
  country: string | null;
  employees: number | null;
  description: string | null;
};

type FmpResult = { profile: Partial<CompanyProfile> | null; note: string };

/* Hồ sơ công ty gần như không đổi trong ngày, nên nhớ trong RAM một ngày. Không
   ghi ra đĩa: trên Render đĩa là ổ gắn thêm dành cho token, không phải chỗ để
   cache thứ lấy lại được. */
const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: FmpResult }>();

const str = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
};
const int = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Đọc /stable/profile của FMP.
 *
 * Đọc thủ phòng: tên trường của FMP đã đổi giữa v3 và stable, nên mỗi trường
 * chấp nhận vài cách viết. Nếu có object trả về mà không có mô tả thì `note`
 * kèm luôn danh sách khoá thật — để sửa được mà không phải đoán.
 */
export function mapFmpProfile(row: any): Partial<CompanyProfile> {
  return {
    sector: str(row?.sector),
    industry: str(row?.industry),
    country: str(row?.country),
    website: str(row?.website),
    ceo: str(row?.ceo),
    employees: int(row?.fullTimeEmployees ?? row?.employees),
    ipoDate: str(row?.ipoDate)?.slice(0, 10) ?? null,
    exchange: str(row?.exchangeFullName ?? row?.exchangeShortName ?? row?.exchange),
    description: str(row?.description),
  };
}

export async function fmpCompanyProfile(symbol: string): Promise<FmpResult> {
  const key = process.env.FMP_API_KEY?.trim();
  if (!key) return { profile: null, note: 'no-key' };

  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let result: FmpResult;
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(
        symbol
      )}&apikey=${key}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) {
      result = { profile: null, note: `http ${r.status}` };
    } else {
      const body = await r.json();
      const row = Array.isArray(body) ? body[0] : body;
      if (!row || typeof row !== 'object') {
        result = { profile: null, note: 'empty' };
      } else {
        const mapped = mapFmpProfile(row);
        result = {
          profile: mapped,
          // Có object mà không có mô tả nghĩa là FMP đã đổi tên trường: nói ra
          // các khoá thật thay vì để trống lặng lẽ.
          note: mapped.description
            ? 'ok'
            : `shape: ${Object.keys(row).slice(0, 25).join(',')}`,
        };
      }
    }
  } catch (e: any) {
    result = { profile: null, note: `error: ${String(e?.message ?? e).slice(0, 80)}` };
  }

  // Chỉ nhớ lần trả lời thành công: lỗi mạng nhất thời không nên khoá cả ngày.
  if (result.profile) cache.set(symbol, { at: Date.now(), value: result });
  return result;
}

/**
 * Ghép hai nguồn. FMP đi trước vì nó là API; Finviz lấp chỗ trống — thường là
 * lấp toàn bộ khi server chưa có FMP_API_KEY.
 */
export function mergeProfile(
  fmp: FmpResult,
  finviz: FinvizProfile | null
): CompanyProfile | null {
  const p = fmp.profile ?? {};
  const merged: CompanyProfile = {
    sector: p.sector ?? finviz?.sector ?? null,
    industry: p.industry ?? finviz?.industry ?? null,
    country: p.country ?? finviz?.country ?? null,
    website: p.website ?? null,
    ceo: p.ceo ?? null,
    employees: p.employees ?? finviz?.employees ?? null,
    ipoDate: p.ipoDate ?? null,
    exchange: p.exchange ?? null,
    description: p.description ?? finviz?.description ?? null,
    sources: { fmp: fmp.note, finviz: finviz ? 'ok' : 'missing' },
  };

  // Không nguồn nào nói được gì thì trả null, để giao diện bỏ hẳn khối này thay
  // vì vẽ một hàng toàn dấu gạch.
  const hasAnything = Object.entries(merged).some(
    ([k, v]) => k !== 'sources' && v !== null
  );
  return hasAnything ? merged : null;
}
