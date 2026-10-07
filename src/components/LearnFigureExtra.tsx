'use client';

import { useEffect, useRef, useState } from 'react';
import type { FigureId } from '@/lib/learn';
import { PLAY_EVENT } from './learnanim';

/**
 * Hình cho phần "Phân tích kỹ thuật căn bản" (bài chủ app gửi, 2026-10-07).
 *
 * Tách khỏi `LearnFigure.tsx` vì đây là ~36 hình mà phần lớn chỉ khác nhau ở
 * DỮ LIỆU: một bộ nến [o,h,l,c] hoặc một đường gấp khúc + vài đường biên. Vẽ
 * mỗi hình một nhánh tay là 36 lần chép cùng một khung; ở đây mỗi hình là một
 * dòng dữ liệu, và ba bộ vẽ chung (`CandleSet`, `LineSet`, chỉ báo).
 *
 * Cùng luật màu với `LearnFigure.tsx`: `--credit`/`--risk` cho nến và hướng,
 * `--warn` cho đường tham chiếu, `--stamp` cho đường chỉ báo thứ nhất — chỉ
 * dùng biến có sẵn ở cả ba khối theme.
 *
 * Mọi số liệu ở đây là MINH HOẠ, không phải cổ phiếu thật; chuỗi chỉ báo sinh
 * từ một bộ sinh số có hạt giống cố định nên server và trình duyệt vẽ y hệt
 * nhau (không lệch hydrate).
 *
 * `drawExtra()` trả `null` cho id nó không biết, để `LearnFigure` rơi về
 * khung "?" — một id quên dữ liệu lộ ra trên màn hình chứ không im.
 */

type Lang = 'vi' | 'en';
type OHLC = [number, number, number, number];
type Bi = [string, string];

const W = 320;
const H = 180;

const UP = { fill: 'var(--credit)', stroke: 'var(--credit)' } as const;
const DN = { fill: 'var(--risk)', stroke: 'var(--risk)' } as const;
const TXT = { fill: 'var(--muted)', fontFamily: 'var(--data)', fontSize: 9 } as const;
const TXT_INK = { ...TXT, fill: 'var(--ink)' } as const;

const pickL = (lang: Lang, b: Bi) => (lang === 'en' ? b[1] : b[0]);

function T({ x, y, children, ink, anchor, color }: { x: number; y: number; children: React.ReactNode; ink?: boolean; anchor?: 'start' | 'middle' | 'end'; color?: string }) {
  const st = color ? { ...TXT, fill: color } : ink ? TXT_INK : TXT;
  return (
    <text x={x} y={y} style={st} textAnchor={anchor ?? 'start'}>
      {children}
    </text>
  );
}

function scaler(lo: number, hi: number, top: number, bottom: number) {
  return (p: number) => bottom - ((p - lo) / (hi - lo)) * (bottom - top);
}

