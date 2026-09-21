import type { Detection } from './patterns';

/**
 * Prompt cho nút "Đọc mẫu hình này" — tab Patterns. Thuần, có test.
 *
 * Claude CHỈ DIỄN GIẢI những gì app đã dò được; nó không tự nhận diện mẫu
 * trên nến (app không gửi nến), không bịa mức giá, không khuyến nghị. Cùng
 * ba luật của `learnask.ts`/`airead.ts`: neo ngôn ngữ ở CẢ HAI ĐẦU bằng ngôn
 * ngữ đích (#148), số liệu là DỮ LIỆU app tính, nói thẳng khi thiếu.
 *
 * Bảng dữ kiện là văn bản tiếng Anh (tên mẫu theo id) để không phải giữ hai
 * bản prompt; câu trả lời theo `lang`.
 */

export type PatternFacts = {
  symbol: string;
  name?: string;
  price: number;
  lastBar: string;
  detections: Detection[];
  nearestSupport: { price: number; distancePct: number; touches: number } | null;
  nearestResistance: { price: number; distancePct: number; touches: number } | null;
  volumeKnown: boolean;
  trend?: { sma50: number | null; sma200: number | null; aboveSma200: boolean | null; sma200SlopePct: number | null } | null;
};

const LANG_LINE = {
  vi: 'Trả lời HOÀN TOÀN bằng tiếng Việt. Thuật ngữ giữ tiếng Anh trong ngoặc ở lần đầu (ví dụ: đường cổ (neckline)).',
  en: 'Answer ENTIRELY in English.',
} as const;

const n = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));

export function patternFacts(f: PatternFacts): string {
  const lines: string[] = [
    `Ticker: ${f.symbol}${f.name ? ` (${f.name})` : ''}`,
    `Last daily close: ${n(f.price)} on ${f.lastBar}`,
    f.trend
      ? `Trend: SMA50 ${n(f.trend.sma50)}, SMA200 ${n(f.trend.sma200)}, price ${f.trend.aboveSma200 === null ? 'n/a' : f.trend.aboveSma200 ? 'ABOVE' : 'BELOW'} SMA200, SMA200 slope over ~21 sessions ${n(f.trend.sma200SlopePct, 2)}%`
      : 'Trend: n/a',
    `Nearest support below: ${f.nearestSupport ? `${n(f.nearestSupport.price)} (${n(f.nearestSupport.distancePct, 1)}% below price, ${f.nearestSupport.touches} touches)` : 'none found'}`,
    `Nearest resistance above: ${f.nearestResistance ? `${n(f.nearestResistance.price)} (${n(f.nearestResistance.distancePct, 1)}% above price, ${f.nearestResistance.touches} touches)` : 'none found'}`,
    `Volume data: ${f.volumeKnown ? 'available' : 'NOT AVAILABLE — every volume ratio below is unknown, not zero'}`,
    '',
    f.detections.length ? 'PATTERNS DETECTED BY THE APP (daily bars):' : 'PATTERNS DETECTED BY THE APP: none in the recent window.',
  ];
  for (const d of f.detections) {
    const lv = d.levels.map((l) => `${l.key} ${n(l.price)}`).join(', ');
    const vr = d.stats?.volumeRatio;
    lines.push(
      `- ${d.id} [${d.kind}, ${d.side}, ${d.confirmed ? 'CONFIRMED' : 'FORMING / unconfirmed'}]` +
        (lv ? ` levels: ${lv}` : '') +
        (vr === undefined ? '' : `; volume vs 20-day avg: ${vr === null ? 'unknown' : `${n(vr, 2)}x`}`) +
        (d.stats?.polePct !== undefined && d.stats?.polePct !== null ? `; pole ${n(d.stats.polePct, 1)}%` : '')
    );
  }
  return lines.join('\n');
}

export function patternSystem(lang: 'vi' | 'en'): string {
  return [
    LANG_LINE[lang],
    '',
    'You are explaining chart patterns and candlestick patterns that a personal trading tool has ALREADY detected on daily bars. The user sees the same list drawn on a candle chart.',
    'Rules:',
    '- Interpret ONLY the patterns and levels listed in the user message. You have no price bars and no news; do not claim to see anything that is not listed, and never invent a level, a date, or a volume figure.',
    '- A pattern marked FORMING / unconfirmed is a possibility, not an event: say what would confirm it (which close, which level) and what would invalidate it.',
    '- A pattern marked CONFIRMED still is not a guarantee. Mention the measured target the app computed as a conventional projection, not a prediction.',
    '- If volume is unknown, say that the confirmation is weaker for lack of volume rather than working around it silently.',
    '- Where patterns disagree (a bullish candle inside a bearish chart pattern), say so plainly; the conflict is the finding.',
    '- No buy/sell/hold recommendation and no price prediction. Describe what the structure says and what to watch.',
    '- 120–250 words, plain text, no markdown, no bullet characters. Start directly with the reading.',
    '',
    LANG_LINE[lang],
  ].join('\n');
}
