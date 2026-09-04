'use client';

import { useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Idea = {
  id: string;
  kind: string;
  bias: string;
  legsLabel: string;
  dte: number;
  expiration: string;
  netCost: number;
  greeks: { delta: number | null; vega: number | null; theta: number | null };
  maxGain: number | null;
  maxLoss: number | null;
  breakeven: number[];
  rr: number | null;
};

type Horizon = {
  dte: number;
  expiration: string | null;
  atmIv: number | null;
  expectedMove: number | null;
  ideas: Idea[];
};

type Brief = {
  symbol: string;
  date: string;
  spot: number;
  regime: 'POSITIVE' | 'NEGATIVE';
  putWall: number | null;
  callWall: number | null;
  gammaFlip: number | null;
  totalGex: number;
  vol: { iv: number | null; hv20: number | null; hv60: number | null };
  termStructure: number | null;
  skew: number | null;
  skewZ: number | null;
  shortTerm: Horizon;
  mediumTerm: Horizon;
};

const money = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function IdeaCard({ idea, t }: { idea: Idea; t: (k: string, ...a: any[]) => string }) {
  return (
    <li className="tbidea">
      <p className="cap" style={{ margin: 0 }}>
        <b>
          [{idea.kind}] {idea.bias}
        </b>
      </p>
      <p style={{ margin: '2px 0' }}>{idea.legsLabel}</p>
      <p className="cap" style={{ margin: 0 }}>
        {idea.netCost >= 0
          ? `${t('tb.cost')}: ${money(idea.netCost)}`
          : `${t('tb.credit')}: ${money(-idea.netCost)}`}
        {idea.greeks.delta !== null && <> · Δ {idea.greeks.delta.toFixed(2)}</>}
        {idea.greeks.vega !== null && <> · V {idea.greeks.vega.toFixed(2)}</>}
        {idea.greeks.theta !== null && <> · Θ {idea.greeks.theta.toFixed(2)}/day</>}
      </p>
      <p className="cap" style={{ margin: 0 }}>
        {t('tb.maxGain')}: {idea.maxGain === null ? t('tb.unlimited') : money(idea.maxGain)} ·{' '}
        {t('tb.maxLoss')}: {idea.maxLoss === null ? t('tb.unlimited') : money(idea.maxLoss)}
        {idea.rr !== null && <> · {t('tb.rr')} {idea.rr.toFixed(2)}:1</>}
      </p>
      <p className="cap" style={{ margin: 0 }}>
        {t('tb.breakeven')}: {idea.breakeven.length ? idea.breakeven.map((b) => b.toFixed(2)).join(' / ') : '—'}
      </p>
    </li>
  );
}

function HorizonBlock({
  label,
  h,
  t,
}: {
  label: string;
  h: Horizon;
  t: (k: string, ...a: any[]) => string;
}) {
  return (
    <div>
      <h3 className="dsec">{label}</h3>
      {h.expiration && (
        <p className="cap">{t('tb.nextExp', { exp: h.expiration, dte: h.dte })}</p>
      )}
      {h.expectedMove !== null && (
        <p className="cap">
          {t('tb.expMove')}: ±{money(h.expectedMove)}
        </p>
      )}
      {h.ideas.length ? (
        <ul className="pfskipped tbideas">
          {h.ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} t={t} />
          ))}
        </ul>
      ) : (
        <p className="cap">{t('tb.noIdeas')}</p>
      )}
    </div>
  );
}

/**
 * "AI Trade Briefing" trong khung GEX - hai bước: (1) /api/tradebrief tính
 * toàn bộ số liệu thật (nhanh, không có Claude), hiện ngay; (2) tự động nối
 * tiếp gọi /api/ai/trade-briefing để Claude viết phần diễn giải cho đúng
 * những số đó - cùng mẫu stream/lỗi với AiRead.tsx.
 */
