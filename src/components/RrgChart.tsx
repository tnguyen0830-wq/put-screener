'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Point = {
  key: string;
  symbol: string;
  quadrant: 'leading' | 'weakening' | 'lagging' | 'improving';
  ratio: number;
  momentum: number;
  tail: [number, number][];
};
type Data = {
  benchmark: string;
  weeks: number;
  from: string;
  to: string;
  points: Point[];
  missing: string[];
};

/**
 * Khung vẽ: nằm ngang trên màn hình rộng, dựng đứng trên điện thoại.
 *
 * Cùng một khung ngang mà nhét vào màn 412px thì biểu đồ chỉ còn cao chưa tới
 * 200px - mười một cái tên chồng lên nhau và chẳng đọc được gì. Khung dựng đứng
 * lấy lại chiều cao, và chữ được phóng theo vì đơn vị trong viewBox lúc đó nhỏ
 * hơn nhiều so với pixel thật.
 */
const WIDE = { w: 900, h: 520, sector: 11, quad: 15, tick: 9 };
const TALL = { w: 460, h: 620, sector: 13, quad: 13, tick: 10.5 };
const PAD = { l: 30, r: 16, t: 16, b: 28 };

/**
 * Màu của bốn góc phần tư.
 *
 * Đây là màu trạng thái, không phải màu định danh: mỗi góc luôn nằm đúng một
 * chỗ trên biểu đồ và có tên viết sẵn ở góc đó, nên vị trí và chữ mới là thứ
 * nói ngành đang ở đâu - màu chỉ nhắc lại. Nhờ vậy người khó phân biệt màu vẫn
 * đọc được biểu đồ, và cái đuôi thì để màu chữ trung tính chứ không tô 11 màu
 * chỉ để rồi chẳng ai tách nổi.
 */
const QUAD: Record<Point['quadrant'], string> = {
  leading: 'var(--credit)',
  weakening: 'var(--warn)',
  lagging: 'var(--risk)',
  improving: 'var(--stamp)',
};
const QUAD_TINT: Record<Point['quadrant'], string> = {
  leading: 'var(--credit-tint)',
  weakening: 'var(--warn-tint)',
  lagging: 'var(--risk-tint)',
  improving: 'var(--stamp-tint)',
};
const QUADRANTS = ['improving', 'leading', 'lagging', 'weakening'] as const;

