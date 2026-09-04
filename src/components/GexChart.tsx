'use client';

import { useLang } from '@/lib/i18n';

import { useEffect, useState } from 'react';
import type { GexChainWindow, GexLevelsResponse, GexProfile } from '@/lib/gex';
import TradeBriefingPanel from './TradeBriefingPanel';

/** GexProfile không có trường phân biệt, nên dùng hàm bảo vệ kiểu tường
 *  minh: TypeScript mới thu hẹp được CẢ nhánh ngược lại (phần vẽ biểu đồ
 *  bên dưới chỉ chạy với dữ liệu Schwab đầy đủ). */
type SchwabGex = GexProfile & { chainWindow?: GexChainWindow };

const isUwLevels = (d: SchwabGex | GexLevelsResponse): d is GexLevelsResponse =>
  (d as GexLevelsResponse).source === 'uw';

const money = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return `${(n / 1e3).toFixed(0)}K`;
};

export default function GexChart({
  symbol,
  strike,
  refreshMs,
  zoomPct = 0.25,
}: {
  symbol: string;
  /** Strike của người dùng, nếu có. Tab phân tích mã xem GEX mà chưa chọn
   *  hợp đồng nào nên bỏ trống — khi đó biểu đồ chỉ vẽ wall, không vẽ vạch. */
  strike?: number;
  /** Khi có giá trị, tự lấy lại dữ liệu theo chu kỳ này (mili-giây) mà KHÔNG
   *  xoá biểu đồ đang hiện — vẽ lại đè lên còn hơn chớp về "đang tính…" mỗi
   *  lần làm mới, giống nguyên tắc ở TickerTape. Chỉ set khi cần tự làm mới
   *  (panel SPX Market Maker Exposure); các nơi gọi khác (Analyze) bỏ trống. */
  refreshMs?: number;
  /** Biên độ strike hiển thị quanh giá hiện tại, phần trăm dạng thập phân
   *  (0.25 = ±25%). Mặc định giữ nguyên hành vi cũ. */
  zoomPct?: number;
}) {
  const { t } = useLang();
  const [data, setData] = useState<SchwabGex | GexLevelsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Lý do thật Schwab trả về (từ /api/gex's `detail`) - xem chú thích ở
   *  route đó. Hiện riêng, nhỏ hơn, để không lẫn với thông báo chính nhưng
   *  vẫn nhìn thấy được thay vì phải xem log server mới biết vì sao. */
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setErrorDetail(null);
    setUpdatedAt(null);

    const load = () => {
      fetch(`/api/gex?symbol=${encodeURIComponent(symbol)}`)
        .then(async (r) => {
          const j = await r.json();
          if (!alive) return;
          if (!r.ok) {
            setError(j.error ?? t('gex.loadFailed'));
            setErrorDetail(j.detail ?? null);
          } else {
            setData(j);
            setError(null);
            setErrorDetail(null);
            setUpdatedAt(Date.now());
          }
        })
        .catch(() => alive && setError(t('gex.loadFailed')));
    };

    load();
    if (!refreshMs) return () => { alive = false; };
    const id = setInterval(load, refreshMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol, refreshMs]);

  if (error)
    return (
      <>
        <p className="cap">{error}</p>
        {errorDetail && <p className="cap">{errorDetail}</p>}
      </>
    );
  if (!data) return <p className="cap">{t('gex.computing')}</p>;

  // Nguồn UW: chỉ có các mức chính, không có gamma theo từng strike nên
  // không vẽ được biểu đồ cột. Nói thẳng nguồn ngay trên màn hình - một
  // con số "put wall" của UW và một con số app tự tính từ chuỗi Schwab là
  // hai thứ khác nhau, để lẫn vào nhau thì người đọc không biết mình đang
  // xem cái nào. Cũng không hiện AI Trade Briefing ở đây: nó dựng kèo từ
  // strike/giá thật của chuỗi Schwab, mà chuỗi đó chính là thứ không lấy
  // được - một nút bấm chắc chắn lỗi thì thà không hiện.
  if (isUwLevels(data)) {
    const L = data.levels;
    return (
      <>
        <dl className="stats gexstats">
          <div>
            <dt>{t('gex.putWall')}</dt>
            <dd className="num-key">{L.putWall?.toFixed(2) ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('gex.callWall')}</dt>
            <dd>{L.callWall?.toFixed(2) ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('gex.zeroGamma')}</dt>
            <dd>{L.gammaFlip?.toFixed(2) ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('gex.gammaMagnet')}</dt>
            <dd>{L.gammaMagnet?.toFixed(2) ?? '—'}</dd>
          </div>
        </dl>

        {L.nearbyFlips.length > 0 && (
          <p className="cap">
            {t('gex.nearbyFlips')}: {L.nearbyFlips.map((n) => n.toFixed(2)).join(' · ')}
          </p>
        )}

        <p className="cap">{t('gex.uwSource', { basis: L.basis ?? '—', date: L.date ?? '—' })}</p>

        {/* Không đọc được mức nào: hiện đúng các khoá UW thật sự trả về,
            thay vì bốn dấu gạch không giải thích được. */}
        {L.rawKeys && (
          <p className="cap">
            {t('gex.uwUnreadable')}: {L.rawKeys.join(', ') || '(rỗng)'}
          </p>
        )}

        {data.schwabDetail && <p className="cap">{t('gex.uwWhy', data.schwabDetail)}</p>}

        {refreshMs && updatedAt && (
          <p className="cap">{t('gex.updatedAt', new Date(updatedAt).toLocaleTimeString())}</p>
        )}
      </>
    );
  }

  // Only the strikes near spot carry meaningful hedging flow.
  const lo = data.spot * (1 - zoomPct);
  const hi = data.spot * (1 + zoomPct);
  const rows = data.strikes.filter((s) => s.strike >= lo && s.strike <= hi);
  if (!rows.length) return <p className="cap">{t('gex.thin')}</p>;

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

        {data.putWall !== null && mark(data.putWall, 'var(--credit)', t('gex.putWall'), 12)}
        {data.callWall !== null && mark(data.callWall, 'var(--muted)', t('gex.callWall'), 24)}
        {strike !== undefined && mark(strike, 'var(--stamp)', t('gex.yourStrike'), 36)}

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
          <dt>{t('gex.putWall')}</dt>
          {/* Mức giá, không phải hướng — làm nổi bằng độ đậm chứ không tô xanh. */}
          <dd className="num-key">{data.putWall?.toFixed(2) ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('gex.callWall')}</dt>
          <dd>{data.callWall?.toFixed(2) ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('gex.zeroGamma')}</dt>
          <dd>{data.zeroGamma?.toFixed(2) ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('gex.netGex')}</dt>
          <dd className={data.totalGex >= 0 ? 'good' : 'bad'}>
            {money(data.totalGex)}
          </dd>
        </div>
      </dl>

      <p className="cap">
        {strike === undefined
          ? t('gex.noStrike', data.putWall?.toFixed(2) ?? '—')
          : belowWall
            ? t('gex.below', strike.toFixed(2))
            : t('gex.above', {
                strike: strike.toFixed(2),
                wall: data.putWall?.toFixed(2) ?? '—',
              })}{' '}
        {data.totalGex >= 0 ? t('gex.netPos') : t('gex.netNeg')}
      </p>

      {/* Chỉ hiện khi có tự làm mới — biểu đồ tĩnh (Analyze) không cần dòng
          này. Không có nó, biểu đồ cũ 10 phút trước trông giống hệt biểu đồ
          vừa mới tải — im lặng đọc thành "vẫn ổn", đúng cái bẫy self-diagnosing
          idiom của app này muốn tránh. */}
      {/* Cửa sổ đã bị thu hẹp: nói ra. Wall tính trên 7 ngày/60 strike là
          wall lớn nhất TRONG phạm vi đó, không phải của cả chuỗi. */}
      {data.chainWindow && data.chainWindow.days < 60 && (
        <p className="cap">
          {t('gex.narrowed', {
            days: data.chainWindow.days,
            strikes: data.chainWindow.strikeCount ?? 0,
          })}
        </p>
      )}

      {refreshMs && updatedAt && (
        <p className="cap">
          {t('gex.updatedAt', new Date(updatedAt).toLocaleTimeString())}
        </p>
      )}

      {/* Một component dùng chung cho cả 3 nơi GexChart xuất hiện (Analyze,
          DetailDrawer, panel SPX ở Heatmap) - đúng yêu cầu "mọi nơi có GEX". */}
      <TradeBriefingPanel symbol={symbol} />
    </>
  );
}
