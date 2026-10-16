import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/userstore';
import { roleOf } from '@/lib/users';
import { readWatchlist } from '@/lib/watchlist';
import { addLevel, readLevels, readSnapshot, rearmLevel, removeLevel } from '@/lib/pricewatch';
import { getLastRun, startAlertLoop } from '@/lib/alert-runner';
import { telegramConfigured, webPushConfigured } from '@/lib/notify';
import { logActivity } from '@/lib/activity';

/**
 * Tab Alerts. Mở cho người nhà: mức giá là của CHÍNH người gọi (danh tính
 * từ header middleware gắn), bảng "gần hỗ trợ" lọc theo watchlist của họ.
 * Chủ app thấy cả phạm vi vòng lặp đang kiểm (vị thế ∪ mọi watchlist) —
 * đó cũng chính là tập mã mà Telegram của chủ app sẽ rung về.
 *
 * GET gọi `startAlertLoop()` như `/api/alerts/status` và `/api/analyze`:
 * sau mỗi deploy vòng lặp chỉ sống lại khi có route nào đó chạm tới nó, và
 * tab này tồn tại để xem thứ vòng lặp đó tính.
 */
export const dynamic = 'force-dynamic';

async function scopeFor(user: string): Promise<Set<string> | null> {
  if (roleOf(user) === 'owner') return null; // null = không lọc
  const mine = await readWatchlist(user).catch(() => [] as string[]);
  return new Set(mine.map((s) => s.toUpperCase()));
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });
  startAlertLoop();
  const [snap, levels, scope] = await Promise.all([readSnapshot(), readLevels(user), scopeFor(user)]);
  const rows = snap ? (scope ? snap.rows.filter((r) => scope.has(r.symbol)) : snap.rows) : [];
  /* Giá hiện tại của mã có mức đặt: lấy từ ảnh chụp nếu mã nằm trong phạm
     vi, để bảng mức in được "còn cách bao nhiêu" mà không tốn request. */
  const last: Record<string, number | null> = {};
  for (const r of snap?.rows ?? []) last[r.symbol] = r.price;
  const lr = getLastRun();
  return NextResponse.json({
    user,
    role: roleOf(user),
    rows,
    report: snap?.report ?? null,
    levels,
    last,
    channels: { telegram: telegramConfigured(), webPush: webPushConfigured() },
    loopAt: lr?.at ?? null,
    loopErrors: lr?.errors ?? [],
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  /* Giá hiện tại để suy hướng: đọc từ ảnh chụp (0 request); không có thì
     hỏi Schwab một mã — rẻ, và hướng sai là mức báo không bao giờ chạm. */
  let last: number | null = null;
  const symbol = String(body?.symbol ?? '').trim().toUpperCase();
  const snap = await readSnapshot();
  const row = snap?.rows.find((r) => r.symbol === symbol);
  if (row && row.price !== null) last = row.price;
  else if (symbol) {
    try {
      const { quotes } = await import('@/lib/schwab');
      const q = await quotes([symbol]);
      const p = Number(q?.[symbol]?.quote?.lastPrice);
      last = Number.isFinite(p) ? p : null;
    } catch {
      last = null;
    }
  }
  const res = await addLevel(user, body ?? {}, last);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error === 'TOO_MANY' ? 409 : 400 });
  await logActivity(user, 'watchlist', `level ${res.level.symbol} ${res.level.price}`);
  return NextResponse.json({ level: res.level, last });
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? '');
  const level = id ? await rearmLevel(user, id) : null;
  if (!level) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ level });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const removed = id ? await removeLevel(user, id) : false;
  if (!removed) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

