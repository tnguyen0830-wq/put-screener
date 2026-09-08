'use client';

import { useLang } from '@/lib/i18n';

import { useEffect, useState } from 'react';
import type {
  GexCacheResponse,
  GexChainWindow,
  GexLevelsResponse,
  GexProfile,
  GexUwLevels,
} from '@/lib/gex';
import TradeBriefingPanel from './TradeBriefingPanel';

/** GexProfile không có trường phân biệt, nên dùng hàm bảo vệ kiểu tường
 *  minh: TypeScript mới thu hẹp được CẢ nhánh ngược lại (phần vẽ biểu đồ
 *  bên dưới chỉ chạy với dữ liệu Schwab đầy đủ). */
type SchwabGex = GexProfile & {
  chainWindow?: GexChainWindow;
  /** Mức của UW lấy song song ở cùng lượt gọi, để đối chiếu. null = UW chưa
   *  cấu hình hoặc lượt gọi đó hỏng (khi đó `uwDetail` nói vì sao). */
  uw?: GexUwLevels | null;
  uwDetail?: string;
  /** 'cboe' khi chuỗi lấy từ feed công khai trễ 15 phút của CBOE thay vì
   *  Schwab (lib/cboe.ts) - cùng công thức, khác nguồn. Vắng mặt = Schwab. */
  source?: 'cboe';
  cboeAsOf?: string | null;
  cboeSymbol?: string;
  /** Chỉ khi source = 'cboe': vì sao Schwab không dùng được. */
  schwabDetail?: string;
};

type GexResponse = SchwabGex | GexLevelsResponse | GexCacheResponse;

const isUwLevels = (d: GexResponse): d is GexLevelsResponse =>
  (d as GexLevelsResponse).source === 'uw';

const isCached = (d: GexResponse): d is GexCacheResponse =>
  (d as GexCacheResponse).source === 'cache';

const money = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return `${(n / 1e3).toFixed(0)}K`;
};

/**
 * Bảng đối chiếu Schwab (app tự tính) với Unusual Whales, bốn mức ánh xạ
 * được sang nhau. Có mặt thường trực chứ không phải nút bấm: một lần so tay
 * giữa app và một trang GEX khác chính là thứ đã tìm ra lỗi định nghĩa call
 * wall (#94) - nếu nó nằm sẵn trên màn hình thì lần lệch sau sẽ tự lộ ra.
 *
 * Hai bên tính theo hai mô hình khác nhau trên hai chuỗi dữ liệu khác nhau,
 * nên LỆCH LÀ BÌNH THƯỜNG - bảng này chỉ ra con số, cố tình không tô màu
 * xanh/đỏ và không phán "đúng/sai": ở đây không có bên nào là chuẩn.
 */
