'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Row = {
  id: string;
  kind: 'put' | 'stock';
  symbol: string;
  openedAt?: string;
  strike?: number;
  expiration?: string;
  contracts?: number;
  credit?: number;
  shares?: number;
  cost?: number;
  spot: number | null;
  changePct: number | null;
  /* put */
  mark?: number | null;
  delta?: number | null;
  creditTotal?: number;
  buyback?: number | null;
  pl: number | null;
  captured?: number | null;
  collateral?: number;
  dte?: number;
  daysHeld?: number | null;
  rocAnnual?: number | null;
  rocRemaining?: number | null;
  cushion?: number | null;
  itm?: boolean | null;
  nextEarnings?: string | null;
  /* stock */
  value?: number | null;
  costTotal?: number;
  plPct?: number | null;
};

type Summary = {
  putCount: number;
  stockCount: number;
  collateral: number;
  creditTotal: number;
  openPl: number;
  stockValue: number;
  itmCount: number;
  earningsCount: number;
  nearestDte: number | null;
  quoteError: string | null;
};

const usd = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: d });
const pct = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined ? '—' : `${(n * 100).toFixed(d)}%`;
const signed = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${usd(n, 0)}`;

/** Chỉ giữ lại phần người dùng đã nhập; số liệu thị trường không được ghi xuống. */
const raw = (r: Row) => ({
  id: r.id,
  kind: r.kind,
  symbol: r.symbol,
  openedAt: r.openedAt,
  strike: r.strike,
  expiration: r.expiration,
  contracts: r.contracts,
  credit: r.credit,
  shares: r.shares,
  cost: r.cost,
});

const BLANK = {
  kind: 'put' as 'put' | 'stock',
  symbol: '',
  strike: '',
  expiration: '',
  contracts: '1',
  credit: '',
  shares: '',
  cost: '',
  openedAt: '',
};

export default function PortfolioPanel() {
  const { t } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(BLANK);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/positions');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? t('pf.loadFailed'));
      setRows(j.rows ?? []);
      setSummary(j.summary ?? null);
      setError(null);
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // Định giá lại mỗi phút, cùng nhịp với thanh chỉ số.
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const save = async (list: ReturnType<typeof raw>[]) => {
    setSaving(true);
    try {
      const r = await fetch('/api/positions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions: list }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? t('pf.saveFailed'));
      // Số lượng trả về ít hơn số gửi đi nghĩa là có dòng bị loại vì thiếu số;
      // nói ra thay vì để người dùng tưởng đã lưu.
      if ((j.positions?.length ?? 0) < list.length) setError(t('pf.invalid'));
      else setError(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const entry: any = {
      kind: form.kind,
      symbol: form.symbol,
      openedAt: form.openedAt || undefined,
    };
    if (form.kind === 'put') {
      entry.strike = parseFloat(form.strike);
      entry.expiration = form.expiration;
      entry.contracts = parseInt(form.contracts, 10);
      entry.credit = parseFloat(form.credit);
    } else {
      entry.shares = parseFloat(form.shares);
      entry.cost = parseFloat(form.cost);
    }
    save([...(rows ?? []).map(raw), entry]);
    setForm({ ...BLANK, kind: form.kind, openedAt: form.openedAt });
  };

  const remove = (id: string) =>
    save((rows ?? []).filter((r) => r.id !== id).map(raw));

  const puts = (rows ?? []).filter((r) => r.kind === 'put');
  const stocks = (rows ?? []).filter((r) => r.kind === 'stock');

  return (
    <section className="panel">
      <div className="panel-head">{t('pf.title')}</div>
      <div className="panel-body">
        {error && <p className="cap warnline">{error}</p>}
        {summary?.quoteError && <p className="cap warnline">{t('pf.quoteError')}</p>}

        {summary && (rows?.length ?? 0) > 0 && (
          <dl className="stats">
            <div>
              <dt>{t('pf.openPl')}</dt>
              <dd className={summary.openPl >= 0 ? 'good' : 'bad'}>{signed(summary.openPl)}</dd>
            </div>
            <div>
              <dt>{t('pf.collateral')}</dt>
              <dd>{usd(summary.collateral, 0)}</dd>
            </div>
            <div>
              <dt>{t('pf.creditTotal')}</dt>
              <dd>{usd(summary.creditTotal, 0)}</dd>
            </div>
            <div>
              <dt>{t('pf.stockValue')}</dt>
              <dd>{usd(summary.stockValue, 0)}</dd>
            </div>
            <div>
              <dt>{t('pf.nearestDte')}</dt>
              <dd>{summary.nearestDte === null ? '—' : t('pf.days', summary.nearestDte)}</dd>
            </div>
            <div>
              <dt>{t('pf.attention')}</dt>
              <dd className={summary.itmCount || summary.earningsCount ? 'warn' : undefined}>
                {t('pf.attentionValue', {
                  itm: summary.itmCount,
                  earnings: summary.earningsCount,
                })}
              </dd>
            </div>
          </dl>
        )}

        {rows === null ? (
          <p className="cap">{t('pf.loading')}</p>
        ) : rows.length === 0 ? (
          <div className="empty">
            <strong>{t('pf.emptyTitle')}</strong>
            {t('pf.emptyBody')}
          </div>
        ) : null}

        {puts.length > 0 && (
          <>
            <h3 className="dsec">{t('pf.puts')}</h3>
            <div className="tablewrap">
              <table className="ratings pftable">
                <thead>
                  <tr>
                    <th>{t('pf.colSymbol')}</th>
                    <th>{t('pf.colStrike')}</th>
                    <th>{t('pf.colExp')}</th>
                    <th>{t('pf.colCredit')}</th>
                    <th>{t('pf.colNow')}</th>
                    <th>{t('pf.colPl')}</th>
                    <th>{t('pf.colCaptured')}</th>
                    <th>{t('pf.colCushion')}</th>
                    <th>{t('pf.colRoc')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {puts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.symbol}</b>
                        <span className="pfsub">
                          {usd(r.spot)}
                          {r.nextEarnings ? ` · ⚠ ${t('pf.earnings', r.nextEarnings)}` : ''}
                        </span>
                      </td>
                      <td>{usd(r.strike, 0)}</td>
                      <td>
                        {r.expiration}
                        <span className="pfsub">{t('pf.days', r.dte ?? 0)}</span>
                      </td>
                      <td>
                        {usd(r.credit)}
                        <span className="pfsub">×{r.contracts}</span>
                      </td>
                      <td>{usd(r.mark)}</td>
                      <td className={(r.pl ?? 0) >= 0 ? 'good' : 'bad'}>{signed(r.pl)}</td>
                      <td>{pct(r.captured, 0)}</td>
                      {/* Khoảng cách từ giá hiện tại xuống strike. Âm là đã vào
                          trong tiền, tức là đang đứng trước khả năng bị assign. */}
                      <td className={r.itm ? 'bad' : (r.cushion ?? 1) < 0.03 ? 'warn' : undefined}>
                        {pct(r.cushion, 1)}
                      </td>
                      {/* Con số chính là phần credit còn lại quy năm - thứ
                          quyết định giữ tiếp hay đóng sớm. Phần đã giữ được
                          quy năm chỉ hiện khi biết ngày mở và đã đủ lâu. */}
                      <td>
                        {pct(r.rocRemaining, 0)}
                        {r.rocAnnual !== null && r.rocAnnual !== undefined && (
                          <span className="pfsub">
                            {t('pf.heldSoFar', { days: r.daysHeld ?? 0, roc: pct(r.rocAnnual, 0) })}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="pfx"
                          title={t('pf.remove')}
                          disabled={saving}
                          onClick={() => remove(r.id)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {stocks.length > 0 && (
          <>
            <h3 className="dsec">{t('pf.shares')}</h3>
            <div className="tablewrap">
              <table className="ratings pftable">
                <thead>
                  <tr>
                    <th>{t('pf.colSymbol')}</th>
                    <th>{t('pf.colShares')}</th>
                    <th>{t('pf.colCost')}</th>
                    <th>{t('pf.colNow')}</th>
                    <th>{t('pf.colValue')}</th>
                    <th>{t('pf.colPl')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.symbol}</b></td>
                      <td>{r.shares}</td>
                      <td>{usd(r.cost)}</td>
                      <td>{usd(r.spot)}</td>
                      <td>{usd(r.value, 0)}</td>
                      <td className={(r.pl ?? 0) >= 0 ? 'good' : 'bad'}>
                        {signed(r.pl)}
                        <span className="pfsub">{pct(r.plPct, 1)}</span>
                      </td>
                      <td>
                        <button
                          className="pfx"
                          title={t('pf.remove')}
                          disabled={saving}
                          onClick={() => remove(r.id)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h3 className="dsec">{t('pf.add')}</h3>
        <form className="pfform" onSubmit={add}>
          <div className="segmented pfkind">
            <button
              type="button"
              className={form.kind === 'put' ? 'on' : undefined}
              onClick={() => setForm({ ...form, kind: 'put' })}
            >
              {t('pf.kindPut')}
            </button>
            <button
              type="button"
              className={form.kind === 'stock' ? 'on' : undefined}
              onClick={() => setForm({ ...form, kind: 'stock' })}
            >
              {t('pf.kindStock')}
            </button>
          </div>

          <label>
            <span>{t('pf.fSymbol')}</span>
            <input
              required
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              placeholder="AAPL"
            />
          </label>

          {form.kind === 'put' ? (
            <>
              <label>
                <span>{t('pf.fStrike')}</span>
                <input required type="number" step="0.5" min="0" value={form.strike}
                  onChange={(e) => setForm({ ...form, strike: e.target.value })} />
              </label>
              <label>
                <span>{t('pf.fExp')}</span>
                <input required type="date" value={form.expiration}
                  onChange={(e) => setForm({ ...form, expiration: e.target.value })} />
              </label>
              <label>
                <span>{t('pf.fContracts')}</span>
                <input required type="number" step="1" min="1" value={form.contracts}
                  onChange={(e) => setForm({ ...form, contracts: e.target.value })} />
              </label>
              <label>
                <span>{t('pf.fCredit')}</span>
                <input required type="number" step="0.01" min="0" value={form.credit}
                  onChange={(e) => setForm({ ...form, credit: e.target.value })} placeholder="1.85" />
              </label>
            </>
          ) : (
            <>
              <label>
                <span>{t('pf.fShares')}</span>
                <input required type="number" step="1" min="1" value={form.shares}
                  onChange={(e) => setForm({ ...form, shares: e.target.value })} />
              </label>
              <label>
                <span>{t('pf.fCost')}</span>
                <input required type="number" step="0.01" min="0" value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </label>
            </>
          )}

          {/* Để trống được: không nhớ ngày thì đừng đoán, những con số cần nó
              sẽ tự vắng mặt thay vì hiện ra sai. */}
          <label>
            <span>{t('pf.fOpened')}</span>
            <input type="date" value={form.openedAt}
              onChange={(e) => setForm({ ...form, openedAt: e.target.value })} />
            <em className="pfhint">{t('pf.openedHint')}</em>
          </label>

          <button type="submit" disabled={saving}>
            {saving ? t('pf.saving') : t('pf.save')}
          </button>
        </form>

        <p className="cap">{t('pf.note')}</p>
      </div>
    </section>
  );
}
