'use client';

import { useMemo, useState } from 'react';
import { useLang } from '@/lib/i18n';
import type { IntraBar } from '@/lib/daytrade';
import type { StrikeExposure } from '@/lib/mmexposure';

/**
 * Ba biểu đồ của phần "Phơi nhiễm nhà tạo lập", vẽ bằng SVG trong code —
 * cùng lý do `IntradayChart`/`PatternChart`/`LearnFigure` làm thế: không
 * host ngoài, đổi theme là đổi màu, và không có ảnh vỡ nào để đọc nhầm
 * thành "app hỏng" (#133).
 *
 * **Quy ước màu, và nó KHÔNG giống nhau ở ba panel — đó là chủ ý.**
 * `ColorLegend.tsx` đặt luật: xanh/đỏ nói về DẤU của một con số, còn
 * `--gexcall`/`--gexput` nói về PHÂN LOẠI call/put.
 *   • Panel 1 và 2 vẽ gamma RÒNG, tức một con số có dấu → `--credit`/`--risk`.
 *   • Panel 3 tách call và put thành hai chuỗi → `--gexcall`/`--gexput`.
 *   • Hai CƠ SỞ (OI vs khối lượng) ở panel 2 lại là phân loại nhưng không
 *     phải call/put, nên dùng `--stamp` và `--warn` — hai biến đã có sẵn ở
 *     cả ba khối theme, nên không đụng bẫy "sửa màu phải sửa ba chỗ".
 */

const fmtCompact = (v: number, lang: string) =>
  new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v);

/** Trục giá trị: chọn bước tròn rồi trả về các mốc. Một trục không nhãn làm
 *  mọi cột trông "to" hay "nhỏ" mà không có gì để so. */
function ticks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = 0; v <= max * 1.0001; v += step) out.push(v);
  return out;
}

/* ------------------------------------------------------------------ *
 * Panel 1 — nến phiên + dải gamma theo strike, CHUNG một trục giá
 * ------------------------------------------------------------------ */

const L_W = 960;
const L_H = 420;
const L_PAD_T = 12;
const L_PAD_B = 26;
/** Bề ngang phần nến, phần nhãn giá, phần cột gamma. Cộng lại = L_W. */
const CANDLE_W = 520;
const AXIS_W = 70;

