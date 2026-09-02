'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Trade = {
  key: string;
  politicianId: string;
  name: string;
  chamber: string | null;
  issuer: string | null;
  txnType: string;
  /** Chuỗi khoảng tiền nguyên văn kiểu STOCK Act - KHÔNG phải số chính
   *  xác, luật chỉ cho khai khoảng. */
  amounts: string | null;
  transactionDate: string;
  filedAtDate: string | null;
  notes: string | null;
};

type Row = {
  symbol: string;
  trades: Trade[];
  traderCount: number;
  lastTradeDate: string | null;
};

type Payload = {
  configured: boolean;
  rows: Row[];
  lookbackDays: number;
  lastRun: {
    at: number;
    pagesRead: number;
    seen: number;
    saved: number;
    error: string | null;
  } | null;
  syncing: boolean;
  trackedCount: number;
  holdingsError: string | null;
  sp500Error: string | null;
};

/** house/senate -> chữ hiển thị. Giữ nguyên chuỗi gốc nếu UW đổi giá trị,
 *  đừng biến mất chỉ vì gặp giá trị lạ. */
function chamber(t: (k: string) => string, raw: string | null): string {
  if (raw === 'house') return t('cg.house');
  if (raw === 'senate') return t('cg.senate');
  return raw ?? '';
}

export default function CongressPanel() {
  const { t } = useLang();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/congress');
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
      const r = await fetch('/api/congress', { method: 'POST' });
      const j = await r.json();
      if (j.error) setError(String(j.error));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    await load();
  }, [load]);

  // Tính năng trả phí, tự tắt khi thiếu UW_API_KEY - giống hệt Telegram/
  // web push: không có biến môi trường thì coi như tính năng không tồn
  // tại, không phải lỗi để người dùng lo lắng.
  if (data !== null && !data.configured) {
    return (
      <section className="panel">
        <div className="panel-head">{t('cg.title')}</div>
        <div className="panel-body">
          <p className="cap">{t('cg.notConfigured')}</p>
        </div>
      </section>
    );
  }

  const nothingTracked = data !== null && data.trackedCount === 0;

  return (
    <section className="panel">
      <div className="panel-head">{t('cg.title')}</div>
      <div className="panel-body">
        <p className="cap">{t('cg.intro')}</p>

        <p className="cap">
          {data?.lastRun ? t('cg.lastRun', data.lastRun.at) : t('cg.neverRun')}{' '}
          {/* Chỉ hiện nút khi ĐÃ BIẾT chắc data.configured === true - lúc
              data còn null (đang tải lần đầu), !data.configured phía dưới
              chưa kịp chặn vì nó đòi data !== null, nên nút sẽ lộ ra một
              nhịp trước khi biết có cấu hình UW_API_KEY hay không. */}
          {data?.configured === true && (
            <button onClick={sync} disabled={!!data?.syncing}>
              {data?.syncing ? t('cg.syncing') : t('cg.syncNow')}
            </button>
          )}
        </p>

        {error && <p className="cap warnline">{error}</p>}
        {data?.holdingsError && (
          <p className="cap warnline">
            {t('cg.holdingsError')} <code>{data.holdingsError}</code>
          </p>
        )}
        {data?.lastRun?.error && (
          <p className="cap warnline">{data.lastRun.error}</p>
        )}
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
            <strong>{t('cg.none')}</strong>
            <p className="cap">{t('cg.noneNote')}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="panel-body" style={{ paddingBottom: 0 }}>
            <p className="cap">{t('cg.lookback', data?.lookbackDays ?? 90)}</p>
          </div>
          <div className="tablewrap">
            <table className="pftable">
              <thead>
                <tr>
                  <th>{t('ins.colSymbol')}</th>
                  <th>{t('cg.colTraders')}</th>
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
                        <td>{r.traderCount}</td>
                        <td>{r.lastTradeDate}</td>
                      </tr>
                      {open && (
                        <tr className="ins-expand-row">
                          <td colSpan={3}>
                            <p className="cap" style={{ margin: '0 0 4px' }}>
                              {r.symbol} — {t('cg.colWho')} ({r.trades.length})
                            </p>
                            <ul className="pfskipped">
                              {r.trades.map((tr) => (
                                <li key={tr.key}>
                                  <b>{tr.name}</b>
                                  {tr.chamber ? ` — ${chamber(t, tr.chamber)}` : ''}
                                  {tr.issuer && tr.issuer !== 'self'
                                    ? ` (${tr.issuer})`
                                    : ''}{' '}
                                  · {tr.txnType} · {tr.transactionDate}
                                  {tr.amounts ? ` · ${tr.amounts}` : ''}
                                  {tr.notes ? (
                                    <span className="pfsub">{tr.notes}</span>
                                  ) : null}
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
        </>
      )}
    </section>
  );
}
