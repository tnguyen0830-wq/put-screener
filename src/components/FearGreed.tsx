'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Data = {
  score: number;
  rating: string | null;
  previousClose: number | null;
  weekAgo: number | null;
  monthAgo: number | null;
  yearAgo: number | null;
  history: [number, number][];
};

/**
 * CNN's own band boundaries, upper bound exclusive except the last. Kept
 * matching theirs so a score reads the same word on both pages.
 */
const BANDS = [
  { to: 25, key: 'fg.extremeFear', tone: 'fear' },
  { to: 45, key: 'fg.fear', tone: 'fear' },
  { to: 55, key: 'fg.neutral', tone: 'neutral' },
  { to: 75, key: 'fg.greed', tone: 'greed' },
  { to: 101, key: 'fg.extremeGreed', tone: 'greed' },
] as const;

const bandOf = (v: number) => BANDS.find((b) => v < b.to) ?? BANDS[BANDS.length - 1];

// ---- gauge geometry ----
const GW = 340;
const GH = 200;
const CX = GW / 2;
const CY = 170;
const R_OUT = 140;
const R_IN = 100;
/** Tick numbers ride outside the ring, leaving the mouth free for the score.
 *  Inside, the 0 and 100 labels land at exactly the score's height. */
const R_TICK = R_OUT + 15;
/** Band names ride down the middle of the ring. */
const R_LABEL = (R_OUT + R_IN) / 2;
const LABEL_SIZE = 8.5;

/** 0 sits at 180°, 100 at 0°, so the dial sweeps left to right. */
const deg = (v: number) => 180 - (Math.max(0, Math.min(100, v)) / 100) * 180;
const pt = (d: number, r: number) => [
  CX + r * Math.cos((d * Math.PI) / 180),
  CY - r * Math.sin((d * Math.PI) / 180),
];

/** Arc down the centre of the ring, for a band name to sit on. */
function labelPath(from: number, to: number) {
  const [x1, y1] = pt(deg(from), R_LABEL);
  const [x2, y2] = pt(deg(to), R_LABEL);
  return `M${x1},${y1} A${R_LABEL},${R_LABEL} 0 0 1 ${x2},${y2}`;
}

/**
 * Whether a band name fits along its own arc.
 *
 * Neutral is only five points wide, so its name is several times longer than
 * the arc it would have to follow - CNN hits the same problem and answers it by
 * lifting that label out of the ring. Measured rather than hard-coded, so
 * changing a boundary moves the label without anyone remembering to.
 */
function fitsOnArc(chars: number, from: number, to: number) {
  const arc = ((to - from) / 100) * Math.PI * R_LABEL;
  return chars * LABEL_SIZE * 0.62 <= arc * 0.9;
}

/** One band of the ring: out along the top, back along the inside. */
function bandPath(from: number, to: number) {
  const a = deg(from);
  const b = deg(to);
  const [x1, y1] = pt(a, R_OUT);
  const [x2, y2] = pt(b, R_OUT);
  const [x3, y3] = pt(b, R_IN);
  const [x4, y4] = pt(a, R_IN);
  return `M${x1},${y1} A${R_OUT},${R_OUT} 0 0 1 ${x2},${y2} L${x3},${y3} A${R_IN},${R_IN} 0 0 0 ${x4},${y4} Z`;
}

/**
 * CNN's Fear & Greed dial, rebuilt rather than embedded.
 *
 * The ring itself is deliberately colourless, exactly as CNN draws it: every
 * band is the same recessive grey and the live one is picked out by fill and a
 * border. Colour appears only on the four comparison pills, and every pill
 * carries its rating in words - which is also what makes the warm/cool pair
 * legal on the dark surface, where the validator puts it in the 6-8 CVD band
 * that requires a secondary encoding.
 *
 * Worth knowing while reading it: for a put seller the scale runs backwards to
 * intuition. Fear is when implied vol is high and options pay well; greed is
 * when premium goes thin.
 */
