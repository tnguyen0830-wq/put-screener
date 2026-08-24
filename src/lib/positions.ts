import { normalizeSymbol } from './watchlist';

/**
 * Danh mục: đọc thẳng từ tài khoản Schwab, không nhập tay.
 *
 * Bản đầu tiên cho nhập tay, vì app chưa được duyệt quyền Accounts and
 * Trading. Giờ đã duyệt, phần nhập tay bị bỏ hẳn - vị thế thật thì lấy từ
 * nguồn thật, không có lý do gì giữ song song một bản gõ tay có thể lệch.
 * Mọi phép tính (giá mua lại, ROC còn lại, khoảng đệm tới strike) giữ
 * nguyên như trước, chỉ đổi nguồn dữ liệu đầu vào.
 */

export type PositionKind = 'put' | 'stock';

export type Position = {
  id: string;
  kind: PositionKind;
  symbol: string;
  /** Ngày mở vị thế. Schwab không trả về qua endpoint vị thế, nên luôn vắng
   *  mặt ở đây - ROC còn lại không cần tới nó, chỉ số ngày đã giữ thì bỏ qua. */
  openedAt?: string;
  /* --- put đã bán --- */
  strike?: number;
  expiration?: string;
  contracts?: number;
  /** Credit nhận được, tính trên mỗi cổ phiếu (1.85 nghĩa là $185 một hợp đồng). */
  credit?: number;
  /* --- cổ phiếu đang giữ --- */
  shares?: number;
  /**
   * Giá vốn trên mỗi cổ phiếu, đọc từ `averagePrice`.
   *
   * Chỉ dùng làm phương án dự phòng. Đối chiếu với app Schwab thật (24/08)
   * cho thấy trường này không khớp giá vốn thật - lệch không theo quy luật
   * cố định (không phải làm tròn hay lệch giờ, vì giá thị trường vẫn khớp).
   * Khi `schwabValue`/`schwabPl` có mặt, chúng mới là nguồn đáng tin: đó là
   * chính con số Schwab đã tính, nên chắc chắn khớp với app của họ.
   */
  cost?: number;
  /** Giá trị thị trường hiện tại của vị thế, theo Schwab tự tính (marketValue). */
  schwabValue?: number;
  /** Lời/lỗ đang mở, theo Schwab tự tính (longOpenProfitLoss). */
  schwabPl?: number;
};

export type SkippedPosition = { symbol: string; reason: string };

/**
 * Ký hiệu hợp đồng quyền chọn theo chuẩn OSI, đúng dạng Schwab dùng cả lúc
 * hỏi giá lẫn lúc trả về trong vị thế.
 *
 *     AAPL 230 put đáo hạn 18/09/2026  ->  "AAPL  260918P00230000"
 *
 * Gốc mã kéo dài đủ 6 ký tự bằng dấu cách, rồi tới ngày đáo hạn yymmdd, chữ P
 * hoặc C, rồi strike nhân 1000 kéo dài đủ 8 chữ số.
 */
