import { NextResponse } from 'next/server';
import { authorizeUrl } from '@/lib/schwab';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.redirect(authorizeUrl());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
