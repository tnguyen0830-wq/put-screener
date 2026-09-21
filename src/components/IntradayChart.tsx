'use client';

import { useMemo, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { vwapSeries, type IntraBar, type OpeningRange, type PriorSession } from '@/lib/daytrade';

/**
 * Biểu đồ nến trong ngày, vẽ bằng SVG trong code — cùng lý do
 * `PatternChart`/`LearnFigure` làm thế: không host ngoài, đổi theme là đổi
 * màu, và không có ảnh vỡ nào để đọc nhầm thành "app hỏng" (#133).
 *
 * Bốn thứ chủ app đặt hàng đều nằm TRÊN biểu đồ chứ không chỉ trong bảng —
 * một con số "giá trên VWAP 0,4%" không nói được giá đã ở trên VWAP suốt
 * phiên hay vừa mới cắt lên.
 *
 * **Miền giá được NỚI để chứa mọi mức đang vẽ.** Một mốc hôm qua nằm ngoài
 * khung trông y hệt một mốc không tồn tại — cùng bài học đã ghi ở
 * `PatternChart` khi mục tiêu bị vẽ ra ngoài màn hình.
 */

export type ChartInput = {
  symbol: string;
  bars: IntraBar[];
  openRange: OpeningRange | null;
  prior: PriorSession | null;
  sessionDate: string | null;
};

const W = 900;
const H = 340;
const PAD_L = 8;
const PAD_R = 58;
const PAD_T = 12;
const PAD_B = 26;

export default function IntradayChart({ data }: { data: ChartInput }) {
  const { t, lang } = useLang();
  const [hover, setHover] = useState<number | null>(null);

  const vwap = useMemo(() => vwapSeries(data.bars), [data.bars]);

  const geom = useMemo(() => {
    const bars = data.bars;
    if (!bars.length) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of bars) {
      if (b.low < lo) lo = b.low;
      if (b.high > hi) hi = b.high;
    }
    // Nới cho MỌI mức được vẽ — xem chú thích đầu file.
    for (const v of vwap) if (v !== null) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (data.openRange) {
      lo = Math.min(lo, data.openRange.low);
      hi = Math.max(hi, data.openRange.high);
    }
    if (data.prior) {
      lo = Math.min(lo, data.prior.low);
      hi = Math.max(hi, data.prior.high, data.prior.close);
    }
    if (!(hi > lo)) { hi = lo + 1; lo -= 1; }
    const pad = (hi - lo) * 0.06;
    lo -= pad;
    hi += pad;
    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;
    const slot = plotW / Math.max(bars.length, 1);
    const x = (i: number) => PAD_L + slot * (i + 0.5);
    const y = (p: number) => PAD_T + ((hi - p) / (hi - lo)) * plotH;
    return { lo, hi, slot, x, y, plotH, bodyW: Math.max(1.5, Math.min(slot * 0.62, 10)) };
  }, [data, vwap]);

  if (!geom) return <p className="cap">{t('dt.chartEmpty')}</p>;
  const { x, y, slot, bodyW } = geom;
  const bars = data.bars;

  const vwapPath = (() => {
    const pts: string[] = [];
    vwap.forEach((v, i) => { if (v !== null) pts.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`); });
    return pts.length > 1 ? pts.join(' ') : null;
  })();

  const orIdx = data.openRange ? data.openRange.bars : 0;
  const brokeIdx = data.openRange?.brokeAt
    ? bars.findIndex((b) => b.t === data.openRange!.brokeAt)
    : -1;

  const clock = (ms: number) =>
    new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(ms));

  /* Nhãn giờ thưa ra để không chồng chữ ở 400px. */
  const tickEvery = Math.max(1, Math.ceil(bars.length / 8));

  const level = (price: number, color: string, label: string, dash: string) => (
    <g key={label}>
      <line x1={PAD_L} x2={W - PAD_R} y1={y(price)} y2={y(price)} stroke={color} strokeWidth="1" strokeDasharray={dash} opacity="0.85" />
      <text x={W - PAD_R + 4} y={y(price) + 3.5} fontSize="10" fill={color}>{label}</text>
    </g>
  );

  const hb = hover !== null ? bars[hover] : null;

  return (
    <div className="dtchartwrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="dtchart" role="img"
           aria-label={`${data.symbol} ${data.sessionDate ?? ''}`}>
        {/* Khoảng mở cửa: vùng tô kéo dài sang phải, vì nó là một MỨC cho cả
            phiên chứ không chỉ cho mấy nến đầu. */}
        {data.openRange && (
          <>
            <rect
              x={PAD_L} y={y(data.openRange.high)}
              width={W - PAD_R - PAD_L}
              height={Math.max(1, y(data.openRange.low) - y(data.openRange.high))}
              fill="var(--warn)" opacity="0.10"
            />
            <line x1={PAD_L + slot * orIdx} x2={PAD_L + slot * orIdx} y1={PAD_T} y2={H - PAD_B}
                  stroke="var(--warn)" strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
            {level(data.openRange.high, 'var(--warn)', `OR ${data.openRange.high.toFixed(2)}`, '4 3')}
            {level(data.openRange.low, 'var(--warn)', `OR ${data.openRange.low.toFixed(2)}`, '4 3')}
          </>
        )}

        {/* Mốc phiên trước */}
        {data.prior && (
          <>
            {level(data.prior.high, 'var(--muted)', `PDH ${data.prior.high.toFixed(2)}`, '1 3')}
            {level(data.prior.low, 'var(--muted)', `PDL ${data.prior.low.toFixed(2)}`, '1 3')}
            {level(data.prior.close, 'var(--muted)', `PDC ${data.prior.close.toFixed(2)}`, '6 3')}
          </>
        )}

        {/* Nến */}
        {bars.map((b, i) => {
          const up = b.close >= b.open;
          const c = up ? 'var(--credit)' : 'var(--risk)';
          const yo = y(b.open);
          const yc = y(b.close);
          return (
            <g key={b.t} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x(i) - slot / 2} y={PAD_T} width={slot} height={H - PAD_T - PAD_B} fill="transparent" />
              <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={c} strokeWidth="1" />
              <rect x={x(i) - bodyW / 2} y={Math.min(yo, yc)}
                    width={bodyW} height={Math.max(1, Math.abs(yc - yo))} fill={c} />
            </g>
          );
        })}

        {/* VWAP */}
        {vwapPath && (
          <polyline points={vwapPath} fill="none" stroke="var(--stamp)" strokeWidth="1.6"
                    vectorEffect="non-scaling-stroke" />
        )}

        {/* Cú phá khoảng mở cửa */}
        {brokeIdx >= 0 && (
          <g>
            <line x1={x(brokeIdx)} x2={x(brokeIdx)} y1={PAD_T} y2={H - PAD_B}
                  stroke={data.openRange!.broke === 'up' ? 'var(--credit)' : 'var(--risk)'}
                  strokeWidth="1.2" strokeDasharray="3 2" />
            <text x={x(brokeIdx) + 3} y={PAD_T + 10} fontSize="10"
                  fill={data.openRange!.broke === 'up' ? 'var(--credit)' : 'var(--risk)'}>
              {data.openRange!.broke === 'up' ? '▲' : '▼'}
            </text>
          </g>
        )}

        {/* Trục giờ */}
        {bars.map((b, i) =>
          i % tickEvery === 0 ? (
            <text key={`t${b.t}`} x={x(i)} y={H - 8} fontSize="10" fill="var(--muted)" textAnchor="middle">
              {clock(b.t)}
            </text>
          ) : null
        )}

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H - PAD_B}
                stroke="var(--muted)" strokeWidth="0.8" opacity="0.6" />
        )}
      </svg>

      <p className="cap dthover">
        {hb ? (
          <>
            {clock(hb.t)} · O {hb.open.toFixed(2)} H {hb.high.toFixed(2)} L {hb.low.toFixed(2)} C{' '}
            {hb.close.toFixed(2)}
            {hb.volume !== null ? ` · V ${hb.volume.toLocaleString()}` : ` · ${t('dt.noVol')}`}
            {hover !== null && vwap[hover] !== null ? ` · VWAP ${vwap[hover]!.toFixed(2)}` : ''}
          </>
        ) : (
          t('dt.chartLegend')
        )}
      </p>
    </div>
  );
}
