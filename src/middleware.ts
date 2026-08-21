import { NextRequest, NextResponse } from 'next/server';

// Gate for the /api/md/* routes the Pro Sell Put Scanner app calls.
//
// These routes proxy a personal Schwab session and a paid FMP quota, so once
// this server is reachable from the public internet they must not stay open.
//
// Deliberately opt-in: with MD_API_TOKEN unset the gate is a no-op, so the
// existing local dev setup (and the web screener that shares this server)
// behaves exactly as before. Set MD_API_TOKEN only on the deployed instance.
//
// NOTE: a token shipped inside the app bundle is readable by anyone who opens
// devtools on the web build. This stops drive-by scanners and casual abuse of
// the URL; it is not a substitute for real per-user login.

const TOKEN_HEADER = 'x-md-token';

function isAuthorized(req: NextRequest, expected: string): boolean {
  const bearer = req.headers.get('authorization');
  if (bearer?.startsWith('Bearer ') && bearer.slice(7) === expected) return true;
  return req.headers.get(TOKEN_HEADER) === expected;
}

export function middleware(req: NextRequest) {
  const expected = process.env.MD_API_TOKEN;
  if (!expected) return NextResponse.next();

  // CORS preflight cannot carry credentials, so it has to pass through and be
  // answered by the route's own OPTIONS handler.
  if (req.method === 'OPTIONS') return NextResponse.next();

  if (isAuthorized(req, expected)) return NextResponse.next();

  // Distinct from Schwab's own 401/REAUTH_REQUIRED so the app can tell a bad
  // API token apart from an expired Schwab session.
  const res = NextResponse.json({ error: 'MD_TOKEN_INVALID' }, { status: 401 });
  res.headers.set('Access-Control-Allow-Origin', '*');
  return res;
}

export const config = {
  matcher: '/api/md/:path*',
};
