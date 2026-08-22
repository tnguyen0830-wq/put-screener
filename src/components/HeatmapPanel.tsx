'use client';

import { useLang } from '@/lib/i18n';
import FearGreed from './FearGreed';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { squarify } from '@/lib/treemap';

type Member = {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;
  price: number;
  change: number | null;
};
type Industry = { name: string; marketCap: number; change: number; members: Member[] };
type Sector = { name: string; marketCap: number; change: number; industries: Industry[] };
type Data = { range: string; source: string; sectors: Sector[]; count: number };

const RANGES = [
  { id: '1d', label: 'hm.range1d', cap: 3 },
  { id: '1w', label: 'hm.range1w', cap: 6 },
  { id: '1m', label: 'hm.range1m', cap: 12 },
  { id: 'ytd', label: 'YTD', cap: 30 },
] as const;

const W = 1000;
const H = 640;
const GAP = 1.5;
const HEADER = 16;      // thanh tiêu đề ngành lớn
const SUBHEADER = 11;   // thanh tiêu đề ngành con

/* Bản đồ giữ nền tối ở cả hai theme, giống Finviz và mọi bản đồ nhiệt tài chính
   khác. Không phải vì lười làm bản sáng, mà vì thang màu xanh–đỏ chỉ tách bạch
   khi đặt trên nền tối; trên nền trắng thì vùng gần 0 và vùng nhạt lẫn vào nhau. */
const MAP_BG = '#14161c';
const SECTOR_BAR = '#262931';
const SECTOR_TEXT = '#c9cfda';

/**
 * Thang màu đọc ngược từ chính ảnh bản đồ Finviz (giải mã pixel, không phải ước
 * lượng bằng mắt). Điểm quan trọng: mốc 0 là xám xanh đậm chứ không phải xám
 * trung tính, và hai đầu bão hoà rất rực — nhờ vậy ô đứng yên chìm xuống còn ô
 * biến động mạnh bật lên.
 *
 * Các mốc theo phần trăm của `cap`, nên dùng chung được cho mọi khung thời gian.
 */
const STOPS: { t: number; c: [number, number, number] }[] = [
  { t: -1.0, c: [246, 53, 56] },
  { t: -0.66, c: [191, 64, 69] },
  { t: -0.33, c: [139, 68, 78] },
  { t: 0, c: [65, 69, 84] },
  { t: 0.33, c: [53, 118, 78] },
  { t: 0.66, c: [47, 158, 79] },
  { t: 1.0, c: [48, 204, 90] },
];

const FLAT = 'rgb(58,61,72)';

