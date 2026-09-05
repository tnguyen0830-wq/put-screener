/**
 * Gamma exposure, computed locally from the Schwab option chain.
 *
 * No subscription needed: GEX is not proprietary data, it is arithmetic on
 * gamma and open interest, both of which the chain endpoint already returns.
 * The convention below is the common dealer-inventory assumption — dealers are
 * long calls and short puts against retail — which is what every public GEX
 * chart uses. It is a model, not observed positioning.
 */

export type StrikeGex = {
  strike: number;
  callGex: number; // dollars of delta per 1% move
  putGex: number; // negative
  netGex: number;
  callOi: number;
  putOi: number;
};

export type GexProfile = {
  symbol: string;
  spot: number;
  expirations: string[];
  strikes: StrikeGex[];
  /** Strike whose NET gamma (call + put) is the most negative — the heaviest
   *  put-dominated strike, usually behaves as support. Null when no strike is
   *  net negative at all. */
  putWall: number | null;
  /** Strike whose NET gamma is the most positive — the heaviest call-dominated
   *  strike, usually behaves as resistance. Null when no strike is net
   *  positive at all. */
  callWall: number | null;
  /** Where cumulative net GEX flips sign. Above it dealers dampen moves. */
  zeroGamma: number | null;
  /** Strike carrying the most gamma of either sign combined - the single
   *  price the most hedging flow is anchored to. Different from the walls
   *  (each net, so each one-signed) and from zero gamma (a crossing, not a
   *  strike): a strike can be the biggest overall while being neither wall,
   *  and the ATM strike is often huge on both sides yet nets out small. */
  absGamma: number | null;
  totalGex: number;
};

/**
 * Khi Schwab không trả được chuỗi cho một mã (SPX, xem uwgex.ts), route
 * /api/gex quay sang lấy các mức của Unusual Whales. Kiểu trả về khác hẳn
 * GexProfile - CỐ TÌNH khác, không nhét bừa vào cùng một hình dạng: UW chỉ
 * cho các mức chính, không có gamma theo từng strike, nên không vẽ được
 * biểu đồ cột. Giao diện phải phân biệt được hai nguồn để nói thẳng con số
 * đang xem là app tự tính hay do UW cung cấp.
 */
/** Cửa sổ dữ liệu thật đã xin được từ Schwab. Kèm theo profile để giao
 *  diện nói rõ khi phải thu hẹp - một wall tính trên 7 ngày/60 strike KHÔNG
 *  phải cùng một con số với wall tính trên 60 ngày/mọi strike, và hai cái
 *  đó mà trông giống hệt nhau thì người đọc không có cách nào biết. */
export type GexChainWindow = { days: number; strikeCount?: number };

export type GexLevelsResponse = {
  source: 'uw';
  symbol: string;
  levels: {
    ticker: string;
    callWall: number | null;
    putWall: number | null;
    gammaFlip: number | null;
    gammaMagnet: number | null;
    nearbyFlips: number[];
    basis: string | null;
    date: string | null;
    time: string | null;
    rawKeys?: string[];
  };
  /** Lỗi thật của Schwab đã khiến phải quay sang UW - giữ lại để không ai
   *  tưởng dùng UW ở đây là lựa chọn thiết kế. */
  schwabDetail?: string;
};

type RawContract = {
  strikePrice: number;
  gamma: number;
  openInterest: number;
};

function collect(map: any): { exp: string; contracts: RawContract[] }[] {
  const out: { exp: string; contracts: RawContract[] }[] = [];
  for (const expKey of Object.keys(map ?? {})) {
    const contracts: RawContract[] = [];
    for (const strikeKey of Object.keys(map[expKey])) {
      for (const c of map[expKey][strikeKey]) {
        if (!Number.isFinite(c.gamma) || !c.openInterest) continue;
        contracts.push({
          strikePrice: c.strikePrice,
          gamma: c.gamma,
          openInterest: c.openInterest,
        });
      }
    }
    out.push({ exp: expKey.split(':')[0], contracts });
  }
  return out;
}

