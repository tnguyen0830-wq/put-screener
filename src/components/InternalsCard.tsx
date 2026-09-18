'use client';

/**
 * Thẻ số liệu của tab Bề rộng TT - dùng CHUNG cho chế độ "Số liệu app" (8
 * thẻ) và chế độ TradingView (những ô app có dữ liệu tốt hơn widget nhúng:
 * VIX tiền mặt, NYSE TICK với đường ±600, UVOL−DVOL). Tách khỏi
 * InternalsPanel.tsx để TradingViewInternals.tsx import mà không tạo vòng
 * import hai chiều.
 */

export type SeriesPoint = { t: number; v: number };
export type Series = {
  key: string;
  label: string;
  points: SeriesPoint[];
  current: number | null;
  source: 'schwab' | 'uw' | 'sampled';
  asOf: number | null;
  /** Vì sao rỗng, khi rỗng - xem Series.note trong internals-pure.ts. */
  note?: string;
  /** Con số đầu thẻ là quote (cùng trường thanh ticker) hay nến cuối. */
  currentSource?: 'quote' | 'candle';
};

/** Đường tham chiếu vẽ lên thẻ - theo đúng các mức trang mẫu tapchiphowall
 *  kẻ sẵn: ±600 cho NYSE TICK, ±300 cho NASDAQ TICK, 0 cho mọi hiệu số.
 *  `band` là ngưỡng tô vùng CỰC ĐOAN (|v| vượt ngưỡng) - vùng đó mới là
 *  thứ trang mẫu tô đỏ. CHỈ vẽ được trên thẻ của app: iframe TradingView là
 *  khung hình khác origin, không vẽ đè lên được, và thang trục bên trong
 *  nó app cũng không biết. */
export const REFS: Record<string, { refs: number[]; band?: number }> = {
  nyseTick: { refs: [600, 0, -600], band: 600 },
  nasdaqTick: { refs: [300, 0, -300], band: 300 },
  uvolDvolDiff: { refs: [0] },
  uvolDvolDiffQ: { refs: [0] },
  advDeclNyse: { refs: [0] },
  marketTide: { refs: [0] },
};

/** Chỉ những chỉ báo là HIỆU SỐ (nhiều mua trừ nhiều bán) mới đáng tô theo
 *  dấu - đúng luật ColorLegend: xanh/đỏ chỉ dùng khi DẤU của số có nghĩa.
 *  VIX và Put/Call là một ĐỘ LỚN, không phải một hiệu số, tô theo dấu ở đó
 *  sẽ đọc thành "số dương là tốt" - sai. */
export const SIGNED = new Set(['uvolDvolDiff', 'uvolDvolDiffQ', 'advDeclNyse', 'nyseTick', 'nasdaqTick', 'marketTide']);

/** Hậu tố đơn vị - chỉ IV rank cần, mọi chỉ báo khác là chênh lệch/tỉ lệ
 *  không đơn vị nên không có mục ở đây thì `UNIT[key]` là `undefined`. */
const UNIT: Record<string, string> = { avgIvRank: '%' };

/** Nhãn nguồn, tra theo `Series.source`. Bảng tra thay vì một biểu thức
 *  ba ngôi: thêm nguồn thứ ba mà quên sửa biểu thức là cách market tide
 *  từng bị dán nhãn "nến thật (Schwab)" trong khi nó là dữ liệu UW. */
export const SOURCE_KEY: Record<Series['source'], string> = {
  schwab: 'int.sourceSchwab',
  uw: 'int.sourceUw',
  sampled: 'int.sourceSampled',
};

export const fmt = (v: number | null, key?: string) =>
  v === null
    ? '—'
    : `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}${key ? (UNIT[key] ?? '') : ''}`;

