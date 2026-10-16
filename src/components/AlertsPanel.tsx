'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readJsonOrText } from '@/lib/fetchjson';
import {
  FALL_SESSIONS,
  MAX_LEVELS,
  NEAR_PCT,
  type PriceLevel,
  type SupportStatus,
  type SupportWatchRow,
} from '@/lib/pricealerts';
import type { PriceReport } from '@/lib/pricewatch';

/**
 * Tab Alerts: bảng "đang rớt gần hỗ trợ" (app tự tính) và bảng mức giá
 * người dùng tự đặt. Mọi con số do server tính trong vòng lặp cảnh báo;
 * tab này chỉ ĐỌC ảnh chụp và sửa danh sách mức của chính mình.
 *
 * Bốn trạng thái của bảng tự báo không được trông giống nhau: chưa có lượt
 * kiểm nào / lượt gần nhất ngoài giờ (bảng cũ) / lượt gần nhất hỏng (lý do
 * thật) / có bảng và không mã nào gần — cùng luật với mọi panel khác.
 */

type Payload = {
  user: string;
  role: 'owner' | 'member';
  rows: SupportWatchRow[];
  report: PriceReport | null;
  levels: PriceLevel[];
  last: Record<string, number | null>;
  channels: { telegram: boolean; webPush: boolean };
  loopAt: number | null;
  loopErrors: string[];
};

const money = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);

const STATUS_CLASS: Record<SupportStatus, string> = {
  near: 'pa-near',
  broken: 'pa-broken',
  ok: 'pa-ok',
  nozone: 'pa-none',
  noquote: 'pa-none',
};

