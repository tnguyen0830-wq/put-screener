import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/userstore';
import { normalizeSymbol } from '@/lib/watchlist';
import { logActivity } from '@/lib/activity';
import { loadDaytrade, BAR_MINUTES, BASELINE_DAYS, MAX_SYMBOLS } from '@/lib/daytradefetch';

/**
 * Nửa CỔ PHIẾU của tab Daytrade: VWAP, mốc phiên trước, khoảng mở cửa và
 * khối lượng tương đối cho tối đa 10 mã.
 *
 * Mở cho người nhà — tab của cả nhà, và chi phí bị chặn cứng bởi
 * `MAX_SYMBOLS`, khác hẳn nút Đồng bộ UW (#192) vốn đốt hạn mức không trần.
 */
export const dynamic = 'force-dynamic';

const SYMBOL_RE = /^[A-Z$][A-Z0-9/.$]{0,9}$/;

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });

  const raw = req.nextUrl.searchParams.get('symbols') ?? '';
  const asked = raw
    .split(',')
    .map((s) => normalizeSymbol(s))
    .filter(Boolean);

  /* Mã sai định dạng bị TÁCH RIÊNG chứ không lặng lẽ biến mất: gõ nhầm một
     mã rồi thấy bảng thiếu một dòng mà không biết vì sao là đúng thứ repo
     này cấm. */
  const symbols = asked.filter((s) => SYMBOL_RE.test(s));
  const rejected = asked.filter((s) => !SYMBOL_RE.test(s));
  if (!symbols.length) {
    return NextResponse.json({ error: 'NO_SYMBOLS', rejected }, { status: 400 });
  }

  const orRaw = Number(req.nextUrl.searchParams.get('or') ?? '15');
  /* Danh sách CHO PHÉP, không phải kẹp khoảng: một giá trị lạ phải rơi về
     mặc định chứ không thành một khoảng mở cửa 7 phút không ai hiểu. */
  const openRangeMinutes = orRaw === 30 ? 30 : 15;

  try {
    const results = await loadDaytrade(symbols, openRangeMinutes);
    await logActivity(user, 'daytrade', symbols.join(' '));
    return NextResponse.json({
      results,
      rejected,
      openRangeMinutes,
      barMinutes: BAR_MINUTES,
      baselineDays: BASELINE_DAYS,
      maxSymbols: MAX_SYMBOLS,
      truncated: symbols.length > MAX_SYMBOLS,
      at: Date.now(),
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // Phiên Schwab chết cần bấm kết nối lại, không phải thử lại — hai cách
    // sửa khác nhau nên hai mã trạng thái khác nhau (#101).
    if (msg.includes('REAUTH_REQUIRED')) {
      return NextResponse.json({ error: 'REAUTH_REQUIRED' }, { status: 401 });
    }
    return NextResponse.json({ error: 'FAILED', detail: msg.slice(0, 300) }, { status: 502 });
  }
}
