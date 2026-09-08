/**
 * Prompt cho phần "Claude đọc toàn bộ chỉ số" ở tab Analyze (/api/ai).
 *
 * Tách khỏi route để test được từ sandbox (route file của Next chỉ được
 * export GET/POST/..., không export hàm phụ) và để hình dạng prompt nằm ở
 * đúng một chỗ.
 *
 * Nguyên tắc không đổi từ bản đầu: Claude chỉ được đọc ĐÚNG những con số
 * đang hiện trên trang - client gửi lên object nó đang hiển thị, route chọn
 * trường, không gọi thêm Schwab. Bản này gom thêm GEX (chủ app: "gom
 * technical và gex tất cả chỉ số") và mọi trường kỹ thuật/giá mà bản trước
 * bỏ sót (Bollinger %B, bid/ask/volume, ngành, MACD histogram - trường này
 * tên là `hist`, bản trước đọc `histogram` nên luôn ra "n/a").
 */

const n = (v: unknown, digits = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : 'n/a';

const pct = (v: unknown, digits = 1) =>
  typeof v === 'number' && Number.isFinite(v)
    ? `${(v * 100).toFixed(digits)}%`
    : 'n/a';

/** Đô la theo triệu, có dấu. GEX đo bằng $ mỗi 1% biến động. */
const mil = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v)
    ? `${v >= 0 ? '+' : '-'}$${(Math.abs(v) / 1e6).toFixed(0)}M`
    : 'n/a';

/**
 * Phần GEX của bảng số. Nhận đúng payload /api/gex trả về, ở CẢ BỐN hình
 * dạng (Schwab, CBOE, mức UW, bản cũ trên đĩa) - và khi không có gì thì nói
 * thẳng là không có và vì sao, thay vì bỏ trống: với Claude, một mục vắng
 * mặt đọc thành "không có cấu trúc gamma đáng nói", tức là một kết luận sai.
 */
