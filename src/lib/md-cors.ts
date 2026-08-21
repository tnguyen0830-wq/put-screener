import { NextResponse } from 'next/server';

// Additive helper for the new /api/md/* routes that the Pro Sell Put
// Scanner mobile app calls. Kept separate from the existing lib files so
// nothing about the working web screener changes.
//
// Permissive CORS is fine here: this is a personal, local-network dev
// server proxying your own Schwab session, not a multi-tenant public API.

export function jsonWithCors(data: unknown, init?: { status?: number }) {
  const res = NextResponse.json(data, { status: init?.status ?? 200 });
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-md-token');
  return res;
}

export function corsOptionsResponse() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-md-token');
  return res;
}

export function errorResponse(message: string, status = 500) {
  return jsonWithCors({ error: message }, { status });
}
