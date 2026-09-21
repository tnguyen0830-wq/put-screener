'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRememberedOneOf, remember } from '@/lib/remember';
import PatternChart, { type ChartData, type Detection } from './PatternChart';
import PatternRead from './PatternRead';

/**
 * Tab Patterns: quét mẫu hình nến/mẫu hình giá trên nến ngày cho watchlist
 * hoặc cả rổ, bảng mã có mẫu, và biểu đồ nến có vẽ mẫu cho mã được chọn
 * (hoặc mã gõ tay). Cùng khuôn `LongTermPanel` (stream NDJSON, kho lưu theo
 * người/phạm vi, câu "ảnh chụp, giá đã cũ" nguyên văn).
 */
type Row = {
  symbol: string; name: string; sector: string; price: number; lastBar: string; bars: number;
  detections: Detection[];
  nearestSupport: { price: number; distancePct: number; touches: number } | null;
  nearestResistance: { price: number; distancePct: number; touches: number } | null;
  volumeKnown: boolean;
  weight: number;
};
type Universe = 'watchlist' | 'sp500';
const UNIVERSES = ['watchlist', 'sp500'] as const;

const n2 = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));

export default function PatternsPanel({ onOpen }: { onOpen: (tab: string, sub?: string) => void }) {
  const { t } = useLang();
  const [universe, setUniverse] = useState<Universe>('watchlist');
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ scanned: number; kept: number; skipped: Record<string, number> } | null>(null);
  const [restored, setRestored] = useState(false);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [chart, setChart] = useState<ChartData | null>(null);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [chartBusy, setChartBusy] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    const u = readRememberedOneOf<Universe>('patUniverse', UNIVERSES);
    if (u) setUniverse(u);
  }, []);

  /* Nạp bản lưu của phạm vi đang chọn; không có thì XOÁ bảng (#144). */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/patterns/last?universe=${universe}`, { cache: 'no-store' });
        const j = await res.json();
        if (!alive || runningRef.current) return;
        if (j.scan) {
          setRows(j.scan.rows ?? []);
          setScannedAt(j.scan.at ?? null);
          setSummary({ scanned: j.scan.scanned, kept: j.scan.kept, skipped: j.scan.skipped ?? {} });
          setRestored(true);
        } else {
          setRows([]); setScannedAt(null); setSummary(null); setRestored(false);
          if (j.error) setErr(t('pat.error', String(j.error)));
        }
      } catch (e: any) {
        if (alive) setErr(t('pat.error', String(e?.message ?? e)));
      }
    })();
    return () => { alive = false; };
  }, [universe]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickUniverse = (u: Universe) => { setUniverse(u); remember('patUniverse', u); };

  const scan = useCallback(async () => {
    runningRef.current = true;
    setRunning(true); setErr(null); setRows([]); setSummary(null); setRestored(false); setScannedAt(null); setProg(null);
    try {
      const res = await fetch(`/api/patterns?universe=${universe}`, { cache: 'no-store' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const found: Row[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === 'phase') setProg(e.total ? { done: 0, total: e.total } : null);
          else if (e.type === 'progress') setProg({ done: e.done, total: e.total });
          else if (e.type === 'candidate') { found.push(e.row); setRows([...found]); }
          else if (e.type === 'error') setErr(e.message);
          else if (e.type === 'done') { setScannedAt(e.at); setSummary({ scanned: e.scanned, kept: e.kept, skipped: e.skipped ?? {} }); }
        }
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      runningRef.current = false;
      setRunning(false); setProg(null);
    }
  }, [universe]);

  const openChart = useCallback(async (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setSymbol(s); setChart(null); setChartErr(null); setChartBusy(true); setFocus(null);
    try {
      const res = await fetch(`/api/patterns/chart?symbol=${encodeURIComponent(s)}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setChartErr(j?.error === 'REAUTH_REQUIRED' ? t('pat.errExpired') : j?.error === 'NO_HISTORY' ? t('pat.chart.noHistory', s) : j?.error === 'BAD_SYMBOL' ? t('pat.chart.badSymbol') : t('pat.chart.err', `HTTP ${res.status}${j?.detail ? ` ${j.detail}` : ''}`));
        return;
      }
      setChart(j as ChartData);
    } catch (e: any) {
      setChartErr(t('pat.chart.err', String(e?.message ?? e)));
    } finally {
      setChartBusy(false);
    }
  }, [t]);

  const skippedText = summary && Object.keys(summary.skipped).length
    ? Object.entries(summary.skipped).map(([k, v]) => `${k === 'REAUTH_REQUIRED' ? t('pat.skipExpired') : k}: ${v}`).join(' · ')
    : '';

  return (
    <section className="patpanel">
      <p className="hint hint-lead">{t('pat.lead')}</p>

      <div className="segmented">
        <button className={universe === 'watchlist' ? 'on' : undefined} onClick={() => pickUniverse('watchlist')} disabled={running}>{t('pat.watchlist')}</button>
        <button className={universe === 'sp500' ? 'on' : undefined} onClick={() => pickUniverse('sp500')} disabled={running}>{t('pat.sp500')}</button>
      </div>
      {universe === 'sp500' && <p className="hint">{t('pat.sp500Note')}</p>}

      <button className="run" onClick={scan} disabled={running}>
        {running ? t('pat.scanning') : t('pat.scan')}
      </button>
      {running && <p className="hint">{t('pat.scanning')}{prog ? ` — ${prog.done}/${prog.total}` : ''}</p>}
      {err && <p className="hint hint-warn">{err.includes('REAUTH_REQUIRED') ? t('pat.errExpired') : t('pat.error', err)}</p>}
      {summary && (
        <p className="hint">
          {t('pat.summary', { scanned: summary.scanned, kept: summary.kept })}
          {scannedAt ? ` · ${new Date(scannedAt).toLocaleString()}` : ''}
          {skippedText ? ` · ${t('pat.skipped')} ${skippedText}` : ''}
        </p>
      )}
      {restored && scannedAt && !running && <p className="hint hint-warn">{t('pat.saved', Date.parse(scannedAt))}</p>}
      <p className="hint hint-warn">{t('pat.caveat')}</p>

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="pftable pattable">
            <thead>
              <tr>
                <th>{t('pat.col.symbol')}</th>
                <th>{t('pat.col.price')}</th>
                <th>{t('pat.col.patterns')}</th>
                <th>{t('pat.col.levels')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className={`ins-row${symbol === r.symbol ? ' lt-open' : ''}`} onClick={() => openChart(r.symbol)}>
                  <td>
                    <strong>{r.symbol}</strong>
                    {r.name && r.name !== r.symbol ? <div className="pfsub">{r.name}</div> : null}
                  </td>
                  <td>
                    {n2(r.price)}
                    <div className="pfsub">{r.lastBar}</div>
                  </td>
                  <td>
                    <div className="patchips">
                      {r.detections.map((d, i) => <Chip key={i} d={d} />)}
                    </div>
                  </td>
                  <td>
                    <div className="pfsub">{t('pat.nearS')} {r.nearestSupport ? `${n2(r.nearestSupport.price)} (−${n2(r.nearestSupport.distancePct, 1)}%)` : '—'}</div>
                    <div className="pfsub">{t('pat.nearR')} {r.nearestResistance ? `${n2(r.nearestResistance.price)} (+${n2(r.nearestResistance.distancePct, 1)}%)` : '—'}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!running && summary && rows.length === 0 && <p className="hint">{t('pat.empty')}</p>}

      <form className="addrow patsym" onSubmit={(e) => { e.preventDefault(); openChart(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('pat.symbolPh')} aria-label={t('pat.symbolPh')} />
        <button type="submit" className="aibtn" disabled={!input.trim() || chartBusy}>{t('pat.open')}</button>
      </form>

      {symbol && (
        <div className="ltdetailcard patdetail">
          <h3 className="learnh">{t('pat.chartTitle', symbol)}</h3>
          {chartBusy && <p className="hint">{t('pat.chart.loading')}</p>}
          {chartErr && <p className="hint hint-warn">{chartErr}</p>}
          {chart && (
            <>
              <PatternChart data={chart} focus={focus} />
              <p className="cap">{t('pat.chart.asOf', { bar: chart.row && (chart as any).row.lastBar, bars: chart.candles.length })}</p>
              {chart.row.detections.length ? (
                <ul className="patlist">
                  {chart.row.detections.map((d, i) => (
                    <li key={i} className={focus === i ? 'on' : undefined} onClick={() => setFocus(focus === i ? null : i)}>
                      <Chip d={d} />
                      <span className="patlv">
                        {d.levels.map((l) => `${t(`pat.level.${l.key}`)} ${n2(l.price)}`).join(' · ')}
                        {d.stats && 'volumeRatio' in d.stats ? ` · ${d.stats.volumeRatio === null ? t('pat.volUnknown') : t('pat.vol', n2(d.stats.volumeRatio, 2))}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">{t('pat.none')}</p>
              )}
              <p className="cap">
                {t('pat.nearS')} {(chart as any).row.nearestSupport ? `${n2((chart as any).row.nearestSupport.price)} (−${n2((chart as any).row.nearestSupport.distancePct, 1)}%, ${(chart as any).row.nearestSupport.touches}×)` : '—'}
                {' · '}
                {t('pat.nearR')} {(chart as any).row.nearestResistance ? `${n2((chart as any).row.nearestResistance.price)} (+${n2((chart as any).row.nearestResistance.distancePct, 1)}%, ${(chart as any).row.nearestResistance.touches}×)` : '—'}
                {!(chart as any).row.volumeKnown ? ` · ${t('pat.volUnknownAll')}` : ''}
              </p>
              <PatternRead facts={{
                symbol: chart.symbol,
                price: (chart as any).row.price,
                lastBar: (chart as any).row.lastBar,
                detections: chart.row.detections,
                nearestSupport: (chart as any).row.nearestSupport,
                nearestResistance: (chart as any).row.nearestResistance,
                volumeKnown: (chart as any).row.volumeKnown,
                trend: (chart as any).trend ?? null,
              }} />
            </>
          )}
        </div>
      )}

      <p className="cap patlearn">
        <button className="rrgfullbtn" onClick={() => onOpen('learn')}>{t('pat.learnLink')} →</button>
      </p>
    </section>
  );
}

function Chip({ d }: { d: Detection }) {
  const { t } = useLang();
  return (
    <span className={`patchip ${d.side}${d.confirmed ? ' sure' : ''}`} title={t(`pat.kind.${d.kind}`)}>
      {t(`pat.name.${d.id}`)}
      <em>{d.confirmed ? ' ✓' : ' …'}</em>
    </span>
  );
}
