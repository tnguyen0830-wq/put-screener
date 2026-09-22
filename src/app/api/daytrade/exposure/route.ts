import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/userstore';
import { normalizeSymbol } from '@/lib/watchlist';
import { logActivity } from '@/lib/activity';
import { loadExposure } from '@/lib/daytradefetch';

/**
 * Ba panel phơi nhiễm nhà tạo lập của tab Daytrade, trong MỘT lượt gọi.
 *
 * Cùng khuôn lỗi với `/api/daytrade/zerodte`: hết phiên Schwab trả 401 và
 * KHÔNG BAO GIỜ bị che bằng một nguồn khác (#101) — `loadGexChain()` đã
 * dừng thang ngay ở đó. Mọi lỗi khác trả 502 kèm nguyên văn lý do, cắt ở
 * 300 ký tự với trạng thái đứng trước (#102).
 */
export const dynamic = 'force-dynamic';

const SYMBOL_RE = /^[A-Z$][A-Z0-9/.$]{0,9}$/;
/** Kỳ đáo hạn client gửi lên chỉ được là một ngày. Không phải vì sợ tấn
 *  công — nó chỉ đi vào một phép so sánh chuỗi — mà để một giá trị rác ra
 *  400 nói thẳng, thay vì lặng lẽ rơi về kỳ đầu tiên và người đọc tưởng
 *  mình đang xem kỳ vừa chọn. */
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

  try {
    const r = await loadExposure(symbol, { expiration: exp });
    await logActivity(user, 'daytrade', `MM exposure ${symbol}`);
    return NextResponse.json({ ...r, at: Date.now() });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('REAUTH_REQUIRED') || e?.reauth) {
      return NextResponse.json({ error: 'REAUTH_REQUIRED' }, { status: 401 });
    }
    // GexChainError mang RIÊNG hai lý do (Schwab và CBOE) — giữ nguyên cả
    // hai: một bên là broker, một bên là sàn, và hai cách sửa khác nhau.
    const detail = e?.schwabDetail
      ? `Schwab: ${e.schwabDetail} · CBOE: ${e.cboeDetail ?? '—'}`
      : msg;
    return NextResponse.json(
      { error: 'FAILED', detail: detail.slice(0, 300) },
      { status: 502 }
    );
  }
}