export default function AlertsPanel() {
  const { t } = useLang();
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ symbol: '', price: '', note: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/pricealerts', { cache: 'no-store' });
      const j = await readJsonOrText(r);
      if (!j.ok) throw new Error(j.summary);
      if (!r.ok) throw new Error(j.json?.error || `HTTP ${r.status}`);
      setData(j.json as Payload);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const runNow = async () => {
    setBusy(true);
    setRunMsg(null);
    try {
      const r = await fetch('/api/pricealerts/run', { method: 'POST' });
      const j = await readJsonOrText(r);
      if (!j.ok) throw new Error(j.summary);
      if (!r.ok) throw new Error(j.json?.error || `HTTP ${r.status}`);
      setRunMsg(t('pa.runDone', { found: j.json.run?.found ?? 0, sent: j.json.run?.sent ?? 0 }));
      await load();
    } catch (e: any) {
      setRunMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const addLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setFormError(null);
    try {
      const r = await fetch('/api/pricealerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol: form.symbol, price: Number(form.price), note: form.note }),
      });
      const j = await readJsonOrText(r);
      if (!r.ok) {
        const code = j.ok ? j.json?.error : null;
        setFormError(
          code === 'TOO_MANY' ? t('pa.err.TOO_MANY', MAX_LEVELS)
          : code === 'BAD_SYMBOL' || code === 'BAD_PRICE' ? t(`pa.err.${code}`)
          : t('pa.err.http', r.status)
        );
        return;
      }
      setForm({ symbol: '', price: '', note: '' });
      await load();
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/pricealerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  };
  const rearm = async (id: string) => {
    await fetch('/api/pricealerts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  const rep = data?.report ?? null;

  return (
    <section className="panel pa">
      <div className="panel-head">{t('pa.title')}</div>
      <div className="panel-body">
        <p className="cap pa-intro">{t('pa.intro', { near: NEAR_PCT, fall: FALL_SESSIONS })}</p>
        {loadError && <p className="cap warnline">{t('pa.loadError', loadError)}</p>}
        {data && (
          <p className={`cap ${data.channels.telegram || data.channels.webPush ? '' : 'warnline'}`}>
            {t('pa.channels', { tg: data.channels.telegram, wp: data.channels.webPush })}
            {data.role === 'member' ? ` ${t('pa.memberNote')}` : ''}
          </p>
        )}

        <h3 className="pa-h">{t('pa.supportTitle')}</h3>
        {data && (
          <div className="pa-status">
            {rep ? (
              <p className={`cap ${!rep.ran && rep.marketOpen ? 'warnline' : ''}`}>
                {t('pa.lastRun', { at: rep.at, ran: rep.ran, open: rep.marketOpen })}{' '}
                {t('pa.counts', { sym: rep.symbols, quoted: rep.quoted, near: rep.near, broken: rep.broken })}
              </p>
            ) : (
              <p className="cap warnline">{t('pa.never')}</p>
            )}
            {rep?.quoteError && <p className="cap warnline">{t('pa.quoteError', rep.quoteError)}</p>}
            {rep?.heldError && <p className="cap warnline">{t('pa.heldError', rep.heldError)}</p>}
            {rep && rep.candleErrors.length > 0 && (
              <p className="cap warnline pa-wrap">
                {t('pa.candleErrors', rep.candleErrors.length)} {rep.candleErrors.slice(0, 6).join(' · ')}
                {rep.candleErrors.length > 6 ? ` … (+${rep.candleErrors.length - 6})` : ''}
              </p>
            )}
            {data.loopErrors.length > 0 && (
              <p className="cap warnline pa-wrap">{t('pa.loopErrors')} {data.loopErrors.join(' · ')}</p>
            )}
            {data.role === 'owner' && (
              <div className="pa-actions">
                <button className="run" onClick={runNow} disabled={busy}>
                  {busy ? t('pa.running') : t('pa.run')}
                </button>
                {runMsg && <span className="cap pa-runmsg">{runMsg}</span>}
              </div>
            )}
          </div>
        )}
        {data && rep && data.rows.length === 0 && <p className="cap">{t('pa.empty')}</p>}
        {data && data.rows.length > 0 && (
          <div className="tablewrap">
            <table className="pftable pa-table">
              <thead>
                <tr>
                  <th>{t('pa.col.symbol')}</th>
                  <th>{t('pa.col.status')}</th>
                  <th className="num">{t('pa.col.price')}</th>
                  <th className="num">{t('pa.col.chg', FALL_SESSIONS)}</th>
                  <th>{t('pa.col.zone')}</th>
                  <th className="num">{t('pa.col.dist')}</th>
                  <th className="num">{t('pa.col.touches')}</th>
                  <th>{t('pa.col.last')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.symbol} className={STATUS_CLASS[r.status]}>
                    <td className="sym">{r.symbol}</td>
                    <td>
                      <span className={`pa-chip ${STATUS_CLASS[r.status]}`}>{t(`pa.st.${r.status}`)}</span>
                    </td>
                    <td className="num">{money(r.price)}</td>
                    <td className={`num ${r.chgPct === null ? '' : r.chgPct < 0 ? 'bad' : 'good'}`}>{pct(r.chgPct)}</td>
                    <td>{r.zone ? `${money(r.zone.price)} (${money(r.zone.low)}–${money(r.zone.high)})` : '—'}</td>
                    <td className="num">{pct(r.distancePct)}</td>
                    <td className="num">{r.zone ? r.zone.touches : '—'}</td>
                    <td>{r.zone ? r.zone.lastTouch : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="pa-h">{t('pa.levelsTitle')}</h3>
        <p className="cap">{t('pa.levelsIntro')}</p>
        <form className="pa-form" onSubmit={addLevel}>
          <label>
            <span>{t('pa.form.symbol')}</span>
            <input
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              placeholder="AAPL"
              required
              maxLength={10}
            />
          </label>
          <label>
            <span>{t('pa.form.price')}</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="180.00"
              required
            />
          </label>
          <label className="pa-note">
            <span>{t('pa.form.note')}</span>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={80} />
          </label>
          <button className="run" type="submit" disabled={adding}>
            {adding ? t('pa.form.adding') : t('pa.form.add')}
          </button>
        </form>
        {formError && <p className="cap warnline">{formError}</p>}
        {data && data.levels.length === 0 && <p className="cap">{t('pa.noLevels')}</p>}
        {data && data.levels.length > 0 && (
          <>
            <div className="tablewrap">
              <table className="pftable pa-table">
                <thead>
                  <tr>
                    <th>{t('pa.col.symbol')}</th>
                    <th>{t('pa.col.dir')}</th>
                    <th className="num">{t('pa.col.level')}</th>
                    <th className="num">{t('pa.col.now')}</th>
                    <th className="num">{t('pa.col.gap')}</th>
                    <th>{t('pa.col.state')}</th>
                    <th>{t('pa.col.note')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.levels.map((l) => {
                    const now = data.last[l.symbol] ?? null;
                    const gap = now !== null && l.price > 0 ? ((now - l.price) / l.price) * 100 : null;
                    return (
                      <tr key={l.id}>
                        <td className="sym">{l.symbol}</td>
                        <td>{t(`pa.dir.${l.direction}`)}</td>
                        <td className="num">{money(l.price)}</td>
                        <td className="num">{money(now)}</td>
                        <td className="num">{pct(gap)}</td>
                        <td>
                          {l.hitAt ? (
                            <span className="pa-chip pa-broken">{t('pa.hit', { at: l.hitAt, p: l.hitPrice ?? 0 })}</span>
                          ) : (
                            <span className="pa-chip pa-ok">{t('pa.armed')}</span>
                          )}
                        </td>
                        <td className="pa-notecell">{l.note || '—'}</td>
                        <td className="pa-btns">
                          {l.hitAt && (
                            <button type="button" className="pa-small" onClick={() => rearm(l.id)}>
                              {t('pa.rearm')}
                            </button>
                          )}
                          <button type="button" className="pa-small" onClick={() => remove(l.id)}>
                            {t('pa.delete')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.levels.some((l) => (data.last[l.symbol] ?? null) === null) && (
              <p className="cap">{t('pa.noNow')}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
