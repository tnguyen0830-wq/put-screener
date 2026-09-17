import { NextRequest, NextResponse } from 'next/server';
import { ciksFor, companyFacts, SecError } from '@/lib/sec';
import { secDiagnosis, secFundamentals, TAGS } from '@/lib/secfacts';

export const dynamic = 'force-dynamic';

/**
 * Đo HÌNH DẠNG thật của SEC `companyfacts` cho một mã - khuôn /api/uwprobe.
 *
 * `data.sec.gov` bị sandbox chặn lúc viết secfacts.ts, nên phần bóc tách
 * được viết theo cấu trúc công bố chứ chưa đo. Route này chạy một lần ở
 * production và trả lời đúng những câu code đang đoán:
 *
 *  - taxonomy là `us-gaap` hay `ifrs-full` (công ty nước ngoài)?
 *  - thẻ doanh thu nào có mặt, và thang thẻ đã chọn đúng thẻ nào?
 *  - một fact thật có đủ `start/end/val/fy/fp/form/filed` không, và
 *    `fp`/`form` viết đúng như code đang so sánh không?
 *  - với công ty năm tài chính lệch (AAPL kết thúc 30/9), chuỗi cả năm có
 *    ra đúng mỗi năm một điểm không?
 *
 * Chỉ trả hình dạng + vài con số đã bóc, KHÔNG trả nguyên payload (hàng
 * chục MB). Dữ liệu SEC là công khai và không có key, nên không cần
 * OWNER_ONLY - khác ttprobe.
 */
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? 'AAPL').trim().toUpperCase();
  const t0 = Date.now();
  try {
    const { found, missing } = await ciksFor([symbol]);
    if (missing.length) {
      return NextResponse.json({ symbol, ok: false, reason: 'no-cik', missing }, { status: 404 });
    }
    const cik = found[symbol];
    const raw = await companyFacts(cik);
    const f = secFundamentals(raw);
    const gaap = raw?.facts?.['us-gaap'] ?? {};

    /* Với mỗi chỉ tiêu: thẻ nào trong thang CÓ MẶT (bất kể có số cả năm hay
       không) - phân biệt "thẻ không tồn tại" với "thẻ có nhưng không có số
       cả năm", hai lỗi khác nhau. */
    const tagPresence = Object.fromEntries(
      (Object.keys(TAGS) as (keyof typeof TAGS)[]).map((m) => [
        m,
        TAGS[m].map((t) => ({ tag: t, present: t in gaap, units: Object.keys(gaap[t]?.units ?? {}) })),
      ])
    );

    const revTag = f.tagsUsed.revenue;
    const sampleFacts = revTag
      ? ((Object.values(gaap[revTag]?.units ?? {})[0] as any[]) ?? []).slice(-3)
      : [];

    return NextResponse.json({
      symbol,
      cik,
      ok: f.revenue.length > 0,
      ms: Date.now() - t0,
      entityName: f.entityName,
      diagnosis: secDiagnosis(raw),
      tagsUsed: f.tagsUsed,
      tagPresence,
      /* Ba fact THẬT gần nhất của thẻ doanh thu, nguyên văn: đây là thứ nói
         `fp` viết "FY" hay "Q4", `form` viết "10-K" hay "10-K405", ... */
      sampleRevenueFacts: sampleFacts,
      annual: {
        revenue: f.revenue.map((p) => ({ end: p.end, value: p.value, filed: p.filed, form: p.form })),
        epsDiluted: f.epsDiluted.map((p) => ({ end: p.end, value: p.value })),
        fcf: f.fcf.map((p) => ({ end: p.end, value: p.value })),
        shares: f.shares.map((p) => ({ end: p.end, value: p.value })),
      },
      derived: {
        revenueCagr3: f.revenueCagr3,
        revenueCagr5: f.revenueCagr5,
        epsCagr3: f.epsCagr3,
        fcfCagr3: f.fcfCagr3,
        sharesCagr3: f.sharesCagr3,
        fcfMarginLatest: f.fcfMarginLatest,
        latestFy: f.latestFy,
        latestFiled: f.latestFiled,
        splitBreaks: f.splitBreaks,
      },
    });
  } catch (e: any) {
    const status = e instanceof SecError ? e.status ?? 502 : 502;
    return NextResponse.json(
      {
        symbol,
        ok: false,
        ms: Date.now() - t0,
        error: String(e?.message ?? e).slice(0, 300),
        /* Vài trăm ký tự thân phản hồi: phân biệt 403 thiếu User-Agent (HTML)
           với 404 sai CIK - cùng bài học sec.ts đã ghi. */
        body: e instanceof SecError ? e.body ?? null : null,
      },
      { status: status >= 400 && status < 600 ? status : 502 }
    );
  }
}
