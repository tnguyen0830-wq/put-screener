'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Alert = {
  id: string;
  type: string;
  strike: number | null;
  expiry: string | null;
  alertRule: string | null;
  hasSweep: boolean;
  hasFloor: boolean;
  hasMultileg: boolean;
  totalPremium: number | null;
  volume: number | null;
  openInterest: number | null;
  tradeCount: number | null;
  underlyingPrice: number | null;
  createdAt: string;
};

type Row = {
  symbol: string;
  alerts: Alert[];
  sweepCount: number;
  lastAlertAt: string | null;
};

type Payload = {
  configured: boolean;
  rows: Row[];
  lookbackDays: number;
  lastRun: { at: number; chunks: number; seen: number; saved: number; error: string | null } | null;
  syncing: boolean;
  trackedCount: number;
  holdingsError: string | null;
  sp500Error: string | null;
};

const usd = (n: number | null) =>
  n === null
    ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function OptionFlowPanel() {
  const { t } = useLang();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/optionflow');
      const j = await r.json();
      if (j.error) setError(String(j.error));
      else {
        setData(j);
        setError(null);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data?.syncing) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [data?.syncing, load]);

  const sync = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/optionflow', { method: 'POST' });
      const j = await r.json();
      if (j.error) setError(String(j.error));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    await load();
  }, [load]);

  if (data !== null && !data.configured) {
    return (
      <section className="panel">
        <div className="panel-head">{t('of.title')}</div>
        <div className="panel-body">
          <p className="cap">{t('cg.notConfigured')}</p>
        </div>
      </section>
    );
  }

  const nothingTracked = data !== null && data.trackedCount === 0;

  return (
    <section className="panel">
      <div className="panel-head">{t('of.title')}</div>
      <div className="panel-body">
        <p className="cap">{t('of.intro')}</p>
        <p className="cap">
          {data?.lastRun ? t('cg.lastRun', data.lastRun.at) : t('cg.neverRun')}{' '}
          {/* Chỉ hiện nút khi ĐÃ BIẾT chắc data.configured === true - xem
              chú thích trong CongressPanel.tsx cho lý do đầy đủ. */}
          {data?.configured === true && (
            <button onClick={sync} disabled={!!data?.syncing}>
              {data?.syncing ? t('cg.syncing') : t('cg.syncNow')}
            </button>
          )}
        </p>
        {error && <p className="cap warnline">{error}</p>}
        {data?.lastRun?.error && <p className="cap warnline">{data.lastRun.error}</p>}
      </div>

      {data === null && !error ? (
        <div className="panel-body">
          <p className="cap">…</p>
        </div>
      ) : nothingTracked ? (
        <div className="panel-body">
          <div className="empty">
            <strong>{t('ins.noneTracked')}</strong>
            <p className="cap">{t('ins.noneTrackedNote')}</p>
          </div>
        </div>
      ) : data && data.rows.length === 0 ? (
        <div className="panel-body">
          <div className="empty">
            <strong>{t('of.none')}</strong>
            <p className="cap">{t('of.noneNote')}</p>
          </div>
        </div>
      ) : (
        <div className="tablewrap">
          <table className="pftable">
            <thead>
              <tr>
                <th>{t('ins.colSymbol')}</th>
                <th>{t('of.colSweeps')}</th>
                <th>{t('cg.colLast')}</th>
              </tr>
            </thead>
            <tbody>
              {data!.rows.map((r) => {
                const open = expanded === r.symbol;
                return (
                  <Fragment key={r.symbol}>
                    <tr
                      className="ins-row"
                      onClick={() => setExpanded(open ? null : r.symbol)}
                      aria-expanded={open}
                    >
                      <td>
                        <b>{r.symbol}</b>
                      </td>
                      <td className={r.sweepCount > 0 ? 'good' : undefined}>{r.sweepCount}</td>
                      <td>{r.lastAlertAt ? new Date(r.lastAlertAt).toLocaleDateString() : ''}</td>
                    </tr>
                    {open && (
                      <tr className="ins-expand-row">
                        <td colSpan={3}>
                          <p className="cap" style={{ margin: '0 0 4px' }}>
                            {r.symbol} — {r.alerts.length}
                          </p>
                          <ul className="pfskipped">
                            {r.alerts.map((a) => (
                              <li key={a.id}>
                                <b>
                                  {a.type === 'put' ? t('of.put') : t('of.call')} {a.strike}
                                </b>{' '}
                                · {a.expiry} · {a.alertRule}
                                {a.hasSweep && <span className="pfsub good"> {t('of.sweep')}</span>}
                                {a.hasFloor && <span className="pfsub"> {t('of.floor')}</span>}
                                <span className="pfsub">
                                  {usd(a.totalPremium)} · {t('of.oi')}: {a.openInterest ?? '—'} ·{' '}
                                  {new Date(a.createdAt).toLocaleString()}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
