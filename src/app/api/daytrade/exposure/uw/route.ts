import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/userstore';
import { normalizeSymbol } from '@/lib/watchlist';
import { loadUwExposure } from '@/lib/uwexposureload';

/**
 * Số phơi nhiễm do Unusual Whales tự tính, để tab MM Exposure đặt SONG SONG
 * với số app tự tính (`/api/daytrade/exposure`).
 *
 * Route RIÊNG chứ không gộp vào route chính, vì hai lý do: UW hỏng hay chậm
 * không được kéo mất ba panel của app (hỏng độc lập), và client gọi route này
 * SAU khi route chính đã xong — nên hai request UW ở đây không chồng lên hai
 * request của chuỗi UW trong thang GEX, dưới trần 3 đồng thời của cả tài khoản.
 *
 * Không ghi Hoạt động: route chính đã ghi `daytrade` cho đúng lượt mở này,
 * và một dòng thứ hai cho cùng một việc là tiếng ồn (#193).
 */
export const dynamic = 'force-dynamic';

const SYMBOL_RE = /^[A-Z$][A-Z0-9/.$]{0,9}$/;
const EXP_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const symbol = normalizeSymbol(q.get('symbol') ?? '$SPX');
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'BAD_SYMBOL' }, { status: 400 });
  }
  const exp = q.get('exp');
  if (exp && !EXP_RE.test(exp)) {
    return NextResponse.json({ error: 'BAD_EXPIRATION' }, { status: 400 });
  }

  // loadUwExposure không bao giờ ném: mỗi nửa mang lỗi thật của chính nó.
  const r = await loadUwExposure(symbol, exp || null);
  return NextResponse.json({ ...r, at: Date.now() });
}
