import { NextRequest } from 'next/server';
import { putChain } from '@/lib/schwab';
import { jsonWithCors, corsOptionsResponse, errorResponse } from '@/lib/md-cors';

export const dynamic = 'force-dynamic';

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const minDays = Number(req.nextUrl.searchParams.get('minDays') ?? '1');
  const maxDays = Number(req.nextUrl.searchParams.get('maxDays') ?? '60');
  if (!symbol) return errorResponse('Missing symbol', 400);

  try {
    const chain = await putChain(symbol, addDays(minDays), addDays(maxDays));
    const map = chain?.putExpDateMap ?? {};
    const expirations = Object.keys(map)
      .map((k) => k.split(':')[0])
      .sort();
    return jsonWithCors({ symbol, expirations });
  } catch (e: any) {
    const msg = String(e.message ?? e);
    return errorResponse(msg, msg.includes('REAUTH_REQUIRED') ? 401 : 500);
  }
}