export default function TradeBriefingPanel({ symbol }: { symbol: string }) {
  const { t, lang } = useLang();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [factsError, setFactsError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'running' | 'done' | 'error'>('idle');
  const [errKey, setErrKey] = useState('ai.failed');
  const abort = useRef<AbortController | null>(null);

  const run = async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;

    setText('');
    setFactsError(null);
    setBrief(null);
    setState('loading');

    let fetched: Brief;
    try {
      const r = await fetch(`/api/tradebrief?symbol=${encodeURIComponent(symbol)}`, {
        signal: ctrl.signal,
      });
      const j = await r.json();
      if (!r.ok) {
        setFactsError(j.error ?? t('gex.loadFailed'));
        setState('error');
        return;
      }
      fetched = j;
      setBrief(fetched);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setFactsError(String(e?.message ?? e));
      setState('error');
      return;
    }

    setState('running');
    try {
      const res = await fetch('/api/ai/trade-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: fetched, lang }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        setErrKey(res.status === 503 ? 'ai.notConfigured' : 'ai.failed');
        setState('error');
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });

        const marker = acc.match(/\[(AI_[A-Z_]+|REFUSED)\]\s*$/);
        if (marker) {
          setText(acc.slice(0, marker.index).trimEnd());
          setErrKey(
            marker[1] === 'AI_BAD_KEY'
              ? 'ai.badKey'
              : marker[1] === 'AI_RATE_LIMITED'
                ? 'ai.rateLimited'
                : marker[1] === 'REFUSED'
                  ? 'ai.refused'
                  : 'ai.failed'
          );
          setState('error');
          return;
        }
        setText(acc);
      }
      setState('done');
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setErrKey('ai.failed');
      setState('error');
    }
  };

  const loading = state === 'loading' || state === 'running';

  return (
    <section className="airead tbrief">
      <div className="aihead">
        <h3 className="dsec">{t('tb.title')}</h3>
        <button className="aibtn" onClick={run} disabled={loading}>
          {state === 'loading'
            ? t('tb.running')
            : state === 'running'
              ? t('ai.running')
              : state === 'idle'
                ? t('tb.run')
                : t('tb.rerun')}
        </button>
      </div>

      <p className="cap">{t('tb.note')}</p>

      {factsError && <p className="hint hint-warn">{factsError}</p>}

      {brief && (
        <>
          <p className="cap">
            {brief.symbol} — {brief.date} — spot {brief.spot.toFixed(2)} —{' '}
            {t('tb.regime')}: {brief.regime === 'POSITIVE' ? t('tb.regimePositive') : t('tb.regimeNegative')}
          </p>
          <dl className="stats gexstats">
            <div>
              <dt>{t('gex.putWall')}</dt>
              <dd className="num-key">{brief.putWall?.toFixed(2) ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('gex.callWall')}</dt>
              <dd>{brief.callWall?.toFixed(2) ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('gex.zeroGamma')}</dt>
              <dd>{brief.gammaFlip?.toFixed(2) ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('gex.netGex')}</dt>
              <dd className={brief.totalGex >= 0 ? 'good' : 'bad'}>
                {brief.totalGex.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </dd>
            </div>
          </dl>
          <p className="cap">
            IV {brief.vol.iv?.toFixed(1) ?? '—'}% · HV20{' '}
            {brief.vol.hv20 !== null ? (brief.vol.hv20 * 100).toFixed(1) : '—'}% · HV60{' '}
            {brief.vol.hv60 !== null ? (brief.vol.hv60 * 100).toFixed(1) : '—'}% · {t('tb.termSkew')}:{' '}
            {brief.termStructure?.toFixed(3) ?? '—'} / {brief.skew?.toFixed(3) ?? '—'}
            {brief.skewZ !== null && ` (z ${brief.skewZ.toFixed(2)})`}
          </p>

          <HorizonBlock label={t('tb.horizonShort')} h={brief.shortTerm} t={t} />
          <HorizonBlock label={t('tb.horizonMedium')} h={brief.mediumTerm} t={t} />
        </>
      )}

      {text && <div className="aitext">{text}</div>}

      {state === 'error' && !factsError && <p className="hint hint-warn">{t(errKey)}</p>}

      {(state === 'done' || state === 'running') && text && <p className="cap">{t('ai.caveat')}</p>}
    </section>
  );
}
