/**
 * Lời/lỗ đã chốt trong năm, dựng lại từ lịch sử giao dịch Schwab.
 *
 * Endpoint vị thế chỉ biết những gì đang còn giữ, nên tự nó không bao giờ trả
 * lời được câu "cả năm lời lỗ bao nhiêu" - phần đã bán xong trong năm không
 * còn là vị thế nữa. Chỗ duy nhất còn dấu vết là lịch sử giao dịch, và ở đó
 * không có sẵn con số lời/lỗ: phải tự ghép từng lệnh bán với đúng lô đã mua
 * trước đó rồi trừ ra.
 *
 * Ghép theo FIFO - lô mua trước khớp với lệnh bán trước. Đây là quy ước mặc
 * định của Schwab khi không chỉ định lô cụ thể; nếu bạn từng bán theo lô chỉ
 * định thì con số ở đây sẽ lệch với báo cáo thuế, nhưng vẫn đúng về tổng thể
 * danh mục.
 *
 * Điều quan trọng: một lệnh bán mà không tìm được lô mua tương ứng (vì mua từ
 * trước khoảng thời gian tải về) KHÔNG bị tính bằng giá vốn 0 - làm vậy sẽ
 * biến một giao dịch hòa vốn thành khoản lãi khổng lồ giả. Mã đó bị gọi tên
 * trong `unknownBasis` và bỏ ra khỏi tổng, để con số hiện ra là con số thiếu
 * chứ không phải con số sai.
 */

export type Lot = { qty: number; price: number };

export type RealizedResult = {
  /** Lời/lỗ đã chốt trong năm, theo từng mã. */
  bySymbol: Record<string, number>;
  /** Tổng của bySymbol. */
  total: number;
  /** Mã có lệnh bán không tìm được lô mua - đã bỏ khỏi tổng, không đoán bằng 0. */
  unknownBasis: string[];
  /** Số giao dịch đã đọc, để biết có thật sự tải được lịch sử hay không. */
  txCount: number;
  /** Các loại giao dịch gặp phải (type), để một lần nhìn là biết Schwab gọi
   *  hết hạn quyền chọn / bị assign bằng tên gì. */
  types: string[];
  /** Một giao dịch thô mỗi loại, để đối chiếu một lần với app thật thay vì
   *  đoán cách Schwab ghi từng loại - đúng cách đã tìm ra averageLongPrice. */
  samples: Record<string, any>;
};

type Leg = {
  symbol: string;
  qty: number;
  price: number;
  /** 100 cho quyền chọn, 1 cho cổ phiếu. */
  mult: number;
  buy: boolean;
};

/**
 * Bóc các chân giao dịch thật ra khỏi một transaction.
 *
 * `transferItems` trộn chung chứng khoán với phí và hoa hồng; phí luôn có
 * `feeType`, còn chân chứng khoán thì không - đó là cách tách đáng tin hơn
 * việc dò tên từng loại phí.
 */
function legsOf(tx: any): Leg[] {
  const items: any[] = Array.isArray(tx?.transferItems) ? tx.transferItems : [];
  const out: Leg[] = [];
  for (const it of items) {
    if (it?.feeType) continue;
    const inst = it?.instrument;
    const assetType = inst?.assetType;
    if (assetType !== 'EQUITY' && assetType !== 'COLLECTIVE_INVESTMENT' && assetType !== 'OPTION')
      continue;
    const symbol = typeof inst.symbol === 'string' ? inst.symbol : '';
    const amount = it.amount;
    const price = it.price;
    if (!symbol || typeof amount !== 'number' || amount === 0) continue;
    // Quyền chọn hết hạn không có giá: đóng ở 0, tức là bên bán ăn trọn phần
    // credit đã nhận. Đó là kết cục thường gặp nhất của người bán put, bỏ qua
    // thì mất đúng phần lãi lớn nhất.
    const p = typeof price === 'number' ? price : 0;
    out.push({
      symbol,
      qty: Math.abs(amount),
      price: p,
      mult: assetType === 'OPTION' ? 100 : 1,
      buy: amount > 0,
    });
  }
  return out;
}