export function timeFmt(t: number | null): string {
  if (t === null) return '—';
  return new Date(t).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * `tall`: bản cao cho các ô app đứng cạnh iframe TradingView 300px - viewBox
 * kéo giãn theo khung (`preserveAspectRatio="none"`) và nét vẽ giữ độ dày
 * thật (`vector-effect`), nếu không một viewBox 260×56 phóng lên 220px cao
 * sẽ thành một nét dày 6px méo mó.
 *
 * `refs`/`band`: miền trục y mở rộng để CHỨA các đường tham chiếu - không
 * thì một phiên TICK yên ắng (±250) vẽ đường ±600 ra ngoài khung, tức
 * không vẽ gì, và người đọc không biết là "chưa tới ngưỡng" hay "không có
 * ngưỡng".
 */
export function Sparkline({
  points,
  signed,
  tall,
  refs = [],
  band,
}: {
  points: SeriesPoint[];
  signed: boolean;
  tall?: boolean;
  refs?: number[];
  band?: number;
}) {
  const W = 260;
  const H = tall ? 120 : 56;
  const RENDER_H = tall ? 220 : H;
  const PAD = 4;
  const LABEL_W = refs.length ? 26 : 0;
  if (points.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={RENDER_H} />;

  const values = points.map((p) => p.v);
  const min = Math.min(...values, ...refs);
  const max = Math.max(...values, ...refs);
  const span = Math.max(1e-9, max - min);
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2 - LABEL_W);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const path = points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ');
  const last = points[points.length - 1].v;
  const color = signed ? (last >= 0 ? 'var(--credit)' : 'var(--risk)') : 'var(--stamp)';
  const plotRight = W - PAD - LABEL_W;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={RENDER_H}
      preserveAspectRatio={tall ? 'none' : undefined}
    >
      {band !== undefined && max > band && (
        <rect x={PAD} y={PAD} width={plotRight - PAD} height={Math.max(0, y(band) - PAD)} fill="var(--risk)" opacity="0.12" />
      )}
      {band !== undefined && min < -band && (
        <rect x={PAD} y={y(-band)} width={plotRight - PAD} height={Math.max(0, H - PAD - y(-band))} fill="var(--risk)" opacity="0.12" />
      )}
      {refs.map((r) => (
        <g key={r}>
          <line
            x1={PAD}
            x2={plotRight}
            y1={y(r)}
            y2={y(r)}
            stroke={r === 0 ? 'var(--rule-soft)' : 'var(--warn)'}
            strokeWidth="1"
            strokeDasharray={r === 0 ? '2 2' : '4 3'}
            vectorEffect={tall ? 'non-scaling-stroke' : undefined}
          />
          <text
            x={W - PAD}
            y={y(r)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={tall ? 7 : 8}
            fill={r === 0 ? 'var(--muted)' : 'var(--warn)'}
            /* chữ trong svg kéo giãn sẽ méo; giữ tỉ lệ bằng cách không giãn
               chữ theo trục - đủ đọc ở cỡ này, không cần chính xác */
          >
            {r}
          </text>
        </g>
      ))}
      <polyline
        points={path}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect={tall ? 'non-scaling-stroke' : undefined}
      />
    </svg>
  );
}

export function Card({
  s,
  t,
  tall,
  badge,
  className,
}: {
  s: Series;
  t: (k: string, ...a: any[]) => string;
  tall?: boolean;
  /** Nội dung phụ in cạnh nhãn (tỉ lệ up/down của ô UVOL−DVOL). */
  badge?: React.ReactNode;
  className?: string;
}) {
  const signed = SIGNED.has(s.key);
  const noPoints = s.points.length < 2;
  const ref = REFS[s.key];
  const sourceLine =
    s.source === 'schwab' && s.currentSource
      ? t(s.currentSource === 'candle' ? 'int.fromCandle' : 'int.fromQuote')
      : t(SOURCE_KEY[s.source]);
  return (
    <div className={className ?? 'intcard'}>
      <p className="cap intlabel" style={badge ? { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } : undefined}>
        <span>{s.label}</span>
        {badge}
      </p>
      <p
        className="intvalue"
        style={signed && s.current !== null ? { color: s.current >= 0 ? 'var(--credit)' : 'var(--risk)' } : undefined}
      >
        {fmt(s.current, s.key)}
      </p>
      {noPoints ? (
        /* `note` là LÝ DO thật do nguồn nói ra (key chưa đặt, UW trả lỗi...),
           nên nó thắng câu mặc định - một nguồn chết phải nói mình chết chứ
           không được đội lốt "chưa có dữ liệu hôm nay". */
        <p className="cap warnline">
          {s.note ?? (s.source === 'sampled' ? t('int.noSamplesYet') : t('int.noHistory'))}
        </p>
      ) : (
        <Sparkline points={s.points} signed={signed} tall={tall} refs={ref?.refs} band={ref?.band} />
      )}
      <p className="cap intmeta">
        {sourceLine} · {t('int.asOf', timeFmt(s.asOf))}
      </p>
    </div>
  );
}
