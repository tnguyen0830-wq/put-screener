import { quotes } from '@/lib/schwab';
import { jsonWithCors, corsOptionsResponse, errorResponse } from '@/lib/md-cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET() {
  try {
    const q = await quotes(['$VIX', '$SPX']);
    const vix = q['$VIX']?.quote;
    const spx = q['$SPX']?.quote;
    if (!vix || !spx) return errorResponse('Index quotes unavailable', 502);

    return jsonWithCors({
      vix: vix.lastPrice ?? 0,
      spxLevel: spx.lastPrice ?? 0,
      spxChangePercent: spx.netPercentChange ?? 0,
    });
  } catch (e: any) {
    const msg = String(e.message ?? e);
    return errorResponse(msg, msg.includes('REAUTH_REQUIRED') ? 401 : 500);
  }
}