export function osiSymbol(
  symbol: string,
  expiration: string,
  strike: number,
  right: 'P' | 'C' = 'P'
): string {
  const root = symbol.replace(/\//g, '').toUpperCase().padEnd(6, ' ');
  const [y, m, d] = expiration.split('-');
  const k = String(Math.round(strike * 1000)).padStart(8, '0');
  return `${root}${y.slice(2)}${m}${d}${right}${k}`;
}

/**
 * Chiều ngược lại: đọc ký hiệu Schwab trả về trong vị thế, tách ra strike và
 * ngày đáo hạn. Trả về null cho bất cứ thứ gì không đúng khuôn 21 ký tự -
 * thà bỏ qua một vị thế lạ còn hơn đọc sai số của nó.
 */
export function parseOsiSymbol(
  sym: string
): { root: string; expiration: string; right: 'P' | 'C'; strike: number } | null {
  if (sym.length !== 21) return null;
  const root = sym.slice(0, 6).trim();
  const datePart = sym.slice(6, 12);
  const right = sym.slice(12, 13);
  const strikePart = sym.slice(13, 21);
  if (!/^[A-Z0-9.]{1,6}$/.test(root)) return null;
  if (!/^\d{6}$/.test(datePart)) return null;
  if (right !== 'P' && right !== 'C') return null;
  if (!/^\d{8}$/.test(strikePart)) return null;

  const yy = Number(datePart.slice(0, 2));
  const mm = datePart.slice(2, 4);
  const dd = datePart.slice(4, 6);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;

  return {
    root,
    expiration: `${2000 + yy}-${mm}-${dd}`,
    right,
    strike: Number(strikePart) / 1000,
  };
}

/** Số ngày giữa hai ngày dạng YYYY-MM-DD, làm tròn theo ngày lịch. */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export type CashSummary = {
  cash: number | null;
  buyingPower: number | null;
  accountValue: number | null;
  /** Tên các trường thật Schwab trả về, để một lần nhìn là biết trường nào
   *  cần đọc nếu ba con số trên trống hết. */
  keys: string[] | null;
};

/**
 * Số dư tiền mặt, gộp trên mọi tài khoản nhìn thấy được.
 *
 * Ba con số, ba câu hỏi khác nhau: `cash` là tiền mặt đang nằm im,
 * `buyingPower` là còn mua/bán được bao nhiêu (tài khoản margin trả về
 * `buyingPower`, tài khoản cash trả về `cashAvailableForTrading` - cái nào có
 * thì lấy cái đó), `accountValue` là tổng giá trị thanh lý cả tài khoản.
 *
 * Mỗi trường được cộng dồn CHỈ khi thật sự đọc được số ở ít nhất một tài
 * khoản; nếu Schwab không trả trường đó ở đâu cả thì kết quả là null, không
 * phải 0 - một tài khoản có tiền thật mà hiện $0 còn tệ hơn hiện dấu gạch.
 * `keys` mang theo tên trường thật của tài khoản đầu tiên, để nếu ba con số
 * đều trống thì một lần nhìn vào response là biết cần đọc tên nào, không
 * phải đoán lại từ đầu.
 */
export function mapCashBalances(accounts: any[]): CashSummary {
  let cash = 0,
    buyingPower = 0,
    accountValue = 0;
  let cashSeen = false,
    bpSeen = false,
    valueSeen = false;
  let keys: string[] | null = null;

  for (const acc of accounts) {
    const b = acc?.securitiesAccount?.currentBalances;
    if (!b || typeof b !== 'object') continue;
    if (!keys) keys = Object.keys(b);

    if (typeof b.cashBalance === 'number') {
      cash += b.cashBalance;
      cashSeen = true;
    }
    const bp =
      typeof b.buyingPower === 'number'
        ? b.buyingPower
        : typeof b.cashAvailableForTrading === 'number'
          ? b.cashAvailableForTrading
          : null;
    if (bp !== null) {
      buyingPower += bp;
      bpSeen = true;
    }
    if (typeof b.liquidationValue === 'number') {
      accountValue += b.liquidationValue;
      valueSeen = true;
    }
  }

  return {
    cash: cashSeen ? cash : null,
    buyingPower: bpSeen ? buyingPower : null,
    accountValue: valueSeen ? accountValue : null,
    keys,
  };
}

/**
 * Ghép vị thế từ toàn bộ tài khoản Schwab nhìn thấy được thành danh sách
 * phẳng - theo lựa chọn gộp chung, không tách riêng từng tài khoản.
 *
 * Chỉ nhận hai hình dạng mà screener này quan tâm: put đã bán (thế chấp bằng
 * tiền) và cổ phiếu đang giữ dài hạn. Mọi thứ khác - quyền chọn mua, put đã
 * mua, cổ phiếu bán khống, quỹ, trái phiếu - bị bỏ qua và gọi tên trong
 * `skipped`, chứ không bị vẽ sai hình hoặc lặng lẽ biến mất.
 */
export function mapSchwabPositions(accounts: any[]): {
  positions: Position[];
  skipped: SkippedPosition[];
} {
  const positions: Position[] = [];
  const skipped: SkippedPosition[] = [];
  let n = 0;

  for (const acc of accounts) {
    const rows: any[] = acc?.securitiesAccount?.positions ?? [];
    for (const p of rows) {
      const inst = p?.instrument ?? {};
      const assetType = inst.assetType;
      const rawSymbol = typeof inst.symbol === 'string' ? inst.symbol : '';
      n += 1;

      if (assetType === 'OPTION') {
        const parsed = parseOsiSymbol(rawSymbol);
        const isShort = (p.shortQuantity ?? 0) > 0;
        const isPut = inst.putCall === 'PUT' || parsed?.right === 'P';

        if (!parsed) {
          skipped.push({ symbol: rawSymbol || '?', reason: 'unrecognized-option-symbol' });
          continue;
        }
        if (!isPut) {
          skipped.push({ symbol: inst.underlyingSymbol ?? parsed.root, reason: 'call-option' });
          continue;
        }
        if (!isShort) {
          skipped.push({ symbol: inst.underlyingSymbol ?? parsed.root, reason: 'long-put' });
          continue;
        }
        const credit = typeof p.averagePrice === 'number' ? p.averagePrice : null;
        const contracts = p.shortQuantity;
        if (!credit || !contracts) {
          skipped.push({ symbol: inst.underlyingSymbol ?? parsed.root, reason: 'missing-price' });
          continue;
        }
        positions.push({
          id: `p${n}`,
          kind: 'put',
          symbol: normalizeSymbol(inst.underlyingSymbol ?? parsed.root),
          strike: parsed.strike,
          expiration: parsed.expiration,
          contracts,
          credit,
        });
        continue;
      }

      if (assetType === 'EQUITY' || assetType === 'COLLECTIVE_INVESTMENT') {
        const shares = p.longQuantity;
        const cost = typeof p.averagePrice === 'number' ? p.averagePrice : null;
        const schwabValue = typeof p.marketValue === 'number' ? p.marketValue : undefined;
        const schwabPl =
          typeof p.longOpenProfitLoss === 'number' ? p.longOpenProfitLoss : undefined;
        if (!shares || shares <= 0) {
          if ((p.shortQuantity ?? 0) > 0)
            skipped.push({ symbol: rawSymbol || '?', reason: 'short-stock' });
          continue;
        }
        // Cần ít nhất một trong hai nguồn giá vốn - averagePrice hoặc cặp
        // marketValue/longOpenProfitLoss - nếu không có gì thì không vẽ được
        // lời/lỗ đáng tin, bỏ qua thay vì đoán bằng 0.
        if (!cost && (schwabValue === undefined || schwabPl === undefined)) {
          skipped.push({ symbol: rawSymbol || '?', reason: 'missing-price' });
          continue;
        }
        positions.push({
          id: `p${n}`,
          kind: 'stock',
          symbol: normalizeSymbol(rawSymbol),
          shares,
          cost: cost ?? 0,
          schwabValue,
          schwabPl,
        });
        continue;
      }

      skipped.push({
        symbol: rawSymbol || '?',
        reason: `asset-type:${assetType ?? 'unknown'}`,
      });
    }
  }

  return { positions, skipped };
}
