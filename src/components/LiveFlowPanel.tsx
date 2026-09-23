'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRemembered, readRememberedOneOf, remember } from '@/lib/remember';
import { readJsonOrText } from '@/lib/fetchjson';
import { filterRows, sideCounts, type FlowSide, type LiveRow } from '@/lib/liveflow';
import ChipRow from './ChipRow';

type Payload =
  | { configured: false }
  | {
      configured: true;
      rows: LiveRow[];
      fetchedAt: number | null;
      now: number;
      marketOpen: boolean;
      error: string | null;
      errorAt: number | null;
      pageFull: boolean;
      sampleKeys: string[];
      lastBatch: number;
      unparsed: number;
      ttlMs: number;
    };

/** Nhịp hỏi của trình duyệt. Server tự giữ bộ đệm 10 giây, nên hỏi nhanh hơn
 *  cũng không tốn thêm request UW nào — chỉ tốn một vòng mạng tới app. */
const POLL_MS = 5_000;

const SIDES: FlowSide[] = ['ask', 'bid', 'mid', 'mixed', 'unknown'];
const TYPES = ['call', 'put'] as const;
const MINS = [0, 25_000, 100_000, 500_000, 1_000_000] as const;

const money = (n: number | null) => {
  if (n === null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};
const px = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);
const int = (n: number | null) => (n === null ? '—' : Math.round(n).toLocaleString('en-US'));

/** Giờ New York — đúng giờ sàn, không theo múi giờ của máy đang xem. */
function nyTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(t));
}
function nyDayShort(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t));
}

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  return raw.split(',').filter((x): x is T => (allowed as readonly string[]).includes(x));
}

