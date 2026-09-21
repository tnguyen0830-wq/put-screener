/**
 * Phần THUẦN của bảng quyền chọn 0DTE — KHÔNG import gì, cùng lý do
 * `daytrade.ts` và `internals-pure.ts` đã ghi.
 *
 * ============================================================
 * MỘT CÂU HỎI CHƯA AI TRẢ LỜI, VÀ FILE NÀY SINH RA ĐỂ ĐO NÓ
 * ============================================================
 *
 * #103/#108 đã đo được ở production: Schwab trả chuỗi SPX **đủ 3600 hợp
 * đồng, `status=SUCCESS`**, nhưng `openInterest: 0` và `gamma: 0` trên TẤT
 * CẢ — lỗi API của Schwab với `assetMainType=INDEX`, đã báo cho Schwab, và
 * thinkorswim trên CÙNG tài khoản có OI thật nên KHÔNG phải chuyện quyền
 * dữ liệu.
 *
 * Nhưng hai phép đo đó chỉ soi `gamma` và `openInterest` — vì GEX =
 * gamma × OI, không ai cần nhìn `bid`/`ask`. **Bảng 0DTE thì chỉ cần
 * bid/ask**, nên câu hỏi quyết định là một câu chưa từng được hỏi: chuỗi
 * rỗng-ruột-về-OI ấy có mang GIÁ thật không?
 *
 * Vì thế `usableQuoteCount()` đếm theo **bid/ask**, KHÔNG theo OI như
 * `usableContractCount()` của `gex.ts`. Dùng lại hàm kia ở đây sẽ loại sạch
 * SPX vì một lý do không liên quan gì tới thứ bảng này cần — và loại sạch
 * một cách im lặng, đúng hình dạng lỗi tệ nhất.
 *
 * `zeroDteDiagnosis()` đếm RIÊNG ba thứ (báo giá / OI / gamma) nên màn hình
 * nói được chính xác Schwab thiếu cái gì, thay vì một dòng "không có dữ
 * liệu" gộp ba nguyên nhân cần ba cách xử lý khác nhau.
 */

/* ------------------------------------------------------------------ *
 * Kiểu dữ liệu
 * ------------------------------------------------------------------ */

export type Leg = {
  bid: number | null;
  ask: number | null;
  /** (bid+ask)/2, chỉ khi CÓ CẢ HAI. Một bên thiếu thì không có giá giữa —
   *  lấy bên còn lại làm "giá" là bịa ra một mức không ai chào. */
  mid: number | null;
  last: number | null;
  volume: number | null;
  /** `null` khi Schwab không trả — với chỉ số thì hiện đang là 0 ở mọi hợp
   *  đồng (lỗi API đã ghi ở trên), và 0 được giữ nguyên là 0 chứ không đổi
   *  thành null: "Schwab nói 0" và "Schwab không nói gì" là hai chuyện. */
  openInterest: number | null;
  delta: number | null;
  symbol: string | null;
};

export type LadderRow = {
  strike: number;
  call: Leg | null;
  put: Leg | null;
  /** Khoảng cách tới giá hiện tại, để màn hình tô đậm dải quanh tiền. */
  distance: number;
};

export type ZeroDteDiagnosis = {
  contracts: number;
  /** Số hợp đồng có bid HOẶC ask > 0 — con số quyết định bảng này sống hay chết. */
  withQuote: number;
  withOpenInterest: number;
  withGamma: number;
  /** Kỳ đáo hạn Schwab thật sự trả về (khoá `YYYY-MM-DD:dte`). */
  expirations: string[];
  /** Một hợp đồng nguyên văn + KIỂU từng trường. Kiểu mới là thứ phân biệt
   *  "Schwab không gửi" với "Schwab gửi dưới dạng chuỗi" (#97). */
  sample: Record<string, unknown> | null;
};

export type ExpectedMove = {
  /** Strike gần giá hiện tại nhất — nơi lấy straddle. */
  strike: number;
  /** Giá straddle ATM (call mid + put mid). */
  straddle: number;
  /** straddle / spot × 100. */
  pct: number;
  /** Hai biên spot ± straddle. */
  low: number;
  high: number;
};

/* ------------------------------------------------------------------ *
 * Đọc dung thứ
 * ------------------------------------------------------------------ */

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Schwab (kế thừa TD Ameritrade) dùng -999.0 làm cờ "không tính được" cho
 *  greeks. Nó là số hữu hạn nên lọt mọi phép kiểm ngây thơ — #97 đã bị. */
const SENTINEL = -999;

function greek(v: unknown): number | null {
  const n = num(v);
  if (n === null || n === SENTINEL) return null;
  return n;
}

/** Giá chào phải > 0 mới là giá chào. Schwab trả `bid: 0` cho hợp đồng
 *  không ai mua; đó là thông tin thật nhưng KHÔNG phải một mức giá, và
 *  dùng nó làm giá giữa sẽ kéo straddle xuống một con số không tồn tại. */
function price(v: unknown): number | null {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
}

function toLeg(c: any): Leg | null {
  if (!c) return null;
  const bid = price(c?.bid);
  const ask = price(c?.ask);
  return {
    bid,
    ask,
    mid: bid !== null && ask !== null ? (bid + ask) / 2 : null,
    last: price(c?.last),
    volume: num(c?.totalVolume),
    openInterest: num(c?.openInterest),
    delta: greek(c?.delta),
    symbol: typeof c?.symbol === 'string' ? c.symbol : null,
  };
}

/* ------------------------------------------------------------------ *
 * Duyệt chuỗi
 * ------------------------------------------------------------------ */