export function ExposureLadder({
  bars,
  strikes,
  spot,
  symbol,
  candlesError,
}: {
  bars: IntraBar[];
  strikes: StrikeExposure[];
  spot: number;
  symbol: string;
  candlesError: string | null;
}) {
  const { t, lang } = useLang();
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (!strikes.length) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of strikes) {
      if (s.strike < lo) lo = s.strike;
      if (s.strike > hi) hi = s.strike;
    }
    /* Miền giá phải chứa CẢ nến LẪN mọi strike đang vẽ. Một cột gamma nằm
       ngoài khung trông y hệt một cột không tồn tại — bài học đã ghi ở
       `IntradayChart` và `PatternChart`. */
    for (const b of bars) {
      if (b.low < lo) lo = b.low;
      if (b.high > hi) hi = b.high;
    }
    if (spot < lo) lo = spot;
    if (spot > hi) hi = spot;
    if (!(hi > lo)) {
      hi = lo + 1;
      lo -= 1;
    }
    const pad = (hi - lo) * 0.04;
    lo -= pad;
    hi += pad;
    const plotH = L_H - L_PAD_T - L_PAD_B;
    const y = (p: number) => L_PAD_T + ((hi - p) / (hi - lo)) * plotH;
    const slot = CANDLE_W / Math.max(bars.length, 1);
    const x = (i: number) => slot * (i + 0.5);
    let maxAbs = 0;
    for (const s of strikes) maxAbs = Math.max(maxAbs, Math.abs(s.netGamma));
    const barsX0 = CANDLE_W + AXIS_W;
    const barsW = L_W - barsX0;
    // Bề dày một cột: khoảng cách giữa hai strike liền nhau, trừ khe hở.
    const rowH = Math.max(2, Math.min(plotH / Math.max(strikes.length, 1) - 1, 12));
    return { lo, hi, y, x, slot, plotH, maxAbs, barsX0, barsW, rowH };
  }, [bars, strikes, spot]);

  if (!geom) return <p className="cap">{t('mm.noStrikes')}</p>;

  const { y, x, slot, maxAbs, barsX0, barsW, rowH } = geom;
  const bodyW = Math.max(1.2, Math.min(slot * 0.6, 9));
  const hovered = hover === null ? null : strikes[hover];

  return (
    <div className="mmchart">
      <svg viewBox={`0 0 ${L_W} ${L_H}`} className="mmsvg" role="img"
           aria-label={t('mm.p1Alt', symbol)}>
        <text x={CANDLE_W / 2} y={L_H / 2} className="mmwatermark" textAnchor="middle">
          {symbol}
        </text>

        {bars.map((b, i) => {
          const up = b.close >= b.open;
          const yo = y(b.open);
          const yc = y(b.close);
          return (
            <g key={b.t} className={up ? 'mmup' : 'mmdown'}>
              <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} strokeWidth={1} />
              <rect x={x(i) - bodyW / 2} y={Math.min(yo, yc)}
                    width={bodyW} height={Math.max(1, Math.abs(yc - yo))} />
            </g>
          );
        })}

        {/* Đường giá hiện tại chạy qua CẢ HAI nửa — đó là thứ duy nhất buộc
            mắt người đọc nối cột gamma với mức giá tương ứng. */}
        <line x1={0} x2={L_W} y1={y(spot)} y2={y(spot)} className="mmspot" />
        <text x={L_W - 4} y={y(spot) - 4} className="mmspotlabel" textAnchor="end">
          {spot.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 })}
        </text>

        {strikes.map((s, i) => {
          const w = maxAbs === 0 ? 0 : (Math.abs(s.netGamma) / maxAbs) * (barsW - 6);
          const pos = s.netGamma >= 0;
          return (
            <g key={s.strike}>
              <rect
                x={barsX0}
                y={y(s.strike) - rowH / 2}
                width={Math.max(w, 0.5)}
                height={rowH}
                className={pos ? 'mmgpos' : 'mmgneg'}
              />
              <rect
                x={barsX0}
                y={y(s.strike) - rowH / 2 - 1}
                width={barsW}
                height={rowH + 2}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}

        {/* Nhãn giá cho những strike có cột đáng kể. Dán nhãn cho MỌI strike
            làm chữ chồng lên nhau tới mức không đọc được cái nào. */}
        {strikes.map((s) =>
          maxAbs > 0 && Math.abs(s.netGamma) / maxAbs > 0.18 ? (
            <text key={s.strike} x={barsX0 - 6} y={y(s.strike) + 3}
                  className="mmaxis" textAnchor="end">
              {s.strike.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')}
            </text>
          ) : null
        )}
      </svg>
      {hovered && (
        <p className="cap mmhover">
          {t('mm.hoverGamma', {
            strike: hovered.strike.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US'),
            v: fmtCompact(hovered.netGamma, lang),
          })}
        </p>
      )}
      {!bars.length && (
        <p className="hint hint-warn">{t('mm.noCandles', candlesError ?? '—')}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Panel 2 — gamma theo strike, hai cơ sở chồng nhau
 * ------------------------------------------------------------------ */

const S_W = 900;
const S_H = 300;
const S_PAD_L = 62;
const S_PAD_R = 10;
const S_PAD_T = 12;
const S_PAD_B = 30;

export function SpotGammaChart({
  oi,
  volume,
  spot,
}: {
  oi: StrikeExposure[];
  volume: StrikeExposure[];
  spot: number;
}) {
  const { t, lang } = useLang();
  const [hover, setHover] = useState<number | null>(null);

  const volByStrike = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of volume) m.set(s.strike, s.netGamma);
    return m;
  }, [volume]);

  const geom = useMemo(() => {
    if (!oi.length) return null;
    let max = 0;
    for (const s of oi) {
      max = Math.max(max, Math.abs(s.netGamma), Math.abs(volByStrike.get(s.strike) ?? 0));
    }
    if (max === 0) max = 1;
    const plotW = S_W - S_PAD_L - S_PAD_R;
    const plotH = S_H - S_PAD_T - S_PAD_B;
    const slot = plotW / oi.length;
    const x = (i: number) => S_PAD_L + slot * (i + 0.5);
    const zeroY = S_PAD_T + plotH / 2;
    const y = (v: number) => zeroY - (v / max) * (plotH / 2);
    // Giá nằm GIỮA hai strike bao quanh nó — trục strike là trục PHÂN LOẠI,
    // không phải trục giá tuyến tính (cùng lý do `xOfStrike()` của GexChart).
    let spotX = S_PAD_L;
    for (let i = 0; i < oi.length; i++) {
      if (oi[i].strike >= spot) {
        if (i === 0) { spotX = x(0); break; }
        const a = oi[i - 1].strike;
        const b = oi[i].strike;
        const tt = b === a ? 0 : (spot - a) / (b - a);
        spotX = x(i - 1) + tt * slot;
        break;
      }
      spotX = x(i);
    }
    return { max, slot, x, y, zeroY, plotH, spotX };
  }, [oi, volByStrike, spot]);

  if (!geom) return <p className="cap">{t('mm.noStrikes')}</p>;
  const { max, slot, x, y, zeroY, spotX } = geom;
  const bw = Math.max(1.5, Math.min(slot * 0.34, 12));
  const hovered = hover === null ? null : oi[hover];

  return (
    <div className="mmchart">
      <svg viewBox={`0 0 ${S_W} ${S_H}`} className="mmsvg" role="img" aria-label={t('mm.p2Alt')}>
        {ticks(max).flatMap((v) =>
          [v, -v].filter((w, k) => (v === 0 ? k === 0 : true)).map((w) => (
            <g key={`${v}-${w}`}>
              <line x1={S_PAD_L} x2={S_W - S_PAD_R} y1={y(w)} y2={y(w)} className="mmgrid" />
              <text x={S_PAD_L - 6} y={y(w) + 3} className="mmaxis" textAnchor="end">
                {fmtCompact(w, lang)}
              </text>
            </g>
          ))
        )}
        <line x1={S_PAD_L} x2={S_W - S_PAD_R} y1={zeroY} y2={zeroY} className="mmzero" />

        {oi.map((s, i) => {
          const v = volByStrike.get(s.strike) ?? 0;
          return (
            <g key={s.strike}>
              <rect x={x(i) - bw - 1} y={Math.min(y(s.netGamma), zeroY)} width={bw}
                    height={Math.max(1, Math.abs(y(s.netGamma) - zeroY))} className="mmoi" />
              <rect x={x(i) + 1} y={Math.min(y(v), zeroY)} width={bw}
                    height={Math.max(1, Math.abs(y(v) - zeroY))} className="mmvol" />
              <rect x={x(i) - slot / 2} y={S_PAD_T} width={slot} height={S_H - S_PAD_T - S_PAD_B}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}

        <line x1={spotX} x2={spotX} y1={S_PAD_T} y2={S_H - S_PAD_B} className="mmspot" />
        <text x={spotX + 4} y={S_PAD_T + 10} className="mmspotlabel">
          {t('mm.spot', spot.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 }))}
        </text>

        {oi.map((s, i) =>
          i % Math.ceil(oi.length / 10) === 0 ? (
            <text key={s.strike} x={x(i)} y={S_H - 10} className="mmaxis" textAnchor="middle">
              {s.strike.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')}
            </text>
          ) : null
        )}
      </svg>
      <p className="cap mmlegend">
        <span className="mmkey mmkoi" /> {t('mm.basisOi')}
        <span className="mmkey mmkvol" /> {t('mm.basisVolume')}
      </p>
      {hovered && (
        <p className="cap mmhover">
          {t('mm.hoverBoth', {
            strike: hovered.strike.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US'),
            oi: fmtCompact(hovered.netGamma, lang),
            vol: fmtCompact(volByStrike.get(hovered.strike) ?? 0, lang),
          })}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Panel 3 — delta theo strike cho MỘT kỳ đáo hạn
 * ------------------------------------------------------------------ */

const D_W = 900;
const D_PAD_L = 60;
const D_PAD_R = 14;
const D_PAD_T = 10;
const D_PAD_B = 28;
const D_ROW = 16;

export function DeltaByStrike({ strikes }: { strikes: StrikeExposure[] }) {
  const { t, lang } = useLang();
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (!strikes.length) return null;
    let max = 0;
    for (const s of strikes) {
      max = Math.max(max, Math.abs(s.callDelta), Math.abs(s.putDelta), Math.abs(s.netDelta));
    }
    if (max === 0) max = 1;
    const plotW = D_W - D_PAD_L - D_PAD_R;
    const midX = D_PAD_L + plotW / 2;
    const x = (v: number) => midX + (v / max) * (plotW / 2);
    const height = D_PAD_T + D_PAD_B + strikes.length * D_ROW;
    const y = (i: number) => D_PAD_T + i * D_ROW;
    return { max, midX, x, height, y };
  }, [strikes]);

  if (!geom) return <p className="cap">{t('mm.noStrikes')}</p>;
  const { max, midX, x, height, y } = geom;
  const hovered = hover === null ? null : strikes[hover];
  // Ba chuỗi xếp chồng trong một hàng: mỗi cái một phần ba chiều cao hàng.
  const sub = (D_ROW - 3) / 3;

  return (
    <div className="mmchart">
      <svg viewBox={`0 0 ${D_W} ${height}`} className="mmsvg" role="img" aria-label={t('mm.p3Alt')}>
        {ticks(max, 3).flatMap((v) =>
          [v, -v].filter((w, k) => (v === 0 ? k === 0 : true)).map((w) => (
            <g key={`${v}-${w}`}>
              <line x1={x(w)} x2={x(w)} y1={D_PAD_T} y2={height - D_PAD_B} className="mmgrid" />
              <text x={x(w)} y={height - 10} className="mmaxis" textAnchor="middle">
                {fmtCompact(w, lang)}
              </text>
            </g>
          ))
        )}
        <line x1={midX} x2={midX} y1={D_PAD_T} y2={height - D_PAD_B} className="mmzero" />

        {strikes.map((s, i) => {
          const row = y(i);
          const bar = (v: number, off: number, cls: string) => {
            const x0 = Math.min(x(0), x(v));
            return (
              <rect x={x0} y={row + off} width={Math.max(1, Math.abs(x(v) - x(0)))}
                    height={sub} className={cls} />
            );
          };
          return (
            <g key={s.strike}>
              {bar(s.putDelta, 0, 'mmput')}
              {bar(s.callDelta, sub + 1, 'mmcall')}
              {bar(s.netDelta, (sub + 1) * 2, 'mmnet')}
              <text x={D_PAD_L - 6} y={row + D_ROW / 2 + 2} className="mmaxis" textAnchor="end">
                {s.strike.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')}
              </text>
              <rect x={D_PAD_L} y={row} width={D_W - D_PAD_L - D_PAD_R} height={D_ROW}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      <p className="cap mmlegend">
        <span className="mmkey mmkput" /> {t('mm.putDelta')}
        <span className="mmkey mmkcall" /> {t('mm.callDelta')}
        <span className="mmkey mmknet" /> {t('mm.netDelta')}
      </p>
      {hovered && (
        <p className="cap mmhover">
          {t('mm.hoverDelta', {
            strike: hovered.strike.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US'),
            put: fmtCompact(hovered.putDelta, lang),
            call: fmtCompact(hovered.callDelta, lang),
            net: fmtCompact(hovered.netDelta, lang),
          })}
        </p>
      )}
    </div>
  );
}
