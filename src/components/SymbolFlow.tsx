'use client';

import { useMemo, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { summarizeFlow, FLOW_DAYS, type UwContext } from '@/lib/uwsummary';
import FlowTable, { money } from './FlowTable';

/** Vẽ nhiều nhất chừng này dòng — 600 dòng một lúc làm trang điện thoại ì,
 *  và con số bị ẩn được NÓI RA, không cắt im lặng. */
const RENDER_CAP = 100;

/**
 * Options Flow của MỘT mã, ngay trong tab Analyze — chủ app: *"Flow nữa"*.
 *
 * Cùng dữ liệu `/api/analyze/uw` mà Claude đọc (không thêm request UW nào),
 * cùng hàm tóm tắt (`summarizeFlow`) và cùng bảng với tab Live Flow
 * (`FlowTable`). Hai thanh theo ngày và theo kỳ hạn dùng MỘT thang chung
 * cho mọi hàng — thang riêng từng hàng thì ngày $50K vẽ dài bằng ngày $5M
 * (luật của tab Options Flow, #125).
 */
export default function SymbolFlow({ uw, loading }: { uw: UwContext | null; loading: boolean }) {
  const { t } = useLang();
  const [sort, setSort] = useState<'time' | 'premium'>('time');
  const f = useMemo(() => (uw && uw.configured && !uw.flow.error ? summarizeFlow(uw.flow.data) : null), [uw]);

  const rows = useMemo(() => {
    if (!uw || !f) return [];
    const cutoff = Date.now() - FLOW_DAYS * 86_400_000;
    const r = uw.flow.data.filter((x) => Date.parse(x.at) >= cutoff);
    return sort === 'premium'
      ? [...r].sort((a, b) => (b.premium ?? 0) - (a.premium ?? 0))
      : [...r].sort((a, b) => b.at.localeCompare(a.at));
  }, [uw, f, sort]);

  const head = <h3 className="dsec">{t('sf.title', FLOW_DAYS)}</h3>;

  if (loading && !uw) return <section className="symflow">{head}<p className="cap">{t('uw.loading')}</p></section>;
  if (!uw) return null;
  if (!uw.configured) return <section className="symflow">{head}<p className="cap">{t('sf.off')}</p></section>;
  if (uw.flow.error)
    return (
      <section className="symflow">
        {head}
        <p className="hint hint-warn uwerr">{t('uw.err', uw.flow.error)}</p>
      </section>
    );
  if (!f || !f.alerts)
    return (
      <section className="symflow">
        {head}
        <p className="cap">{t('uw.flowNone', FLOW_DAYS)}</p>
      </section>
    );

  const bar = (call: number, put: number, max: number) => {
    const total = call + put;
    const callPct = total > 0 ? (call / total) * 100 : 0;
    return (
      <div className="ofbar" style={{ width: `${Math.max((total / max) * 100, 4)}%` }}>
        <i className="ofbar-call" style={{ width: `${callPct}%` }} />
        <i className="ofbar-put" style={{ width: `${100 - callPct}%` }} />
      </div>
    );
  };
  const maxDay = Math.max(1, ...f.byDay.map((d) => d.call + d.put));
  const maxDte = Math.max(1, ...f.byDte.map((d) => d.call + d.put));
  const total = f.callPremium + f.putPremium;

  return (
    <section className="symflow">
      {head}
      <p className="cap">
        {t('sf.lead', [f.alerts, money(f.callPremium), money(f.putPremium)])}
        {uw.flow.pages && uw.flow.pages > 1 ? ` ${t('sf.pages', uw.flow.pages)}` : ''}
      </p>
      {uw.flow.capped && <p className="hint hint-warn">{t('sf.capped', FLOW_DAYS)}</p>}

      <div className="sfbar">
        {bar(f.callPremium, f.putPremium, Math.max(1, total))}
        <span className="ofsplit">
          {t('uw.flowSides', [money(f.callAsk), money(f.callBid), money(f.putAsk), money(f.putBid)])}
        </span>
        <span className="ofsplit">{t('uw.flowFlags', [f.sweeps, f.newPositions, f.multileg])}</span>
        {f.otherSide > 0 && <span className="ofsplit">{t('sf.other', money(f.otherSide))}</span>}
      </div>

      <div className="sfgrid">
        <table className="sftable">
          <thead>
            <tr>
              <th>{t('sf.day')}</th>
              <th className="num">Call</th>
              <th className="num">Put</th>
              <th className="sfbarcol" />
            </tr>
          </thead>
          <tbody>
            {f.byDay.map((d) => (
              <tr key={d.day}>
                <td>{d.day.slice(5)}</td>
                <td className="num">{money(d.call)}</td>
                <td className="num">{money(d.put)}</td>
                <td className="sfbarcol">{bar(d.call, d.put, maxDay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="sftable">
          <thead>
            <tr>
              <th>{t('sf.dte')}</th>
              <th className="num">Call</th>
              <th className="num">Put</th>
              <th className="sfbarcol" />
            </tr>
          </thead>
          <tbody>
            {f.byDte.map((d) => (
              <tr key={d.bucket}>
                <td>{d.bucket === '?' ? '?' : `${d.bucket}d`}</td>
                <td className="num">{money(d.call)}</td>
                <td className="num">{money(d.put)}</td>
                <td className="sfbarcol">{bar(d.call, d.put, maxDte)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cap">
        <i className="sfkey sfkey-call" /> Call · <i className="sfkey sfkey-put" /> Put · {t('sf.scale')}
      </p>

      <div className="chiprow" role="group">
        {(['time', 'premium'] as const).map((k) => (
          <button key={k} type="button" className={sort === k ? 'on' : ''} aria-pressed={sort === k} onClick={() => setSort(k)}>
            {t(k === 'time' ? 'sf.sortTime' : 'sf.sortPrem')}
          </button>
        ))}
      </div>
      <FlowTable rows={rows.slice(0, RENDER_CAP)} showTicker={false} />
      {rows.length > RENDER_CAP && <p className="cap">{t('sf.more', [RENDER_CAP, rows.length])}</p>}
      <p className="cap">{t('uw.caveat')}</p>
    </section>
  );
}
