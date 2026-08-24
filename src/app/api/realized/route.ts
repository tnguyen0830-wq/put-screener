import { NextResponse } from 'next/server';
import { traderGet } from '@/lib/schwab';
import { realizedPl } from '@/lib/realized';

/**
 * Lời/lỗ đã chốt trong năm, dựng lại từ lịch sử giao dịch Schwab.
 *
 * Tách khỏi /api/positions vì đắt hơn hẳn: mỗi tài khoản cần vài lần gọi
 * (mỗi lần tối đa một năm lịch sử), trong khi bảng vị thế phải nhẹ để định
 * giá lại mỗi phút. Trang gọi endpoint này một lần khi mở, không lặp lại.
 */
export const dynamic = 'force-dynamic';

/**
 * Tải lùi ngần này năm để có giá vốn cho các lô mua từ trước.
 *
 * Lệnh bán năm nay có thể khớp vào lô mua từ nhiều năm trước; không có lô đó
 * thì mã bị gọi tên trong `unknownBasis` và bỏ khỏi tổng. Ba năm là đủ cho
 * phần lớn danh mục mà vẫn chỉ vài lần gọi.
 */
const YEARS_BACK = 3;

const iso = (d: Date) => d.toISOString().slice(0, 19) + '.000Z';

/** Bóc mã HTTP ra khỏi thông báo lỗi mà lib schwab ném ra. */
const statusFrom = (msg: string) => {
  const m = msg.match(/\s(\d{3}):/);
  return m ? Number(m[1]) : null;
};

export async function GET() {
  try {
    // Endpoint giao dịch nhận mã tài khoản đã mã hoá, không phải số tài khoản
    // thật - hai thứ khác nhau, phải hỏi riêng.
    const numbers = await traderGet('/accounts/accountNumbers');
    const hashes: string[] = (Array.isArray(numbers) ? numbers : [])
      .map((a: any) => a?.hashValue)
      .filter((h: any): h is string => typeof h === 'string' && h.length > 0);

    if (!hashes.length) {
      return NextResponse.json({ error: 'NO_ACCOUNTS', reason: 'NO_ACCOUNTS' }, { status: 502 });
    }

    const now = new Date();
    const year = now.getUTCFullYear();
    const all: any[] = [];
    // Mỗi lần gọi tối đa một năm - Schwab giới hạn khoảng ngày, nên chia nhỏ
    // theo từng năm thay vì hỏi một lần rồi bị từ chối.
    for (const hash of hashes) {
      for (let back = YEARS_BACK; back >= 0; back--) {
        const start = new Date(Date.UTC(year - back, 0, 1));
        const end = back === 0 ? now : new Date(Date.UTC(year - back, 11, 31, 23, 59, 59));
        const page = await traderGet(`/accounts/${hash}/transactions`, {
          startDate: iso(start),
          endDate: iso(end),
        });
        if (Array.isArray(page)) all.push(...page);
      }
    }

    const result = realizedPl(all, year);
    return NextResponse.json({ year, ...result });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('REAUTH_REQUIRED')) {
      return NextResponse.json(
        { error: 'SCHWAB_SESSION_EXPIRED', reason: 'SCHWAB_SESSION_EXPIRED' },
        { status: 401 }
      );
    }
    // Kèm nguyên văn lỗi Schwab trả về (cắt ngắn). Endpoint giao dịch chưa
    // từng chạy thật lần nào từ phiên này, nên nếu tên đường dẫn hay định
    // dạng ngày sai thì chính câu trả lời của Schwab mới nói ra được - đoán
    // lần nữa từ đây thì không.
    return NextResponse.json(
      {
        error: 'NO_TRADER_ACCESS',
        reason: 'NO_TRADER_ACCESS',
        status: statusFrom(msg),
        detail: msg.slice(0, 400),
      },
      { status: 502 }
    );
  }
}
