'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Buy = {
  accessionNumber: string;
  filingDate: string;
  ownerName: string;
  title: string;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  shares: number;
  value: number | null;
  url: string;
};

type Row = {
  symbol: string;
  buys: Buy[];
  buyerCount: number;
  totalValue: number | null;
  clusterBuy: boolean;
  lastBuyDate: string | null;
  checkedAt: number | null;
  lastError: string | null;
  unavailable: 'never-checked' | 'no-filer' | 'fetch-failed' | null;
};

/** Máy chủ trả về mã, màn hình mới dịch — nếu không thì câu tiếng Việt
 *  cứng trong lib sẽ lọt thẳng ra giao diện tiếng Anh. */
const REASON: Record<NonNullable<Row['unavailable']>, string> = {
  'no-filer': 'ins.unavail.noFiler',
  'never-checked': 'ins.unavail.neverChecked',
  'fetch-failed': 'ins.unavail.fetchFailed',
};

type Payload = {
  rows: Row[];
  lookbackDays: number;
  clusterMinBuyers: number;
  lastRun: {
    at: number;
    checked: number;
    fetched: number;
    symbols: number;
    errors: string[];
    holdingsError: string | null;
  } | null;
  holdingsError: string | null;
};

const usd = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

/** "Chief Executive Officer" đọc trên điện thoại thì dài quá. */
function role(b: Buy, t: (k: string, v?: any) => string): string {
  if (b.title) return b.title;
  const parts: string[] = [];
  if (b.isOfficer) parts.push('Officer');
  if (b.isDirector) parts.push('Director');
  if (b.isTenPercentOwner) parts.push('10%');
  return parts.join(' · ');
}

export default function InsiderPanel() {
  const { t } = useLang();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/insiders');
      const j = await r.json();
      if (j.error) setError(String(j.error));
      else setData(j);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const r = await fetch('/api/insiders?force=1', { method: 'POST' });
      const j = await r.json();
      if (j.error) setError(String(j.error));
      await load();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const withBuys = data?.rows.filter((r) => r.buys.length > 0) ?? [];
  // Mã không có dữ liệu tách hẳn xuống dưới, KHÔNG trộn vào bảng chính:
  // "đã hỏi, không ai mua" và "chưa hỏi được" mà nằm cạnh nhau trong cùng
  // một bảng trống thì đọc y hệt nhau.
  const unknown = data?.rows.filter((r) => r.unavailable !== null) ?? [];

  return (
    <section className="panel">
      <div className="panel-head">{t('ins.title')}</div>
      <div className="panel-body">
        <p className="cap">{t('ins.intro')}</p>
        <p className="cap">{t('ins.clusterNote', data?.clusterMinBuyers ?? 2)}</p>

        <p className="cap">
          {data?.lastRun
            ? t('ins.lastRun', data.lastRun.at)
            : t('ins.neverRun')}{' '}
          <button onClick={sync} disabled={syncing}>
            {syncing ? t('ins.syncing') : t('ins.syncNow')}
          </button>
        </p>

        {data?.lastRun && (
          <p className="cap">
            {t('ins.syncDone', data.lastRun)}{' '}
            {t('ins.scope', data.lastRun.symbols)}
          </p>
        )}

        {error && <p className="cap warnline">{error}</p>}
        {data?.holdingsError && (
          <p className="cap warnline">
            {t('ins.holdingsError')} <code>{data.holdingsError}</code>
          </p>
        )}
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
      ) : withBuys.length === 0 ? (
        <div className="panel-body">
          <div className="empty">
            <strong>{t('ins.none')}</strong>
            <p className="cap">{t('ins.noneNote')}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="panel-body" style={{ paddingBottom: 0 }}>
            <p className="cap">{t('ins.lookback', data?.lookbackDays ?? 90)}</p>
          </div>
          {/* .pftable đặt min-width 640px cho khỏi bẹp chữ, nên trên
              điện thoại nó phải tự cuộn ngang trong khung của mình -
              cả trang mà cuộn ngang theo thì hỏng. Cột mã được ghim lại
              sẵn trong globals.css. */}
          <div className="tablewrap">
          <table className="pftable">
            <thead>
              <tr>
                <th>{t('ins.colSymbol')}</th>
                <th>{t('ins.colBuyers')}</th>
                <th>{t('ins.colValue')}</th>
                <th>{t('ins.colLast')}</th>
              </tr>
            </thead>
            <tbody>
              {withBuys.map((r) => (
                <tr key={r.symbol}>
                  <td>
                    <b>{r.symbol}</b>
                    {r.clusterBuy && (
                      <span className="pfsub good">{t('ins.cluster')}</span>
                    )}
                  </td>
                  <td className={r.clusterBuy ? 'good' : undefined}>
                    {r.buyerCount}
                  </td>
                  <td>
                    {r.totalValue === null ? (
                      <span className="pfsub">{t('ins.noPrice')}</span>
                    ) : (
                      usd(r.totalValue)
                    )}
                  </td>
                  <td>{r.lastBuyDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="panel-body">
            {withBuys.map((r) => (
              <details key={`who-${r.symbol}`} className="rrgtable">
                <summary>
                  {r.symbol} — {t('ins.colWho')} ({r.buys.length})
                </summary>
                <ul className="pfskipped">
                  {r.buys.map((b) => (
                    <li key={b.accessionNumber}>
                      <b>{b.ownerName}</b>
                      {role(b, t) ? ` — ${role(b, t)}` : ''} · {b.filingDate} ·{' '}
                      {t('ins.shares', b.shares)}
                      {b.value !== null ? ` · ${usd(b.value)}` : ` · ${t('ins.noPrice')}`}{' '}
                      <a href={b.url} target="_blank" rel="noreferrer">
                        {t('ins.viewFiling')}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </>
      )}

      {unknown.length > 0 && (
        <div className="panel-body">
          <h3>{t('ins.unavailableHead')}</h3>
          <p className="cap warnline">{t('ins.unavailableNote')}</p>
          <ul className="pfskipped">
            {unknown.map((r) => (
              <li key={`unk-${r.symbol}`}>
                <b>{r.symbol}</b> — {t(REASON[r.unavailable!])}
                {/* Lời của chính SEC, giữ nguyên văn: "403" và "không tìm
                    thấy" là hai chuyện phải sửa bằng hai cách khác nhau. */}
                {r.lastError && <span className="pfsub">{r.lastError}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
