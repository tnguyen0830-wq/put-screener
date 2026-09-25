'use client';

import { useMemo, useState } from 'react';
import { useLang } from '@/lib/i18n';
import {
  summarizeFlow,
  flowTrend,
  FLOW_DAYS,
  TREND_MIN_ALERTS,
  TREND_RATIO,
  TREND_SHIFT,
  type FlowTrend,
  type TrendHalf,
  type UwContext,
} from '@/lib/uwsummary';
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
  const tr = useMemo(() => (uw && uw.configured && !uw.flow.error ? flowTrend(uw.flow.data) : null), [uw]);

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
      {tr && <TrendBlock tr={tr} />}

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

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

/**
 * Flow đang diễn biến ra sao — cùng `flowTrend()` Claude đọc, nên con số
 * trên màn hình và con số trong câu trả lời là MỘT. Nhãn không tô xanh/đỏ:
 * "dịch về call" không phải tin tốt, cũng như ask ≠ lạc quan (#218).
 */
function TrendBlock({ tr }: { tr: FlowTrend }) {
  const { t } = useLang();
  const e = tr.early;
  const l = tr.late;
  const v = tr.verdict;
  const label = (x: string | null | undefined) =>
    x === undefined ? null : <td className={`sfv${x === null ? ' sfv-none' : ''}`}>{t(`sf.trend.v.${x ?? 'none'}`)}</td>;
  const span = (h: TrendHalf) => (h.days.length > 1 ? `${h.days[0].slice(5)}–${h.days[h.days.length - 1].slice(5)}` : h.days[0]?.slice(5) ?? '');
  const rows: [string, (h: TrendHalf) => string, string | null | undefined][] = [
    ['sf.trend.perDay', (h) => money(h.perDay), v?.intensity],
    ['sf.trend.callShare', (h) => pct(h.callShare), v?.mix],
    ['sf.trend.shortShare', (h) => pct(h.shortShare), v?.tenor],
    ['sf.trend.newShare', (h) => pct(h.newShare), v?.newPos],
    ['sf.trend.callAsk', (h) => pct(h.callAskShare), undefined],
    ['sf.trend.putAsk', (h) => pct(h.putAskShare), undefined],
  ];
  return (
    <div className="sftrend">
      <h4>{t('sf.trend.title')}</h4>
      <p className="cap">{t('sf.trend.lead')}</p>
      {tr.reason === 'too-few-days' && <p className="hint hint-warn">{t('sf.trend.fewDays')}</p>}
      {e && l && (
        <table className="sftable">
          <thead>
            <tr>
              <th>{t('sf.trend.metric')}</th>
              <th className="num">
                {t('sf.trend.early')}
                <span className="sfdates">{span(e)}</span>
              </th>
              <th className="num">
                {t('sf.trend.late')}
                <span className="sfdates">{span(l)}</span>
              </th>
              {v && <th>{t('sf.trend.label')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, get, lab]) => (
              <tr key={k}>
                <td>{t(k)}</td>
                <td className="num">{get(e)}</td>
                <td className="num">{get(l)}</td>
                {v && (label(lab) ?? <td />)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tr.reason === 'too-few-alerts' && <p className="hint hint-warn">{t('sf.trend.fewAlerts', TREND_MIN_ALERTS)}</p>}
      {tr.middle && <p className="cap">{t('sf.trend.middle', tr.middle)}</p>}
      {tr.peak && (
        <p className="cap">
          {t('sf.trend.peak', [tr.peak.day, money(tr.peak.premium), tr.peak.ratio !== null ? tr.peak.ratio.toFixed(1) : null])}
          {tr.peak.spike && <span className="sfspike"> · {t('sf.trend.spike')}</span>}
        </p>
      )}
      {tr.excluded.map((x) => (
        <p key={x.day} className="cap">
          {t('sf.trend.excluded', [x.day, money(x.premium), t(`sf.trend.why.${x.reason}`)])}
        </p>
      ))}
      <p className="cap">{t('sf.trend.note', [TREND_RATIO, Math.round(TREND_SHIFT * 100)])}</p>
    </div>
  );
}