function GexCompare({
  schwab,
  uw,
  uwDetail,
  leftLabel,
  t,
}: {
  schwab: GexSnapshotLike | null;
  uw: GexUwLevels | null;
  uwDetail?: string;
  /** Tiêu đề cột trái: "App (Schwab)" hay "App (CBOE)" - cùng công thức,
   *  nhưng người đọc phải biết chuỗi nào đang được tính. */
  leftLabel?: string;
  t: (k: string, v?: any) => string;
}) {
  // UW chưa cấu hình và cũng không có lỗi -> không có gì để so, không hiện
  // bảng rỗng. Nhưng nếu CÓ lỗi thì phải nói, đừng để bảng biến mất im lặng.
  if (!uw) {
    return uwDetail ? <p className="cap">{t('gex.uwFailed', uwDetail)}</p> : null;
  }

  const rows: { label: string; a: number | null; b: number | null }[] = [
    { label: t('gex.putWall'), a: schwab?.putWall ?? null, b: uw.putWall },
    { label: t('gex.callWall'), a: schwab?.callWall ?? null, b: uw.callWall },
    { label: t('gex.zeroGamma'), a: schwab?.zeroGamma ?? null, b: uw.gammaFlip },
    { label: t('gex.absGamma'), a: schwab?.absGamma ?? null, b: uw.gammaMagnet },
  ];

  return (
    <div className="gexcompare">
      <table>
        <thead>
          <tr>
            <th />
            <th>{leftLabel ?? t('gex.srcSchwab')}</th>
            <th>{t('gex.srcUw')}</th>
            <th>{t('gex.diff')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            // Chỉ tính lệch khi có ĐỦ hai số. Thiếu một bên thì để trống -
            // coi null thành 0 rồi trừ sẽ đẻ ra một con số chênh lệch bịa.
            const both = r.a !== null && r.b !== null;
            const d = both ? r.b! - r.a! : null;
            const pct = both && r.a !== 0 ? (d! / r.a!) * 100 : null;
            return (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.a?.toFixed(2) ?? '—'}</td>
                <td>{r.b?.toFixed(2) ?? '—'}</td>
                <td>
                  {d === null
                    ? '—'
                    : `${d > 0 ? '+' : ''}${d.toFixed(2)}${
                        pct === null ? '' : ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`
                      }`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="cap">
        {t('gex.compareNote', {
          basis: uw.basis ?? '—',
          date: uw.date ?? '—',
          // "Schwab" hay "CBOE" - cùng công thức, nhưng câu chú thích phải
          // nói đúng chuỗi nào đang được tính, khớp với tiêu đề cột.
          left: leftLabel === t('gex.srcCboe') ? 'CBOE' : 'Schwab',
        })}
      </p>
      {uw.rawKeys && (
        <p className="cap">
          {t('gex.uwUnreadable')}: {uw.rawKeys.join(', ') || '(rỗng)'}
        </p>
      )}
    </div>
  );
}

/** Chỉ cần bốn mức để so - nhận cả GexProfile lẫn bản đọc cũ trên đĩa. */
type GexSnapshotLike = {
  putWall: number | null;
  callWall: number | null;
  zeroGamma: number | null;
  absGamma: number | null;
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
  const [data, setData] = useState<GexResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Lý do thật Schwab trả về (từ /api/gex's `detail`) - xem chú thích ở
   *  route đó. Hiện riêng, nhỏ hơn, để không lẫn với thông báo chính nhưng
   *  vẫn nhìn thấy được thay vì phải xem log server mới biết vì sao. */
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  /** Chỉ số cột đang rê/chạm, cho hộp chú thích. */
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setErrorDetail(null);
    setUpdatedAt(null);
    setHover(null);

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
        {/* Tới được UW nghĩa là CBOE cũng hỏng - phải nói, vì CBOE mới là
            bậc cho biểu đồ cột; im lặng thì đọc thành "SPX vốn chỉ có 4 số". */}
        {data.cboeDetail && <p className="cap">{t('gex.cboeFailed', data.cboeDetail)}</p>}

        {refreshMs && updatedAt && (
          <p className="cap">{t('gex.updatedAt', new Date(updatedAt).toLocaleTimeString())}</p>
        )}
      </>
    );
  }

  /* Cả Schwab lẫn UW đều hỏng, đang hiện bản đọc cũ lấy từ đĩa. Phải nói
     ra thật to: một bảng số cũ ba tiếng trông y hệt một bảng vừa lấy về, và
     im lặng thì đọc thành "mọi thứ vẫn ổn". Không vẽ biểu đồ cột (không lưu
     `strikes`) và không hiện AI Trade Briefing - nó dựng kèo từ chuỗi quyền
     chọn sống, mà chuỗi đó chính là thứ không lấy được. */
  if (isCached(data)) {
    // Bản đọc cũ có thể tính từ Schwab hoặc từ CBOE (cùng công thức) - lấy
    // cái nào có, và nói rõ là cái nào ở tiêu đề cột.
    const own = data.schwab ?? data.cboe ?? null;
    const ownLabel = data.schwab ? t('gex.srcSchwab') : t('gex.srcCboe');
    return (
      <>
        <p className="gexstale">{t('gex.stale', new Date(data.at).toLocaleString())}</p>
        <dl className="stats gexstats">
          <div>
            <dt>{t('gex.putWall')}</dt>
            <dd className="num-key">{own?.putWall?.toFixed(2) ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('gex.callWall')}</dt>
            <dd>{own?.callWall?.toFixed(2) ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('gex.zeroGamma')}</dt>
            <dd>{own?.zeroGamma?.toFixed(2) ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('gex.absGamma')}</dt>
            <dd>{own?.absGamma?.toFixed(2) ?? '—'}</dd>
          </div>
        </dl>
        <GexCompare schwab={own} uw={data.uw} uwDetail={undefined} leftLabel={ownLabel} t={t} />
        <p className="cap">{t('gex.bothDown')}</p>
        {data.schwabDetail && <p className="cap">Schwab: {data.schwabDetail}</p>}
        {data.cboeDetail && <p className="cap">CBOE: {data.cboeDetail}</p>}
        {data.uwDetail && <p className="cap">UW: {data.uwDetail}</p>}
      </>
    );
  }

  // Only the strikes near spot carry meaningful hedging flow.
  const lo = data.spot * (1 - zoomPct);
  const hi = data.spot * (1 + zoomPct);
  const rows = data.strikes.filter((s) => s.strike >= lo && s.strike <= hi);
  if (!rows.length) return <p className="cap">{t('gex.thin')}</p>;

  /* Bố cục theo đúng biểu đồ người dùng đưa (tapchiphowall.com/GEX): trục
     giá trị có nhãn, call đỏ phía trên / put xanh dương phía dưới, khung
     các mức chính ở góc, vạch giá hiện tại, và mờ tên mã làm nền.

     Đỏ/xanh dương ở đây là phân LOẠI (call vs put), không phải hướng tăng/
     giảm - nên không đụng luật xanh-lá/đỏ của ColorLegend.tsx (dành riêng
     cho dấu của một con số). Xanh dương không nằm trong bảng màu đó, và
     đỏ-call/xanh-put là quy ước chung của mọi biểu đồ GEX. */
  const W = 760;
  const H = 420;
  const padL = 58;
  const padR = 14;
  const padT = 30;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxUp = Math.max(0, ...rows.map((s) => s.callGex));
  const maxDown = Math.max(0, ...rows.map((s) => -s.putGex));
  // Một đơn vị chung cho cả hai nửa: cột call và cột put mới so sánh được
  // với nhau. Chia đôi cứng sẽ phóng đại bên nhỏ hơn.
  const unit = plotH / (maxUp + maxDown || 1);
  const yZero = padT + maxUp * unit;
  const yOf = (v: number) => yZero - v * unit;

  const slotW = plotW / rows.length;
  const xOf = (i: number) => padL + (i + 0.5) * slotW;
  const barW = Math.max(1.2, slotW * 0.62);
  /** Bề ngang khối chú giải ở góc trên phải, dùng lại để hộp chú thích
   *  biết mình có đang đè lên nó không. */
  const LEGEND_W = 140;

  /* Trục hoành là các strike CÓ THẬT xếp đều nhau, không phải thang giá
     tuyến tính - strike thưa dần khi ra xa giá nên thang tuyến tính để lại
     những khoảng trống lớn. Đổi lại, một mức giá bất kỳ (giá hiện tại, các
     tường) phải nội suy vào đúng vị trí giữa hai strike kề nó. */
  const xOfStrike = (v: number): number | null => {
    if (v < rows[0].strike || v > rows[rows.length - 1].strike) return null;
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i].strike;
      const b = rows[i + 1].strike;
      if (v >= a && v <= b) {
        const f = b === a ? 0 : (v - a) / (b - a);
        return xOf(i) + f * (xOf(i + 1) - xOf(i));
      }
    }
    return xOf(rows.length - 1);
  };

  // Vạch chia trục: bước "tròn" gần nhất, tính theo $M cho dễ đọc.
  const rangeM = (maxUp + maxDown) / 1e6 || 1;
  const rawStep = rangeM / 6;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const stepM = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((v) => v >= rawStep) ?? pow * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= maxUp / 1e6; v += stepM) ticks.push(v);
  for (let v = -stepM; v >= -maxDown / 1e6; v -= stepM) ticks.push(v);

  const LEVELS = [
    { v: data.putWall, color: 'var(--gexput)', label: t('gex.putWall') },
    { v: data.callWall, color: 'var(--gexcall)', label: t('gex.callWall') },
    { v: data.absGamma ?? null, color: 'var(--gexabs)', label: t('gex.absGamma') },
  ].filter((l): l is { v: number; color: string; label: string } => typeof l.v === 'number');

  /* Khoảng 9 mốc cách đều, không trùng nhau khi chuỗi ít strike. */
  const xLabels = (() => {
    const want = Math.min(9, rows.length);
    const out = new Set<number>();
    for (let k = 0; k < want; k++) {
      out.add(Math.round((k * (rows.length - 1)) / Math.max(1, want - 1)));
    }
    return [...out].sort((a, b) => a - b);
  })();

  const hovered = hover !== null ? rows[hover] : null;

  /* Câu chú thích dưới bảng số: strike người dùng đang xem nằm dưới hay trên
     put wall. Chỉ có nghĩa khi biết cả hai. */
  const belowWall =
    strike !== undefined && data.putWall !== null && strike <= data.putWall;

  return (
    <>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Gamma theo strike cho ${symbol}`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Tên mã mờ làm nền, đúng như biểu đồ tham chiếu - biết đang xem mã
            nào mà không tốn thêm một dòng chữ. */}
        <text
          x={padL + 6}
          y={padT + 34}
          fontSize="34"
          fontWeight="700"
          fill="var(--ink)"
          fillOpacity="0.09"
          fontFamily="var(--display)"
        >
          {symbol.replace(/^\$/, '')}
        </text>

        {/* Lưới + nhãn trục giá trị. Không có nhãn thì cột cao thấp chỉ nói
            được "cái nào lớn hơn", không nói được lớn hơn bao nhiêu. */}
        {ticks.map((tv) => (
          <g key={tv}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yOf(tv * 1e6)}
              y2={yOf(tv * 1e6)}
              stroke="var(--rule-soft)"
              strokeWidth={tv === 0 ? 1.2 : 0.6}
            />
            <text
              x={padL - 8}
              y={yOf(tv * 1e6) + 3.5}
              fontSize="10"
              textAnchor="end"
              fill="var(--muted)"
              fontFamily="var(--data)"
            >
              {tv}
            </text>
          </g>
        ))}
        <text
          x={-(padT + plotH / 2)}
          y={14}
          fontSize="10.5"
          textAnchor="middle"
          transform="rotate(-90)"
          fill="var(--muted)"
          fontFamily="var(--data)"
        >
          {t('gex.axisLabel')}
        </text>

        {/* Cột: call lên trên, put xuống dưới. Cả nhóm bắt sự kiện rê/chạm
            trên toàn chiều cao ô, không chỉ đúng thân cột - cột mỏng vài
            pixel thì gần như không trỏ trúng, nhất là trên điện thoại. */}
        {rows.map((s, i) => (
          <g key={s.strike} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
            <rect
              x={xOf(i) - slotW / 2}
              y={padT}
              width={slotW}
              height={plotH}
              fill="transparent"
            />
            {s.callGex > 0 && (
              <rect
                x={xOf(i) - barW / 2}
                y={yOf(s.callGex)}
                width={barW}
                height={Math.max(0.6, yZero - yOf(s.callGex))}
                fill="var(--gexcall)"
              />
            )}
            {s.putGex < 0 && (
              <rect
                x={xOf(i) - barW / 2}
                y={yZero}
                width={barW}
                height={Math.max(0.6, yOf(s.putGex) - yZero)}
                fill="var(--gexput)"
              />
            )}
          </g>
        ))}

        {/* Các mức chính + giá hiện tại. Mức nào rơi ngoài khoảng đang hiện
            thì bỏ vạch (xOfStrike trả null) chứ không vẽ ép vào mép - vẽ ép
            sẽ thành một vạch sai chỗ trông như số thật. */}
        {LEVELS.map((l) => {
          const x = xOfStrike(l.v);
          return x === null ? null : (
            <line
              key={l.label}
              x1={x}
              x2={x}
              y1={padT}
              y2={padT + plotH}
              stroke={l.color}
              strokeWidth="1.4"
              strokeDasharray="5 4"
            />
          );
        })}
        {strike !== undefined && xOfStrike(strike) !== null && (
          <line
            x1={xOfStrike(strike)!}
            x2={xOfStrike(strike)!}
            y1={padT}
            y2={padT + plotH}
            stroke="var(--stamp)"
            strokeWidth="1.4"
            strokeDasharray="2 3"
          />
        )}
        {xOfStrike(data.spot) !== null && (
          <>
            <line
              x1={xOfStrike(data.spot)!}
              x2={xOfStrike(data.spot)!}
              y1={padT - 12}
              y2={padT + plotH}
              stroke="var(--stamp)"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
            <text
              x={xOfStrike(data.spot)!}
              y={padT - 16}
              fontSize="11"
              textAnchor="middle"
              fill="var(--stamp)"
              fontFamily="var(--data)"
            >
              {t('gex.currentPrice', data.spot.toFixed(2))}
            </text>
          </>
        )}

        {/* Chú giải + các mức, gom một góc như biểu đồ tham chiếu. */}
        <g fontFamily="var(--data)" fontSize="10.5">
          <rect x={W - padR - 132} y={padT + 4} width={9} height={9} fill="var(--gexcall)" />
          <text x={W - padR - 119} y={padT + 12.5} fill="var(--muted)">
            {t('gex.calls')}
          </text>
          <rect x={W - padR - 132} y={padT + 20} width={9} height={9} fill="var(--gexput)" />
          <text x={W - padR - 119} y={padT + 28.5} fill="var(--muted)">
            {t('gex.puts')}
          </text>
          {LEVELS.map((l, i) => (
            <text
              key={l.label}
              x={W - padR}
              y={padT + 50 + i * 15}
              textAnchor="end"
              fill={l.color}
            >
              {l.label}: {l.v.toFixed(2)}
            </text>
          ))}
        </g>

        {/* Nhãn strike rải thưa. Chuỗi có thể có hàng trăm strike nên không
            ghi hết được; lấy khoảng 9 mốc cách đều theo VỊ TRÍ cột (không
            theo giá) để nhãn luôn nằm đúng dưới một cột có thật. Hai đầu
            luôn có nhãn, để biết biểu đồ đang cắt ở đâu. */}
        {xLabels.map((i) => (
          <g key={rows[i].strike}>
            <line
              x1={xOf(i)}
              x2={xOf(i)}
              y1={padT + plotH}
              y2={padT + plotH + 4}
              stroke="var(--rule)"
              strokeWidth="0.8"
            />
            <text
              x={xOf(i)}
              y={H - 14}
              fontSize="10"
              textAnchor={i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}
              fill="var(--muted)"
              fontFamily="var(--data)"
            >
              {rows[i].strike}
            </text>
          </g>
        ))}

        {hovered && (
          <g pointerEvents="none">
            <line
              x1={xOf(hover!)}
              x2={xOf(hover!)}
              y1={padT}
              y2={padT + plotH}
              stroke="var(--ink)"
              strokeOpacity="0.35"
              strokeWidth="1"
            />
            {(() => {
              // Hộp chú thích tự lật sang trái khi cột nằm sát mép phải, để
              // không bị tràn ra ngoài khung.
              const bw = 148;
              const bh = 52;
              const flip = xOf(hover!) + bw + 10 > W - padR;
              const bx = flip ? xOf(hover!) - bw - 8 : xOf(hover!) + 8;
              // Góc trên bên phải đã có chú giải + các mức; hộp lật sang trái
              // sẽ đè lên đúng chỗ đó. Rơi vào vùng ấy thì hạ xuống đáy khung
              // thay vì chồng hai khối chữ lên nhau.
              const overLegend = bx + bw > W - padR - LEGEND_W;
              const by = overLegend ? padT + plotH - bh - 6 : padT + 4;
              return (
                <g>
                  <rect x={bx} y={by} width={bw} height={bh} rx="4" fill="var(--card)" stroke="var(--rule)" />
                  <text x={bx + 8} y={by + 16} fontSize="10.5" fill="var(--ink)" fontFamily="var(--data)">
                    {t('gex.tipStrike')}: {hovered.strike}
                  </text>
                  <text x={bx + 8} y={by + 30} fontSize="10.5" fill="var(--gexcall)" fontFamily="var(--data)">
                    {t('gex.calls')}: {money(hovered.callGex)}
                  </text>
                  <text x={bx + 8} y={by + 44} fontSize="10.5" fill="var(--gexput)" fontFamily="var(--data)">
                    {t('gex.puts')}: {money(hovered.putGex)}
                  </text>
                </g>
              );
            })()}
          </g>
        )}
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

      {/* Chuỗi từ CBOE chứ không phải Schwab: nói NGAY dưới biểu đồ, trước
          mọi thứ khác. Cùng công thức nên biểu đồ trông y hệt - và đó chính
          là lý do phải nói: trễ 15 phút, greeks của CBOE, và đây là đường
          vòng vì Schwab trả chuỗi rỗng ruột cho mã này. */}
      {data.source === 'cboe' && (
        <>
          <p className="cap">
            {t('gex.cboeSource', { asOf: data.cboeAsOf ?? '—', file: data.cboeSymbol ?? '' })}
          </p>
          {data.schwabDetail && <p className="cap">{t('gex.cboeWhy', data.schwabDetail)}</p>}
        </>
      )}

      <GexCompare
        schwab={data}
        uw={data.uw ?? null}
        uwDetail={data.uwDetail}
        leftLabel={data.source === 'cboe' ? t('gex.srcCboe') : undefined}
        t={t}
      />

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
      {/* Cửa sổ đã bị thu hẹp hoặc phải ghép từng kỳ: nói ra. Wall tính trên
          7 ngày/60 strike - hay trên 12 kỳ đáo hạn gần nhất - là wall lớn
          nhất TRONG phạm vi đó, không phải của cả chuỗi. */}
      {data.chainWindow?.sliced ? (
        <p className="cap">
          {t('gex.sliced', {
            expirations: data.chainWindow.expirations ?? 0,
            strikes: data.chainWindow.strikeCount ?? 0,
          })}
        </p>
      ) : (
        data.chainWindow &&
        data.chainWindow.days < 60 && (
          <p className="cap">
            {t('gex.narrowed', {
              days: data.chainWindow.days,
              strikes: data.chainWindow.strikeCount ?? 0,
            })}
          </p>
        )
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
