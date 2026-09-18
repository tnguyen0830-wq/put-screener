import { marketInternals } from '@/lib/internals';

/**
 * Market internals (TICK, UVOL/DVOL, ADV-DECL, Put/Call). Phần tính nằm
 * trong lib/internals.ts - route chỉ là lớp vỏ HTTP, đúng khuôn /api/rrg.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await marketInternals());
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return Response.json({ error: msg }, { status: msg.includes('REAUTH_REQUIRED') ? 401 : 500 });
  }
}
