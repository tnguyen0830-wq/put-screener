'use client';

import { useMemo, useState } from 'react';
import { useLang } from '@/lib/i18n';

/**
 * Biểu đồ nến ngày SVG với mẫu hình app đã dò vẽ đè lên — tab Patterns.
 *
 * Vẽ bằng SVG trong code (không thư viện biểu đồ, không iframe) vì cùng lý do
 * `LearnFigure`: màu theo biến theme của app, và app phải VẼ ĐƯỢC lên biểu đồ
 * (đường cổ, mục tiêu, hai đáy) — thứ một widget nhúng khác origin không cho
 * làm (#177). Trục X là THỨ TỰ nến (categorical), không phải thời gian: ngày
 * nghỉ không để lại khoảng trống.
 *
 * Hình dạng dữ liệu khớp `/api/patterns/chart`; khai lại ở đây vì đây là
 * client component (không import chuỗi kéo theo node:fs).
 */
export type Candle = { t: number; open: number; high: number; low: number; close: number; volume: number | null };
export type Detection = {
  id: string; kind: 'candle' | 'chart' | 'level'; side: 'bull' | 'bear' | 'neutral';
  from: number; to: number; confirmed: boolean;
  levels: { key: string; price: number }[];
  points?: { i: number; price: number }[];
  lines?: { key: string; a: { i: number; price: number }; b: { i: number; price: number } }[];
  stats?: Record<string, number | null>;
};
export type Zone = { price: number; low: number; high: number; touches: number };
export type ChartData = {
  symbol: string;
  candles: Candle[];
  support: Zone[];
  resistance: Zone[];
  sma50: (number | null)[];
  sma200: (number | null)[];
  row: { detections: Detection[] };
};

const W = 900;
const H = 420;
const VOL_H = 60;
const PAD = { l: 8, r: 64, t: 12, b: 22 };
const ZOOMS = [60, 120, 260] as const;

