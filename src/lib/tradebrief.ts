import type { ChainContract } from './screener';

/**
 * "AI Trade Briefing" trong khung GEX - gợi ý cấu trúc quyền chọn theo chế độ
 * gamma (put wall/call wall/gamma flip), giống mẫu người dùng đưa ("TSLA
 * MODEL 2 TRADE BRIEFING"). Chia rõ hai phần trách nhiệm:
 *
 * 1) File này tính TOÀN BỘ con số (strike thật lấy từ chuỗi quyền chọn Schwab
 *    đang có, giá mid thật, lãi/lỗ tối đa, breakeven) bằng công thức thanh
 *    toán (payoff) đúng theo lý thuyết, không đoán mò và không cần Claude.
 * 2) Route API gọi Claude CHỈ để viết phần diễn giải (Overview, Rationale,
 *    Trigger) dựa trên đúng những con số đã tính sẵn ở đây - cùng nguyên tắc
 *    "Use only the numbers given. Never invent a figure" đã áp dụng ở
 *    /api/ai. Số liệu định lượng KHÔNG bao giờ do Claude tạo ra.
 *
 * CHƯA làm ở bản này (khác mẫu người dùng đưa, đã báo trước, không lặng lẽ
 * bỏ qua): mô hình biến động Heston (spot_vol/long-run vol/half-life/
 * fwd_curve) - cần dựng riêng một kho lịch sử IV theo nhiều kỳ hạn trước
 * (hiện app chỉ giữ IV/skew của MỘT kỳ hạn tham chiếu mỗi mã, xem
 * `iv-history.json`/`skew-history.json`), rồi hiệu chỉnh (calibrate) quá
 * trình quay về trung bình - việc đủ lớn để làm ở một lượt riêng, có kiểm
 * chứng bằng số thật khi đã deploy, thay vì ước lượng liều trong bản này.
 * Vol ở đây thay bằng so sánh IV/HV20/HV60 + độ dốc term structure đã có sẵn
 * trong app (`realizedVol`, `termStructureAndSkew`) - đọc được ngay, không
 * bịa số.
 *
 * Lịch Calendar Spread cũng KHÔNG có trong bản này: lãi/lỗ tối đa của
 * calendar phụ thuộc giá trị thời gian còn lại của chân gần khi chân xa đáo
 * hạn - cần một mô hình định giá quyền chọn (không chỉ nội tại như các cấu
 * trúc khác), việc khác hẳn phần còn lại của file này.
 */

export type Regime = 'POSITIVE' | 'NEGATIVE';
export type Right = 'call' | 'put';
export type Bias = 'Bullish' | 'Bearish' | 'Neutral' | 'Neutral-Bullish' | 'Neutral-Bearish';

export type TradeLeg = {
  action: 'buy' | 'sell';
  right: Right;
  strike: number;
  mark: number;
  delta: number | null;
  theta: number | null;
  vega: number | null;
};

export type TradeIdea = {
  id: string;
  kind: string;
  bias: Bias;
  /** "Buy 376 Call / Sell 400 Call" - không kèm tên chiến lược, tên chiến
   *  lược nằm ở `kind` + hiển thị riêng ở UI. */
  legsLabel: string;
  legs: TradeLeg[];
  dte: number;
  expiration: string;
  /** Dương = trả (debit), âm = thu (credit) - tổng theo giá mid từng chân. */
  netCost: number;
  greeks: { delta: number | null; vega: number | null; theta: number | null };
  /** null = không giới hạn (chỉ đúng khi có chân short call trần trụi -
   *  short put trần trụi lỗ tối đa vẫn hữu hạn vì giá không xuống dưới 0,
   *  KHÁC quy ước lỏng lẻo hay thấy ("Unlimited" cho mọi lệnh short trần
   *  trụi) - ở đây tính đúng theo lý thuyết định giá, xem `evaluateTrade`). */
  maxGain: number | null;
  maxLoss: number | null;
  breakeven: number[];
  rr: number | null;
};

function intrinsic(right: Right, strike: number, spot: number): number {
  return right === 'call' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
}

