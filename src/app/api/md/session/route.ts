import { accessToken, readTokens } from '@/lib/schwab';
import { jsonWithCors, corsOptionsResponse, errorResponse } from '@/lib/md-cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return corsOptionsResponse();
}

// Lets the app warn about Schwab's 7-day refresh-token expiry BEFORE a scan
// fails on it. Lives under /api/md/* so it shares that prefix's CORS helper and
// MD_API_TOKEN gate. Returns no token material - only whether the session works
// and how long it has left.
export async function GET() {
  try {
    const t = await readTokens();
    if (!t) return jsonWithCors({ connected: false, daysLeft: 0, reason: 'NO_TOKENS' });

    // refresh_expires_at is only this app's own bookkeeping. Schwab can revoke
    // a refresh token well before that clock runs out - submitting an app
    // modification does exactly that - and then the countdown keeps reading
    // healthy while every data call 401s. Actually exercising the token is the
    // only honest answer, and it is cheap: accessToken() returns the cached
    // access token unless it genuinely needs refreshing.
    let connected = false;
    let reason: string | null = null;
    try {
      await accessToken();
      connected = true;
    } catch (e: any) {
      reason = String(e?.message ?? e).includes('REAUTH_REQUIRED')
        ? 'REAUTH_REQUIRED'
        : String(e?.message ?? e);
    }

    const msLeft = t.refresh_expires_at - Date.now();
    return jsonWithCors({
      connected,
      daysLeft: connected ? Math.max(0, msLeft / 86_400_000) : 0,
      expiresAt: t.refresh_expires_at,
      reason,
    });
  } catch (e: any) {
    return errorResponse(String(e.message ?? e), 500);
  }
}