function eachContract(chain: any, fn: (c: any, side: 'call' | 'put', strike: number) => void) {
  const maps: [any, 'call' | 'put'][] = [
    [chain?.callExpDateMap, 'call'],
    [chain?.putExpDateMap, 'put'],
  ];
  for (const [map, side] of maps) {
    for (const expKey of Object.keys(map ?? {})) {
      for (const strikeKey of Object.keys(map[expKey] ?? {})) {
        const strike = num(strikeKey);
        if (strike === null) continue;
        for (const c of map[expKey][strikeKey] ?? []) fn(c, side, strike);
      }
    }
  }
}

export function zeroDteDiagnosis(chain: any): ZeroDteDiagnosis {
  let contracts = 0;
  let withQuote = 0;
  let withOpenInterest = 0;
  let withGamma = 0;
  let sample: Record<string, unknown> | null = null;

  eachContract(chain, (c) => {
    contracts++;
    if (price(c?.bid) !== null || price(c?.ask) !== null) withQuote++;
    if (num(c?.openInterest)) withOpenInterest++;
    if (greek(c?.gamma)) withGamma++;
    if (!sample) {
      sample = {
        symbol: c?.symbol,
        bid: c?.bid,
        bidType: typeof c?.bid,
        ask: c?.ask,
        askType: typeof c?.ask,
        totalVolume: c?.totalVolume,
        openInterest: c?.openInterest,
        oiType: typeof c?.openInterest,
        gamma: c?.gamma,
        gammaType: typeof c?.gamma,
      };
    }
  });

  const expirations = [
    ...new Set([
      ...Object.keys(chain?.callExpDateMap ?? {}),
      ...Object.keys(chain?.putExpDateMap ?? {}),
    ]),
  ].sort();

  return { contracts, withQuote, withOpenInterest, withGamma, expirations, sample };
}

/** Số hợp đồng CÓ GIÁ CHÀO. Đây — chứ không phải open interest — là phép
 *  kiểm "chuỗi này dùng được không" cho bảng 0DTE. Xem khối chú thích đầu
 *  file: dùng nhầm phép kiểm của `gex.ts` sẽ giết SPX một cách im lặng. */
export function usableQuoteCount(chain: any): number {
  let n = 0;
  eachContract(chain, (c) => {
    if (price(c?.bid) !== null || price(c?.ask) !== null) n++;
  });
  return n;
}

/**
 * Dựng thang strike. CHỈ giữ strike có ít nhất một bên mang giá chào — một
 * hàng trống trơn giữa bảng không nói thêm được gì và đẩy hàng có tin ra
 * khỏi màn hình.
 */
export function buildLadder(chain: any, spot: number | null): LadderRow[] {
  const byStrike = new Map<number, { call?: any; put?: any }>();
  eachContract(chain, (c, side, strike) => {
    const slot = byStrike.get(strike) ?? {};
    // Một strike chỉ có MỘT hợp đồng mỗi bên trong một kỳ đáo hạn; nếu
    // Schwab trả nhiều (kỳ tuần + kỳ tháng trùng ngày) thì giữ cái ĐẦU và
    // không trộn, vì trộn hai hợp đồng khác nhau thành một hàng là nói dối.
    if (!slot[side]) slot[side] = c;
    byStrike.set(strike, slot);
  });

  const rows: LadderRow[] = [];
  for (const [strike, slot] of byStrike) {
    const call = toLeg(slot.call);
    const put = toLeg(slot.put);
    const hasQuote =
      (call && (call.bid !== null || call.ask !== null)) ||
      (put && (put.bid !== null || put.ask !== null));
    if (!hasQuote) continue;
    rows.push({
      strike,
      call,
      put,
      distance: spot !== null ? Math.abs(strike - spot) : Number.POSITIVE_INFINITY,
    });
  }
  rows.sort((a, b) => a.strike - b.strike);
  return rows;
}

/**
 * Biên dao động thị trường đang định giá cho hôm nay = giá straddle ATM.
 *
 * CỐ Ý không nhân thêm hệ số nào. Nhiều nơi nhân 0,85 cho "chính xác hơn";
 * đó là một MÔ HÌNH, và luật của repo là code chỉ tính từ số thật còn mô
 * hình thì không tự dựng. Giá straddle là con số CHÍNH THỊ TRƯỜNG đang
 * chào — nói đúng tên nó, để người đọc biết mình đang nhìn gì.
 *
 * Đòi CẢ HAI chân có giá giữa: một chân thiếu thì không có straddle, và
 * lấy một chân nhân đôi là bịa.
 */
export function expectedMove(rows: LadderRow[], spot: number | null): ExpectedMove | null {
  if (spot === null || !rows.length) return null;
  let best: LadderRow | null = null;
  for (const r of rows) {
    if (r.call?.mid == null || r.put?.mid == null) continue;
    if (!best || Math.abs(r.strike - spot) < Math.abs(best.strike - spot)) best = r;
  }
  if (!best) return null;
  const straddle = best.call!.mid! + best.put!.mid!;
  return {
    strike: best.strike,
    straddle,
    pct: (straddle / spot) * 100,
    low: spot - straddle,
    high: spot + straddle,
  };
}

export function underlyingPrice(chain: any): number | null {
  return num(chain?.underlyingPrice) ?? num(chain?.underlying?.last) ?? null;
}

/** Ngày giao dịch New York dạng `YYYY-MM-DD`. Chuỗi 0DTE phải hỏi theo
 *  ngày NEW YORK: lúc 20:00 ET thì ngày UTC đã sang hôm sau, và hỏi nhầm
 *  ngày sẽ trả về chuỗi RỖNG trông y như "hôm nay không có kỳ đáo hạn". */
export function nyToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Khoá kỳ đáo hạn của Schwab là `YYYY-MM-DD:dte`. Trả về phần ngày. */
export function expiryDate(key: string): string {
  const i = key.indexOf(':');
  return i === -1 ? key : key.slice(0, i);
}