/** Giá trị thanh toán (payoff) của một tổ hợp chân quyền chọn tại giá đáo
 *  hạn giả định `spot`, đã trừ chi phí ròng - dùng công thức nội tại thuần
 *  tuý (không cần mô hình định giá), đúng cho mọi tổ hợp long/short. */
function payoffAt(legs: TradeLeg[], netCost: number, spot: number): number {
  let v = 0;
  for (const leg of legs) {
    const iv = intrinsic(leg.right, leg.strike, spot);
    v += leg.action === 'buy' ? iv : -iv;
  }
  return v - netCost;
}

/**
 * Tính lãi/lỗ tối đa + breakeven cho BẤT KỲ tổ hợp chân nào, bằng cách quét
 * các điểm gãy (chỉ xảy ra đúng tại các strike có mặt, cộng S=0) - giữa hai
 * điểm gãy payoff luôn là đường thẳng nên cực trị chỉ có thể nằm ở điểm gãy
 * hoặc ở hướng ra vô cực. Đã kiểm chứng khớp chính xác từng đồng với 5 lệnh
 * mẫu thật (vertical debit, long call, butterfly, BWB, vertical credit) -
 * xem test đi kèm.
 *
 * Lỗ tối đa CHỈ vô hạn khi có chân short call trần trụi (giá cổ phiếu có
 * thể tăng không giới hạn) - short put trần trụi vẫn tính ra số hữu hạn
 * (giá không thể xuống dưới 0), khác quy ước lỏng lẻo "Unlimited" cho mọi
 * lệnh short hay thấy trên các trang khác.
 */
export function evaluateTrade(
  legs: TradeLeg[],
  netCost: number
): { maxGain: number | null; maxLoss: number | null; breakeven: number[] } {
  const strikes = [...new Set(legs.map((l) => l.strike))].sort((a, b) => a - b);
  // slope của payoff khi S -> vô cực chỉ do các chân CALL quyết định (chân
  // put "phẳng" dần về 0 khi giá tăng cao).
  const slopeInf = legs
    .filter((l) => l.right === 'call')
    .reduce((s, l) => s + (l.action === 'buy' ? 1 : -1), 0);

  const corePoints = [0, ...strikes];
  const coreValues = corePoints.map((s) => payoffAt(legs, netCost, s));

  // Điểm ảo đủ xa để đọc đúng giá trị "phẳng" phía trên strike cao nhất khi
  // slopeInf === 0 (không dùng làm cực trị khi slopeInf !== 0 - khi đó
  // hướng đó thật sự vô hạn, xử lý riêng bên dưới).
  const farPoint = (strikes[strikes.length - 1] ?? 0) + 1_000_000;
  const farValue = payoffAt(legs, netCost, farPoint);

  const gainCandidates = [...coreValues];
  const lossCandidates = [...coreValues];
  if (slopeInf === 0) {
    gainCandidates.push(farValue);
    lossCandidates.push(farValue);
  }

  const maxGain = slopeInf > 0 ? null : Math.max(...gainCandidates);
  const maxLoss = slopeInf < 0 ? null : -Math.min(...lossCandidates);

  // Breakeven: quét từng đoạn thẳng liên tiếp, kể cả đoạn cuối nối tới
  // farPoint - cần cả khi slopeInf === 0 (đoạn phẳng, không đổi dấu, vô hại)
  // lẫn khi slopeInf !== 0 (bắt breakeven nằm trên nhánh thật sự vô hạn,
  // như cạnh call của strangle).
  const points = [...corePoints, farPoint];
  const values = points.map((s) => payoffAt(legs, netCost, s));
  const breakeven: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [s0, s1] = [points[i], points[i + 1]];
    const [v0, v1] = [values[i], values[i + 1]];
    if (v0 === 0) {
      breakeven.push(s0);
      continue;
    }
    if ((v0 < 0 && v1 > 0) || (v0 > 0 && v1 < 0)) {
      const t = -v0 / (v1 - v0);
      breakeven.push(Math.round((s0 + t * (s1 - s0)) * 100) / 100);
    }
  }
  return {
    maxGain: maxGain === null ? null : Math.round(maxGain * 100) / 100,
    maxLoss: maxLoss === null ? null : Math.round(maxLoss * 100) / 100,
    breakeven,
  };
}

