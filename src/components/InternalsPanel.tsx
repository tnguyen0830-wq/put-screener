'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRememberedOneOf, remember } from '@/lib/remember';
import TradingViewInternals from './TradingViewInternals';

type SeriesPoint = { t: number; v: number };
type Series = {
  key: string;
  label: string;
  points: SeriesPoint[];
  current: number | null;
  source: 'schwab' | 'sampled';
  asOf: number | null;
};
type Unavailable = { key: string; label: string };
type Data = { series: Series[]; unavailable: Unavailable[] };

/**
 * Đo được ở #165 (`/api/internalsprobe`): market internals chia ba nhóm,
 * và bố cục panel đi thẳng theo đó -
 *
 *   - 6 chỉ báo có mặt trong ORDER dưới đây, mỗi cái tự nói nó là đường THẬT
 *     (nến phút Schwab, làm mới mỗi lần mở panel) hay đường TỰ LẤY MẪU
 *     (~15 phút/lần, thô hơn hẳn) - hai thứ trông giống nhau trên biểu đồ
 *     nhưng đáng tin khác nhau, không được để người đọc tự đoán.
 *   - 2 chỉ báo Schwab không quote được (NASDAQ Advance-Decline, Put/Call
 *     Total) hiện thành thẻ NÓI THẲNG "không có dữ liệu", không bị bỏ qua
 *     âm thầm - một ô trống trông giống app quên vẽ, một ô ghi rõ lý do thì
 *     không.
 */
const ORDER = ['uvolDvolDiff', 'advDeclNyse', 'nyseTick', 'nasdaqTick', 'vix', 'pccEquity', 'avgIvRank'];

/** Chỉ những chỉ báo là HIỆU SỐ (nhiều mua trừ nhiều bán) mới đáng tô theo
 *  dấu - đúng luật ColorLegend: xanh/đỏ chỉ dùng khi DẤU của số có nghĩa.
 *  VIX và Put/Call là một ĐỘ LỚN, không phải một hiệu số, tô theo dấu ở đó
 *  sẽ đọc thành "số dương là tốt" - sai. */
const SIGNED = new Set(['uvolDvolDiff', 'advDeclNyse', 'nyseTick', 'nasdaqTick']);

/** Hậu tố đơn vị - chỉ IV rank cần, mọi chỉ báo khác là chênh lệch/tỉ lệ
 *  không đơn vị nên không có mục ở đây thì `UNIT[key]` là `undefined`. */
const UNIT: Record<string, string> = { avgIvRank: '%' };

const fmt = (v: number | null, key?: string) =>
  v === null ? '—' : `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}${key ? (UNIT[key] ?? '') : ''}`;

function timeFmt(t: number | null): string {
  if (t === null) return '—';
  return new Date(t).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function Sparkline({ points, signed }: { points: SeriesPoint[]; signed: boolean }) {
  const W = 260;
  const H = 56;
  const PAD = 4;
  if (points.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} />;

  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const path = points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ');
  const last = points[points.length - 1].v;
  const color = signed ? (last >= 0 ? 'var(--credit)' : 'var(--risk)') : 'var(--stamp)';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {min <= 0 && max >= 0 && (
        <line
          x1={PAD}
          x2={W - PAD}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--rule-soft)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      )}
      <polyline
        points={path}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Card({ s, t }: { s: Series; t: (k: string, ...a: any[]) => string }) {
  const signed = SIGNED.has(s.key);
  const noPoints = s.points.length < 2;
  return (
    <div className="intcard">
      <p className="cap intlabel">{s.label}</p>
      <p
        className="intvalue"
        style={signed && s.current !== null ? { color: s.current >= 0 ? 'var(--credit)' : 'var(--risk)' } : undefined}
      >
        {fmt(s.current, s.key)}
      </p>
      {noPoints ? (
        <p className="cap">{s.source === 'sampled' ? t('int.noSamplesYet') : t('int.noHistory')}</p>
      ) : (
        <Sparkline points={s.points} signed={signed} />
      )}
      <p className="cap intmeta">
        {t(s.source === 'sampled' ? 'int.sourceSampled' : 'int.sourceSchwab')} · {t('int.asOf', timeFmt(s.asOf))}
      </p>
    </div>
  );
}

const VIEWS = ['tv', 'app'] as const;
type View = (typeof VIEWS)[number];

/** Phần "Số liệu app": các thẻ dựng từ dữ liệu Schwab/tastytrade CHÍNH APP
 *  đọc được - khác hẳn khung hình TradingView bên cạnh. */
function AppCards({ t }: { t: (k: string, ...a: any[]) => string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/internals')
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setError(j.error ?? t('int.loadFailed'));
        else setData(j);
      })
      .catch(() => alive && setError(t('int.loadFailed')));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="cap">{error}</p>;
  if (!data) return <p className="cap">{t('int.loading')}</p>;

  const byKey = new Map(data.series.map((s) => [s.key, s]));
  const ordered = ORDER.map((k) => byKey.get(k)).filter((s): s is Series => !!s);

  return (
    <>
      <p className="cap">{t('int.note')}</p>
      <div className="intgrid">
        {ordered.map((s) => (
          <Card key={s.key} s={s} t={t} />
        ))}
        {data.unavailable.map((u) => (
          <div key={u.key} className="intcard intcard-unavail">
            <p className="cap intlabel">{u.label}</p>
            <p className="intvalue intvalue-dash">{'—'}</p>
            <p className="cap">{t('int.unavailable')}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export default function InternalsPanel() {
  const { t } = useLang();
  // Mặc định 'tv' vì đó là thứ chủ app xin ("hiện giống ảnh"), nhưng nhớ
  // lựa chọn để ai thích số liệu app thì không phải gạt lại mỗi lần mở.
  const [view, setView] = useState<View>('tv');
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const saved = readRememberedOneOf<View>('internalsView', VIEWS);
    if (saved) setView(saved);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) remember('internalsView', view);
  }, [restored, view]);

  return (
    <section className="panel">
      <div className="panel-head">{t('int.title')}</div>
      <div className="panel-body">
        <div className="segmented hmranges">
          <button className={view === 'tv' ? 'on' : undefined} onClick={() => setView('tv')}>
            {t('int.viewTv')}
          </button>
          <button className={view === 'app' ? 'on' : undefined} onClick={() => setView('app')}>
            {t('int.viewApp')}
          </button>
        </div>

        {/* Chỉ gọi /api/internals khi đang XEM chế độ đó - không tiêu 4
            request Schwab cho một bảng không ai mở. Đổi chế độ thì component
            được dựng lại và tự gọi. */}
        {view === 'tv' ? <TradingViewInternals /> : <AppCards t={t} />}
      </div>
    </section>
  );
}
