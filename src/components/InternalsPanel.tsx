'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRememberedOneOf, remember } from '@/lib/remember';
import { Card, type Series } from './InternalsCard';
import TradingViewInternals from './TradingViewInternals';

type Unavailable = { key: string; label: string };
export type SectorChange = { name: string; change: number; count: number };
export type Internals = {
  series: Series[];
  unavailable: Unavailable[];
  marketOpen: boolean;
  nyseUpDown: number | null;
  tables: { sectors: SectorChange[]; topCaps: { symbol: string; change: number }[]; note?: string };
};
export type Load =
  | { state: 'loading' }
  | { state: 'error'; expired: boolean; msg: string }
  | { state: 'ok'; data: Internals };

/**
 * Đo được ở #165 (`/api/internalsprobe`): market internals chia ba nhóm,
 * và bố cục panel đi thẳng theo đó -
 *
 *   - 6 chỉ báo có mặt trong ORDER dưới đây, mỗi cái tự nói nó là đường THẬT
 *     (nến phút Schwab, làm mới mỗi lần mở panel) hay đường TỰ LẤY MẪU
 *     (~15 phút/lần, thô hơn hẳn) - hai thứ trông giống nhau trên biểu đồ
 *     nhưng đáng tin khác nhau, không được để người đọc tự đoán.
 *   - Chỉ báo Schwab không quote được (NASDAQ Advance-Decline) hiện thành
 *     thẻ NÓI THẲNG "không có dữ liệu", không bị bỏ qua âm thầm - một ô
 *     trống trông giống app quên vẽ, một ô ghi rõ lý do thì không.
 *
 * /api/internals được gọi MỘT lần ở đây và đưa xuống CẢ HAI chế độ: từ #177
 * chế độ TradingView cũng có ba ô app (VIX, NYSE TICK, UVOL−DVOL) cộng hai
 * bảng ngành/top vốn hoá, nên "chỉ gọi khi xem Số liệu app" không còn tiết
 * kiệm được gì mà chỉ thành hai lượt gọi cho cùng một dữ liệu.
 */
const ORDER = [
  'uvolDvolDiff', 'advDeclNyse', 'nyseTick', 'nasdaqTick',
  'vix', 'pccEquity', 'pccTotal', 'marketTide', 'avgIvRank',
];

const VIEWS = ['tv', 'app'] as const;
type View = (typeof VIEWS)[number];

const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const signColor = (v: number) => ({ color: v >= 0 ? 'var(--credit)' : 'var(--risk)' });

/** Phần "Số liệu app": các thẻ dựng từ dữ liệu Schwab/tastytrade/UW CHÍNH
 *  APP đọc được - khác hẳn khung hình TradingView bên cạnh. */
function AppCards({ load, t }: { load: Load; t: (k: string, ...a: any[]) => string }) {
  if (load.state === 'error') return <p className="cap warnline">{load.expired ? t('int.expired') : `${t('int.loadFailed')} ${load.msg}`}</p>;
  if (load.state === 'loading') return <p className="cap">{t('int.loading')}</p>;
  const data = load.data;

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

/**
 * Hai bảng của trang mẫu, dựng từ rổ S&P 500 của chính app (cùng cache với
 * bản đồ nhiệt). Trang mẫu đặt chúng làm tooltip ĐÈ lên biểu đồ; ở đây
 * chúng đứng dưới lưới - một bảng che mất một phần biểu đồ là một bảng
 * người đọc phải đóng đi mới xem được cái bên dưới.
 */
function Tables({ data, t }: { data: Internals; t: (k: string, ...a: any[]) => string }) {
  const { sectors, topCaps, note } = data.tables;
  if (note) return <p className="cap warnline">{t('int.tablesFailed', note)}</p>;
  return (
    <div className="inttables">
      <div className="intcard">
        <p className="cap intlabel">{t('int.sectorsTitle')}</p>
        <table className="inttable">
          <tbody>
            {sectors.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td style={signColor(s.change)}>{pct(s.change)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="intcard">
        <p className="cap intlabel">{t('int.topCapsTitle')}</p>
        <table className="inttable">
          <tbody>
            {topCaps.map((r) => (
              <tr key={r.symbol}>
                <td>{r.symbol}</td>
                <td style={signColor(r.change)}>{pct(r.change)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cap" style={{ gridColumn: '1 / -1' }}>{t('int.tablesNote')}</p>
    </div>
  );
}

export default function InternalsPanel() {
  const { t } = useLang();
  // Mặc định 'tv' vì đó là thứ chủ app xin ("hiện giống ảnh"), nhưng nhớ
  // lựa chọn để ai thích số liệu app thì không phải gạt lại mỗi lần mở.
  const [view, setView] = useState<View>('tv');
  const [restored, setRestored] = useState(false);
  const [full, setFull] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    const saved = readRememberedOneOf<View>('internalsView', VIEWS);
    if (saved) setView(saved);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) remember('internalsView', view);
  }, [restored, view]);

  useEffect(() => {
    let alive = true;
    fetch('/api/internals')
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setLoad({ state: 'error', expired: r.status === 401, msg: String(j?.error ?? r.status) });
        else setLoad({ state: 'ok', data: j });
      })
      .catch((e) => alive && setLoad({ state: 'error', expired: false, msg: String(e?.message ?? e) }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className={full ? 'panel panelfull' : 'panel'}>
      <div
        className="panel-head"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <span>{t('int.title')}</span>
        <button className="rrgfullbtn" onClick={() => setFull((v) => !v)}>
          {full ? t('rrg.exitFullscreen') : t('rrg.fullscreen')}
        </button>
      </div>
      <div className="panel-body">
        <div className="segmented hmranges">
          <button className={view === 'tv' ? 'on' : undefined} onClick={() => setView('tv')}>
            {t('int.viewTv')}
          </button>
          <button className={view === 'app' ? 'on' : undefined} onClick={() => setView('app')}>
            {t('int.viewApp')}
          </button>
        </div>

        {/* Chỉ nói "đã đóng cửa" khi ĐÃ đo được giờ từ server; lúc chưa tải
            xong hoặc lỗi thì không nói gì - "chưa biết" không được đội lốt
            "đang mở". */}
        {load.state === 'ok' && !load.data.marketOpen && (
          <p className="cap warnline intclosed">{t('int.closed')}</p>
        )}

        {view === 'tv' ? <TradingViewInternals load={load} t={t} /> : <AppCards load={load} t={t} />}

        {load.state === 'ok' && <Tables data={load.data} t={t} />}
      </div>
    </section>
  );
}
