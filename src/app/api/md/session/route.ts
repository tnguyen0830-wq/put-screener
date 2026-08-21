import { readTokens } from '@/lib/schwab';
import { jsonWithCors, corsOptionsResponse, errorResponse } from '@/lib/md-cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return corsOptionsResponse();
}

// Lets the app warn about Schwab's 7-day refresh-token expiry BEFORE a scan
// fails on it. Mirrors /api/auth/status, but lives under /api/md/* so it shares
// that prefix's CORS helper and MD_API_TOKEN gate. Returns no token material -
// only how long the current session has left.
export async function GET() {
  try {
    const t = await readTokens();
    if (!t) return jsonWithCors({ connected: false, daysLeft: 0 });

    const msLeft = t.refresh_expires_at - Date.now();
    return jsonWithCors({
      connected: msLeft > 0,
      daysLeft: Math.max(0, msLeft / 86_400_000),
      expiresAt: t.refresh_expires_at,
    });
  } catch (e: any) {
    return errorResponse(String(e.message ?? e), 500);
  }
}