function Candle({ d, x, w, y }: { d: OHLC; x: number; w: number; y: (p: number) => number }) {
  const [o, h, l, c] = d;
  const st = c >= o ? UP : DN;
  const bt = y(Math.max(o, c));
  const bb = y(Math.min(o, c));
  return (
    <g className="lf-c">
      <line x1={x} x2={x} y1={y(h)} y2={y(l)} style={st} strokeWidth={1} />
      <rect x={x - w / 2} y={bt} width={w} height={Math.max(1, bb - bt)} style={st} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Bộ nến: nến dẫn vào (bối cảnh) + các nến của mẫu, đóng khung nét đứt. */

type CSet = {
  data: OHLC[];
  name: Bi;
  note: Bi;
  /** Chỉ số các nến thuộc mẫu — đóng khung để mắt biết nhìn vào đâu. */
  mark: number[];
  /** Vẽ đường nét đứt tại điểm giữa THÂN nến này (đường nhọn / mây đen). */
  mid?: number;
  /** Vẽ đường nét đứt ngang tại mức giá này (nhíp: hai đỉnh/đáy bằng nhau). */
  level?: number;
};

const CANDLE_SETS: Partial<Record<FigureId, CSet>> = {
  marubozu: {
    data: [[9.6, 9.8, 9.3, 9.4], [9.4, 9.6, 9.0, 9.2], [9.2, 9.4, 8.9, 9.1], [9.1, 11, 9.1, 11]],
    mark: [3], name: ['Marubozu tăng', 'Bullish marubozu'],
    note: ['thân dài, không râu: phe mua giữ cả phiên', 'long body, no wicks: buyers held all session'],
  },
  'bear-marubozu': {
    data: [[10.4, 10.7, 10.3, 10.6], [10.6, 10.9, 10.5, 10.8], [10.8, 11, 10.6, 10.7], [10.7, 10.7, 8.9, 8.9]],
    mark: [3], name: ['Marubozu giảm', 'Bearish marubozu'],
    note: ['mở ở đỉnh, đóng ở đáy: phe bán giữ cả phiên', 'opens at the high, closes at the low'],
  },
  'spinning-top': {
    data: [[8.4, 8.9, 8.3, 8.8], [8.8, 9.3, 8.7, 9.2], [9.2, 9.9, 9.1, 9.8], [9.8, 10.6, 9.0, 9.7]],
    mark: [3], name: ['Con xoay', 'Spinning top'],
    note: ['thân nhỏ, hai râu dài: chưa phe nào thắng', 'small body, two long wicks: no winner yet'],
  },
  'dragonfly-doji': {
    data: [[11.4, 11.5, 10.9, 11], [11, 11.1, 10.5, 10.6], [10.6, 10.7, 10, 10.1], [10.05, 10.08, 8.9, 10.05], [10.1, 10.8, 10, 10.7]],
    mark: [3], name: ['Doji chuồn chuồn', 'Dragonfly doji'],
    note: ['đạp sâu rồi bị kéo về hết — mạnh nhất ở đáy', 'pushed deep, pulled all the way back'],
  },
  'gravestone-doji': {
    data: [[9, 9.5, 8.9, 9.4], [9.4, 9.9, 9.3, 9.8], [9.8, 10.3, 9.7, 10.2], [10.25, 11.4, 10.22, 10.25], [10.2, 10.25, 9.6, 9.7]],
    mark: [3], name: ['Doji bia mộ', 'Gravestone doji'],
    note: ['đẩy lên cao rồi mất hết — cảnh báo ở đỉnh', 'pushed up, gave it all back — a top warning'],
  },
  'long-legged-doji': {
    data: [[9.2, 9.6, 9.1, 9.5], [9.5, 9.9, 9.4, 9.8], [9.8, 10.2, 9.7, 10.1], [10.1, 11.2, 9, 10.12]],
    mark: [3], name: ['Doji chân dài', 'Long-legged doji'],
    note: ['biên độ lớn, đóng ngay giá mở: cực kỳ do dự', 'wide range, closes at the open: deep indecision'],
  },
  'bull-harami': {
    data: [[11.6, 11.7, 11.1, 11.2], [11.2, 11.3, 10.8, 10.9], [10.9, 11, 9.2, 9.4], [9.8, 10.3, 9.7, 10.2]],
    mark: [2, 3], name: ['Mẹ bồng con tăng (Harami)', 'Bullish harami'],
    note: ['nến nhỏ nằm gọn trong thân nến lớn trước đó', 'a small body inside the prior large body'],
  },
  'bear-harami': {
    data: [[8.6, 9.1, 8.5, 9], [9, 9.4, 8.9, 9.3], [9.2, 11.1, 9.1, 11], [10.6, 10.7, 10.1, 10.2]],
    mark: [2, 3], name: ['Mẹ bồng con giảm', 'Bearish harami'],
    note: ['sau đợt tăng: đà chững lại, chưa phải đảo chiều', 'after a rise: momentum stalls, not yet a turn'],
  },
  piercing: {
    data: [[11.8, 11.9, 11.3, 11.4], [11.4, 11.5, 11, 11.1], [11, 11.1, 9.6, 9.8], [9.5, 10.7, 9.3, 10.6]],
    mark: [2, 3], mid: 2, name: ['Đường nhọn (Piercing)', 'Piercing line'],
    note: ['mở thấp hơn, đóng QUA điểm giữa thân nến đỏ', 'opens lower, closes PAST the red body’s midpoint'],
  },
  'dark-cloud': {
    data: [[8.4, 8.9, 8.3, 8.8], [8.8, 9.1, 8.7, 9], [9, 10.4, 8.9, 10.2], [10.5, 10.7, 9.4, 9.5]],
    mark: [2, 3], mid: 2, name: ['Mây đen che phủ', 'Dark cloud cover'],
    note: ['mở cao hơn, đóng DƯỚI điểm giữa thân nến xanh', 'opens higher, closes BELOW the green midpoint'],
  },
  'tweezer-top': {
    data: [[8.5, 9.1, 8.4, 9], [9, 10, 8.9, 9.8], [9.8, 11, 9.7, 10.8], [10.8, 11, 9.9, 10]],
    mark: [2, 3], level: 11, name: ['Đỉnh nhíp', 'Tweezer top'],
    note: ['hai đỉnh bằng nhau: bị từ chối hai lần ở một mức', 'equal highs: rejected twice at one price'],
  },
  'tweezer-bottom': {
    data: [[11.6, 11.7, 11, 11.1], [11, 11.1, 10, 10.2], [10.2, 10.3, 9, 9.2], [9.2, 10.1, 9, 10]],
    mark: [2, 3], level: 9, name: ['Đáy nhíp', 'Tweezer bottom'],
    note: ['hai đáy bằng nhau: một mức được giữ hai lần', 'equal lows: one price held twice'],
  },
  'three-soldiers': {
    data: [[10, 10.1, 9.3, 9.4], [9.4, 9.5, 8.9, 9], [9, 9.9, 8.9, 9.8], [9.6, 10.6, 9.5, 10.5], [10.3, 11.3, 10.2, 11.2]],
    mark: [2, 3, 4], name: ['Ba chàng lính trắng', 'Three white soldiers'],
    note: ['ba nến xanh dài, mỗi nến đóng cao hơn', 'three long greens, each closing higher'],
  },
  'three-crows': {
    data: [[10.6, 11.2, 10.5, 11.1], [11.1, 11.6, 11, 11.5], [11.2, 11.3, 10.2, 10.3], [10.5, 10.6, 9.5, 9.6], [9.8, 9.9, 8.9, 9]],
    mark: [2, 3, 4], name: ['Ba con quạ đen', 'Three black crows'],
    note: ['ba nến đỏ dài, mỗi nến đóng thấp hơn', 'three long reds, each closing lower'],
  },
  'three-inside-up': {
    data: [[11.8, 11.9, 11, 11.1], [11, 11.1, 9.2, 9.4], [9.7, 10.3, 9.6, 10.2], [10.2, 11.4, 10.1, 11.3]],
    mark: [1, 2, 3], name: ['Ba nến bên trong tăng', 'Three inside up'],
    note: ['harami tăng + nến 3 đóng vượt đỉnh nến đầu', 'bullish harami + bar 3 closes above bar 1'],
  },
  'three-inside-down': {
    data: [[8.4, 9.2, 8.3, 9.1], [9.2, 11.1, 9.1, 11], [10.6, 10.7, 10.1, 10.2], [10.2, 10.3, 8.9, 9]],
    mark: [1, 2, 3], name: ['Ba nến bên trong giảm', 'Three inside down'],
    note: ['harami giảm + nến 3 đóng dưới đáy nến đầu', 'bearish harami + bar 3 closes below bar 1'],
  },
  'abandoned-baby': {
    data: [[11.8, 11.9, 11.1, 11.2], [11, 11.1, 9.8, 9.9], [9.3, 9.5, 9.1, 9.3], [9.9, 11, 9.85, 10.9]],
    mark: [1, 2, 3], name: ['Em bé bị bỏ rơi', 'Abandoned baby'],
    note: ['doji tách hẳn hai bên bằng khoảng trống giá', 'a doji gapped away from both neighbours'],
  },
  'rising-three': {
    data: [[9, 10.6, 8.9, 10.5], [10.4, 10.5, 10, 10.1], [10.1, 10.2, 9.7, 9.8], [9.8, 9.9, 9.4, 9.5], [9.5, 11.2, 9.4, 11.1]],
    mark: [0, 1, 2, 3, 4], name: ['Tăng ba bước', 'Rising three methods'],
    note: ['nghỉ ba nến trong thân nến đầu, rồi vượt đỉnh', 'three-bar rest inside bar 1, then a new high'],
  },
  'falling-three': {
    data: [[11, 11.1, 9.4, 9.5], [9.6, 10, 9.5, 9.9], [9.9, 10.3, 9.8, 10.2], [10.2, 10.6, 10.1, 10.5], [10.5, 10.6, 8.8, 8.9]],
    mark: [0, 1, 2, 3, 4], name: ['Giảm ba bước', 'Falling three methods'],
    note: ['hồi ba nến trong thân nến đầu, rồi phá đáy', 'three-bar bounce inside bar 1, then a new low'],
  },
};

function CandleSet({ s, lang }: { s: CSet; lang: Lang }) {
  const lo = Math.min(...s.data.map((d) => d[2]));
  const hi = Math.max(...s.data.map((d) => d[1]));
  const pad = (hi - lo) * 0.06;
  const y = scaler(lo - pad, hi + pad, 28, H - 22);
  const n = s.data.length;
  const step = Math.min(44, 240 / n);
  const x0 = W / 2 - (step * (n - 1)) / 2;
  const w = Math.min(18, step * 0.55);
  const a = Math.min(...s.mark);
  const b = Math.max(...s.mark);
  const mLo = Math.min(...s.mark.map((i) => s.data[i][2]));
  const mHi = Math.max(...s.mark.map((i) => s.data[i][1]));
  return (
    <g>
      <rect
        x={x0 + a * step - step / 2 + 2}
        y={y(mHi) - 4}
        width={(b - a + 1) * step - 4}
        height={y(mLo) - y(mHi) + 8}
        fill="none"
        stroke="var(--warn)"
        strokeDasharray="3 2"
        data-mark="1"
      />
      {s.mid !== undefined && (() => {
        const [o, , , c] = s.data[s.mid];
        const m = (o + c) / 2;
        return <line x1={x0 + s.mid * step - w} x2={x0 + (s.mid + 1) * step + w} y1={y(m)} y2={y(m)} stroke="var(--warn)" strokeDasharray="4 3" />;
      })()}
      {s.level !== undefined && (
        <line x1={x0 + a * step - step / 2} x2={x0 + b * step + step / 2} y1={y(s.level)} y2={y(s.level)} stroke="var(--warn)" strokeDasharray="4 3" />
      )}
      {s.data.map((d, i) => (
        <Candle key={i} d={d} x={x0 + i * step} w={w} y={y} />
      ))}
      <T x={14} y={14} ink>{pickL(lang, s.name)}</T>
      <T x={14} y={H - 5}>{pickL(lang, s.note)}</T>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Mẫu giá dạng đường: điểm trên lưới 0-100 (ngang) × 0-106 (dọc). */

type Seg = [number, number, number, number];
type LSet = {
  pts: [number, number][];
  /** Đường cổ / biên mẫu — nét đứt `--warn`. */
  dash: Seg[];
  /** Hướng kỳ vọng sau khi phá — màu theo phía. */
  tgt: Seg;
  side: 'bull' | 'bear' | 'neutral';
  name: Bi;
  note: Bi;
};

const LINE_SETS: Partial<Record<FigureId, LSet>> = {
  'triple-top': {
    pts: [[0, 10], [14, 80], [26, 45], [40, 80], [52, 45], [66, 80], [78, 45], [83, 36]],
    dash: [[0, 45, 100, 45], [8, 82, 72, 82]], tgt: [83, 36, 97, 8], side: 'bear',
    name: ['Ba đỉnh', 'Triple top'], note: ['ba lần thất bại ở một vùng; thủng đáy = xác nhận', 'fails three times; a break of the lows confirms'],
  },
  'triple-bottom': {
    pts: [[0, 95], [14, 25], [26, 60], [40, 25], [52, 60], [66, 25], [78, 60], [83, 69]],
    dash: [[0, 60, 100, 60], [8, 23, 72, 23]], tgt: [83, 69, 97, 97], side: 'bull',
    name: ['Ba đáy', 'Triple bottom'], note: ['một vùng giữ ba lần; vượt đỉnh = xác nhận', 'one zone holds three times; clearing the highs confirms'],
  },
  'rising-wedge': {
    pts: [[0, 10], [14, 50], [24, 30], [38, 66], [48, 50], [60, 76], [70, 64], [78, 82], [84, 66]],
    dash: [[14, 50, 84, 86], [24, 30, 84, 70]], tgt: [84, 66, 98, 30], side: 'bear',
    name: ['Nêm tăng', 'Rising wedge'], note: ['đi lên nhưng hội tụ, đỉnh mới yếu dần → hay gãy', 'rising but converging; weaker highs → often breaks down'],
  },
  'falling-wedge': {
    pts: [[0, 100], [14, 60], [24, 80], [38, 44], [48, 60], [60, 34], [70, 46], [78, 28], [84, 46]],
    dash: [[14, 60, 84, 24], [24, 80, 84, 40]], tgt: [84, 46, 98, 84], side: 'bull',
    name: ['Nêm giảm', 'Falling wedge'], note: ['đi xuống nhưng hội tụ, lực bán yếu dần → hay bật', 'falling but converging; selling fades → often breaks up'],
  },
  'rounding-bottom': {
    pts: [[0, 85], [10, 62], [22, 42], [36, 32], [50, 30], [64, 36], [76, 50], [86, 72], [90, 84]],
    dash: [[0, 85, 95, 85]], tgt: [90, 84, 99, 104], side: 'bull',
    name: ['Đáy tròn', 'Rounding bottom'], note: ['giảm chậm → đi ngang → tăng chậm: đổi chiều dài hạn', 'slow fall → flat → slow rise: a long turn'],
  },
  'cup-handle': {
    pts: [[0, 80], [8, 60], [18, 40], [30, 30], [42, 30], [54, 40], [64, 60], [72, 80], [80, 68], [86, 76], [90, 82]],
    dash: [[0, 80, 96, 80]], tgt: [90, 82, 99, 104], side: 'bull',
    name: ['Cốc và tay cầm', 'Cup and handle'], note: ['đáy tròn + nhịp lùi nhỏ; vượt miệng cốc = tiếp diễn', 'round base + small dip; clearing the rim continues'],
  },
  pennant: {
    pts: [[0, 10], [25, 80], [34, 60], [42, 76], [50, 63], [57, 73], [64, 66], [70, 74]],
    dash: [[25, 80, 70, 72], [34, 60, 70, 67]], tgt: [70, 74, 94, 104], side: 'bull',
    name: ['Cờ đuôi nheo', 'Pennant'], note: ['sau cú chạy dốc, co thành tam giác nhỏ rồi đi tiếp', 'after a steep run, a small triangle, then onward'],
  },
  rectangle: {
    pts: [[0, 20], [12, 75], [24, 40], [36, 75], [48, 40], [60, 75], [72, 40], [82, 78]],
    dash: [[6, 75, 90, 75], [6, 40, 90, 40]], tgt: [82, 78, 97, 104], side: 'neutral',
    name: ['Hình chữ nhật (tích luỹ)', 'Rectangle (range)'], note: ['đi ngang giữa hai biên; cạnh bị phá quyết định', 'sideways between two edges; the break decides'],
  },
  channel: {
    pts: [[0, 10], [14, 42], [24, 26], [40, 60], [50, 44], [66, 78], [76, 62]],
    dash: [[0, 32, 100, 101], [0, 9, 100, 79]], tgt: [76, 62, 92, 96], side: 'bull',
    name: ['Kênh giá tăng', 'Ascending channel'], note: ['hai biên song song dốc lên; thủng biên dưới = cảnh báo', 'parallel rising edges; losing the lower one warns'],
  },
  trendline: {
    pts: [[0, 15], [14, 45], [22, 32], [38, 62], [46, 48], [62, 80], [70, 64], [84, 92]],
    dash: [[0, 17.3, 100, 84]], tgt: [84, 92, 96, 102], side: 'bull',
    name: ['Xu hướng tăng + đường xu hướng', 'Uptrend + trendline'], note: ['đỉnh cao dần, đáy cao dần; nối các đáy', 'higher highs, higher lows; join the lows'],
  },
  'sr-flip': {
    pts: [[0, 40], [10, 68], [20, 45], [30, 69], [40, 48], [50, 70], [58, 88], [68, 73], [76, 72], [86, 92], [96, 100]],
    dash: [[0, 70, 100, 70]], tgt: [76, 72, 86, 92], side: 'bull',
    name: ['Kháng cự đổi thành hỗ trợ', 'Resistance becomes support'], note: ['phá lên → quay lại kiểm tra từ trên → đi tiếp', 'break up → retest from above → continue'],
  },
};

function LineSet({ s, lang, id }: { s: LSet; lang: Lang; id: FigureId }) {
  const X = (v: number) => 16 + v * 2.85;
  const Y = (v: number) => H - 20 - v * 1.32;
  const tgtColor = s.side === 'bull' ? 'var(--credit)' : s.side === 'bear' ? 'var(--risk)' : 'var(--warn)';
  return (
    <g>
      {s.dash.map((d, i) => (
        <line key={i} x1={X(d[0])} y1={Y(d[1])} x2={X(d[2])} y2={Y(d[3])} stroke="var(--warn)" strokeDasharray="4 3" />
      ))}
      <polyline points={s.pts.map(([a, b]) => `${X(a)},${Y(b)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinejoin="round" />
      <line className="lf-tgt" x1={X(s.tgt[0])} y1={Y(s.tgt[1])} x2={X(s.tgt[2])} y2={Y(s.tgt[3])} stroke={tgtColor} strokeWidth={2} />
      {s.side === 'neutral' && (
        <line x1={X(s.tgt[0])} y1={Y(s.tgt[1])} x2={X(s.tgt[2])} y2={Y(s.tgt[1] - (s.tgt[3] - s.tgt[1]))} stroke={tgtColor} strokeWidth={2} strokeDasharray="2 2" />
      )}
      {id === 'sr-flip' && <circle cx={X(76)} cy={Y(72)} r={6} fill="none" stroke="var(--warn)" strokeWidth={1.5} />}
      <T x={14} y={14} ink>{pickL(lang, s.name)}</T>
      <T x={14} y={H - 5}>{pickL(lang, s.note)}</T>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Chỉ báo: một chuỗi giá minh hoạ, sinh có hạt giống cố định. */

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chặng: [số nến, giá đích, độ nhiễu]. */
function series(start: number, legs: [number, number, number][], seed: number): OHLC[] {
  const r = rng(seed);
  let p = start;
  const out: OHLC[] = [];
  for (const [n, to, noise] of legs) {
    const from = p;
    for (let i = 1; i <= n; i++) {
      const c = from + ((to - from) * i) / n + (r() - 0.5) * noise;
      const o = p;
      out.push([o, Math.max(o, c) + r() * noise * 0.5, Math.min(o, c) - r() * noise * 0.5, c]);
      p = c;
    }
  }
  return out;
}

function sma(v: number[], n: number): (number | null)[] {
  return v.map((_, i) => (i < n - 1 ? null : v.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n));
}
function ema(v: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  v.forEach((x, i) => out.push(i === 0 ? x : x * k + out[i - 1] * (1 - k)));
  return out;
}
function rsi(v: number[], n = 14): (number | null)[] {
  return v.map((_, i) => {
    if (i < n) return null;
    let g = 0;
    let l = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const d = v[j] - v[j - 1];
      if (d > 0) g += d;
      else l -= d;
    }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  });
}

const IND = series(30, [[12, 24, 1.4], [14, 38, 1.4], [6, 33, 1.4], [12, 46, 1.4], [10, 36, 1.4], [8, 41, 1.4]], 5);
const IND_C = IND.map((d) => d[3]);

function PriceCandles({ data, top, bottom, x0 = 14, x1 = W - 34 }: { data: OHLC[]; top: number; bottom: number; x0?: number; x1?: number }) {
  const lo = Math.min(...data.map((d) => d[2]));
  const hi = Math.max(...data.map((d) => d[1]));
  const y = scaler(lo, hi, top, bottom);
  const step = (x1 - x0) / data.length;
  const xs = (i: number) => x0 + step * (i + 0.5);
  return { y, xs, step, el: <g>{data.map((d, i) => <Candle key={i} d={d} x={xs(i)} w={Math.max(1.5, step * 0.6)} y={y} />)}</g> };
}

function poly(v: (number | null)[], xs: (i: number) => number, y: (p: number) => number) {
  return v.map((q, i) => (q == null ? '' : `${xs(i).toFixed(1)},${y(q).toFixed(1)}`)).filter(Boolean).join(' ');
}

function MaCross({ lang }: { lang: Lang }) {
  const pc = PriceCandles({ data: IND, top: 22, bottom: H - 18 });
  const m1 = sma(IND_C, 9);
  const m2 = sma(IND_C, 21);
  const crosses: { i: number; up: boolean }[] = [];
  for (let i = 21; i < IND_C.length; i++) {
    const a = (m1[i - 1] as number) - (m2[i - 1] as number);
    const b = (m1[i] as number) - (m2[i] as number);
    if (a * b < 0) crosses.push({ i, up: b > 0 });
  }
  return (
    <g>
      {pc.el}
      <polyline points={poly(m1, pc.xs, pc.y)} fill="none" stroke="var(--stamp)" strokeWidth={1.6} />
      <polyline points={poly(m2, pc.xs, pc.y)} fill="none" stroke="var(--warn)" strokeWidth={1.6} />
      {crosses.map((c) => (
        <circle key={c.i} cx={pc.xs(c.i)} cy={pc.y(m2[c.i] as number)} r={4.5} fill="none" stroke={c.up ? 'var(--credit)' : 'var(--risk)'} strokeWidth={2} data-cross={c.up ? 'golden' : 'death'} />
      ))}
      <T x={14} y={12} ink>{pickL(lang, ['Giao cắt MA', 'Moving-average crossover'])}</T>
      <T x={W - 14} y={12} anchor="end" color="var(--stamp)">MA9</T>
      <T x={W - 44} y={12} anchor="end" color="var(--warn)">MA21</T>
      <T x={14} y={H - 5}>{pickL(lang, ['○ xanh: cắt lên (vàng) · ○ đỏ: cắt xuống (tử thần)', '○ green: crosses up (golden) · ○ red: down (death)'])}</T>
    </g>
  );
}

function RsiFig({ lang }: { lang: Lang }) {
  const pc = PriceCandles({ data: IND, top: 20, bottom: 92 });
  const r = rsi(IND_C);
  const top = 104;
  const bottom = H - 18;
  const yr = scaler(0, 100, top, bottom);
  const x0 = 14;
  const x1 = W - 34;
  return (
    <g>
      {pc.el}
      <rect x={x0} y={yr(100)} width={x1 - x0} height={yr(70) - yr(100)} fill="var(--risk)" opacity={0.12} />
      <rect x={x0} y={yr(30)} width={x1 - x0} height={yr(0) - yr(30)} fill="var(--credit)" opacity={0.12} />
      <line x1={x0} x2={x1} y1={yr(70)} y2={yr(70)} stroke="var(--muted)" strokeDasharray="3 3" />
      <line x1={x0} x2={x1} y1={yr(30)} y2={yr(30)} stroke="var(--muted)" strokeDasharray="3 3" />
      <polyline points={poly(r, pc.xs, yr)} fill="none" stroke="var(--ink)" strokeWidth={1.4} />
      <T x={x1 + 4} y={yr(70) + 3}>70</T>
      <T x={x1 + 4} y={yr(30) + 3}>30</T>
      <T x={14} y={12} ink>RSI (14)</T>
      <T x={14} y={H - 5}>{pickL(lang, ['trên 70 quá mua, dưới 30 quá bán — không phải lệnh', 'above 70 overbought, below 30 oversold — not orders'])}</T>
    </g>
  );
}

function MacdFig({ lang }: { lang: Lang }) {
  const pc = PriceCandles({ data: IND, top: 20, bottom: 88 });
  const e12 = ema(IND_C, 12);
  const e26 = ema(IND_C, 26);
  const macd = e12.map((v, i) => v - e26[i]);
  const sig = ema(macd, 9);
  const hist = macd.map((v, i) => v - sig[i]);
  const start = 26;
  const vis = (v: number[]) => v.map((x, i) => (i < start ? null : x));
  const all = [...macd.slice(start), ...sig.slice(start), ...hist.slice(start)];
  const lim = Math.max(...all.map(Math.abs));
  const ym = scaler(-lim, lim, 100, H - 18);
  return (
    <g>
      {pc.el}
      <line x1={14} x2={W - 34} y1={ym(0)} y2={ym(0)} stroke="var(--muted)" strokeDasharray="3 3" />
      {hist.map((h, i) => (i < start ? null : (
        <rect key={i} x={pc.xs(i) - pc.step * 0.3} y={Math.min(ym(h), ym(0))} width={pc.step * 0.6} height={Math.abs(ym(h) - ym(0))} fill={h >= 0 ? 'var(--credit)' : 'var(--risk)'} opacity={0.55} />
      )))}
      <polyline points={poly(vis(macd), pc.xs, ym)} fill="none" stroke="var(--stamp)" strokeWidth={1.5} />
      <polyline points={poly(vis(sig), pc.xs, ym)} fill="none" stroke="var(--warn)" strokeWidth={1.5} />
      <T x={14} y={12} ink>MACD (12, 26, 9)</T>
      <T x={W - 14} y={12} anchor="end" color="var(--stamp)">MACD</T>
      <T x={W - 52} y={12} anchor="end" color="var(--warn)">{pickL(lang, ['tín hiệu', 'signal'])}</T>
      <T x={14} y={H - 5}>{pickL(lang, ['cột = MACD − tín hiệu; đổi dấu = đổi động lượng', 'bars = MACD − signal; a sign flip = momentum shift'])}</T>
    </g>
  );
}

const BB = series(50, [[26, 50.4, 0.5], [12, 58, 1.6], [8, 56, 1.2]], 9);

function BollingerFig({ lang }: { lang: Lang }) {
  const c = BB.map((d) => d[3]);
  const mid = sma(c, 20);
  const sd = c.map((_, i) => {
    if (i < 19) return null;
    const m = mid[i] as number;
    const w = c.slice(i - 19, i + 1);
    return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 20);
  });
  const up = mid.map((m, i) => (m == null ? null : m + 2 * (sd[i] as number)));
  const dn = mid.map((m, i) => (m == null ? null : m - 2 * (sd[i] as number)));
  const lo = Math.min(...BB.map((d) => d[2]), ...(dn.filter((v) => v != null) as number[]));
  const hi = Math.max(...BB.map((d) => d[1]), ...(up.filter((v) => v != null) as number[]));
  const x0 = 14;
  const x1 = W - 14;
  const step = (x1 - x0) / BB.length;
  const xs = (i: number) => x0 + step * (i + 0.5);
  const y = scaler(lo, hi, 24, H - 22);
  const squeeze = 24;
  return (
    <g>
      <rect x={xs(19) - step / 2} y={22} width={xs(squeeze) - xs(19) + step} height={H - 46} fill="var(--warn-tint)" />
      {BB.map((d, i) => <Candle key={i} d={d} x={xs(i)} w={Math.max(1.5, step * 0.6)} y={y} />)}
      <polyline points={poly(up, xs, y)} fill="none" stroke="var(--stamp)" strokeWidth={1.3} />
      <polyline points={poly(mid, xs, y)} fill="none" stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
      <polyline points={poly(dn, xs, y)} fill="none" stroke="var(--stamp)" strokeWidth={1.3} />
      <T x={xs(19)} y={H - 26} >{pickL(lang, ['bó hẹp', 'squeeze'])}</T>
      <T x={14} y={12} ink>{pickL(lang, ['Dải Bollinger (20, 2)', 'Bollinger Bands (20, 2)'])}</T>
      <T x={14} y={H - 5}>{pickL(lang, ['dải bó hẹp thường báo trước một đợt chạy mạnh', 'a squeeze often comes before a big move'])}</T>
    </g>
  );
}

function VolumeFig({ lang }: { lang: Lang }) {
  /* Trái: phá vỡ có khối lượng. Phải: giá tăng mà khối lượng cạn dần. */
  const left = [50, 51, 50.5, 51.5, 50.8, 51.6, 51, 51.7, 54.5, 56];
  const lv = [1, 0.9, 1, 0.8, 0.9, 1, 0.8, 0.9, 2.7, 1.9];
  const right = [50, 51.5, 52.6, 53.6, 54.4, 55.1, 55.6, 56, 56.3, 56.5];
  const rv = [2.2, 1.9, 1.7, 1.5, 1.3, 1.1, 0.9, 0.8, 0.6, 0.5];
  const y = scaler(49, 57, 26, 104);
  const half = (xs0: number, px: number[], vol: number[], hot?: number) => {
    const step = 12.5;
    return (
      <g>
        <polyline points={px.map((p, i) => `${xs0 + i * step},${y(p)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={1.8} />
        {vol.map((v, i) => (
          <rect key={i} x={xs0 + i * step - 4} y={H - 22 - v * 18} width={8} height={v * 18} fill={i === hot ? 'var(--credit)' : 'var(--muted)'} opacity={i === hot ? 0.9 : 0.5} />
        ))}
      </g>
    );
  };
  return (
    <g>
      <line x1={14} x2={150} y1={y(51.9)} y2={y(51.9)} stroke="var(--warn)" strokeDasharray="4 3" />
      {half(20, left, lv, 8)}
      <line x1={160} x2={160} y1={18} y2={H - 18} stroke="var(--muted)" strokeDasharray="2 3" />
      {half(176, right, rv)}
      <T x={14} y={14} ink>{pickL(lang, ['phá vỡ + KL lớn', 'breakout + big volume'])}</T>
      <T x={170} y={14} ink>{pickL(lang, ['tăng nhưng KL cạn', 'rising, volume fading'])}</T>
      <T x={14} y={H - 5}>{pickL(lang, ['khối lượng là bằng chứng: trái đáng tin, phải đang yếu', 'volume is the evidence: left is credible, right is tiring'])}</T>
    </g>
  );
}

function RiskReward({ lang }: { lang: Lang }) {
  const y = scaler(94, 110, 22, H - 22);
  const entry = 100;
  const stop = 96;
  const target = 108;
  const x0 = 30;
  const x1 = W - 70;
  const path = [104, 102.5, 101, 100.2, 99.4, 100, 101.2, 102.5, 101.8, 103.6, 105, 104.2, 106, 107.4, 108.2];
  const step = (x1 - x0) / (path.length - 1);
  return (
    <g>
      <rect x={x0 + 3 * step} y={y(target)} width={x1 - x0 - 3 * step} height={y(entry) - y(target)} fill="var(--credit)" opacity={0.14} />
      <rect x={x0 + 3 * step} y={y(entry)} width={x1 - x0 - 3 * step} height={y(stop) - y(entry)} fill="var(--risk)" opacity={0.14} />
      <line x1={x0 + 3 * step} x2={x1} y1={y(entry)} y2={y(entry)} stroke="var(--ink)" strokeDasharray="4 3" />
      <line x1={x0 + 3 * step} x2={x1} y1={y(target)} y2={y(target)} stroke="var(--credit)" strokeWidth={1.5} />
      <line x1={x0 + 3 * step} x2={x1} y1={y(stop)} y2={y(stop)} stroke="var(--risk)" strokeWidth={1.5} />
      <polyline points={path.map((p, i) => `${x0 + i * step},${y(p)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={1.6} />
      <T x={x1 + 4} y={y(target) + 3} color="var(--credit)">{pickL(lang, ['mục tiêu +2R', 'target +2R'])}</T>
      <T x={x1 + 4} y={y(entry) + 3} ink>{pickL(lang, ['vào lệnh', 'entry'])}</T>
      <T x={x1 + 4} y={y(stop) + 3} color="var(--risk)">{pickL(lang, ['cắt lỗ −1R', 'stop −1R'])}</T>
      <T x={14} y={14} ink>{pickL(lang, ['Rủi ro : lợi nhuận = 1 : 2', 'Risk : reward = 1 : 2'])}</T>
      <T x={14} y={H - 5}>{pickL(lang, ['đặt cắt lỗ TRƯỚC khi vào; 1R ≈ 1–2% tài khoản', 'set the stop BEFORE entry; 1R ≈ 1–2% of account'])}</T>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Cây nến hình thành trong phiên — lấy ý từ bài gốc chủ app gửi: bên
   trái là giá chạy từng nhịp, bên phải là cây nến tương ứng lớn dần. Đứng
   yên ở trạng thái cuối cho tới khi LearnFigure phát `PLAY_EVENT` (hình lọt
   vào màn hình, hoặc bấm ↻) — nên server và "giảm chuyển động" thấy đủ. */

const LIVE_N = 64;
const LIVE_TICKS: number[] = (() => {
  const r = rng(42);
  const out = [50];
  for (let i = 1; i < LIVE_N; i++) out.push(out[i - 1] + 0.08 + (r() - 0.5) * 2.2);
  return out;
})();

function LiveCandle({ lang }: { lang: Lang }) {
  const ref = useRef<SVGGElement>(null);
  const [k, setK] = useState(LIVE_N - 1);
  useEffect(() => {
    const svg = ref.current?.closest('svg');
    if (!svg) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer) clearInterval(timer);
      let i = 0;
      setK(0);
      timer = setInterval(() => {
        i += 1;
        setK(Math.min(i, LIVE_N - 1));
        if (i >= LIVE_N - 1 && timer) clearInterval(timer);
      }, 60);
    };
    svg.addEventListener(PLAY_EVENT, start);
    return () => {
      svg.removeEventListener(PLAY_EVENT, start);
      if (timer) clearInterval(timer);
    };
  }, []);
  const lo = Math.min(...LIVE_TICKS) - 1;
  const hi = Math.max(...LIVE_TICKS) + 1;
  const y = scaler(lo, hi, 22, H - 22);
  const x = (i: number) => 14 + (i * 176) / (LIVE_N - 1);
  const ticks = LIVE_TICKS.slice(0, k + 1);
  const o = ticks[0];
  const c = ticks[k];
  const h = Math.max(...ticks);
  const l = Math.min(...ticks);
  const st = c >= o ? UP : DN;
  const cx = 248;
  const tag = (v: number, label: Bi, right: boolean) => (
    <g>
      <line x1={right ? cx + 16 : cx - 30} x2={right ? cx + 30 : cx - 16} y1={y(v)} y2={y(v)} stroke="var(--muted)" />
      <T x={right ? cx + 33 : cx - 33} y={y(v) + 3} anchor={right ? 'start' : 'end'}>{pickL(lang, label)}</T>
    </g>
  );
  return (
    <g ref={ref} data-noanim="1">
      <line x1={14} x2={190} y1={y(o)} y2={y(o)} stroke="var(--warn)" strokeDasharray="4 3" />
      <polyline points={ticks.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
      <circle cx={x(k)} cy={y(c)} r={3} style={{ fill: st.fill }} />
      <line x1={198} x2={198} y1={16} y2={H - 16} stroke="var(--rule)" />
      <line x1={cx} x2={cx} y1={y(h)} y2={y(l)} style={st} strokeWidth={2} />
      <rect x={cx - 12} y={y(Math.max(o, c))} width={24} height={Math.max(1.5, Math.abs(y(o) - y(c)))} style={st} />
      {tag(h, ['cao', 'high'], true)}
      {tag(l, ['thấp', 'low'], true)}
      {tag(o, ['mở', 'open'], false)}
      {tag(c, ['đóng', 'close'], false)}
      <T x={14} y={14} ink>{pickL(lang, ['Giá chạy trong phiên', 'Price during the session'])}</T>
      <T x={cx} y={14} anchor="middle" ink>{pickL(lang, ['cây nến', 'the candle'])}</T>
      <T x={14} y={H - 5}>{pickL(lang, ['bấm ↻ để xem cây nến hình thành lại từ đầu', 'press ↻ to watch the candle form again'])}</T>
    </g>
  );
}

export function drawExtra(id: FigureId, lang: Lang): React.ReactNode | null {
  if (id === 'candle-live') return <LiveCandle lang={lang} />;
  const cs = CANDLE_SETS[id];
  if (cs) return <CandleSet s={cs} lang={lang} />;
  const ls = LINE_SETS[id];
  if (ls) return <LineSet s={ls} lang={lang} id={id} />;
  switch (id) {
    case 'ma-cross': return <MaCross lang={lang} />;
    case 'rsi': return <RsiFig lang={lang} />;
    case 'macd': return <MacdFig lang={lang} />;
    case 'bollinger': return <BollingerFig lang={lang} />;
    case 'volume-confirm': return <VolumeFig lang={lang} />;
    case 'risk-reward': return <RiskReward lang={lang} />;
    default: return null;
  }
}

/** Cho test: mọi id hình mà file này vẽ được. */
export const EXTRA_FIGURE_IDS: string[] = [
  ...Object.keys(CANDLE_SETS),
  ...Object.keys(LINE_SETS),
  'ma-cross', 'rsi', 'macd', 'bollinger', 'volume-confirm', 'risk-reward', 'candle-live',
];