export default function LiveFlowPanel() {
  const { t } = useLang();
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [ticker, setTicker] = useState('');
  const [sides, setSides] = useState<FlowSide[]>([]);
  const [types, setTypes] = useState<('call' | 'put')[]>([]);
  const [minPrem, setMinPrem] = useState<number>(0);
  /** id đã thấy ở lượt trước — dòng MỚI được tô sáng một nhịp, như màn UW. */
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    setTicker(readRemembered('lfTicker') ?? '');
    setSides(parseList(readRemembered('lfSides'), SIDES));
    setTypes(parseList(readRemembered('lfTypes'), TYPES));
    const m = readRememberedOneOf('lfMin', MINS.map(String));
    if (m) setMinPrem(Number(m));
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/liveflow', { cache: 'no-store' });
      const body = await readJsonOrText(r);
      if (!body.ok) {
        setErr(body.summary);
        return;
      }
      if (!r.ok) {
        setErr(`HTTP ${r.status}${body.json?.error ? ` · ${body.json.error}` : ''}`);
        return;
      }
      const p = body.json as Payload;
      if (p.configured) {
        const prev = seen.current;
        const ids = new Set(p.rows.map((x) => x.id));
        // Lượt đầu không tô gì: cả bảng "mới" thì chẳng dòng nào nổi bật.
        setFresh(prev ? new Set(p.rows.filter((x) => !prev.has(x.id)).map((x) => x.id)) : new Set());
        seen.current = ids;
      }
      setData(p);
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (paused) return;
    // Chỉ hỏi khi tab trình duyệt đang HIỆN — cửa sổ bỏ quên trong nền không
    // cần luồng sống, và quay lại là hỏi ngay.
    const tick = () => {
      if (document.visibilityState === 'visible') load();
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [paused, load]);

  const rows = data && data.configured ? data.rows : [];
  const shown = useMemo(
    () => filterRows(rows, { ticker, sides, types, minPremium: minPrem }),
    [rows, ticker, sides, types, minPrem]
  );
  const counts = useMemo(() => sideCounts(rows), [rows]);
  const allUnknown = rows.length > 0 && counts.unknown === rows.length;
  const fromPremium = rows.some((r) => r.sideSource === 'premium');

  if (data && !data.configured) {
    return (
      <section className="panel">
        <div className="panel-head">Live Flow</div>
        <div className="panel-body">
          <p className="cap">{t('lf.notConfigured')}</p>
        </div>
      </section>
    );
  }

  const live = !paused && data?.configured && data.marketOpen;

  return (
    <section className="panel liveflow">
      <div className="panel-head lfhead">
        <span>Live Flow</span>
        <span className={`lfstatus${live ? ' on' : ''}`}>
          <i className="lfdot" />
          {paused ? t('lf.paused') : data?.configured && !data.marketOpen ? t('lf.closedShort') : t('lf.live')}
          {data?.configured && data.fetchedAt ? ` · ${nyTime(new Date(data.fetchedAt).toISOString())} ET` : ''}
        </span>
      </div>
      <div className="panel-body">
        <p className="cap">{t('lf.intro')}</p>

        <div className="lftools">
          <div className="segmented lfplay">
            <button className={!paused ? 'on' : undefined} onClick={() => setPaused(false)}>
              ▶ {t('lf.live')}
            </button>
            <button className={paused ? 'on' : undefined} onClick={() => setPaused(true)}>
              ❚❚ {t('lf.pause')}
            </button>
          </div>
          <input
            className="lfticker"
            value={ticker}
            placeholder={t('lf.tickerPh')}
            onChange={(e) => {
              setTicker(e.target.value);
              remember('lfTicker', e.target.value);
            }}
          />
        </div>

        <ChipRow
          label={t('lf.side')}
          note={sides.length ? t('lf.sideOn') : t('lf.sideOff')}
          options={SIDES.map((s) => ({ value: s, label: t(`lf.side.${s}`) }))}
          value={sides}
          onChange={(v) => {
            setSides(v);
            remember('lfSides', v.join(','));
          }}
        />
        <ChipRow
          label={t('lf.type')}
          note={types.length ? t('lf.typeOn') : t('lf.typeOff')}
          options={TYPES.map((s) => ({ value: s, label: s === 'call' ? 'Calls' : 'Puts' }))}
          value={types}
          onChange={(v) => {
            setTypes(v);
            remember('lfTypes', v.join(','));
          }}
        />
        <div className="field">
          <label>{t('lf.minPrem')}</label>
          <div className="chiprow">
            {MINS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={minPrem === m}
                className={minPrem === m ? 'on' : undefined}
                onClick={() => {
                  setMinPrem(m);
                  remember('lfMin', String(m));
                }}
              >
                {m === 0 ? t('lf.minAll') : `≥ ${money(m)}`}
              </button>
            ))}
          </div>
        </div>

        <p className="hint hint-warn">{t('lf.caveat')}</p>
        {data?.configured && !data.marketOpen && <p className="cap warnline">{t('lf.closed')}</p>}
        {err && <p className="cap warnline">{t('lf.fetchErr', err)}</p>}
        {data?.configured && data.error && (
          <p className="cap warnline">
            {t('lf.uwErr', data.error)}
            {data.rows.length ? ` ${t('lf.keptOld')}` : ''}
          </p>
        )}
        {data?.configured && data.pageFull && data.marketOpen && <p className="hint">{t('lf.pageFull', data.lastBatch)}</p>}
        {allUnknown && (
          <p className="cap warnline lfkeys">
            {t('lf.noSide')} <code>{data?.configured ? data.sampleKeys.join(', ') : ''}</code>
          </p>
        )}
        {fromPremium && <p className="hint">{t('lf.sidePremium')}</p>}
        {data?.configured && data.unparsed > 0 && (
          <p className="hint hint-warn lfkeys">
            {t('lf.unparsed', data.unparsed)} <code>{data.sampleKeys.join(', ')}</code>
          </p>
        )}

        <p className="hint">
          {t('lf.count', { shown: shown.length, total: rows.length })} · ASK {counts.ask} · BID {counts.bid}
          {counts.mid ? ` · MID ${counts.mid}` : ''}
          {counts.mixed ? ` · ${t('lf.side.mixed')} ${counts.mixed}` : ''}
          {counts.unknown ? ` · ? ${counts.unknown}` : ''}
        </p>

        {!data ? (
          <p className="cap">…</p>
        ) : rows.length === 0 ? (
          <div className="empty">
            <p className="cap">{data.configured && data.error ? t('lf.emptyErr') : t('lf.empty')}</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <p className="cap">{t('lf.emptyFiltered')}</p>
          </div>
        ) : (
          <div className="tablewrap">
            <table className="pftable lftable">
              <thead>
                <tr>
                  <th>{t('lf.col.time')}</th>
                  <th>{t('lf.col.ticker')}</th>
                  <th>{t('lf.col.side')}</th>
                  <th className="num">Strike</th>
                  <th>C/P</th>
                  <th>{t('lf.col.expiry')}</th>
                  <th className="num">DTE</th>
                  <th className="num">{t('lf.col.spot')}</th>
                  <th className="num">Bid - Ask</th>
                  <th className="num">{t('lf.col.fill')}</th>
                  <th>{t('lf.col.fillSpread')}</th>
                  <th className="num">Size</th>
                  <th className="num">Premium</th>
                  <th className="num">Vol</th>
                  <th className="num">OI</th>
                  <th>{t('lf.col.flags')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={fresh.has(r.id) ? 'lfnew' : undefined}>
                    <td className="lftime">
                      <span className="lfday">{nyDayShort(r.at)}</span> {nyTime(r.at)}
                    </td>
                    <td className="lftk">{r.ticker || '—'}</td>
                    <td className={`lfside lfside-${r.side}`} title={r.sideSource === 'premium' ? t('lf.sidePremium') : undefined}>
                      {r.side === 'unknown' ? '?' : t(`lf.side.${r.side}`).toUpperCase()}
                    </td>
                    <td className="num">{r.strike ?? '—'}</td>
                    <td className={`lftype lftype-${r.type}`}>{r.type === 'other' ? '?' : r.type}</td>
                    <td>{r.expiry ?? '—'}</td>
                    <td className="num">{r.dte === null ? '—' : `${r.dte}d`}</td>
                    <td className="num">{px(r.spot)}</td>
                    <td className="num">
                      {r.bid === null && r.ask === null ? '—' : `${px(r.bid)} - ${px(r.ask)}`}
                    </td>
                    <td className="num">{px(r.price)}</td>
                    <td>
                      {r.fillPos === null ? (
                        <span className="hint">—</span>
                      ) : (
                        <span
                          className={`lfspread${r.outside ? ' out' : ''}`}
                          title={r.outside ? t('lf.outside') : undefined}
                        >
                          <i style={{ left: `${(r.fillPos * 100).toFixed(1)}%` }} />
                        </span>
                      )}
                    </td>
                    <td className="num">{int(r.size)}</td>
                    <td className="num lfprem">{money(r.premium)}</td>
                    <td className="num">{int(r.volume)}</td>
                    <td className="num">{int(r.openInterest)}</td>
                    <td className="lfflags">
                      {[r.sweep && 'Sweep', r.floor && 'Floor', r.multileg && 'Multi-leg', r.rule]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