export default function FearGreed() {
  const { t } = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/feargreed')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Data) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // ---- history line, kept below the dial ----
  const LW = 640;
  const LH = 104;
  const LP = { l: 22, r: 6, t: 8, b: 16 };

  const line = useMemo(() => {
    if (!data?.history.length) return null;
    const pts = data.history;
    const t0 = pts[0][0];
    const span = pts[pts.length - 1][0] - t0 || 1;
    const x = (ms: number) => LP.l + ((ms - t0) / span) * (LW - LP.l - LP.r);
    const y = (v: number) => LP.t + (1 - v / 100) * (LH - LP.t - LP.b);
    return {
      x,
      y,
      pts,
      d: pts
        .map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`)
        .join(''),
    };
  }, [data]);

  const onMove = (clientX: number) => {
    if (!line || !svg.current) return;
    const box = svg.current.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * LW;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < line.pts.length; i++) {
      const d = Math.abs(line.x(line.pts[i][0]) - vx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  if (failed) {
    return (
      <section className="fg">
        <h3 className="dsec">{t('fg.title')}</h3>
        <p className="hint hint-warn">{t('fg.failed')}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="fg">
        <h3 className="dsec">{t('fg.title')}</h3>
        <p className="cap">{t('fg.loading')}</p>
      </section>
    );
  }

  const live = bandOf(data.score);
  const needle = deg(data.score);
  const [nx, ny] = pt(needle, R_OUT - 6);
  const hp = hover !== null && line ? line.pts[hover] : null;

  const rows: [string, number | null][] = [
    ['fg.prevClose', data.previousClose],
    ['fg.week', data.weekAgo],
    ['fg.month', data.monthAgo],
    ['fg.year', data.yearAgo],
  ];

  return (
    <section className="fg">
      <h3 className="dsec">{t('fg.title')}</h3>

      <div className="fgtop">
        <div className="fgdial">
          <svg
            viewBox={`0 0 ${GW} ${GH}`}
            width="100%"
            role="img"
            aria-label={t('fg.aria', Math.round(data.score))}
          >
            {BANDS.map((b, i) => {
              const from = i === 0 ? 0 : BANDS[i - 1].to;
              const to = Math.min(b.to, 100);
              const on = b === live;
              return (
                <path
                  key={b.key}
                  d={bandPath(from, to)}
                  /* The live band is picked out by fill alone. A border as well
                     made it read as a solid wedge rather than part of a ring. */
                  fill={on ? 'var(--rule)' : 'var(--rule-soft)'}
                  stroke="var(--card)"
                  /* A surface-coloured stroke is the 2px gap between bands. */
                  strokeWidth="2"
                />
              );
            })}

            <defs>
              {BANDS.map((b, i) => (
                <path
                  key={b.key}
                  id={`fgarc-${i}`}
                  d={labelPath(i === 0 ? 0 : BANDS[i - 1].to, Math.min(b.to, 100))}
                  fill="none"
                />
              ))}
            </defs>

            {BANDS.map((b, i) => {
              const from = i === 0 ? 0 : BANDS[i - 1].to;
              const to = Math.min(b.to, 100);
              const name = t(b.key).toUpperCase();
              const on = b === live;
              const fill = on ? 'var(--ink)' : 'var(--muted)';

              if (fitsOnArc(name.length, from, to)) {
                return (
                  <text
                    key={b.key}
                    fontSize={LABEL_SIZE}
                    letterSpacing="0.08em"
                    fill={fill}
                    fontFamily="var(--data)"
                    fontWeight={on ? 600 : 400}
                  >
                    <textPath href={`#fgarc-${i}`} startOffset="50%" textAnchor="middle">
                      {name}
                    </textPath>
                  </text>
                );
              }

              // Too narrow for its own arc: sits just inside the ring instead,
              // where nothing else is drawn at that height.
              const [lx, ly] = pt(deg((from + to) / 2), R_IN - 13);
              return (
                <text
                  key={b.key}
                  x={lx}
                  y={ly + 3}
                  textAnchor="middle"
                  fontSize={LABEL_SIZE}
                  letterSpacing="0.08em"
                  fill={fill}
                  fontFamily="var(--data)"
                  fontWeight={on ? 600 : 400}
                >
                  {name}
                </text>
              );
            })}

            {[0, 25, 50, 75, 100].map((v) => {
              const d = deg(v);
              const [tx, ty] = pt(d, R_TICK);
              return (
                <text
                  key={v}
                  x={tx}
                  y={ty + 4}
                  textAnchor={v === 0 ? 'start' : v === 100 ? 'end' : 'middle'}
                  fontSize="11"
                  fill="var(--muted)"
                  fontFamily="var(--data)"
                >
                  {v}
                </text>
              );
            })}

            {/* Needle: tapered so the reading end is unambiguous. */}
            <polygon
              points={`${CX - 5},${CY} ${CX + 5},${CY} ${nx},${ny}`}
              fill="var(--ink)"
            />
            <circle cx={CX} cy={CY} r="8" fill="var(--ink)" />

            {/* Drawn in the SVG, not layered over it: sharing one coordinate
                system is what keeps the score off the tick labels. */}
            <text
              x={CX}
              y={CY - 38}
              textAnchor="middle"
              fontSize="38"
              fontWeight="700"
              fill="var(--ink)"
              fontFamily="var(--data)"
            >
              {Math.round(data.score)}
            </text>
            <text
              x={CX}
              y={CY - 18}
              textAnchor="middle"
              fontSize="11"
              letterSpacing="0.1em"
              fill="var(--label)"
              fontFamily="var(--data)"
            >
              {t(live.key).toUpperCase()}
            </text>
          </svg>
        </div>

        <dl className="fgprev">
          {rows.map(([k, v]) => {
            const b = v === null ? null : bandOf(v);
            return (
              <div key={k}>
                <dt>{t(k)}</dt>
                <dd>
                  {/* The word is the secondary encoding: identity here is never
                      carried by the pill's colour alone. */}
                  <span className="fgword">{b ? t(b.key) : '—'}</span>
                  <span className={`fgpill ${b?.tone ?? 'neutral'}`}>
                    {v === null ? '—' : Math.round(v)}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {line && (
        <div className="fgchart">
          <svg
            ref={svg}
            viewBox={`0 0 ${LW} ${LH}`}
            width="100%"
            role="img"
            aria-label={t('fg.lineAria')}
            onMouseMove={(e) => onMove(e.clientX)}
            onMouseLeave={() => setHover(null)}
            onTouchMove={(e) => onMove(e.touches[0].clientX)}
            onTouchEnd={() => setHover(null)}
          >
            {[0, 50, 100].map((v) => (
              <g key={v}>
                <line
                  x1={LP.l}
                  x2={LW - LP.r}
                  y1={line.y(v)}
                  y2={line.y(v)}
                  stroke="var(--rule)"
                  strokeWidth="1"
                  strokeDasharray={v === 50 ? undefined : '2 3'}
                />
                <text
                  x={LP.l - 5}
                  y={line.y(v) + 3}
                  textAnchor="end"
                  fontSize="8.5"
                  fill="var(--muted)"
                  fontFamily="var(--data)"
                >
                  {v}
                </text>
              </g>
            ))}

            <path
              d={line.d}
              fill="none"
              stroke="var(--fg-line)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {hp && (
              <>
                <line
                  x1={line.x(hp[0])}
                  x2={line.x(hp[0])}
                  y1={LP.t}
                  y2={LH - LP.b}
                  stroke="var(--muted)"
                  strokeWidth="1"
                />
                <circle
                  cx={line.x(hp[0])}
                  cy={line.y(hp[1])}
                  r="4.5"
                  fill="var(--fg-line)"
                  stroke="var(--card)"
                  strokeWidth="2"
                />
              </>
            )}
          </svg>

          <p className="fgtip">
            {hp
              ? t('fg.tip', {
                  date: new Date(hp[0]).toISOString().slice(0, 10),
                  score: Math.round(hp[1]),
                })
              : t('fg.tipIdle')}
          </p>
        </div>
      )}

      <p className="cap">{t('fg.note')}</p>
    </section>
  );
}
