'use client';

import { useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';

/**
 * Claude's read of the indicators below it, on demand.
 *
 * On demand rather than automatic: every run costs real money on the API key,
 * and the analyze tab is often opened just to glance at a price. A button
 * makes the spend a decision instead of a side effect of navigating.
 *
 * The whole analysis object goes up because the route picks its own fields
 * from it; sending a pre-trimmed version here would put the prompt's shape in
 * two places.
 */
export default function AiRead({ analysis }: { analysis: any }) {
  const { t, lang } = useLang();
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>(
    'idle'
  );
  const [errKey, setErrKey] = useState('ai.failed');
  const abort = useRef<AbortController | null>(null);

  const run = async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;

    setText('');
    setState('running');

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, lang }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        // 503 is the deliberate "no API key on this server" answer, and it is
        // the one failure the reader can actually do something about.
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

        // The route cannot send a status code once streaming has started, so
        // failures arrive as a marker in the text instead.
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

  return (
    <section className="airead">
      <div className="aihead">
        <h3 className="dsec">{t('ai.title')}</h3>
        <button className="aibtn" onClick={run} disabled={state === 'running'}>
          {state === 'running'
            ? t('ai.running')
            : state === 'idle'
              ? t('ai.run')
              : t('ai.rerun')}
        </button>
      </div>

      {state === 'idle' && !text && <p className="cap">{t('ai.idle')}</p>}

      {text && <div className="aitext">{text}</div>}

      {state === 'error' && <p className="hint hint-warn">{t(errKey)}</p>}

      {(state === 'done' || state === 'running') && text && (
        <p className="cap">{t('ai.caveat')}</p>
      )}
    </section>
  );
}
