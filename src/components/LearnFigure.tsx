'use client';

import type { FigureId } from '@/lib/learn';

/**
 * Hình minh hoạ của tab Learn — SVG vẽ bằng code, không phải ảnh tải về.
 *
 * Vì sao vẽ: ảnh từ host ngoài không đo được từ sandbox, không đổi theo
 * theme, và một ảnh vỡ đọc là "app hỏng" (#133). SVG đây dùng đúng biến màu
 * của app (`--credit`/`--risk` cho nến, `--gexcall`/`--gexput` cho GEX là
 * PHÂN LOẠI, `--warn` cho đường tham chiếu) nên đúng ở cả hai theme mà không
 * đụng bẫy ba khối theme trong globals.css.
 *
 * Mỗi `FigureId` có đúng một nhánh; test ghim rằng không id nào rơi vào
 * nhánh mặc định (nhánh mặc định vẽ một khung có chữ "?" để một id mới quên
 * vẽ lộ ra trên màn hình chứ không im lặng).
 */

type Lang = 'vi' | 'en';
type OHLC = [number, number, number, number];

const W = 320;
const H = 180;

const UP = { fill: 'var(--credit)', stroke: 'var(--credit)' } as const;
const DN = { fill: 'var(--risk)', stroke: 'var(--risk)' } as const;
const INK = { stroke: 'var(--ink)', fill: 'none' } as const;
const MUT = { stroke: 'var(--muted)', fill: 'none' } as const;
const WARN = { stroke: 'var(--warn)', fill: 'none' } as const;
const TXT = { fill: 'var(--muted)', fontFamily: 'var(--data)', fontSize: 9 } as const;
const TXT_INK = { ...TXT, fill: 'var(--ink)' } as const;

function scale(lo: number, hi: number, top = 14, bottom = H - 16) {
  return (p: number) => bottom - ((p - lo) / (hi - lo)) * (bottom - top);
}

/** Vẽ một chuỗi nến, cách đều, từ mảng [o,h,l,c]. */
function Candles({ data, x0 = 20, step = 14, w = 8, lo, hi, top, bottom }: {
  data: OHLC[]; x0?: number; step?: number; w?: number; lo: number; hi: number; top?: number; bottom?: number;
}) {
  const y = scale(lo, hi, top, bottom);
  return (
    <g>
      {data.map(([o, h, l, c], i) => {
        const x = x0 + i * step;
        const up = c >= o;
        const st = up ? UP : DN;
        const bt = y(Math.max(o, c));
        const bb = y(Math.min(o, c));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(h)} y2={y(l)} style={st} strokeWidth={1} />
            <rect x={x - w / 2} y={bt} width={w} height={Math.max(1, bb - bt)} style={st} />
          </g>
        );
      })}
    </g>
  );
}

function T({ x, y, children, ink, anchor }: { x: number; y: number; children: React.ReactNode; ink?: boolean; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <text x={x} y={y} style={ink ? TXT_INK : TXT} textAnchor={anchor ?? 'start'}>
      {children}
    </text>
  );
}

function Dashed({ y, label, color = 'var(--warn)', x1 = 12, x2 = W - 12, lang: _lang }: { y: number; label?: string; color?: string; x1?: number; x2?: number; lang?: Lang }) {
  return (
    <g>
      <line x1={x1} x2={x2} y1={y} y2={y} stroke={color} strokeDasharray="4 3" strokeWidth={1} />
      {label && <text x={x2} y={y - 3} textAnchor="end" style={{ ...TXT, fill: color }}>{label}</text>}
    </g>
  );
}

const L = (lang: Lang, vi: string, en: string) => (lang === 'en' ? en : vi);

export default function LearnFigure({ id, lang }: { id: FigureId; lang: Lang }) {
  const body = draw(id, lang);
  return (
    <svg className="learnfig" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={id} data-figure={id}>
      {body}
    </svg>
  );
}

