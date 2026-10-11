'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLang } from '@/lib/i18n';

/**
 * Lịch sử + chi phí theo từng thành viên (trang /accounts, chỉ chủ app).
 *
 * Hai nguồn, cố ý không trộn thành một bảng:
 *  - "Đã làm gì" — nhật ký hoạt động (`/api/users/activity`, #193), trang
 *    cha đưa xuống, lọc theo người. Ghi TRƯỚC khi gọi dịch vụ nên không có
 *    tiền.
 *  - "Tốn bao nhiêu" — sổ chi phí (`/api/users/usage`, lib/usage.ts), ghi
 *    SAU từ con số Claude/ElevenLabs tự trả về.
 * Ghép hai thứ thành một dòng phải đoán dòng nào ứng với lượt gọi nào —
 * một lượt bấm có thể không gọi dịch vụ nào (lấy từ cache) — và một phép
 * ghép đoán sai là một con số tiền gắn nhầm việc.
 */

type ActEvent = { at: string; user: string; kind: string; detail?: string; n?: number };

type Call = {
  at: string;
  user: string;
  kind: string;
  detail?: string;
  provider: 'anthropic' | 'elevenlabs';
  model?: string;
  inTok?: number;
  outTok?: number;
  cacheRead?: number;
  cacheWrite?: number;
  chars?: number;
  usd?: number | null;
};

type Totals = { calls: number; usd: number; unpriced: number; inTok: number; outTok: number; chars: number };
type UserUsage = { today: Totals; d7: Totals; d30: Totals };
type Usage = { summary: Record<string, UserUsage>; calls: Call[]; truncated: number; now: number };

const SHOW_ROWS = 100;
const REFRESH_MS = 30_000;