/** Khớp `want` đơn vị vào hàng đợi lô theo FIFO. Trả về phần khớp được. */
function consume(lots: Lot[], want: number): { matched: number; cost: number } {
  let matched = 0;
  let cost = 0;
  while (want > 0 && lots.length) {
    const lot = lots[0];
    const take = Math.min(lot.qty, want);
    matched += take;
    cost += take * lot.price;
    lot.qty -= take;
    want -= take;
    if (lot.qty <= 0) lots.shift();
  }
  return { matched, cost };
}

/**
 * Dựng lại lời/lỗ đã chốt trong năm `year` từ toàn bộ giao dịch đưa vào.
 *
 * Giao dịch của những năm trước vẫn phải đưa vào - chúng không được tính vào
 * kết quả, nhưng là nguồn giá vốn cho các lô bán ra trong năm nay. Đưa vào
 * càng nhiều năm thì `unknownBasis` càng ngắn.
 */
export function realizedPl(transactions: any[], year: number): RealizedResult {
  const sorted = [...transactions].sort((a, b) =>
    String(a?.tradeDate ?? a?.time ?? '').localeCompare(String(b?.tradeDate ?? b?.time ?? ''))
  );

  const longLots = new Map<string, Lot[]>();
  const shortLots = new Map<string, Lot[]>();
  const bySymbol: Record<string, number> = {};
  const unknown = new Set<string>();
  const types = new Set<string>();
  const samples: Record<string, any> = {};

  const lotsOf = (m: Map<string, Lot[]>, s: string) => {
    let l = m.get(s);
    if (!l) m.set(s, (l = []));
    return l;
  };

  for (const tx of sorted) {
    const type = String(tx?.type ?? 'UNKNOWN');
    types.add(type);
    if (!(type in samples)) samples[type] = tx;

    const when = String(tx?.tradeDate ?? tx?.time ?? '');
    const inYear = when.slice(0, 4) === String(year);

    for (const leg of legsOf(tx)) {
      const longs = lotsOf(longLots, leg.symbol);
      const shorts = lotsOf(shortLots, leg.symbol);
      const opposite = leg.buy ? shorts : longs;

      // Trước hết đóng phần đang mở ngược chiều - đó mới là chỗ sinh ra lời/lỗ.
      const { matched, cost } = consume(opposite, leg.qty);
      if (matched > 0 && inYear) {
        // Mua để đóng vị thế bán khống: lời = giá đã bán - giá mua lại.
        // Bán để đóng vị thế mua: lời = giá bán - giá vốn.
        const pl = leg.buy
          ? (cost - matched * leg.price) * leg.mult
          : (matched * leg.price - cost) * leg.mult;
        bySymbol[leg.symbol] = (bySymbol[leg.symbol] ?? 0) + pl;
      }

      const leftover = leg.qty - matched;
      if (leftover > 0) {
        // Không khớp được lô nào mà vẫn là lệnh đóng trong năm nay thì giá vốn
        // nằm ngoài khoảng đã tải - gọi tên ra thay vì tính bằng 0.
        if (inYear && opposite.length === 0 && matched === 0 && isClose(tx, leg)) {
          unknown.add(leg.symbol);
        }
        (leg.buy ? longs : shorts).push({ qty: leftover, price: leg.price });
      }
    }
  }

  // Mã thiếu giá vốn bị loại hẳn khỏi tổng: một phần con số đúng còn hơn cả
  // con số sai.
  for (const s of unknown) delete bySymbol[s];

  const total = Object.values(bySymbol).reduce((a, b) => a + b, 0);
  return {
    bySymbol,
    total,
    unknownBasis: [...unknown].sort(),
    txCount: transactions.length,
    types: [...types].sort(),
    samples,
  };
}

/**
 * Chân này có phải lệnh đóng vị thế không.
 *
 * Schwab ghi `positionEffect` khi biết; không có thì không kết luận là đóng -
 * thà bỏ sót một cảnh báo còn hơn gắn nhãn "thiếu giá vốn" cho một lệnh mua
 * mở vị thế bình thường.
 */
function isClose(tx: any, leg: Leg): boolean {
  const items: any[] = Array.isArray(tx?.transferItems) ? tx.transferItems : [];
  return items.some(
    (it) => it?.instrument?.symbol === leg.symbol && it?.positionEffect === 'CLOSING'
  );
}