export function gexFacts(g: any, gexError?: string | null): string[] {
  if (!g) {
    return [
      `Gamma exposure (GEX): NOT AVAILABLE${gexError ? ` - ${gexError}` : ''}. ` +
        'Say that the dealer-positioning picture cannot be read for this run; do not infer walls or a regime.',
    ];
  }

  if (g.source === 'uw') {
    const L = g.levels ?? {};
    return [
      'Gamma exposure (GEX) - Unusual Whales key levels only (no per-strike data, no net GEX; ' +
        `basis "${L.basis ?? 'n/a'}", as of ${L.date ?? 'n/a'}):`,
      `  put wall ${n(L.putWall)}, call wall ${n(L.callWall)}, gamma flip ${n(L.gammaFlip)}, gamma magnet ${n(L.gammaMagnet)}`,
    ];
  }

  if (g.source === 'cache') {
    const own = g.schwab ?? g.cboe ?? null;
    return [
      `Gamma exposure (GEX) - STALE reading saved at ${g.at ?? 'n/a'} (both live sources failed; treat with caution):`,
      own
        ? `  put wall ${n(own.putWall)}, call wall ${n(own.callWall)}, zero gamma ${n(own.zeroGamma)}, abs gamma ${n(own.absGamma)}, net GEX ${mil(own.totalGex)} per 1% move`
        : '  no self-computed levels in the saved reading',
    ];
  }

  // Schwab or CBOE: full profile with per-strike data.
  const src =
    g.source === 'cboe'
      ? `CBOE public feed, 15-min delayed${g.cboeAsOf ? `, CBOE timestamp ${g.cboeAsOf}` : ''}`
      : 'Schwab option chain, live';
  const spot = typeof g.spot === 'number' ? g.spot : null;
  const rel = (level: unknown) =>
    typeof level === 'number' && spot
      ? `${level > spot ? '+' : ''}${(((level - spot) / spot) * 100).toFixed(1)}% from spot`
      : 'n/a';

  const strikes: any[] = Array.isArray(g.strikes) ? g.strikes : [];
  const topCalls = [...strikes]
    .filter((s) => typeof s.callGex === 'number' && s.callGex > 0)
    .sort((a, b) => b.callGex - a.callGex)
    .slice(0, 3)
    .map((s) => `${n(s.strike)} (${mil(s.callGex)})`)
    .join(', ');
  const topPuts = [...strikes]
    .filter((s) => typeof s.putGex === 'number' && s.putGex < 0)
    .sort((a, b) => a.putGex - b.putGex)
    .slice(0, 3)
    .map((s) => `${n(s.strike)} (${mil(s.putGex)})`)
    .join(', ');

  const win = g.chainWindow;
  const winNote = win?.sliced
    ? `; computed over the ${win.expirations ?? '?'} nearest expirations only`
    : win?.days && win.days < 60
      ? `; computed over the next ${win.days} days only`
      : '';

  const out = [
    `Gamma exposure (GEX) - self-computed from gamma x open interest (${src}${winNote}). ` +
      'Dealer-inventory model: dealers assumed long calls / short puts. It is a map of where hedging flow concentrates, not observed positioning.',
    `  Put wall ${n(g.putWall)} (${rel(g.putWall)}) - most net-negative strike, usually behaves as support.`,
    `  Call wall ${n(g.callWall)} (${rel(g.callWall)}) - most net-positive strike, usually behaves as resistance.`,
    `  Zero gamma ${n(g.zeroGamma)} (${rel(g.zeroGamma)}) - above it dealers damp moves, below it they amplify.`,
    `  Abs gamma ${n(g.absGamma)} (${rel(g.absGamma)}) - strike with the most gamma of both signs combined.`,
    `  Net GEX ${mil(g.totalGex)} per 1% move -> regime ${typeof g.totalGex === 'number' ? (g.totalGex >= 0 ? 'POSITIVE (volatility damped)' : 'NEGATIVE (volatility amplified)') : 'n/a'}.`,
    `  Largest call-gamma strikes: ${topCalls || 'n/a'}. Largest put-gamma strikes: ${topPuts || 'n/a'}.`,
    `  Expirations in the chain: ${Array.isArray(g.expirations) ? g.expirations.length : 'n/a'}.`,
  ];
  if (g.uw) {
    out.push(
      `  Unusual Whales' own levels for comparison (basis "${g.uw.basis ?? 'n/a'}", ${g.uw.date ?? 'n/a'}): ` +
        `put wall ${n(g.uw.putWall)}, call wall ${n(g.uw.callWall)}, gamma flip ${n(g.uw.gammaFlip)}, gamma magnet ${n(g.uw.gammaMagnet)}. ` +
        'Two models on two feeds - a gap is normal; note it only if it is large.'
    );
  }
  return out;
}