export function fmtUsd(v: number): string {
  if (v === 0) return '$0';
  if (v < 0.0001) return '<$0.0001';
  return v < 1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

function fmtTok(v: number | undefined): string {
  const x = v ?? 0;
  return x >= 1000 ? `${(x / 1000).toFixed(x >= 100_000 ? 0 : 1)}k` : String(x);
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function MemberUsage({ events, names }: { events: ActEvent[]; names: string[] }) {
  const { t } = useLang();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/users/usage');
      const text = await r.text();
      let j: any = null;
      try {
        j = JSON.parse(text);
      } catch {
        /* HTML (502 của Render, trang đăng nhập) — nói ra mã HTTP thật */
      }
      if (!r.ok || !j) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setUsage(j as Usage);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  /* Mọi người từng có mặt ở đâu đó: danh sách tài khoản, sổ chi phí, nhật
     ký. Người đã bị xoá vẫn hiện nếu còn dữ liệu — tiền họ đã tiêu vẫn là
     tiền đã tiêu. Chủ app đứng đầu, rồi theo tên. */
  const people = useMemo(() => {
    const s = new Set<string>(['owner', ...names]);
    for (const k of Object.keys(usage?.summary ?? {})) s.add(k);
    for (const e of events) s.add(e.user);
    return [...s].sort((a, b) => (a === 'owner' ? -1 : b === 'owner' ? 1 : a.localeCompare(b)));
  }, [names, usage, events]);

  const selected = who && people.includes(who) ? who : (people.find((p) => p !== 'owner') ?? people[0] ?? null);

  const label = (kind: string) => {
    const k = `act.kind.${kind}`;
    const v = t(k);
    return v === k ? kind : v;
  };
  const what = (e: { kind: string; detail?: string }) => {
    if (!e.detail) return label(e.kind);
    const detail = e.kind === 'tab' ? (t(`tab.${e.detail}`) === `tab.${e.detail}` ? e.detail : t(`tab.${e.detail}`)) : e.detail;
    return `${label(e.kind)} · ${detail}`;
  };

  const cell = (x: Totals | undefined) => {
    if (!x || x.calls === 0) return <span className="usgzero">{t('acct.histNone')}</span>;
    return (
      <>
        <b className="usgusd">{fmtUsd(x.usd)}</b>
        {x.unpriced > 0 && <span className="usgwarn"> +?</span>}
        <span className="usgsub">{t('acct.histCalls', x.calls)}</span>
        {x.chars > 0 && <span className="usgsub">{t('acct.histChars', x.chars)}</span>}
      </>
    );
  };

  const myEvents = selected ? events.filter((e) => e.user === selected) : [];
  const myCalls = selected && usage ? usage.calls.filter((c) => c.user === selected) : [];
  const unpricedModels = [...new Set(myCalls.filter((c) => c.provider === 'anthropic' && c.usd == null).map((c) => c.model ?? '?'))];

  return (
    <>
      <h3 className="dsec">{t('acct.histTitle')}</h3>
      <p className="cap">{t('acct.histIntro')}</p>
      {error && <p className="hint hint-warn">{t('acct.histFailed', error)}</p>}

      <h4 className="actsub">{t('acct.histTotals')}</h4>
      {!usage && !error ? (
        <p className="cap">{t('acct.loading')}</p>
      ) : (
        <div className="usgwrap">
          <table className="acctlist usgtable">
            <thead>
              <tr>
                <th>{t('acct.actColUser')}</th>
                <th>{t('acct.histToday')}</th>
                <th>{t('acct.hist7')}</th>
                <th>{t('acct.hist30')}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const u = usage?.summary[p];
                return (
                  <tr key={p} className={p === selected ? 'usgsel' : undefined}>
                    <th scope="row">
                      <button type="button" className="usgname" onClick={() => setWho(p)} aria-pressed={p === selected}>
                        {p}
                      </button>
                      {p === 'owner' && <span className="actme"> {t('acct.actOwnerTag')}</span>}
                    </th>
                    <td>{cell(u?.today)}</td>
                    <td>{cell(u?.d7)}</td>
                    <td>{cell(u?.d30)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <>
          <div className="chiprow usgpick" role="group" aria-label={t('acct.histPick')}>
            <span className="usgpicklabel">{t('acct.histPick')}</span>
            {people.map((p) => (
              <button key={p} type="button" className={p === selected ? 'on' : undefined} aria-pressed={p === selected} onClick={() => setWho(p)}>
                {p}
              </button>
            ))}
          </div>

          <h4 className="actsub">{t('acct.histSpent', selected)}</h4>
          {unpricedModels.length > 0 && <p className="hint hint-warn">{t('acct.histUnpriced', unpricedModels.join(', '))}</p>}
          {myCalls.length === 0 ? (
            <p className="cap">{t('acct.histNoSpent')}</p>
          ) : (
            <div className="usgwrap">
              <table className="acctlist actlog usgcalls">
                <thead>
                  <tr>
                    <th>{t('acct.actColTime')}</th>
                    <th>{t('acct.actColWhat')}</th>
                    <th>{t('acct.histColCost')}</th>
                    <th>{t('acct.histColUse')}</th>
                  </tr>
                </thead>
                <tbody>
                  {myCalls.slice(0, SHOW_ROWS).map((c, i) => (
                    <tr key={`${c.at}-${i}`}>
                      <td>{when(c.at)}</td>
                      <td className="usgwhat">{what(c)}</td>
                      <td className="usgnum usgcost">
                        {c.provider === 'anthropic' ? (
                          typeof c.usd === 'number' ? <b className="usgusd">{fmtUsd(c.usd)}</b> : <span className="usgwarn">?</span>
                        ) : (
                          <span className="usgsub">{t('acct.histElevenUnit')}</span>
                        )}
                      </td>
                      <td className="usgnum">
                        {c.provider === 'anthropic'
                          ? t('acct.histTok', { i: fmtTok(c.inTok), o: fmtTok(c.outTok), c: fmtTok(c.cacheRead) })
                          : t('acct.histChars', c.chars ?? 0)}
                        {c.model && <span className="usgsub">{c.model}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {myCalls.length > SHOW_ROWS && <p className="cap">{t('acct.actMore', myCalls.length - SHOW_ROWS)}</p>}

          <h4 className="actsub">{t('acct.histDid', selected)}</h4>
          {myEvents.length === 0 ? (
            <p className="cap">{t('acct.histNoDid')}</p>
          ) : (
            <div className="usgwrap">
              <table className="acctlist actlog">
                <thead>
                  <tr>
                    <th>{t('acct.actColTime')}</th>
                    <th>{t('acct.actColWhat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {myEvents.slice(0, SHOW_ROWS).map((e, i) => (
                    <tr key={`${e.at}-${e.kind}-${i}`}>
                      <td>{when(e.at)}</td>
                      <td className="usgwhat">
                        {what(e)}
                        {e.n && e.n > 1 && <span className="actn">{t('acct.actTimes', e.n)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {myEvents.length > SHOW_ROWS && <p className="cap">{t('acct.actMore', myEvents.length - SHOW_ROWS)}</p>}
        </>
      )}
      <p className="cap">{t('acct.histNote')}</p>
    </>
  );
}