const sideColor = (s: Detection['side']) => (s === 'bull' ? 'var(--credit)' : s === 'bear' ? 'var(--risk)' : 'var(--warn)');
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export default function PatternChart({ data, focus }: { data: ChartData; focus?: number | null }) {
  const { t } = useLang();
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(120);
  const [hover, setHover] = useState<number | null>(null);
  const n = data.candles.length;
  const dets = data.row.detections;

  /* Cửa sổ nhìn: `zoom` nến cuối, nới ra để mẫu đang chọn (hoặc mẫu giá dài
     nhất) không bị cắt mất phần đầu. Một cái vai-đầu-vai chỉ thấy vai phải
     trông như không có gì. */
  const start = useMemo(() => {
    let s = Math.max(0, n - zoom);
    const want = focus !== null && focus !== undefined && dets[focus] ? [dets[focus]] : dets.filter((d) => d.kind === 'chart');
    for (const d of want) s = Math.min(s, Math.max(0, d.from - 3));
    return Math.max(0, Math.min(s, n - 10));
  }, [n, zoom, dets, focus]);
  const vis = data.candles.slice(start);
  const m = vis.length;

  const geom = useMemo(() => {
    const plotH = H - VOL_H - PAD.t - PAD.b;
    let lo = Infinity, hi = -Infinity;
    for (const c of vis) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
    /* Mức của mẫu đang chọn (mục tiêu, đường cổ) phải nằm trong khung, nếu
       không "mục tiêu ở ngoài màn hình" trông như "không có mục tiêu". */
    const shown = focus !== null && focus !== undefined && dets[focus] ? [dets[focus]] : dets.slice(0, 3);
    for (const d of shown) for (const l of d.levels) { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); }
    for (const s of [data.sma50, data.sma200]) for (let i = start; i < n; i++) { const v = s[i]; if (v !== null && v !== undefined) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    const padY = (hi - lo) * 0.04 || 1;
    lo -= padY; hi += padY;
    const slot = (W - PAD.l - PAD.r) / Math.max(1, m);
    const x = (i: number) => PAD.l + (i - start + 0.5) * slot;         // i = chỉ số toàn cục
    const y = (p: number) => PAD.t + ((hi - p) / (hi - lo)) * plotH;
    const maxVol = Math.max(1, ...vis.map((c) => c.volume ?? 0));
    const vy = (v: number) => H - PAD.b - (v / maxVol) * (VOL_H - 6);
    return { lo, hi, slot, x, y, vy, plotH, maxVol };
  }, [vis, m, start, n, dets, focus, data.sma50, data.sma200]);

  const { x, y, vy, slot } = geom;
  const bw = Math.max(1.5, slot * 0.62);
  const hasVol = vis.some((c) => c.volume !== null);
  const path = (s: (number | null)[]) => {
    let d = '';
    for (let i = start; i < n; i++) {
      const v = s[i];
      if (v === null || v === undefined) continue;
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    }
    return d;
  };
  const ticks = useMemo(() => {
    const out: number[] = [];
    const span = geom.hi - geom.lo;
    const step = Math.pow(10, Math.floor(Math.log10(span / 5)));
    const nice = [1, 2, 5, 10].map((k) => k * step).find((s) => span / s <= 8) ?? step * 10;
    for (let v = Math.ceil(geom.lo / nice) * nice; v <= geom.hi; v += nice) out.push(v);
    return out;
  }, [geom.lo, geom.hi]);
  const shownDets = focus !== null && focus !== undefined && dets[focus] ? [dets[focus]] : dets.slice(0, 3);
  const hc = hover !== null ? data.candles[hover] : null;
  const inWin = (i: number) => i >= start && i < n;

  return (
    <div className="patchart">
      <div className="chiprow patzoom" role="group">
        {ZOOMS.map((z) => (
          <button key={z} className={z === zoom ? 'on' : undefined} aria-pressed={z === zoom} onClick={() => setZoom(z)} disabled={z > n && zoom !== z}>
            {z}{t('pat.bars')}
          </button>
        ))}
        <span className="cap patlegend">{t('pat.legend')}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={data.symbol}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = start + Math.floor((px - PAD.l) / slot);
          setHover(i >= start && i < n ? i : null);
        }}>
        {/* vùng hỗ trợ / kháng cự */}
        {data.support.map((z, k) => (
          <rect key={`s${k}`} x={PAD.l} width={W - PAD.l - PAD.r} y={y(z.high)} height={Math.max(1, y(z.low) - y(z.high))} fill="var(--credit)" opacity={0.12} />
        ))}
        {data.resistance.map((z, k) => (
          <rect key={`r${k}`} x={PAD.l} width={W - PAD.l - PAD.r} y={y(z.high)} height={Math.max(1, y(z.low) - y(z.high))} fill="var(--risk)" opacity={0.12} />
        ))}
        {/* trục giá */}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeWidth={0.6} />
            <text x={W - PAD.r + 6} y={y(v) + 3} style={{ fill: 'var(--muted)', fontFamily: 'var(--data)', fontSize: 10 }}>{v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)}</text>
          </g>
        ))}
        {/* khoảng của mẫu đang hiện */}
        {shownDets.map((d, k) => inWin(d.to) && (
          <rect key={`d${k}`} x={x(Math.max(d.from, start)) - slot / 2} width={(Math.min(d.to, n - 1) - Math.max(d.from, start) + 1) * slot}
            y={PAD.t} height={geom.plotH} fill={sideColor(d.side)} opacity={0.07} />
        ))}
        {/* SMA */}
        <path d={path(data.sma50)} fill="none" stroke="var(--stamp)" strokeWidth={1} opacity={0.9} />
        <path d={path(data.sma200)} fill="none" stroke="var(--muted)" strokeWidth={1.2} strokeDasharray="5 3" opacity={0.9} />
        {/* nến */}
        {vis.map((c, k) => {
          const i = start + k;
          const up = c.close >= c.open;
          const col = up ? 'var(--credit)' : 'var(--risk)';
          const top = y(Math.max(c.open, c.close)), bot = y(Math.min(c.open, c.close));
          return (
            <g key={c.t} className={hover === i ? 'pathov' : undefined}>
              <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth={1} />
              <rect x={x(i) - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} fill={col} />
              {hasVol && c.volume !== null && (
                <rect x={x(i) - bw / 2} y={vy(c.volume)} width={bw} height={H - PAD.b - vy(c.volume)} fill={col} opacity={0.35} />
              )}
            </g>
          );
        })}
        {/* mức và đường của mẫu */}
        {shownDets.map((d, k) => (
          <g key={`L${k}`}>
            {d.lines?.map((l, j) => inWin(l.b.i) && (
              <line key={j} x1={x(Math.max(l.a.i, start))} y1={y(l.a.price + ((l.b.price - l.a.price) * (Math.max(l.a.i, start) - l.a.i)) / Math.max(1, l.b.i - l.a.i))}
                x2={x(l.b.i)} y2={y(l.b.price)} stroke={sideColor(d.side)} strokeWidth={1.4} strokeDasharray={l.key === 'neckline' ? '6 3' : undefined} />
            ))}
            {d.levels.filter((l) => l.key === 'neckline' || l.key === 'target' || l.key === 'upper' || l.key === 'lower' || l.key === 'zone').map((l) => (
              <g key={l.key}>
                <line x1={x(Math.max(d.from, start))} x2={W - PAD.r} y1={y(l.price)} y2={y(l.price)} stroke={sideColor(d.side)} strokeWidth={1} strokeDasharray={l.key === 'target' ? '2 3' : '6 3'} opacity={l.key === 'target' ? 0.8 : 0.6} />
                <text x={W - PAD.r - 4} y={y(l.price) - 3} textAnchor="end" style={{ fill: sideColor(d.side), fontFamily: 'var(--data)', fontSize: 10 }}>
                  {t(`pat.level.${l.key}`)} {l.price.toFixed(2)}
                </text>
              </g>
            ))}
            {d.points?.map((p, j) => inWin(p.i) && (
              <circle key={j} cx={x(p.i)} cy={y(p.price)} r={4} fill="none" stroke={sideColor(d.side)} strokeWidth={1.6} />
            ))}
            {inWin(d.to) && (
              <text x={x(Math.min(d.to, n - 1))} y={PAD.t + 12 + k * 13} textAnchor="end" style={{ fill: sideColor(d.side), fontFamily: 'var(--data)', fontSize: 11, fontWeight: 700 }}>
                {t(`pat.name.${d.id}`)}{d.confirmed ? ' ✓' : ' …'}
              </text>
            )}
          </g>
        ))}
        {/* nhãn ngày đầu/cuối */}
        <text x={PAD.l} y={H - 6} style={{ fill: 'var(--muted)', fontFamily: 'var(--data)', fontSize: 10 }}>{iso(vis[0].t)}</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" style={{ fill: 'var(--muted)', fontFamily: 'var(--data)', fontSize: 10 }}>{iso(vis[m - 1].t)}</text>
        {hover !== null && inWin(hover) && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink)" strokeWidth={0.6} strokeDasharray="2 2" opacity={0.6} />
        )}
      </svg>
      <div className="hmhover pathover">
        {hc
          ? `${iso(hc.t)} · O ${hc.open.toFixed(2)} H ${hc.high.toFixed(2)} L ${hc.low.toFixed(2)} C ${hc.close.toFixed(2)}${hc.volume !== null ? ` · V ${Math.round(hc.volume).toLocaleString()}` : ''}`
          : t('pat.hoverHint')}
      </div>
    </div>
  );
}