/** Flatten the analysis payload (plus GEX) into the compact table Claude reads. */
export function facts(a: any, gex?: any, gexError?: string | null): string {
  const p = a?.price ?? {};
  const te = a?.technical ?? {};
  const o = a?.options ?? {};
  const f = a?.fundamental ?? {};
  const pr = a?.profile ?? {};

  return [
    `Ticker: ${a?.symbol} (${a?.name ?? ''})${pr.sector ? ` - sector ${pr.sector}` : ''}${pr.industry ? `, industry ${pr.industry}` : ''}`,
    `Price: ${n(p.spot)}  change ${n(p.change)} (${pct((p.changePct ?? 0) / 100)}), bid ${n(p.bid)} / ask ${n(p.ask)}, session volume ${p.volume ?? 'n/a'}`,
    `52-week: low ${n(p.low52)} / high ${n(p.high52)}, position in range ${pct(p.pos52)}`,
    '',
    'TECHNICAL',
    `SMA20 ${n(te.sma20)} (price vs: ${pct(te.vsSma20)})`,
    `SMA50 ${n(te.sma50)} (price vs: ${pct(te.vsSma50)})`,
    `SMA200 ${n(te.sma200)} (price vs: ${pct(te.vsSma200)}), sessions on current side: ${te.sma200Streak ?? 'n/a'}`,
    `RSI14 ${n(te.rsi14, 1)}`,
    `MACD ${n(te.macd?.macd, 3)}, signal ${n(te.macd?.signal, 3)}, histogram ${n(te.macd?.hist ?? te.macd?.histogram, 3)}`,
    `ATR14 ${n(te.atr14)} (${pct(te.atrPct)} of price)`,
    `Bollinger(20,2): lower ${n(te.bollinger?.lower)}, mid ${n(te.bollinger?.mid)}, upper ${n(te.bollinger?.upper)}, %B ${n(te.bollinger?.pctB)}`,
    `Realized vol: HV20 ${pct(te.hv20)}, HV60 ${pct(te.hv60)}, ratio HV20/HV60 ${n(te.volRatio)}`,
    '',
    'OPTIONS / VOLATILITY',
    `Implied vol ${pct(o.iv)}, IV/HV20 ${n(o.ivHv)}`,
    `Reference put: delta ${n(o.refDelta)}, strike ${n(o.refStrike)}, expiry ${o.refExpiration ?? 'n/a'}`,
    '',
    'GAMMA STRUCTURE',
    ...gexFacts(gex, gexError),
    '',
    'FUNDAMENTAL',
    `P/E ${n(f.peRatio)}, EPS ${n(f.eps)}, market cap ${f.marketCap ? Math.round(f.marketCap / 1e9) + 'B' : 'n/a'}`,
    `Dividend ${n(f.divAmount)} (yield ${n(f.divYield)}%), ex-date ${f.divExDate ?? 'n/a'}`,
    `Earnings: last ${f.lastEarnings ?? 'n/a'}, next ${f.nextEarnings ?? 'unknown'}`,
    `Average volume: 10-day ${f.avgVolume10d ?? 'n/a'}, 1-year ${f.avgVolume1y ?? 'n/a'}`,
  ].join('\n');
}

export const system = (lang: string) => `You are reading technical, volatility, \
gamma-exposure and fundamental indicators for someone deciding whether to sell \
a cash-secured put on this stock. Selling a cash-secured put means being \
obliged to buy 100 shares at the strike, so the question that matters is what \
the data says about the risk of owning this stock at a discount, about how well \
the option is currently being paid, and about where the option market's own \
hedging flow would help or hurt a short put.

Write your answer in ${lang === 'en' ? 'English' : 'Vietnamese'}.

Cover, in short labelled sections:
1. What the trend and momentum indicators say when read together (moving \
averages, RSI, MACD, Bollinger, ATR).
2. What the volatility picture says about whether premium is rich or thin \
right now - IV against realized vol is the key comparison.
3. What the gamma structure says: where spot sits relative to the put wall, \
call wall and zero gamma; what the net-GEX regime means for how the stock \
is likely to trade (damped or amplified); and which strike zone the dealer \
hedging map favours for a short put (at or below the put wall is where \
hedging flow supports price). Say plainly when the GEX reading is missing, \
stale, or levels-only.
4. Where the technical picture and the gamma picture agree or contradict \
each other - for example a downtrend with a put wall far below spot, or an \
overbought RSI right under the call wall.
5. The clearest risks in this data, including any earnings date that falls \
inside a typical 25-50 day option.

Rules you must follow:
- Use only the numbers given. Never invent a figure, a date, or a news event.
- Where indicators disagree, say so plainly rather than picking a side. A \
conflicting picture is the useful finding, not a problem to smooth over.
- Do not give a buy, sell, or hold recommendation, and do not predict a price. \
Describe what the indicators show and let the reader decide.
- If a number is missing (n/a), say what its absence prevents you concluding \
rather than working around it silently.
- GEX is a model built on open interest, not observed dealer positioning; \
treat walls as zones where hedging flow concentrates, not as guarantees.
- Around 400 words. No preamble - start with the first section.
- Plain text only. No markdown: no asterisks, no hash marks, no bullet characters. Put each section's label on its own line - it is rendered as-is, so any syntax you type shows up literally as punctuation.`;
