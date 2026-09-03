'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Print = {
  trackingId: string;
  size: number | null;
  price: number | null;
  premium: number | null;
  executedAt: string;
  marketCenter: string | null;
  extendedHours: boolean;
  nbboBid: number | null;
  nbboAsk: number | null;
  /** Suy đoán từ giá khớp so với bid/ask - KHÔNG phải nhãn thật của UW
   *  (không tồn tại). Xem chú thích đầy đủ trong lib/darkpool.ts. */
  sideEstimate: 'buy' | 'sell' | 'neutral' | null;
};

type Row = {
  symbol: string;
  prints: Print[];
  totalPremium: number;
  lastPrintAt: string | null;
  buyVolume: number;
  sellVolume: number;
};

type Payload = {
  configured: boolean;
  rows: Row[];
  lookbackDays: number;
  minPremium: number;
  lastRun: {
    at: number;
    symbolsChecked: number;
    seen: number;
    saved: number;
    errors: string[];
  } | null;
  syncing: boolean;
  trackedCount: number;
  holdingsError: string | null;
  sp500Error: string | null;
};

const usd = (n: number | null) =>
  n === null
    ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function DarkpoolPanel() {
  const { t } = useLang();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/darkpool');
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
      const r = await fetch('/api/darkpool', { method: 'POST' });
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
        <div className="panel-head">{t('dp.title')}</div>
        <div className="panel-body">
          <p className="cap">{t('cg.notConfigured')}</p>
        </div>
      </section>
    );
  }

  const nothingTracked = data !== null && data.trackedCount === 0;

  return (
    <section className="panel">
      <div className="panel-head">{t('dp.title')}</div>
      <div className="panel-body">
        <p className="cap">{t('dp.intro', data?.minPremium ?? 1_000_000)}</p>
        <p className="cap">{t('dp.sideNote')}</p>
        <p className="cap">{t('dp.volNote')}</p>
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
        {data?.lastRun?.errors.length ? (
          <details className="rrgtable">
            <summary>
              {t('ins.errors')} ({data.lastRun.errors.length})
            </summary>
            <ul className="pfskipped">
              {data.lastRun.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
        ) : null}
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
            <strong>{t('dp.none')}</strong>
            <p className="cap">{t('dp.noneNote')}</p>
          </div>
        </div>
      ) : (
        <div className="tablewrap">
          <table className="pftable">
            <thead>
              <tr>
                <th>{t('ins.colSymbol')}</th>
                <th>{t('dp.colTotal')}</th>
                <th>{t('dp.colBuyVol')}</th>
                <th>{t('dp.colSellVol')}</th>
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
                      <td>{usd(r.totalPremium)}</td>
                      {/* Theo yêu cầu của người dùng: mua = xanh, bán = đỏ,
                          dù house rule ở nơi khác (ColorLegend.tsx) dành
                          xanh/đỏ riêng cho hướng số liệu thật - đây là lựa
                          chọn có chủ đích cho riêng ước lượng dark pool. */}
                      <td className={r.buyVolume > 0 ? 'good' : undefined}>
                        {r.buyVolume > 0 ? r.buyVolume.toLocaleString('en-US') : '—'}
                      </td>
                      <td className={r.sellVolume > 0 ? 'bad' : undefined}>
                        {r.sellVolume > 0 ? r.sellVolume.toLocaleString('en-US') : '—'}
                      </td>
                      <td>{r.lastPrintAt ? new Date(r.lastPrintAt).toLocaleDateString() : ''}</td>
                    </tr>
                    {open && (
                      <tr className="ins-expand-row">
                        <td colSpan={5}>
                          <p className="cap" style={{ margin: '0 0 4px' }}>
                            {r.symbol} — {r.prints.length}
                          </p>
                          <ul className="pfskipped">
                            {r.prints.map((p) => (
                              <li key={p.trackingId}>
                                <b>{usd(p.premium)}</b> · {p.size?.toLocaleString('en-US')}{' '}
                                {t('dp.shares')} @ {p.price}
                                {p.extendedHours && <span className="pfsub"> {t('dp.extHours')}</span>}
                                {/* Theo yêu cầu người dùng: mua = xanh, bán =
                                    đỏ, dù đây là suy đoán (ước lượng), không
                                    phải nhãn thật của UW - đã ghi rõ "(ước
                                    lượng)" trong chính chữ hiển thị và trong
                                    dp.sideNote phía trên bảng. */}
                                {p.sideEstimate && (
                                  <span
                                    className={
                                      p.sideEstimate === 'buy'
                                        ? 'pfsub good'
                                        : p.sideEstimate === 'sell'
                                          ? 'pfsub bad'
                                          : 'pfsub'
                                    }
                                  >
                                    {' '}
                                    {t(
                                      p.sideEstimate === 'buy'
                                        ? 'dp.sideBuy'
                                        : p.sideEstimate === 'sell'
                                          ? 'dp.sideSell'
                                          : 'dp.sideNeutral'
                                    )}
                                  </span>
                                )}
                                <span className="pfsub">
                                  {new Date(p.executedAt).toLocaleString()}
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