export function computeGex(chain: any, symbol: string): GexProfile | null {
  const spot =
    chain?.underlyingPrice ?? chain?.underlying?.last ?? chain?.underlying?.mark;
  if (!spot) return null;

  // One contract covers 100 shares; the 0.01 scales the answer to a 1% move.
  const notional = spot * spot * 0.01 * 100;

  const calls = collect(chain.callExpDateMap);
  const puts = collect(chain.putExpDateMap);
  const expirations = Array.from(
    new Set([...calls, ...puts].map((e) => e.exp))
  ).sort();

  const byStrike = new Map<number, StrikeGex>();
  const bucket = (k: number) => {
    let row = byStrike.get(k);
    if (!row) {
      row = { strike: k, callGex: 0, putGex: 0, netGex: 0, callOi: 0, putOi: 0 };
      byStrike.set(k, row);
    }
    return row;
  };

  for (const e of calls) {
    for (const c of e.contracts) {
      const row = bucket(c.strikePrice);
      row.callGex += c.gamma * c.openInterest * notional;
      row.callOi += c.openInterest;
    }
  }
  for (const e of puts) {
    for (const c of e.contracts) {
      const row = bucket(c.strikePrice);
      row.putGex -= c.gamma * c.openInterest * notional;
      row.putOi += c.openInterest;
    }
  }

  const strikes = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  for (const s of strikes) s.netGex = s.callGex + s.putGex;
  if (!strikes.length) return null;

  /* Tường tính trên gamma RÒNG của từng strike (call + put), không phải trên
     một chiều. Đổi từ "max call gamma / max put gamma" sang cách này sau khi
     đối chiếu TSLA với tapchiphowall (xem CLAUDE.md): cột call cao nhất của
     họ nằm ở 355 nhưng call wall họ ghi là 400, nên "tường" của họ không thể
     là max một chiều. Ba quy tắc ròng dưới đây tái tạo đúng cả ba nhãn của
     họ trên cùng một biểu đồ (put wall 355, call wall 400, abs gamma 355).

     Cách cũ có một hệ quả tệ nhìn thấy ngay trên màn hình: strike ATM thường
     lớn nhất ở CẢ hai chiều, nên put wall = call wall = gamma tuyệt đối =
     đúng một strike ngay tại giá - ba vạch chồng lên nhau, không chỉ ra được
     hỗ trợ dưới hay kháng cự trên. Gamma ròng tách được hai bên vì một strike
     chỉ có thể ròng dương HOẶC ròng âm. */
  let putWall: number | null = null;
  let callWall: number | null = null;
  let absGamma: number | null = null;
  let mostNegative = 0;
  let mostPositive = 0;
  let maxAbs = 0;
  for (const s of strikes) {
    if (s.netGex < mostNegative) {
      mostNegative = s.netGex;
      putWall = s.strike;
    }
    if (s.netGex > mostPositive) {
      mostPositive = s.netGex;
      callWall = s.strike;
    }
    const both = Math.abs(s.callGex) + Math.abs(s.putGex);
    if (both > maxAbs) {
      maxAbs = both;
      absGamma = s.strike;
    }
  }
  /* Không có strike nào ròng dương (hoặc ròng âm) thì KHÔNG có tường bên đó -
     trả null để màn hình hiện "—". Chọn đại strike ít âm nhất làm call wall
     sẽ vẽ ra một vạch kháng cự không tồn tại, đúng kiểu "chưa tính được"
     trông giống "đây là số thật" mà app này tránh. */

  // Zero gamma: walk cumulative net exposure upward and find the sign change.
  let cum = 0;
  let zeroGamma: number | null = null;
  let prevCum = 0;
  let prevStrike = strikes[0].strike;
  for (const s of strikes) {
    cum += s.netGex;
    if (prevCum < 0 && cum >= 0) {
      const span = cum - prevCum;
      const t = span === 0 ? 0 : -prevCum / span;
      zeroGamma = prevStrike + t * (s.strike - prevStrike);
    }
    prevCum = cum;
    prevStrike = s.strike;
  }

  return {
    symbol,
    spot,
    expirations,
    strikes,
    putWall,
    callWall,
    zeroGamma,
    absGamma,
    totalGex: strikes.reduce((a, s) => a + s.netGex, 0),
  };
}
