'use client';

type Props = {
  low52: number;
  high52: number;
  spot: number;
  strike: number;
  breakeven: number;
};

/**
 * A one-glance answer to the only question that matters when you sell a put:
 * how far can this thing fall before I own it, and where does that sit inside
 * the last year of trading?
 */
export default function CushionBar({
  low52,
  high52,
  spot,
  strike,
  breakeven,
}: Props) {
  const W = 168;
  const H = 26;
  const pad = 5;
  const lo = Math.min(low52, breakeven) * 0.99;
  const hi = Math.max(high52, spot) * 1.01;
  const span = hi - lo || 1;
  const x = (v: number) => pad + ((v - lo) / span) * (W - pad * 2);

  const y = 16;
  const xStrike = x(strike);
  const xSpot = x(spot);
  const xBe = x(breakeven);
  const belowLow = breakeven < low52;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Break-even ${breakeven.toFixed(2)}, strike ${strike.toFixed(
        2
      )}, giá hiện tại ${spot.toFixed(2)}, biên độ 52 tuần ${low52.toFixed(
        2
      )}–${high52.toFixed(2)}`}
    >
      {/* 52-week range track */}
      <line
        x1={x(low52)}
        x2={x(high52)}
        y1={y}
        y2={y}
        stroke="var(--rule)"
        strokeWidth="5"
        strokeLinecap="butt"
      />
      {/* the cushion: room between strike and current price */}
      <line
        x1={xStrike}
        x2={xSpot}
        y1={y}
        y2={y}
        stroke="var(--credit)"
        strokeWidth="5"
      />
      {/* break-even marker */}
      <line
        x1={xBe}
        x2={xBe}
        y1={y - 7}
        y2={y + 7}
        stroke={belowLow ? 'var(--risk)' : 'var(--ink)'}
        strokeWidth="1.5"
      />
      {/* spot */}
      <circle cx={xSpot} cy={y} r="3.4" fill="var(--ink)" />
      {/* 52w low tick */}
      <line
        x1={x(low52)}
        x2={x(low52)}
        y1={y - 4}
        y2={y + 4}
        stroke="var(--muted)"
        strokeWidth="1"
      />
      <text
        x={pad}
        y={7}
        fontSize="7.5"
        fontFamily="var(--data)"
        fill="var(--muted)"
        letterSpacing="0.06em"
      >
        52T
      </text>
      <text
        x={W - pad}
        y={7}
        fontSize="7.5"
        fontFamily="var(--data)"
        fill="var(--muted)"
        textAnchor="end"
        letterSpacing="0.06em"
      >
        {belowLow ? 'BE < ĐÁY' : 'BE'}
      </text>
    </svg>
  );
}
