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
export type GexChainWindow = {
  days: number;
  strikeCount?: number;
  /** Số kỳ đáo hạn thực sự lấy được ở chế độ ghép. */
  expirations?: number;
  /** Phải xin từng kỳ đáo hạn rồi ghép lại (SPX) - xem fullChainSliced(). */
  sliced?: boolean;
};

/** Các mức UW trả về. Cùng hình dạng với UwGexLevels ở uwgex.ts - khai báo
 *  lại ở đây để gex.ts (thuần tính toán, không gọi mạng) và các component
 *  không phải kéo theo cả module gọi API của UW. */
export type GexUwLevels = {
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

export type GexLevelsResponse = {
  source: 'uw';
  symbol: string;
  levels: GexUwLevels;
  /** Lỗi thật của Schwab đã khiến phải quay sang UW - giữ lại để không ai
   *  tưởng dùng UW ở đây là lựa chọn thiết kế. */
  schwabDetail?: string;
};

/**
 * Cả hai nguồn cùng chết. Trả về bản đọc gần nhất đã lưu trên đĩa thay vì
 * một màn hình trống - nhưng LUÔN kèm `at` và một cờ nguồn riêng, vì một
 * bảng số cũ 3 tiếng trông y hệt một bảng số vừa lấy về. Đây là đúng cái
 * bẫy "im lặng đọc thành mọi thứ vẫn ổn" mà app này tránh, nên số cũ phải
 * tự khai là số cũ.
 */
export type GexCacheResponse = {
  source: 'cache';
  symbol: string;
  /** ISO time của lần đọc đã lưu. */
  at: string;
  spot: number | null;
  schwab: GexSnapshotLevels | null;
  uw: GexUwLevels | null;
  /** Vì sao phải dùng số cũ: lỗi thật của cả hai nguồn, không gộp làm một. */
  schwabDetail?: string;
  uwDetail?: string;
};

/** Phần mức của một bản đọc Schwab, đủ để so sánh và để hiện lại khi cả hai
 *  nguồn chết. Không lưu `strikes` - hàng trăm dòng mỗi lần đọc sẽ làm file
 *  lịch sử phình ra rất nhanh, mà biểu đồ cột thì cũ rồi cũng không nên vẽ
 *  lại như số sống. */
export type GexSnapshotLevels = {
  putWall: number | null;
  callWall: number | null;
  zeroGamma: number | null;
  absGamma: number | null;
  totalGex: number;
};

type RawContract = {
  strikePrice: number;
  gamma: number;
  openInterest: number;
};

/**
 * Đọc một số từ Schwab một cách khoan dung: chấp nhận cả số lẫn chuỗi số.
 *
 * Vì sao cần: `Number.isFinite('0.05')` là **false** - nó chỉ đúng với kiểu
 * number, không tự ép chuỗi. Nên nếu Schwab trả greeks dưới dạng chuỗi cho
 * một loại hợp đồng nào đó (đã thấy chuyện này ở UW's gex-levels, mọi giá
 * trị đều là chuỗi), bộ lọc cũ sẽ loại sạch MỌI hợp đồng mà không báo gì -
 * đúng triệu chứng SPX: Schwab trả về đầy đủ, app bảo "không đủ dữ liệu
 * gamma".
 */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    // Chuỗi rỗng phải thành null chứ KHÔNG phải 0: Number('') === 0.
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Schwab (kế thừa từ TD Ameritrade) dùng -999.0 làm cờ "không tính được"
 *  cho greeks, chứ không phải null. Để nguyên thì một hợp đồng không có
 *  gamma sẽ được cộng vào như gamma = -999 - ra một con số GEX sai hoàn
 *  toàn mà trông vẫn như số thật. */
const SENTINEL = -999;

function gammaOf(c: any): number | null {
  const g = num(c?.gamma);
  if (g === null || g === SENTINEL) return null;
  return g;
}

/** Vì sao một chuỗi trả về đầy đủ mà vẫn không tính được gì. Chỉ dựng khi
 *  computeGex() thất bại - xem gexDiagnostics(). */
export type GexDiagnosis = {
  expirations: number;
  contracts: number;
  /** Số hợp đồng bị loại, tách theo lý do - mỗi lý do sửa một kiểu khác nhau. */
  droppedNoGamma: number;
  droppedSentinelGamma: number;
  droppedNoOi: number;
  droppedNoStrike: number;
  spot: number | null;
  /** Nguyên văn một hợp đồng thật kèm KIỂU dữ liệu của từng trường - thứ
   *  duy nhất phân biệt được "Schwab không gửi gamma" với "Schwab gửi gamma
   *  dưới dạng chuỗi". */
  sample?: string;
};

function collect(map: any): { exp: string; contracts: RawContract[] }[] {
  const out: { exp: string; contracts: RawContract[] }[] = [];
  for (const expKey of Object.keys(map ?? {})) {
    const contracts: RawContract[] = [];
    for (const strikeKey of Object.keys(map[expKey])) {
      for (const c of map[expKey][strikeKey]) {
        const gamma = gammaOf(c);
        const oi = num(c?.openInterest);
        // strikePrice cũng đi qua num(): khoá của map là chuỗi ("6000.0"),
        // nên trường bên trong cũng có thể là chuỗi ở một số phản hồi.
        const strike = num(c?.strikePrice) ?? num(strikeKey);
        if (gamma === null || !oi || strike === null) continue;
        contracts.push({ strikePrice: strike, gamma, openInterest: oi });
      }
    }
    out.push({ exp: expKey.split(':')[0], contracts });
  }
  return out;
}

/**
 * Chẩn đoán khi Schwab trả về một chuỗi trông đầy đủ nhưng computeGex()
 * không dựng được gì. Liệt kê các khoá cấp cao nhất là chưa đủ - nó chỉ nói
 * "có callExpDateMap", không nói vì sao mọi hợp đồng bên trong đều bị loại.
 * Đây đúng là idiom tự chẩn đoán của repo này, đẩy sâu thêm một tầng.
 */
export function gexDiagnosis(chain: any): GexDiagnosis {
  const d: GexDiagnosis = {
    expirations: 0,
    contracts: 0,
    droppedNoGamma: 0,
    droppedSentinelGamma: 0,
    droppedNoOi: 0,
    droppedNoStrike: 0,
    spot: num(chain?.underlyingPrice ?? chain?.underlying?.last ?? chain?.underlying?.mark),
  };
  for (const map of [chain?.callExpDateMap, chain?.putExpDateMap]) {
    for (const expKey of Object.keys(map ?? {})) {
      d.expirations++;
      for (const strikeKey of Object.keys(map[expKey] ?? {})) {
        for (const c of map[expKey][strikeKey] ?? []) {
          d.contracts++;
          if (!d.sample) {
            d.sample = JSON.stringify({
              gamma: c?.gamma,
              gammaType: typeof c?.gamma,
              openInterest: c?.openInterest,
              oiType: typeof c?.openInterest,
              strikePrice: c?.strikePrice,
              strikeType: typeof c?.strikePrice,
            });
          }
          const rawG = num(c?.gamma);
          if (rawG === SENTINEL) d.droppedSentinelGamma++;
          else if (rawG === null) d.droppedNoGamma++;
          if (!num(c?.openInterest)) d.droppedNoOi++;
          if (num(c?.strikePrice) === null && num(strikeKey) === null) d.droppedNoStrike++;
        }
      }
    }
  }
  return d;
}

export function computeGex(chain: any, symbol: string): GexProfile | null {
  const spot = num(
    chain?.underlyingPrice ?? chain?.underlying?.last ?? chain?.underlying?.mark
  );
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