function colorFor(change: number | null, cap: number): string {
  if (change === null || Number.isNaN(change)) return FLAT;
  const t = Math.max(-1, Math.min(1, change / cap));
  // Nội suy tuyến tính giữa hai mốc kề nhau.
  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (t >= STOPS[i].t && t <= STOPS[i + 1].t) {
      lo = STOPS[i];
      hi = STOPS[i + 1];
      break;
    }
  }
  const span = hi.t - lo.t;
  const k = span === 0 ? 0 : (t - lo.t) / span;
  const c = lo.c.map((v, i) => Math.round(v + (hi.c[i] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const pctStr = (n: number | null) =>
  n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

/* Rút gọn tên ngành cho vừa thanh tiêu đề hẹp. */
const SHORT: Record<string, string> = {
  'Information Technology': 'TECHNOLOGY',
  'Communication Services': 'COMMUNICATION',
  'Consumer Discretionary': 'CONSUMER CYCLICAL',
  'Consumer Staples': 'CONSUMER DEFENSIVE',
  'Health Care': 'HEALTHCARE',
  'Real Estate': 'REAL ESTATE',
  Financials: 'FINANCIAL',
  Industrials: 'INDUSTRIALS',
  Materials: 'BASIC MATERIALS',
  Utilities: 'UTILITIES',
  Energy: 'ENERGY',
};

export default function HeatmapPanel({
  onSelectSymbol,
}: {
  onSelectSymbol: (symbol: string) => void;
}) {
  const { t } = useLang();
  const [range, setRange] = useState<string>('1d');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<Member | null>(null);

  const load = useCallback(async (r: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/heatmap?range=${encodeURIComponent(r)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? t('hm.loadFailed'));
      setData(j);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const cap = RANGES.find((r) => r.id === range)?.cap ?? 3;

  /* Ba tầng treemap: ngành lớn -> ngành con -> mã. Ngành con quá nhỏ thì bỏ
     thanh tiêu đề của nó, vì một thanh 11px trên ô 14px chỉ tổ che mất mã. */
  const boxes = useMemo(() => {
    if (!data) return [];
    const sectorRects = squarify(
      data.sectors.map((s) => ({ ...s, value: s.marketCap })),
      { x: 0, y: 0, w: W, h: H }
    );
    return sectorRects.map((sr) => {
      const inner = {
        x: sr.x + GAP,
        y: sr.y + HEADER,
        w: Math.max(0, sr.w - GAP * 2),
        h: Math.max(0, sr.h - HEADER - GAP),
      };
      const industryRects = squarify(
        sr.industries.map((i) => ({ ...i, value: i.marketCap })),
        inner
      );
      return {
        sector: sr,
        groups: industryRects.map((ir) => {
          const labelled = ir.h > SUBHEADER + 14 && ir.w > 34;
          const box = {
            x: ir.x,
            y: ir.y + (labelled ? SUBHEADER : 0),
            w: ir.w,
            h: Math.max(0, ir.h - (labelled ? SUBHEADER : 0)),
          };
          return {
            industry: ir,
            labelled,
            cells: squarify(
              ir.members.map((m) => ({ ...m, value: m.marketCap })),
              box
            ),
          };
        }),
      };
    });
  }, [data]);

  return (
    <section className="panel">
      <div className="panel-head">
        {loading
          ? t('hm.loading')
          : error
          ? error
          : data
          ? t('hm.head', { count: data.count, source: data.source })
          : t('hm.title')}
      </div>

      <div className="panel-body">
        <FearGreed />

        <div className="segmented hmranges">
          {RANGES.map((r) => (
            <button
              key={r.id}
              className={range === r.id ? 'on' : undefined}
              onClick={() => setRange(r.id)}
            >
              {t(r.label)}
            </button>
          ))}
        </div>

        <div className="hmlegend">
          <span>−{cap}%</span>
          <i
            style={{
              background: `linear-gradient(90deg, ${STOPS.map(
                (s) => `rgb(${s.c.join(',')})`
              ).join(', ')})`,
            }}
          />
          <span>+{cap}%</span>
          <span className="spacer" />
          <span>{t('hm.areaIsCap')}</span>
        </div>

        {data && (
          <div className="hmwrap">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              role="img"
              aria-label={t('hm.aria')}
            >
              <rect width={W} height={H} fill={MAP_BG} />

              {boxes.map(({ sector, groups }) => (
                <g key={sector.name}>
                  {/* Thanh tiêu đề ngành: nền tối, chữ hoa nhạt — giống Finviz,
                      để tên ngành không tranh màu với các ô bên dưới. */}
                  <rect
                    x={sector.x + GAP}
                    y={sector.y + GAP}
                    width={Math.max(0, sector.w - GAP * 2)}
                    height={HEADER - GAP}
                    fill={SECTOR_BAR}
                  />
                  <text
                    x={sector.x + GAP + 5}
                    y={sector.y + GAP + 10.5}
                    fontSize="9"
                    fontWeight="700"
                    letterSpacing="0.06em"
                    fill={SECTOR_TEXT}
                    fontFamily="var(--body)"
                  >
                    {(SHORT[sector.name] ?? sector.name.toUpperCase()).slice(
                      0,
                      Math.max(3, Math.floor(sector.w / 6))
                    )}
                  </text>

                  {groups.map(({ industry, labelled, cells }) => (
                    <g key={industry.name}>
                      {/* Thanh ngành con tô theo chính biến động của nhóm, nên
                          liếc qua là thấy cả nhóm đỏ hay chỉ một mã lẻ đỏ. */}
                      {labelled && (
                        <>
                          <rect
                            x={industry.x}
                            y={industry.y}
                            width={Math.max(0, industry.w - GAP)}
                            height={SUBHEADER - GAP}
                            fill={colorFor(industry.change, cap)}
                          />
                          <text
                            x={industry.x + 3}
                            y={industry.y + 7.6}
                            fontSize="6.6"
                            fontWeight="700"
                            letterSpacing="0.04em"
                            fill="#fff"
                            fillOpacity="0.9"
                            fontFamily="var(--body)"
                            pointerEvents="none"
                          >
                            {industry.name
                              .toUpperCase()
                              .slice(0, Math.max(3, Math.floor(industry.w / 4.1)))}
                          </text>
                        </>
                      )}

                      {cells.map((c) => {
                        // Cỡ chữ theo kích thước ô; ô quá nhỏ thì bỏ chữ hẳn cho
                        // sạch, vì nhồi chữ vào ô 10px chỉ tạo nhiễu.
                        const fs = Math.min(c.w / 4.4, c.h / 2.9, 21);
                        const showSym = c.w > 26 && c.h > 15 && fs >= 6;
                        const showPct = c.w > 42 && c.h > 30;
                        return (
                          <g
                            key={c.symbol}
                            onMouseEnter={() => setHover(c as Member)}
                            onMouseLeave={() => setHover(null)}
                            onClick={() => onSelectSymbol(c.symbol)}
                            style={{ cursor: 'pointer' }}
                          >
                            <rect
                              x={c.x}
                              y={c.y}
                              width={Math.max(0, c.w - GAP)}
                              height={Math.max(0, c.h - GAP)}
                              fill={colorFor(c.change, cap)}
                            />
                            {showSym && (
                              <text
                                x={c.x + (c.w - GAP) / 2}
                                y={c.y + (c.h - GAP) / 2 + (showPct ? -1 : fs * 0.35)}
                                fontSize={fs}
                                textAnchor="middle"
                                fill="#fff"
                                fontFamily="var(--body)"
                                fontWeight="600"
                                pointerEvents="none"
                              >
                                {c.symbol}
                              </text>
                            )}
                            {showPct && (
                              <text
                                x={c.x + (c.w - GAP) / 2}
                                y={c.y + (c.h - GAP) / 2 + fs * 0.92}
                                fontSize={Math.max(6.5, fs * 0.55)}
                                textAnchor="middle"
                                fill="#fff"
                                fillOpacity="0.92"
                                fontFamily="var(--body)"
                                pointerEvents="none"
                              >
                                {pctStr(c.change)}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  ))}
                </g>
              ))}
            </svg>
          </div>
        )}

        <div className="hmhover">
          {hover ? (
            <>
              {t('hm.hover', {
                symbol: hover.symbol,
                name: hover.name,
                sector: hover.sector,
                price: hover.price.toFixed(2),
                change: pctStr(hover.change),
                cap: (hover.marketCap / 1e9).toFixed(1),
              })}
            </>
          ) : (
            t('hm.hoverIdle')
          )}
        </div>

        <p className="cap">
          {t('hm.note')}
        </p>
      </div>
    </section>
  );
}
