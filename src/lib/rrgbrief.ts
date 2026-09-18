import { DIRECTION_ARROW, type Direction, type Quadrant } from './rrg';

/**
 * Prompt cho nút "Phân tích AI" của biểu đồ RRG (`/api/ai/rrg-briefing`).
 *
 * Cùng phân công với airead.ts/tradebrief.ts: MỌI con số (RS-Ratio,
 * RS-Momentum, góc phần tư, hướng) đã tính sẵn trong `rrgsectors.ts` từ giá
 * thật - Claude chỉ đọc và diễn giải, không được tự tính hay tự bịa một điểm
 * dữ liệu nào. Tách khỏi route vì route của Next chỉ được export handler.
 */

const RRG_NAMES: Record<string, string> = {
  tech: 'Technology',
  fin: 'Financials',
  health: 'Health care',
  discretionary: 'Consumer discretionary',
  staples: 'Consumer staples',
  energy: 'Energy',
  industrial: 'Industrials',
  material: 'Materials',
  realestate: 'Real estate',
  utility: 'Utilities',
  comm: 'Communication services',
};

const QUAD_LABEL: Record<Quadrant, string> = {
  leading: 'LEADING (stronger than the pack, still gaining)',
  weakening: 'WEAKENING (still strong but losing steam)',
  lagging: 'LAGGING (weaker than the pack, still slipping)',
  improving: 'IMPROVING (still weak but picking up)',
};

const DIR_LABEL: Record<Direction, string> = {
  n: 'straight up (gaining momentum fast)',
  ne: 'up-right (toward Leading)',
  e: 'right (gaining relative strength)',
  se: 'down-right (from Leading toward Weakening)',
  s: 'straight down (losing momentum fast)',
  sw: 'down-left (from Lagging deeper into Lagging, or from Improving back down)',
  w: 'left (losing relative strength)',
  nw: 'up-left (toward Improving)',
};

/**
 * Yêu cầu ngôn ngữ đặt ở ĐẦU, viết BẰNG CHÍNH ngôn ngữ đó, và nhắc lại ở
 * cuối - đúng khuôn `LANG_LINE` của ltwhy.ts (#148), sau khi bản đầu của
 * cùng lỗi này (một dòng tiếng Anh xin tiếng Việt, cuối một prompt toàn
 * tiếng Anh) từng làm câu trả lời ra tiếng Anh dù UI đang tiếng Việt.
 */
const LANG_LINE = {
  vi: 'QUAN TRỌNG: Viết TOÀN BỘ câu trả lời bằng TIẾNG VIỆT. Mọi tiêu đề mục, mọi câu, mọi gạch đầu dòng đều phải là tiếng Việt.',
  en: 'IMPORTANT: write the entire answer in English.',
} as const;

export function system(lang: 'vi' | 'en'): string {
  const common = [
    LANG_LINE[lang],
    '',
    'You are narrating a Relative Rotation Graph (RRG) of the 11 S&P 500',
    'sector SPDR funds against SPY. Every number below (RS-Ratio, RS-Momentum,',
    'quadrant, direction) was already computed in code from real weekly prices.',
    'Do not invent, recompute, or contradict any of it - your job is only the',
    'prose reading of what is already there.',
    '',
    'RS-Ratio (x-axis) is relative strength vs the other 10 sectors this week;',
    '100 means level with the pack, above is stronger. RS-Momentum (y-axis) is',
    'whether that relative strength is accelerating or decelerating. The',
    'quadrant is a SNAPSHOT of where a sector sits; the direction is which way',
    'its tail is moving RIGHT NOW, and the two can disagree - a sector sitting',
    'in Leading while its direction points down-right toward Weakening is an',
    'early warning the quadrant label alone does not show. Treat direction as',
    'at least as important as the current quadrant.',
    '',
    'Structure, in short labelled sections:',
    '1. The overall picture: which sectors are leading money flow this week',
    'and which are being abandoned.',
    '2. Sectors worth watching because their DIRECTION disagrees with their',
    'current quadrant (early rotation signal) - name them explicitly.',
    '3. What this rotation pattern typically means for market posture',
    '(risk-on cyclicals leading vs risk-off defensives leading), stated as a',
    'READ of the data, not a forecast.',
    '',
    'Rules:',
    '- This describes SECTORS, not individual stocks. Never name or recommend',
    'an individual ticker.',
    '- A quadrant or direction describes a state, not a buy/sell instruction.',
    'Never tell the reader to buy or sell anything.',
    '- The underlying RS-Ratio/RS-Momentum formula is a reconstruction of an',
    'unpublished original (JdK), so if asked about exact methodology, say the',
    'absolute numbers are this app’s own computation, not a licensed feed.',
    '- Be concise: roughly 150-250 words, plain prose and short lists, no',
    'preamble.',
  ].join('\n');

  return `${common}\n\n${LANG_LINE[lang]}`;
}

export function facts(data: {
  benchmark: string;
  weeks: number;
  from: string;
  to: string;
  points: {
    key: string;
    symbol: string;
    quadrant: Quadrant;
    direction: Direction;
    ratio: number;
    momentum: number;
    tail: [number, number][];
  }[];
  missing: string[];
}): string {
  const lines: string[] = [];
  lines.push(
    `RRG snapshot: ${data.points.length} sectors vs benchmark ${data.benchmark}, ` +
      `tail length ${data.weeks} weeks (${data.from} → ${data.to}).`
  );
  if (data.missing.length) {
    lines.push(`Sectors dropped from this reading (missing/stale history): ${data.missing.join(', ')}.`);
  }
  lines.push('');
  lines.push('SECTOR | ETF | RS-Ratio | RS-Momentum | quadrant | direction | N weeks ago');
  for (const p of [...data.points].sort((a, b) => b.ratio - a.ratio)) {
    const name = RRG_NAMES[p.key] ?? p.key;
    const past = p.tail[0];
    const pastStr = past ? `RS-Ratio ${past[0].toFixed(2)}, RS-Momentum ${past[1].toFixed(2)}` : 'n/a';
    lines.push(
      `${name} | ${p.symbol} | ${p.ratio.toFixed(2)} | ${p.momentum.toFixed(2)} | ` +
        `${QUAD_LABEL[p.quadrant]} | ${DIR_LABEL[p.direction]} (${DIRECTION_ARROW[p.direction]}) | ${pastStr}`
    );
  }
  return lines.join('\n');
}