function netCostOf(legs: TradeLeg[]): number {
  return legs.reduce((s, l) => s + (l.action === 'buy' ? l.mark : -l.mark), 0);
}

function sumGreek(legs: TradeLeg[], pick: (l: TradeLeg) => number | null): number | null {
  let sum = 0;
  for (const l of legs) {
    const v = pick(l);
    if (v === null) return null; // thiếu 1 chân thì không cộng ẩu - null rõ ràng hơn số sai
    sum += l.action === 'buy' ? v : -v;
  }
  return Math.round(sum * 1000) / 1000;
}

/** Dựng một TradeIdea hoàn chỉnh từ danh sách chân đã chọn strike thật. */
export function buildIdea(
  id: string,
  kind: string,
  bias: Bias,
  legsLabel: string,
  legs: TradeLeg[],
  dte: number,
  expiration: string
): TradeIdea {
  const netCost = Math.round(netCostOf(legs) * 100) / 100;
  const { maxGain, maxLoss, breakeven } = evaluateTrade(legs, netCost);
  const rr = maxGain !== null && maxLoss !== null && maxLoss > 0 ? Math.round((maxGain / maxLoss) * 100) / 100 : null;
  return {
    id,
    kind,
    bias,
    legsLabel,
    legs,
    dte,
    expiration,
    netCost,
    greeks: {
      delta: sumGreek(legs, (l) => l.delta),
      vega: sumGreek(legs, (l) => l.vega),
      theta: sumGreek(legs, (l) => l.theta),
    },
    maxGain,
    maxLoss,
    breakeven,
    rr,
  };
}

/** Hợp đồng gần nhất một strike mục tiêu, trong đúng kỳ hạn `dte` cho trước -
 *  null khi kỳ hạn đó không có hợp đồng nào (chuỗi mỏng). */
export function nearestContract(
  contracts: ChainContract[],
  dte: number,
  targetStrike: number
): ChainContract | null {
  const inExp = contracts.filter((c) => c.daysToExpiration === dte);
  if (!inExp.length) return null;
  return inExp.reduce((best, c) =>
    Math.abs(c.strikePrice - targetStrike) < Math.abs(best.strikePrice - targetStrike) ? c : best
  );
}

/** Kỳ hạn (DTE) thật gần nhất với mục tiêu, trong danh sách hợp đồng đã có. */
export function nearestDte(contracts: ChainContract[], targetDte: number): number | null {
  const dtes = [...new Set(contracts.map((c) => c.daysToExpiration))];
  if (!dtes.length) return null;
  return dtes.reduce((best, d) => (Math.abs(d - targetDte) < Math.abs(best - targetDte) ? d : best));
}

export function legFrom(c: ChainContract, action: 'buy' | 'sell', right: Right): TradeLeg {
  return {
    action,
    right,
    strike: c.strikePrice,
    mark: c.mark,
    delta: typeof c.delta === 'number' ? c.delta : null,
    theta: c.theta,
    vega: c.vega,
  };
}

export const expectedMove = (spot: number, ivPct: number, dte: number): number =>
  Math.round(spot * (ivPct / 100) * Math.sqrt(dte / 365) * 100) / 100;

/**
 * Chọn gợi ý giao dịch theo chế độ gamma + hướng nghiêng, dựng từ strike
 * THẬT có trên chuỗi (không suy diễn strike ảo) - mỗi ý tưởng dùng
 * `buildIdea()` nên lãi/lỗ tối đa và breakeven luôn tính đúng, không phải
 * do Claude viết ra.
 *
 * Hướng nghiêng (bullish/bearish): spot đang ở trên hay dưới gamma flip -
 * đúng logic mẫu người dùng đưa (spot ngay trên flip -> các gợi ý đều
 * nghiêng tăng). Chế độ POSITIVE (mean-reversion, dealer hãm biến động) ưu
 * tiên thêm các cấu trúc bán premium tại tường (butterfly, strangle);
 * NEGATIVE (dealer khuếch đại biến động) thay bằng một lệnh mua đơn thuần
 * theo hướng nghiêng thay vì bán premium trần trụi vào một chế độ không ổn
 * định.
 */
