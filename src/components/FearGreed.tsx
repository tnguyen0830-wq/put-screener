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

const W = 640;
const H = 132;
const PAD_L = 22;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 16;

/**
 * CNN's Fear & Greed Index: where it stands now, and the year behind it.
 *
 * Deliberately one blue line rather than the red-to-green dial CNN uses. This
 * app has already spent green on "up" and red on "down" (see globals.css), and
 * a greed-is-green gauge would quietly add a second meaning to the same two
 * colours - worse here than elsewhere, because for someone selling puts the
 * mapping actually inverts: fear is when premium is generous. The number leads
 * by weight, the way every other headline figure in the app does, and the
 * reading is spelled out in words instead of implied by hue.
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

  const geom = useMemo(() => {
    if (!data?.history.length) return null;
    const pts = data.history;
    const t0 = pts[0][0];
    const t1 = pts[pts.length - 1][0];
    const span = t1 - t0 || 1;
    // The index is defined 0-100, so the axis is fixed rather than fitted -
    // rescaling it per window would make a calm year look as dramatic as a
    // panic and hide where 50 sits.
    const x = (ms: number) => PAD_L + ((ms - t0) / span) * (W - PAD_L - PAD_R);
    const y = (v: number) => PAD_T + (1 - v / 100) * (H - PAD_T - PAD_B);
    return {
      x,
      y,
      pts,
      d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(''),
    };
  }, [data]);

  const onMove = (clientX: number) => {
    if (!geom || !svg.current) return;
    const box = svg.current.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * W;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < geom.pts.length; i++) {
      const d = Math.abs(geom.x(geom.pts[i][0]) - vx);
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

  const hp = hover !== null && geom ? geom.pts[hover] : null;

  return (
    <section className="fg">
      <h3 className="dsec">{t('fg.title')}</h3>

      <div className="fghead">
        {/* House rule: a headline number leads with weight, not colour. */}
        <span className="fgscore">{Math.round(data.score)}</span>
        <span className="fgrating">{data.rating ?? '—'}</span>
        <span className="spacer" />
        <dl className="fgprev">
          {([
            ['fg.prevClose', data.previousClose],
            ['fg.week', data.weekAgo],
            ['fg.month', data.monthAgo],
            ['fg.year', data.yearAgo],
          ] as [string, number | null][]).map(([k, v]) => (
            <div key={k}>
              <dt>{t(k)}</dt>
              <dd>{v === null ? '—' : Math.round(v)}</dd>
            </div>
          ))}
        </dl>
      </div>

      {geom && (
        <div className="fgchart">
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={t('fg.aria', Math.round(data.score))}
            onMouseMove={(e) => onMove(e.clientX)}
            onMouseLeave={() => setHover(null)}
            onTouchMove={(e) => onMove(e.touches[0].clientX)}
            onTouchEnd={() => setHover(null)}
          >
            {[0, 50, 100].map((v) => (
              <g key={v}>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={geom.y(v)}
                  y2={geom.y(v)}
                  stroke="var(--rule)"
                  strokeWidth="1"
                  /* 50 is the neutral midpoint of a diverging scale, so it is
                     drawn solid while the outer bounds stay dashed. */
                  strokeDasharray={v === 50 ? undefined : '2 3'}
                />
                <text
                  x={PAD_L - 5}
                  y={geom.y(v) + 3}
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
              d={geom.d}
              fill="none"
              stroke="var(--fg-line)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {hp && (
              <>
                <line
                  x1={geom.x(hp[0])}
                  x2={geom.x(hp[0])}
                  y1={PAD_T}
                  y2={H - PAD_B}
                  stroke="var(--muted)"
                  strokeWidth="1"
                />
                {/* A surface ring keeps the marker readable over the line. */}
                <circle
                  cx={geom.x(hp[0])}
                  cy={geom.y(hp[1])}
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
