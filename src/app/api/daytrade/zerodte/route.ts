import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/userstore';
import { normalizeSymbol } from '@/lib/watchlist';
import { logActivity } from '@/lib/activity';
import { loadZeroDte, ZERODTE_STRIKES } from '@/lib/daytradefetch';

/**
 * Nửa 0DTE: chuỗi quyền chọn ĐÁO HẠN HÔM NAY cho một mã.
 *
 * Route này cũng là PHÉP ĐO. #103/#108 đo được Schwab trả chuỗi SPX với
 * `openInterest: 0` và `gamma: 0` ở mọi hợp đồng, nhưng chưa ai nhìn
 * `bid`/`ask` — và bảng này chỉ cần bid/ask. `diagnosis` trong câu trả lời
 * đếm RIÊNG ba thứ đó, nên một lần mở tab là biết nửa 0DTE sống hay chết,
 * và biết vì sao.
 */
export const dynamic = 'force-dynamic';

const SYMBOL_RE = /^[A-Z$][A-Z0-9/.$]{0,9}$/;

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });

  const symbol = normalizeSymbol(req.nextUrl.searchParams.get('symbol') ?? '$SPX');
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'BAD_SYMBOL' }, { status: 400 });
  }

  try {
    const r = await loadZeroDte(symbol);
    await logActivity(user, 'daytrade', `0DTE ${symbol}`);
    return NextResponse.json({ ...r, strikeCount: ZERODTE_STRIKES, at: Date.now() });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('REAUTH_REQUIRED')) {
      return NextResponse.json({ error: 'REAUTH_REQUIRED' }, { status: 401 });
    }
    return NextResponse.json({ error: 'FAILED', detail: msg.slice(0, 300) }, { status: 502 });
  }
}
