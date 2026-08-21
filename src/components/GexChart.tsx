'use client';

import { useEffect, useState } from 'react';
import type { GexProfile } from '@/lib/gex';

const money = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return `${(n / 1e3).toFixed(0)}K`;
};

export default function GexChart({
  symbol,
  strike,
}: {
  symbol: string;
  /** Strike của người dùng, nếu có. Tab phân tích mã xem GEX mà chưa chọn
   *  hợp đồng nào nên bỏ trống — khi đó biểu đồ chỉ vẽ wall, không vẽ vạch. */
  strike?: number;
}) {
  const [data, setData] = useState<GexProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    fetch(`/api/gex?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setError(j.error ?? 'Không tải được GEX');
        else setData(j);
      })
      .catch(() => alive && setError('Không tải được GEX'));
    return () => {
      alive = false;
    };
  }, [symbol]);

  if (error) return <p className="cap">{error}</p>;
  if (!data) return <p className="cap">Đang tính gamma theo strike…</p>;

  // Only the strikes near spot carry meaningful hedging flow.
  const lo = data.spot * 0.75;
  const hi = data.spot * 1.25;
  const rows = data.strikes.filter((s) => s.strike >= lo && s.strike <= hi);
  if (!rows.length) return <p className="cap">Không đủ open interest quanh giá.</p>;

  const W = 470;
  const H = 190;
  const padL = 6;
  const padB = 22;
  const minK = rows[0].strike;
  const maxK = rows[rows.length - 1].strike;
  const span = maxK - minK || 1;
  const peak = Math.max(...rows.map((s) => Math.max(s.callGex, -s.putGex))) || 1;

  const x = (k: number) => padL + ((k - minK) / span) * (W - padL * 2);
  const barW = Math.max(1.5, (W - padL * 2) / rows.length - 1);
  const axis = H - padB;
  const h = (v: number) => (Math.abs(v) / peak) * (axis - 14);

  const mark = (k: number, color: string, label: string, dy: number) => (
    <g>
      <line x1={x(k)} x2={x(k)} y1={4} y2={axis} stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
      <text x={x(k) + 3} y={dy} fontSize="8.5" fill={color} fontFamily="var(--data)">
        {label}
      </text>
    </g>
  );

  const belowWall =
    strike !== undefined && data.putWall !== null && strike <= data.putWall;

  return (
    <>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gamma theo strike cho ${symbol}`}>
        {rows.map((s) => (
          <g key={s.strike}>
            {s.callGex > 0 && (
              <rect
                x={x(s.strike) - barW / 2}
                y={axis - h(s.callGex)}
                width={barW}
                height={h(s.callGex)}
                fill="var(--rule)"
              />
            )}
            {s.putGex < 0 && (
              <rect
                x={x(s.strike) - barW / 2}
                y={axis - h(s.putGex)}
                width={barW}
                height={h(s.putGex)}
                fill="var(--credit-tint)"
              />
            )}
          </g>
        ))}
        <line x1={0} x2={W} y1={axis} y2={axis} stroke="var(--rule)" strokeWidth="1" />

        {data.putWall !== null && mark(data.putWall, 'var(--credit)', 'Put wall', 12)}
        {data.callWall !== null && mark(data.callWall, 'var(--muted)', 'Call wall', 24)}
        {strike !== undefined && mark(strike, 'var(--stamp)', 'Strike của bạn', 36)}

        <circle cx={x(data.spot)} cy={axis} r="3.5" fill="var(--ink)" />
        <text x={x(data.spot)} y={axis + 14} fontSize="8.5" textAnchor="middle" fill="var(--ink)" fontFamily="var(--data)">
          {data.spot.toFixed(0)}
        </text>
        <text x={padL} y={axis + 14} fontSize="8.5" fill="var(--muted)" fontFamily="var(--data)">
          {minK.toFixed(0)}
        </text>
        <text x={W - padL} y={axis + 14} fontSize="8.5" textAnchor="end" fill="var(--muted)" fontFamily="var(--data)">
          {maxK.toFixed(0)}
        </text>
      </svg>

      <dl className="stats gexstats">
        <div>
          <dt>Put wall</dt>
          {/* Mức giá, không phải hướng — làm nổi bằng độ đậm chứ không tô xanh. */}
          <dd className="num-key">{data.putWall?.toFixed(2) ?? '—'}</dd>
        </div>
        <div>
          <dt>Call wall</dt>
          <dd>{data.callWall?.toFixed(2) ?? '—'}</dd>
        </div>
        <div>
          <dt>Zero gamma</dt>
          <dd>{data.zeroGamma?.toFixed(2) ?? '—'}</dd>
        </div>
        <div>
          <dt>Net GEX</dt>
          <dd className={data.totalGex >= 0 ? 'good' : 'bad'}>
            {money(data.totalGex)}
          </dd>
        </div>
      </dl>

      <p className="cap">
        {strike === undefined ? (
          <>
            Put wall {data.putWall?.toFixed(2) ?? '—'} là mốc gamma put lớn nhất —
            vùng dealer phải mua vào để hedge, nên thường hành xử như hỗ trợ.
          </>
        ) : belowWall ? (
          <>
            Strike {strike.toFixed(2)} nằm <b>tại hoặc dưới put wall</b> — dòng
            hedge của dealer đứng về phía bạn ở vùng này.
          </>
        ) : (
          <>
            Strike {strike.toFixed(2)} nằm <b>trên put wall</b>{' '}
            {data.putWall?.toFixed(2)} — không có lớp hedge nào đỡ ở mức này. Cân
            nhắc hạ xuống gần put wall hơn.
          </>
        )}{' '}
        Net GEX {data.totalGex >= 0 ? 'dương' : 'âm'}:{' '}
        {data.totalGex >= 0
          ? 'dealer làm dịu biến động, biên độ thường hẹp.'
          : 'dealer khuếch đại biến động, giảm size và nới stop.'}
      </p>
    </>
  );
}