export function curateIdeas(params: {
  regime: Regime;
  spot: number;
  putWall: number | null;
  callWall: number | null;
  flip: number | null;
  puts: ChainContract[];
  calls: ChainContract[];
  dte: number;
  expiration: string;
  horizon: 'short' | 'medium';
}): TradeIdea[] {
  const { regime, spot, puts, calls, dte, expiration, horizon } = params;
  const upTarget = params.callWall ?? Math.round(spot * 1.05 * 100) / 100;
  const downTarget = params.putWall ?? Math.round(spot * 0.95 * 100) / 100;
  const bullish = params.flip === null ? true : spot >= params.flip;
  const atmTarget = Math.round(spot * 100) / 100;

  const ideas: TradeIdea[] = [];
  const pickC = (target: number) => nearestContract(calls, dte, target);
  const pickP = (target: number) => nearestContract(puts, dte, target);

  // Lệnh gần strike mục tiêu nhất, cách xa hơn về phía OTM so với một hợp
  // đồng đã chọn - dùng cho chân "mua bảo hiểm" của vertical credit (định
  // nghĩa rủi ro, không phải naked).
  const furtherOtm = (list: ChainContract[], from: ChainContract, dir: 'below' | 'above') => {
    const candidates = list
      .filter((c) => c.daysToExpiration === dte)
      .filter((c) => (dir === 'below' ? c.strikePrice < from.strikePrice : c.strikePrice > from.strikePrice))
      .sort((a, b) => (dir === 'below' ? b.strikePrice - a.strikePrice : a.strikePrice - b.strikePrice));
    return candidates[0] ?? null;
  };

  if (bullish) {
    const longC = pickC(atmTarget);
    const shortC = pickC(upTarget);
    if (longC && shortC && longC.strikePrice < shortC.strikePrice) {
      ideas.push(
        buildIdea(
          `${horizon}-vertical-debit`,
          'VERTICAL DEBIT',
          'Bullish',
          `Buy ${longC.strikePrice} Call / Sell ${shortC.strikePrice} Call`,
          [legFrom(longC, 'buy', 'call'), legFrom(shortC, 'sell', 'call')],
          dte,
          expiration
        )
      );
    }
    if (horizon === 'short' && longC) {
      ideas.push(
        buildIdea(
          `${horizon}-long-call`,
          'LONG',
          'Bullish',
          `Buy ${longC.strikePrice} Call`,
          [legFrom(longC, 'buy', 'call')],
          dte,
          expiration
        )
      );
    }
    const shortP = pickP(downTarget);
    const longP = shortP ? furtherOtm(puts, shortP, 'below') : null;
    if (shortP && longP) {
      ideas.push(
        buildIdea(
          `${horizon}-credit-put`,
          'CREDIT',
          'Bullish',
          `Sell ${shortP.strikePrice} Put / Buy ${longP.strikePrice} Put`,
          [legFrom(shortP, 'sell', 'put'), legFrom(longP, 'buy', 'put')],
          dte,
          expiration
        )
      );
    }
    if (horizon === 'medium') {
      const width = Math.max(1, Math.round((upTarget - atmTarget) * 0.2));
      const wing1 = pickC(upTarget - width);
      const body = pickC(upTarget);
      const wing2 = pickC(upTarget + width);
      if (wing1 && body && wing2 && wing1.strikePrice < body.strikePrice && body.strikePrice < wing2.strikePrice) {
        ideas.push(
          buildIdea(
            `${horizon}-butterfly`,
            'DEBIT',
            'Neutral-Bullish',
            `Buy ${wing1.strikePrice} Call / Sell 2x ${body.strikePrice} Call / Buy ${wing2.strikePrice} Call`,
            [
              legFrom(wing1, 'buy', 'call'),
              legFrom(body, 'sell', 'call'),
              legFrom(body, 'sell', 'call'),
              legFrom(wing2, 'buy', 'call'),
            ],
            dte,
            expiration
          )
        );
      }
      if (regime === 'POSITIVE' && shortC && shortP) {
        ideas.push(
          buildIdea(
            `${horizon}-strangle`,
            'CREDIT',
            'Neutral',
            `Sell ${shortP.strikePrice} Put / Sell ${shortC.strikePrice} Call`,
            [legFrom(shortP, 'sell', 'put'), legFrom(shortC, 'sell', 'call')],
            dte,
            expiration
          )
        );
      } else if (longC) {
        ideas.push(
          buildIdea(
            `${horizon}-long-call`,
            'LONG',
            'Bullish',
            `Buy ${longC.strikePrice} Call`,
            [legFrom(longC, 'buy', 'call')],
            dte,
            expiration
          )
        );
      }
    }
  } else {
    const longP = pickP(atmTarget);
    const shortP = pickP(downTarget);
    if (longP && shortP && shortP.strikePrice < longP.strikePrice) {
      ideas.push(
        buildIdea(
          `${horizon}-vertical-debit`,
          'VERTICAL DEBIT',
          'Bearish',
          `Buy ${longP.strikePrice} Put / Sell ${shortP.strikePrice} Put`,
          [legFrom(longP, 'buy', 'put'), legFrom(shortP, 'sell', 'put')],
          dte,
          expiration
        )
      );
    }
    if (horizon === 'short' && longP) {
      ideas.push(
        buildIdea(
          `${horizon}-long-put`,
          'LONG',
          'Bearish',
          `Buy ${longP.strikePrice} Put`,
          [legFrom(longP, 'buy', 'put')],
          dte,
          expiration
        )
      );
    }
    const shortC = pickC(upTarget);
    const longC = shortC ? furtherOtm(calls, shortC, 'above') : null;
    if (shortC && longC) {
      ideas.push(
        buildIdea(
          `${horizon}-credit-call`,
          'CREDIT',
          'Bearish',
          `Sell ${shortC.strikePrice} Call / Buy ${longC.strikePrice} Call`,
          [legFrom(shortC, 'sell', 'call'), legFrom(longC, 'buy', 'call')],
          dte,
          expiration
        )
      );
    }
    if (horizon === 'medium') {
      const width = Math.max(1, Math.round((atmTarget - downTarget) * 0.2));
      const wing1 = pickP(downTarget - width);
      const body = pickP(downTarget);
      const wing2 = pickP(downTarget + width);
      if (wing1 && body && wing2 && wing1.strikePrice < body.strikePrice && body.strikePrice < wing2.strikePrice) {
        ideas.push(
          buildIdea(
            `${horizon}-butterfly`,
            'DEBIT',
            'Neutral-Bearish',
            `Buy ${wing2.strikePrice} Put / Sell 2x ${body.strikePrice} Put / Buy ${wing1.strikePrice} Put`,
            [
              legFrom(wing2, 'buy', 'put'),
              legFrom(body, 'sell', 'put'),
              legFrom(body, 'sell', 'put'),
              legFrom(wing1, 'buy', 'put'),
            ],
            dte,
            expiration
          )
        );
      }
      if (regime === 'POSITIVE' && shortC && shortP) {
        ideas.push(
          buildIdea(
            `${horizon}-strangle`,
            'CREDIT',
            'Neutral',
            `Sell ${shortP.strikePrice} Put / Sell ${shortC.strikePrice} Call`,
            [legFrom(shortP, 'sell', 'put'), legFrom(shortC, 'sell', 'call')],
            dte,
            expiration
          )
        );
      } else if (longP) {
        ideas.push(
          buildIdea(
            `${horizon}-long-put`,
            'LONG',
            'Bearish',
            `Buy ${longP.strikePrice} Put`,
            [legFrom(longP, 'buy', 'put')],
            dte,
            expiration
          )
        );
      }
    }
  }

  return ideas;
}
