import { traderGet } from '@/lib/schwab';

/**
 * App Schwab này có quyền đọc tài khoản hay không.
 *
 * Market data và Accounts & Trading là hai sản phẩm riêng trên dashboard
 * Schwab, cùng dùng một OAuth. Quét giá chạy tốt không nói lên được gì về
 * quyền đọc tài khoản, mà cách duy nhất biết chắc là gọi thử.
 *
 * Endpoint này tồn tại để trả lời đúng câu đó trước khi có ai bỏ công dựng tab
 * danh mục. Nó cố ý **không** trả về số tài khoản, mã cổ phiếu hay số tiền:
 * trang này hiện chưa có đăng nhập, nên chỗ duy nhất an toàn để nói là "có
 * quyền hay không" và "có bao nhiêu vị thế", chứ không phải chúng là gì.
 */
export const dynamic = 'force-dynamic';

/** Bóc mã HTTP ra khỏi thông báo lỗi mà lib schwab ném ra. */
const statusFrom = (msg: string) => {
  const m = msg.match(/\s(\d{3}):/);
  return m ? Number(m[1]) : null;
};

export async function GET() {
  const out: Record<string, unknown> = {};

  try {
    const nums = await traderGet('/accounts/accountNumbers');
    // Chỉ đếm, không kể tên.
    out.accountsVisible = Array.isArray(nums) ? nums.length : 0;
    out.ok = (out.accountsVisible as number) > 0;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('REAUTH_REQUIRED')) {
      return Response.json({
        ok: false,
        reason: 'SCHWAB_SESSION_EXPIRED',
        next: 'Bấm Kết nối lại trong phần Cài đặt rồi mở lại link này.',
      });
    }
    return Response.json({
      ok: false,
      reason: 'NO_TRADER_ACCESS',
      status: statusFrom(msg),
      // Nguyên văn lời từ chối của Schwab, cắt ngắn: 401 và 403 cần hai cách
      // xử lý khác nhau, và chính họ nói rõ hơn mọi phỏng đoán.
      detail: msg.slice(0, 300),
      next: 'Vào Schwab developer dashboard, kiểm tra app đã được duyệt "Accounts and Trading Production" chưa.',
    });
  }

  // Có quyền rồi thì hỏi luôn xem vị thế trả về ra sao - vẫn chỉ đếm, để biết
  // tab danh mục sẽ phải vẽ những loại gì.
  try {
    const accounts = await traderGet('/accounts', { fields: 'positions' });
    const list: any[] = Array.isArray(accounts) ? accounts : [];
    let equity = 0;
    let option = 0;
    let other = 0;
    for (const a of list)
      for (const p of a?.securitiesAccount?.positions ?? []) {
        const type = p?.instrument?.assetType;
        if (type === 'OPTION') option++;
        else if (type === 'EQUITY' || type === 'COLLECTIVE_INVESTMENT') equity++;
        else other++;
      }
    out.positions = { equity, option, other };
  } catch (e: any) {
    out.positions = { error: String(e?.message ?? e).slice(0, 200) };
  }

  return Response.json(out);
}