export default function RrgChart() {
  const { t } = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [on, setOn] = useState<string | null>(null);
  // Bắt đầu bằng khung ngang rồi mới đo: server không có màn hình nào để hỏi,
  // và đổi sau khi dựng xong thì không lệch giữa HTML của server và của trình
  // duyệt.
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/rrg')
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setError(j.error ?? t('rrg.loadFailed'));
        else setData(j);
      })
      .catch(() => alive && setError(t('rrg.loadFailed')));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error)
    return (
      <section className="panel">
        <div className="panel-head">{t('rrg.title')}</div>
        <div className="panel-body">
          <p className="cap">{error}</p>
        </div>
      </section>
    );
  if (!data)
    return (
      <section className="panel">
        <div className="panel-head">{t('rrg.title')}</div>
        <div className="panel-body">
          <p className="cap">{t('rrg.loading')}</p>
        </div>
      </section>
    );

  const { w: W, h: H, sector: FS, quad: FQ, tick: FT } = compact ? TALL : WIDE;

  // Mỗi trục tự co giãn theo dữ liệu của chính nó, nhưng luôn đối xứng quanh
  // 100 - nếu không thì bốn góc phần tư sẽ không gặp nhau ở giữa và cách đọc
  // biểu đồ mất hết ý nghĩa. Hai trục là hai điểm z khác nhau nên không buộc
  // phải cùng tỉ lệ; thả cho mỗi trục tự giãn thì đám ngành trải ra kín khung
  // thay vì dồn cục ở giữa.
  const spanOf = (pick: (p: [number, number]) => number) =>
    Math.max(
      1.2,
      Math.max(
        ...data.points.flatMap((p) => p.tail.map((t) => Math.abs(pick(t) - 100)))
      ) * 1.15
    );
  const spanX = spanOf((t) => t[0]);
  const spanY = spanOf((t) => t[1]);
  const px = (v: number) =>
    PAD.l + ((v - (100 - spanX)) / (2 * spanX)) * (W - PAD.l - PAD.r);
  const py = (v: number) =>
    H - PAD.b - ((v - (100 - spanY)) / (2 * spanY)) * (H - PAD.t - PAD.b);
  const cx = px(100);
  const cy = py(100);

  // Vạch lưới ở mỗi bước 1 điểm z, bỏ đúng mốc 100 vì đã có trục chính ở đó.
  const tickList = (span: number) => {
    const step = span > 3 ? 2 : 1;
    const out: number[] = [];
    for (let v = 100 - Math.floor(span / step) * step; v <= 100 + span; v += step)
      if (Math.abs(v - 100) > 1e-9) out.push(v);
    return out;
  };
  const xTicks = tickList(spanX);
  const yTicks = tickList(spanY);

  const dim = (k: string) => (on && on !== k ? 0.12 : 1);

  const hovered = data.points.find((p) => p.key === on) ?? null;

  return (
    <section className="panel">
      <div className="panel-head">{t('rrg.title')}</div>
      <div className="panel-body">

      <div className="rrgwrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={t('rrg.aria')}
          onMouseLeave={() => setOn(null)}
        >
          {/* Nền bốn góc: cùng màu với chấm đầu mỗi ngành, nhạt hơn nhiều. */}
          <rect x={cx} y={PAD.t} width={W - PAD.r - cx} height={cy - PAD.t} fill={QUAD_TINT.leading} />
          <rect x={PAD.l} y={PAD.t} width={cx - PAD.l} height={cy - PAD.t} fill={QUAD_TINT.improving} />
          <rect x={PAD.l} y={cy} width={cx - PAD.l} height={H - PAD.b - cy} fill={QUAD_TINT.lagging} />
          <rect x={cx} y={cy} width={W - PAD.r - cx} height={H - PAD.b - cy} fill={QUAD_TINT.weakening} />

          {xTicks.map((v) => (
            <g key={`x${v}`}>
              <line x1={px(v)} x2={px(v)} y1={PAD.t} y2={H - PAD.b} stroke="var(--rule-soft)" strokeWidth="1" />
              <text x={px(v)} y={H - PAD.b + 12} fontSize={FT} textAnchor="middle" fill="var(--muted)" fontFamily="var(--data)">
                {v.toFixed(0)}
              </text>
            </g>
          ))}
          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line x1={PAD.l} x2={W - PAD.r} y1={py(v)} y2={py(v)} stroke="var(--rule-soft)" strokeWidth="1" />
              <text x={PAD.l - 5} y={py(v) + 3} fontSize={FT} textAnchor="end" fill="var(--muted)" fontFamily="var(--data)">
                {v.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Hai trục chính cắt nhau ở 100/100 - mốc ngang bằng mặt bằng chung. */}
          <line x1={cx} x2={cx} y1={PAD.t} y2={H - PAD.b} stroke="var(--rule)" strokeWidth="1.5" />
          <line x1={PAD.l} x2={W - PAD.r} y1={cy} y2={cy} stroke="var(--rule)" strokeWidth="1.5" />

          {QUADRANTS.map((q) => {
            const right = q === 'leading' || q === 'weakening';
            const top = q === 'leading' || q === 'improving';
            return (
              <text
                key={q}
                x={right ? W - PAD.r - 8 : PAD.l + 8}
                y={top ? PAD.t + 20 : H - PAD.b - 8}
                fontSize={FQ}
                fontWeight="700"
                letterSpacing="0.12em"
                textAnchor={right ? 'end' : 'start'}
                fill={QUAD[q]}
                fillOpacity="0.5"
                fontFamily="var(--display)"
                pointerEvents="none"
              >
                {t(`rrg.q.${q}`).toUpperCase()}
              </text>
            );
          })}

          {data.points.map((p) => {
            const path = p.tail.map(([x, y]) => `${px(x)},${py(y)}`).join(' ');
            const [hx, hy] = p.tail[p.tail.length - 1];
            const right = px(hx) > cx;
            return (
              <g
                key={p.key}
                opacity={dim(p.key)}
                onMouseEnter={() => setOn(p.key)}
                onClick={() => setOn(on === p.key ? null : p.key)}
                style={{ cursor: 'pointer' }}
              >
                {/* Vùng bắt chuột rộng hơn nét vẽ, để không phải trỏ trúng sợi
                    dây 2px mới hiện được số. */}
                <polyline points={path} fill="none" stroke="transparent" strokeWidth="14" />
                <polyline
                  points={path}
                  fill="none"
                  stroke={on === p.key ? QUAD[p.quadrant] : 'var(--muted)'}
                  strokeWidth={on === p.key ? 2.5 : 1.6}
                  strokeOpacity={on === p.key ? 0.95 : 0.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {p.tail.slice(0, -1).map(([x, y], i) => (
                  <circle key={i} cx={px(x)} cy={py(y)} r="1.8" fill="var(--muted)" fillOpacity="0.55" />
                ))}
                <circle cx={px(hx)} cy={py(hy)} r="5.5" fill={QUAD[p.quadrant]} stroke="var(--card)" strokeWidth="2" />
                <text
                  x={px(hx) + (right ? -10 : 10)}
                  y={py(hy) + FS * 0.33}
                  fontSize={FS}
                  textAnchor={right ? 'end' : 'start'}
                  fill="var(--ink)"
                  fontFamily="var(--body)"
                  fontWeight={on === p.key ? 700 : 500}
                  pointerEvents="none"
                >
                  {t(`rrg.s.${p.key}`)}
                </text>
              </g>
            );
          })}

          <text x={W - PAD.r} y={H - 4} fontSize={FT} textAnchor="end" fill="var(--muted)" fontFamily="var(--data)">
            {t('rrg.xAxis')}
          </text>
          <text x={PAD.l - 5} y={PAD.t + 2} fontSize={FT} fill="var(--muted)" fontFamily="var(--data)">
            {t('rrg.yAxis')}
          </text>
        </svg>
      </div>

      <div className="hmhover">
        {hovered
          ? t('rrg.hover', {
              name: t(`rrg.s.${hovered.key}`),
              symbol: hovered.symbol,
              ratio: hovered.ratio.toFixed(2),
              momentum: hovered.momentum.toFixed(2),
              quadrant: t(`rrg.q.${hovered.quadrant}`),
            })
          : t('rrg.hoverIdle', { weeks: data.weeks, from: data.from, to: data.to })}
      </div>

      <div className="rrglegend">
        {QUADRANTS.map((q) => (
          <span key={q}>
            <i style={{ background: QUAD[q] }} />
            {t(`rrg.q.${q}`)} — {t(`rrg.qNote.${q}`)}
          </span>
        ))}
      </div>

      {/* Bảng số: đọc được bằng trình đọc màn hình, và khi hai ngành chồng lên
          nhau trên biểu đồ thì đây là chỗ tra ra con số thật. */}
      <details className="rrgtable">
        <summary>{t('rrg.tableToggle')}</summary>
        <table className="ratings">
          <thead>
            <tr>
              <th>{t('rrg.colSector')}</th>
              <th>ETF</th>
              <th>RS-Ratio</th>
              <th>RS-Momentum</th>
              <th>{t('rrg.colQuadrant')}</th>
            </tr>
          </thead>
          <tbody>
            {[...data.points]
              .sort((a, b) => b.ratio - a.ratio)
              .map((p) => (
                <tr key={p.key}>
                  <td>{t(`rrg.s.${p.key}`)}</td>
                  <td>{p.symbol}</td>
                  <td>{p.ratio.toFixed(2)}</td>
                  <td>{p.momentum.toFixed(2)}</td>
                  <td>{t(`rrg.q.${p.quadrant}`)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>

      <p className="cap">{t('rrg.note')}</p>
      </div>
    </section>
  );
}