function draw(id: FigureId, lang: Lang): React.ReactNode {
  const l = (vi: string, en: string) => L(lang, vi, en);
  switch (id) {
    case 'candle-anatomy': {
      const y = scale(90, 110, 20, H - 20);
      const x = 120;
      return (
        <g>
          <line x1={x} x2={x} y1={y(108)} y2={y(92)} style={UP} strokeWidth={1.5} />
          <rect x={x - 12} y={y(104)} width={24} height={y(96) - y(104)} style={UP} />
          <T x={x + 22} y={y(108) + 3}>{l('cao nhất (high)', 'high')}</T>
          <T x={x + 22} y={y(104) + 3}>{l('đóng (close)', 'close')}</T>
          <T x={x + 22} y={y(96) + 3}>{l('mở (open)', 'open')}</T>
          <T x={x + 22} y={y(92) + 3}>{l('thấp nhất (low)', 'low')}</T>
          <T x={x - 18} y={y(100) + 3} anchor="end">{l('thân', 'body')}</T>
          <T x={x - 18} y={y(106) + 3} anchor="end">{l('râu', 'wick')}</T>
          <line x1={x} x2={x} y1={y(108)} y2={y(100)} stroke="none" />
          <g transform={`translate(230 0)`}>
            <line x1={0} x2={0} y1={y(107)} y2={y(93)} style={DN} strokeWidth={1.5} />
            <rect x={-12} y={y(103)} width={24} height={y(97) - y(103)} style={DN} />
            <T x={0} y={H - 6} anchor="middle">{l('nến đỏ: đóng < mở', 'red: close < open')}</T>
          </g>
          <T x={x} y={H - 6} anchor="middle">{l('nến xanh: đóng > mở', 'green: close > open')}</T>
        </g>
      );
    }
    case 'doji': {
      const data: OHLC[] = [[90, 93, 89, 92], [92, 95, 91, 94], [94, 97, 93, 96], [96, 100, 95, 99], [99, 103, 98, 102], [102, 106, 101, 105], [105, 109, 104, 108], [108, 111, 105, 108.2], [108, 109, 103, 104], [104, 105, 100, 101]];
      const y = scale(88, 112);
      return (
        <g>
          <Candles data={data} x0={30} step={26} w={12} lo={88} hi={112} />
          <T x={30 + 7 * 26} y={y(111) - 6} anchor="middle" ink>doji</T>
          <T x={30 + 8 * 26 + 6} y={y(100) + 14} anchor="middle">{l('câu trả lời', 'the answer')}</T>
          <T x={16} y={H - 4}>{l('xu hướng tăng → do dự → nến đỏ đóng dưới đáy doji', 'uptrend → indecision → red close below the doji\'s low')}</T>
        </g>
      );
    }
    case 'hammer': {
      const dn: OHLC[] = [[110, 111, 105, 106], [106, 107, 101, 102], [102, 103, 97, 98], [98, 99, 94, 95], [95, 96, 86, 94.5], [94.5, 100, 94, 99]];
      const up: OHLC[] = [[92, 96, 91, 95], [95, 99, 94, 98], [98, 102, 97, 101], [101, 105, 100, 104], [104, 113, 103.5, 104.8], [104.8, 105, 99, 100]];
      return (
        <g>
          <Candles data={dn} x0={22} step={22} w={10} lo={84} hi={114} />
          <T x={22 + 4 * 22} y={H - 20} anchor="middle" ink>{l('búa', 'hammer')}</T>
          <line x1={165} x2={165} y1={10} y2={H - 10} style={MUT} strokeDasharray="2 3" />
          <Candles data={up} x0={185} step={22} w={10} lo={84} hi={114} />
          <T x={185 + 4 * 22} y={14} anchor="middle" ink>{l('sao băng', 'shooting star')}</T>
          <T x={16} y={H - 4}>{l('râu dài về phía một mức = mức đó được bảo vệ', 'a long wick toward a level = that level was defended')}</T>
        </g>
      );
    }
    case 'engulfing': {
      const eng: OHLC[] = [[104, 105, 99, 100], [100, 101, 96, 97], [97, 98, 94, 95], [95, 96, 92, 93], [92.5, 99, 91, 98.5], [98.5, 103, 98, 102]];
      const star: OHLC[] = [[104, 105, 98, 99], [99, 100, 94, 95], [93.5, 94.5, 92.5, 93.8], [95, 101, 94.5, 100.5], [100.5, 104, 100, 103]];
      return (
        <g>
          <Candles data={eng} x0={22} step={22} w={10} lo={88} hi={108} />
          <T x={22 + 4 * 22} y={14} anchor="middle" ink>{l('nhấn chìm tăng', 'bullish engulfing')}</T>
          <line x1={160} x2={160} y1={10} y2={H - 10} style={MUT} strokeDasharray="2 3" />
          <Candles data={star} x0={185} step={24} w={10} lo={88} hi={108} />
          <T x={185 + 2 * 24} y={14} anchor="middle" ink>{l('sao mai', 'morning star')}</T>
          <T x={16} y={H - 4}>{l('thân bao thân · ba nến: giảm → do dự → tăng', 'body wraps body · three candles: down → pause → up')}</T>
        </g>
      );
    }
    case 'star': {
      const data: OHLC[] = [[95, 100, 94, 99], [99, 104, 98, 103], [104.5, 105.5, 103.5, 104.8], [103, 103.5, 97, 98], [98, 99, 93, 94]];
      return (
        <g>
          <Candles data={data} x0={80} step={36} w={14} lo={90} hi={108} />
          <T x={80 + 2 * 36} y={14} anchor="middle" ink>{l('sao hôm', 'evening star')}</T>
          <T x={16} y={H - 4}>{l('tăng → do dự (có khoảng trống) → giảm sâu vào thân nến đầu', 'up → pause (gapped) → deep into the first body')}</T>
        </g>
      );
    }
    case 'support': {
      const px = [100, 97, 94, 91, 90, 92, 95, 98, 101, 99, 96, 93, 90.5, 91, 94, 97, 100, 103, 101, 98, 96, 94.5, 93];
      const data: OHLC[] = px.map((c, i) => { const o = i ? px[i - 1] : c; return [o, Math.max(o, c) + 1.2, Math.min(o, c) - 1.2, c]; });
      const y = scale(86, 108);
      const sma = px.map((_, i) => 96 + i * 0.08);
      return (
        <g>
          <rect x={12} y={y(92.5)} width={W - 24} height={y(89) - y(92.5)} fill="var(--warn-tint)" />
          <Candles data={data} x0={16} step={12.5} w={7} lo={86} hi={108} />
          <polyline points={sma.map((v, i) => `${16 + i * 12.5},${y(v)}`).join(' ')} style={{ stroke: 'var(--stamp)', fill: 'none' }} strokeWidth={1.5} />
          <T x={W - 14} y={y(92.5) - 3} anchor="end">{l('vùng hỗ trợ · 2 lần chạm', 'support zone · 2 touches')}</T>
          <T x={W - 14} y={y(sma[sma.length - 1]) - 4} anchor="end" ink>SMA200 ↗</T>
          <rect x={16 + 18 * 12.5 - 4} y={12} width={5 * 12.5} height={H - 28} fill="var(--hover)" opacity={0.6} />
          <T x={16 + 20.5 * 12.5} y={22} anchor="middle">{l('5 nến cuối: chưa xác nhận', 'last 5: unconfirmed')}</T>
        </g>
      );
    }
    case 'head-shoulders': {
      const pts = [[20, 140], [50, 100], [80, 120], [120, 60], [160, 120], [200, 95], [240, 125], [280, 165]];
      return (
        <g>
          <polyline points={pts.map((p) => p.join(',')).join(' ')} style={INK} strokeWidth={1.5} />
          <Dashed y={122} label={l('đường cổ', 'neckline')} x1={70} x2={300} />
          <T x={50} y={94} anchor="middle" ink>{l('vai', 'shoulder')}</T>
          <T x={120} y={54} anchor="middle" ink>{l('đầu', 'head')}</T>
          <T x={200} y={89} anchor="middle" ink>{l('vai', 'shoulder')}</T>
          <T x={286} y={158} anchor="end">{l('đóng dưới cổ = hoàn thành', 'close below = complete')}</T>
        </g>
      );
    }
    case 'double': {
      const w = [[20, 60], [50, 130], [80, 90], [110, 132], [140, 50]];
      const m = [[180, 150], [210, 60], [240, 105], [270, 62], [300, 150]];
      return (
        <g>
          <polyline points={w.map((p) => p.join(',')).join(' ')} style={INK} strokeWidth={1.5} />
          <Dashed y={131} x1={40} x2={125} />
          <T x={80} y={165} anchor="middle" ink>{l('hai đáy (W)', 'double bottom (W)')}</T>
          <polyline points={m.map((p) => p.join(',')).join(' ')} style={INK} strokeWidth={1.5} />
          <Dashed y={61} x1={195} x2={290} />
          <T x={240} y={165} anchor="middle" ink>{l('hai đỉnh (M)', 'double top (M)')}</T>
          <T x={16} y={14}>{l('cùng một vùng, không qua được lần hai', 'same zone, fails the second time')}</T>
        </g>
      );
    }
    case 'triangle': {
      const px = [100, 108, 101, 107, 102, 106.5, 103, 106, 104, 105.8, 104.5, 108.5, 111, 113];
      const data: OHLC[] = px.map((c, i) => { const o = i ? px[i - 1] : c; return [o, Math.max(o, c) + 0.8, Math.min(o, c) - 0.8, c]; });
      const y = scale(96, 116);
      return (
        <g>
          <Candles data={data} x0={24} step={18} w={9} lo={96} hi={116} />
          <line x1={24} x2={24 + 10 * 18} y1={y(108.5)} y2={y(108.5)} style={WARN} strokeDasharray="4 3" />
          <line x1={24} x2={24 + 10 * 18} y1={y(100)} y2={y(105.5)} style={WARN} strokeDasharray="4 3" />
          <T x={24 + 5 * 18} y={y(115)} anchor="middle" ink>{l('tam giác tăng', 'ascending triangle')}</T>
          <T x={16} y={H - 4}>{l('đỉnh ngang, đáy cao dần, khối lượng cạn → bung lên', 'flat tops, rising lows, volume dries → breaks up')}</T>
        </g>
      );
    }
    case 'flag': {
      const y = scale(90, 120);
      const pole = [[30, y(92)], [90, y(114)]];
      const flag = [[90, y(114)], [110, y(110)], [130, y(112)], [150, y(108)], [170, y(110)], [190, y(106.5)]];
      const out = [[190, y(106.5)], [230, y(118)]];
      return (
        <g>
          <polyline points={pole.map((p) => p.join(',')).join(' ')} style={INK} strokeWidth={2} />
          <polyline points={flag.map((p) => p.join(',')).join(' ')} style={INK} strokeWidth={1.5} />
          <polyline points={out.map((p) => p.join(',')).join(' ')} style={{ stroke: 'var(--credit)', fill: 'none' }} strokeWidth={2} />
          <line x1={88} x2={192} y1={y(115)} y2={y(108)} style={WARN} strokeDasharray="4 3" />
          <line x1={88} x2={192} y1={y(111.5)} y2={y(104.5)} style={WARN} strokeDasharray="4 3" />
          <T x={40} y={y(104)} ink>{l('cột cờ', 'pole')}</T>
          <T x={140} y={y(117)} anchor="middle" ink>{l('cờ', 'flag')}</T>
          <T x={236} y={y(118) + 3}>{l('bung tiếp', 'breakout')}</T>
        </g>
      );
    }
    case 'gex-profile': {
      const strikes = [180, 185, 190, 195, 200, 205, 210, 215, 220];
      const call = [1, 2, 4, 7, 12, 18, 9, 4, 2];
      const put = [-9, -14, -8, -6, -5, -3, -2, -1, -0.5];
      const mid = 92;
      const k = 3.4;
      const x0 = 30;
      const step = 32;
      return (
        <g>
          <line x1={16} x2={W - 12} y1={mid} y2={mid} style={MUT} />
          {strikes.map((s, i) => {
            const x = x0 + i * step;
            return (
              <g key={s}>
                <rect x={x - 8} y={mid - call[i] * k} width={8} height={call[i] * k} fill="var(--gexcall)" />
                <rect x={x} y={mid} width={8} height={-put[i] * k} fill="var(--gexput)" />
                <T x={x} y={H - 6} anchor="middle">{s}</T>
              </g>
            );
          })}
          <line x1={x0 + 1 * step} x2={x0 + 1 * step} y1={18} y2={H - 16} stroke="var(--gexput)" strokeDasharray="4 3" />
          <T x={x0 + 1 * step + 3} y={26} anchor="start">{l('put wall', 'put wall')}</T>
          <line x1={x0 + 5 * step} x2={x0 + 5 * step} y1={18} y2={H - 16} stroke="var(--gexcall)" strokeDasharray="4 3" />
          <T x={x0 + 5 * step + 3} y={26}>{l('call wall / abs', 'call wall / abs')}</T>
          <line x1={x0 + 3.6 * step} x2={x0 + 3.6 * step} y1={18} y2={H - 16} stroke="var(--ink)" strokeWidth={1.5} />
          <T x={x0 + 3.6 * step + 3} y={H - 22} ink>{l('giá', 'spot')}</T>
        </g>
      );
    }
    case 'gamma-regime': {
      const y = scale(-10, 10, 20, H - 26);
      const pts = [-9, -8.5, -7.5, -6, -4, -2, 0.5, 3, 5.5, 7.5, 8.5, 9];
      const x = (i: number) => 24 + i * 25;
      const zi = 6;
      return (
        <g>
          <rect x={16} y={y(0)} width={W - 28} height={y(-10) - y(0)} fill="var(--risk-tint)" />
          <rect x={16} y={y(10)} width={W - 28} height={y(0) - y(10)} fill="var(--credit-tint)" />
          <line x1={16} x2={W - 12} y1={y(0)} y2={y(0)} style={MUT} />
          <polyline points={pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')} style={INK} strokeWidth={1.5} />
          <line x1={x(zi) - 4} x2={x(zi) - 4} y1={20} y2={H - 26} style={WARN} strokeDasharray="4 3" />
          <T x={x(zi)} y={16} anchor="middle" ink>{l('zero gamma', 'zero gamma')}</T>
          <T x={24} y={y(-8.5) + 12}>{l('gamma âm: dao động bị khuếch đại', 'negative: moves amplified')}</T>
          <T x={W - 14} y={y(8.5) - 4} anchor="end">{l('gamma dương: giá bị ghìm', 'positive: price pinned')}</T>
          <T x={16} y={H - 6}>{l('tổng chạy gamma ròng theo giá →', 'running total of net gamma by price →')}</T>
        </g>
      );
    }
    case 'tick': {
      const vals = [120, -80, 300, 650, 420, -200, -700, -450, 150, 800, 300, -100, -650, -300, 100, 500, 250, -50, -250, 50];
      const y = scale(-1000, 1000, 16, H - 24);
      const x = (i: number) => 20 + i * 15;
      return (
        <g>
          <rect x={16} y={y(1000)} width={W - 28} height={y(600) - y(1000)} fill="var(--warn-tint)" />
          <rect x={16} y={y(-600)} width={W - 28} height={y(-1000) - y(-600)} fill="var(--warn-tint)" />
          <Dashed y={y(600)} label="+600" />
          <Dashed y={y(-600)} label="−600" />
          <line x1={16} x2={W - 12} y1={y(0)} y2={y(0)} style={MUT} />
          <polyline points={vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')} style={INK} strokeWidth={1.5} />
          <T x={16} y={H - 6}>{l('TICK NYSE, từng phút · ngoài ±600 = cả sàn cùng một phía', 'NYSE TICK by minute · beyond ±600 = the whole exchange on one side')}</T>
        </g>
      );
    }
    case 'rrg': {
      const cx = 160;
      const cy = 88;
      return (
        <g>
          <rect x={cx - 120} y={cy - 70} width={120} height={70} fill="var(--stamp-tint)" />
          <rect x={cx} y={cy - 70} width={120} height={70} fill="var(--credit-tint)" />
          <rect x={cx} y={cy} width={120} height={70} fill="var(--warn-tint)" />
          <rect x={cx - 120} y={cy} width={120} height={70} fill="var(--risk-tint)" />
          <line x1={cx - 120} x2={cx + 120} y1={cy} y2={cy} style={MUT} />
          <line x1={cx} x2={cx} y1={cy - 70} y2={cy + 70} style={MUT} />
          <T x={cx - 60} y={cy - 56} anchor="middle" ink>{l('Đang hồi', 'Improving')}</T>
          <T x={cx + 60} y={cy - 56} anchor="middle" ink>{l('Dẫn đầu', 'Leading')}</T>
          <T x={cx + 60} y={cy + 62} anchor="middle" ink>{l('Suy yếu', 'Weakening')}</T>
          <T x={cx - 60} y={cy + 62} anchor="middle" ink>{l('Tụt hậu', 'Lagging')}</T>
          <path d={`M ${cx - 70} ${cy + 30} C ${cx - 90} ${cy - 40}, ${cx + 20} ${cy - 60}, ${cx + 60} ${cy - 25} S ${cx + 40} ${cy + 55}, ${cx - 30} ${cy + 40}`} style={INK} strokeWidth={1.5} strokeDasharray="5 3" />
          <polygon points={`${cx - 30},${cy + 40} ${cx - 22},${cy + 32} ${cx - 20},${cy + 44}`} fill="var(--ink)" />
          <T x={cx + 120} y={cy + 12} anchor="end">{l('sức mạnh tương đối →', 'relative strength →')}</T>
          <T x={cx + 4} y={cy - 62}>{l('↑ đà', '↑ momentum')}</T>
          <T x={16} y={H - 6}>{l('toạ độ của NGÀNH so với 10 ngành kia, quay theo chiều kim đồng hồ', 'the SECTOR\'s position against the other 10, rotating clockwise')}</T>
        </g>
      );
    }
    case 'flow-bar': {
      const rows = [['NVDA', 5.2, 0.7], ['TSLA', 3.1, 0.35], ['AAPL', 1.4, 0.55], ['AMD', 0.6, 0.2]] as const;
      const max = 5.2;
      const bw = 200;
      return (
        <g>
          {rows.map(([sym, total, callShare], i) => {
            const y = 30 + i * 32;
            const w = (total / max) * bw;
            return (
              <g key={sym}>
                <T x={60} y={y + 11} anchor="end" ink>{sym}</T>
                <rect x={70} y={y} width={w * callShare} height={16} fill="var(--gexcall)" />
                <rect x={70 + w * callShare} y={y} width={w * (1 - callShare)} height={16} fill="var(--gexput)" />
                <T x={70 + w + 6} y={y + 11}>${total}M</T>
              </g>
            );
          })}
          <T x={16} y={H - 18}>{l('bề rộng = tổng premium trên một thang chung', 'width = total premium on one shared scale')}</T>
          <T x={16} y={H - 6}>{l('đỏ = call, xanh = put — phân loại, không phải tốt/xấu', 'red = call, blue = put — classification, not good/bad')}</T>
        </g>
      );
    }
    case 'darkpool': {
      const y = scale(90, 110, 20, H - 26);
      const prints = [[30, 101, 3], [70, 100.5, 5], [95, 100.8, 4], [140, 104, 2], [175, 100.2, 6], [215, 100.6, 4], [260, 106, 2]];
      const px = [102, 103, 101, 100.5, 101, 104, 103, 100.3, 101, 100.8, 102, 106, 105];
      return (
        <g>
          <rect x={16} y={y(101.3)} width={W - 28} height={y(99.9) - y(101.3)} fill="var(--stamp-tint)" />
          <polyline points={px.map((v, i) => `${20 + i * 24},${y(v)}`).join(' ')} style={MUT} strokeWidth={1} />
          {prints.map(([x, p, r], i) => (
            <circle key={i} cx={x} cy={y(p)} r={r * 1.6} fill="var(--stamp)" opacity={0.75} />
          ))}
          <T x={W - 14} y={y(101.3) - 4} anchor="end">{l('nhiều print cùng vùng giá, vài ngày', 'several prints, one price area, days apart')}</T>
          <T x={16} y={H - 6}>{l('kích thước = số tiền · chỉ giữ print ≥ $1M', 'size = dollars · only prints ≥ $1M kept')}</T>
        </g>
      );
    }
    case 'insider': {
      const rows = [['CEO', 'P', true], ['CFO', 'M', false], ['Director', 'P', true], ['VP', 'A', false], ['Director', 'P', false]] as const;
      return (
        <g>
          {rows.map(([who, code, keep], i) => {
            const y = 26 + i * 26;
            const kept = code === 'P' && keep;
            return (
              <g key={i} opacity={kept ? 1 : 0.45}>
                <T x={30} y={y + 4} ink>{who}</T>
                <rect x={110} y={y - 9} width={18} height={18} rx={3} fill={code === 'P' ? 'var(--credit)' : 'var(--muted)'} />
                <text x={119} y={y + 4} textAnchor="middle" style={{ ...TXT, fill: 'var(--card)', fontWeight: 700 }}>{code}</text>
                <T x={140} y={y + 4}>{code === 'P' ? (keep ? l('mua tiền túi', 'own money') : l('mua theo kế hoạch 10b5-1 → loại', '10b5-1 plan → dropped')) : code === 'M' ? l('thực hiện quyền chọn → loại', 'option exercise → dropped') : l('được cấp → loại', 'grant → dropped')}</T>
              </g>
            );
          })}
          <T x={16} y={H - 6}>{l('2 NGƯỜI mua (CEO, một Director) — không phải 3 lượt', '2 BUYERS (CEO, one Director) — not 3 purchases')}</T>
        </g>
      );
    }
    case 'congress-lag': {
      /* Độ trễ công bố: trần luật 30–45 ngày so với trung vị ĐO ĐƯỢC ~116 ngày
         (#133). Thang ngày, hai vạch: người đọc thấy ngay "trần" và "thực tế"
         cách nhau gần ba lần. */
      const x = (d: number) => 40 + (d / 150) * (W - 60);
      const rows = [
        [l('giao dịch', 'trade'), 0],
        [l('trần luật 30–45 ngày', 'legal ceiling 30–45 d'), 45],
        [l('trung vị đo được ~116 ngày', 'measured median ~116 d'), 116],
      ] as const;
      return (
        <g>
          <line x1={x(0)} x2={x(150)} y1={H - 30} y2={H - 30} style={MUT} />
          {[0, 30, 60, 90, 120, 150].map((d) => (
            <g key={d}>
              <line x1={x(d)} x2={x(d)} y1={H - 30} y2={H - 26} style={MUT} />
              <T x={x(d)} y={H - 14} anchor="middle">{d}</T>
            </g>
          ))}
          <T x={W - 12} y={H - 4} anchor="end">{l('ngày sau giao dịch', 'days after the trade')}</T>
          <rect x={x(30)} y={40} width={x(45) - x(30)} height={18} fill="var(--warn)" opacity={0.35} />
          <line x1={x(45)} x2={x(45)} y1={36} y2={H - 30} style={WARN} strokeDasharray="4 3" />
          <T x={x(45) - 4} y={34} anchor="end">{rows[1][0]}</T>
          <rect x={x(0)} y={80} width={x(116) - x(0)} height={18} fill="var(--risk)" opacity={0.6} />
          <line x1={x(116)} x2={x(116)} y1={76} y2={H - 30} stroke="var(--risk)" strokeDasharray="4 3" />
          <T x={x(116) - 4} y={74} anchor="end" ink>{rows[2][0]}</T>
          <circle cx={x(0)} cy={89} r={4} fill="var(--ink)" />
          <T x={x(0) + 8} y={112}>{rows[0][0]}</T>
          <T x={x(0)} y={124}>{l('0/250 bản ghi mẫu là giao dịch trong 7 ngày gần nhất', '0 of 250 sampled records were trades from the last 7 days')}</T>
        </g>
      );
    }
    case 'footprint': {
      const levels = [[102, 40, 220], [101.5, 120, 980], [101, 340, 1250], [100.5, 610, 300], [100, 920, 80], [99.5, 400, 0]] as const;
      return (
        <g>
          <rect x={92} y={18} width={136} height={H - 44} style={INK} strokeWidth={1} />
          {levels.map(([p, bid, ask], i) => {
            const y = 30 + i * 22;
            const imb = ask >= bid * 3 || (bid >= ask * 3 && ask > 0);
            return (
              <g key={p}>
                <T x={86} y={y + 4} anchor="end" ink>{p}</T>
                <text x={130} y={y + 4} textAnchor="end" style={{ ...TXT, fill: bid > ask ? 'var(--risk)' : 'var(--muted)', fontWeight: imb && bid > ask ? 700 : 400 }}>{bid}</text>
                <T x={160} y={y + 4} anchor="middle">×</T>
                <text x={190} y={y + 4} textAnchor="start" style={{ ...TXT, fill: ask > bid ? 'var(--credit)' : 'var(--muted)', fontWeight: imb && ask > bid ? 700 : 400 }}>{ask}</text>
              </g>
            );
          })}
          <T x={130} y={H - 18} anchor="end">{l('khớp ở bid', 'at bid')}</T>
          <T x={190} y={H - 18}>{l('khớp ở ask', 'at ask')}</T>
          <T x={240} y={52} ink>{l('← imbalance', '← imbalance')}</T>
          <T x={240} y={140}>{l('← 0 = auction chưa xong', '← 0 = unfinished auction')}</T>
          <T x={16} y={H - 6}>{l('app CHƯA có — cần dữ liệu từng giao dịch', 'NOT in the app yet — needs per-trade data')}</T>
        </g>
      );
    }
    case 'short-put-payoff': {
      const xs = scale(70, 120, 24, W - 24);
      const ys = scale(-25, 5, 20, H - 26);
      const strike = 95;
      const prem = 2;
      const pts: [number, number][] = [[70, 70 - strike + prem], [strike, prem], [120, prem]];
      return (
        <g>
          <line x1={20} x2={W - 12} y1={ys(0)} y2={ys(0)} style={MUT} />
          <rect x={xs(strike - prem)} y={ys(5)} width={W - 24 - xs(strike - prem)} height={ys(0) - ys(5)} fill="var(--credit-tint)" />
          <polyline points={pts.map(([px, pl]) => `${xs(px)},${ys(pl)}`).join(' ')} style={INK} strokeWidth={2} />
          <line x1={xs(strike)} x2={xs(strike)} y1={ys(5)} y2={ys(-25)} style={WARN} strokeDasharray="4 3" />
          <T x={xs(strike)} y={ys(5) - 4} anchor="middle" ink>{l('strike 95', 'strike 95')}</T>
          <T x={xs(110)} y={ys(prem) - 6} anchor="middle">{l('lãi tối đa = premium', 'max profit = premium')}</T>
          <T x={xs(93) - 4} y={ys(0) + 12} anchor="end">{l('hoà vốn 93', 'breakeven 93')}</T>
          <T x={xs(76)} y={ys(-14)}>{l('lỗ như cầm cổ phiếu', 'loses like owning stock')}</T>
          <T x={16} y={H - 6}>{l('P/L lúc đáo hạn theo giá cổ phiếu →', 'P/L at expiry versus stock price →')}</T>
        </g>
      );
    }
    case 'score': {
      const parts = [[45, 'ROC', 'var(--stamp)'], [25, 'Cushion', 'var(--credit)'], [15, 'IV/HV', 'var(--warn)'], [15, l('Thanh khoản', 'Liquidity'), 'var(--muted)']] as const;
      let x = 20;
      return (
        <g>
          {parts.map(([w, name, color], i) => {
            const px = x;
            const pw = (w / 100) * (W - 40);
            x += pw;
            return (
              <g key={i}>
                <rect x={px} y={60} width={pw - 2} height={40} fill={color} />
                <text x={px + pw / 2} y={84} textAnchor="middle" style={{ ...TXT, fill: 'var(--card)', fontWeight: 700, fontSize: 11 }}>{w}</text>
                <T x={px + pw / 2} y={116} anchor="middle" ink>{name}</T>
              </g>
            );
          })}
          <T x={16} y={H - 22}>{l('điểm = tổng bốn phần · ngăn chi tiết in từng phần', 'score = sum of four parts · the drawer prints each')}</T>
          <T x={16} y={H - 8}>{l('gate hỏng → loại, dù điểm cao', 'a failed gate → dropped, whatever the score')}</T>
        </g>
      );
    }
    case 'gates': {
      const rows = [
        ['VRP ≥ 1.0', '✓', 'var(--credit)'],
        [l('Không earnings trong kỳ', 'No earnings in window'), '?', 'var(--warn)'],
        ['OI ≥ 500 · Vol ≥ 100', '✓', 'var(--credit)'],
        [l('Spread ≤ 5%', 'Spread ≤ 5%'), '✗', 'var(--risk)'],
        [l('Không rớt >20% / 20 phiên', 'Not down >20% / 20 sessions'), '✓', 'var(--credit)'],
        ['Term structure ≥ 0.95', '✓', 'var(--credit)'],
        ['Put skew z ≤ 2', '?', 'var(--warn)'],
      ] as const;
      return (
        <g>
          {rows.map(([name, mark, color], i) => {
            const y = 22 + i * 20;
            return (
              <g key={i}>
                <text x={30} y={y + 4} textAnchor="middle" style={{ ...TXT, fill: color, fontWeight: 700, fontSize: 12 }}>{mark}</text>
                <T x={46} y={y + 4} ink>{name}</T>
              </g>
            );
          })}
          <T x={200} y={46} anchor="start">{l('? = chưa có dữ liệu, KHÔNG phải ✓', '? = no data, NOT a ✓')}</T>
          <T x={200} y={86} anchor="start">{l('✗ = loại, điểm không cứu', '✗ = dropped, score cannot rescue')}</T>
        </g>
      );
    }
    case 'iv-hv': {
      const iv = [38, 40, 42, 45, 44, 47, 52, 55, 50, 46, 44, 43, 45, 48, 46];
      const hv = [30, 31, 33, 34, 32, 35, 38, 41, 40, 37, 35, 33, 34, 35, 34];
      const y = scale(20, 65, 20, H - 26);
      const x = (i: number) => 20 + i * 20;
      return (
        <g>
          <polygon points={[...iv.map((v, i) => `${x(i)},${y(v)}`), ...hv.map((v, i) => `${x(i)},${y(v)}`).reverse()].join(' ')} fill="var(--credit-tint)" />
          <polyline points={iv.map((v, i) => `${x(i)},${y(v)}`).join(' ')} style={{ stroke: 'var(--stamp)', fill: 'none' }} strokeWidth={1.5} />
          <polyline points={hv.map((v, i) => `${x(i)},${y(v)}`).join(' ')} style={INK} strokeWidth={1.5} strokeDasharray="4 3" />
          <T x={x(14) + 4} y={y(46) + 3}>IV</T>
          <T x={x(14) + 4} y={y(34) + 3}>HV20</T>
          <T x={x(7)} y={y(60)} anchor="middle" ink>{l('khoảng cách = VRP (IV ÷ HV) > 1', 'the gap = VRP (IV ÷ HV) > 1')}</T>
          <T x={16} y={H - 6}>{l('thị trường định giá dao động nhiều hơn dao động thật', 'the market prices more movement than actually happens')}</T>
        </g>
      );
    }
    case 'manage': {
      const xs = scale(0, 45, 24, W - 24);
      const y = scale(0, 1, 30, H - 30);
      const theta = Array.from({ length: 46 }, (_, d) => Math.sqrt(d / 45));
      const gamma = Array.from({ length: 46 }, (_, d) => 1 / (1 + d / 4));
      return (
        <g>
          <polyline points={theta.map((v, d) => `${xs(45 - d)},${y(v)}`).join(' ')} style={{ stroke: 'var(--credit)', fill: 'none' }} strokeWidth={1.5} />
          <polyline points={gamma.map((v, d) => `${xs(45 - d)},${y(v)}`).join(' ')} style={{ stroke: 'var(--risk)', fill: 'none' }} strokeWidth={1.5} />
          <line x1={xs(21)} x2={xs(21)} y1={26} y2={H - 26} style={WARN} strokeDasharray="4 3" />
          <T x={xs(21)} y={20} anchor="middle" ink>21 DTE</T>
          <T x={xs(40)} y={y(0.15)} anchor="middle">{l('giá trị thời gian còn lại', 'time value left')}</T>
          <T x={xs(8)} y={y(0.85)} anchor="middle">{l('gamma (rủi ro cú rớt nhỏ)', 'gamma (risk of a small drop)')}</T>
          <T x={xs(45)} y={H - 10} anchor="start">45</T>
          <T x={xs(0)} y={H - 10} anchor="end">0</T>
          <T x={W / 2} y={H - 10} anchor="middle">{l('← ngày còn lại tới đáo hạn', '← days to expiry')}</T>
        </g>
      );
    }
    default: {
      /* Một id mới thêm vào FIGURE_IDS mà quên vẽ: lộ ra trên màn hình, không im. */
      return (
        <g data-missing-figure={String(id)}>
          <rect x={8} y={8} width={W - 16} height={H - 16} style={WARN} strokeDasharray="4 3" />
          <text x={W / 2} y={H / 2 + 6} textAnchor="middle" style={{ ...TXT, fill: 'var(--warn)', fontSize: 18 }}>?</text>
          <T x={W / 2} y={H / 2 + 24} anchor="middle">{String(id)}</T>
        </g>
      );
    }
  }
}
