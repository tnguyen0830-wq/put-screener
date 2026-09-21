'use client';

import { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';

/**
 * "Đọc mẫu hình này" — Claude diễn giải các mẫu app đã dò. Cùng khuôn stream
 * `AiRead`. `facts` là đúng cái đang vẽ trên biểu đồ (post what you display).
 */
export default function PatternRead({ facts }: { facts: any }) {
  const { t, lang } = useLang();
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [errKey, setErrKey] = useState('ai.failed');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    abort.current?.abort();
    setText('');
    setState('idle');
  }, [facts?.symbol]);

  const run = async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setText('');
    setState('running');
    try {
      const res = await fetch('/api/ai/pattern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts, lang }),
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
          setErrKey(marker[1] === 'AI_BAD_KEY' ? 'ai.badKey' : marker[1] === 'AI_RATE_LIMITED' ? 'ai.rateLimited' : marker[1] === 'REFUSED' ? 'ai.refused' : 'ai.failed');
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
    <section className="airead patread">
      <div className="aihead">
        <h3 className="dsec">{t('pat.read.title')}</h3>
        <button className="aibtn" onClick={run} disabled={state === 'running'}>
          {state === 'running' ? t('ai.running') : state === 'idle' ? t('pat.read.run') : t('ai.rerun')}
        </button>
      </div>
      {state === 'idle' && !text && <p className="cap">{t('pat.read.idle')}</p>}
      {text && <div className="aitext">{text}</div>}
      {state === 'error' && <p className="hint hint-warn">{t(errKey)}</p>}
      {(state === 'done' || state === 'running') && text && <p className="cap">{t('pat.read.caveat')}</p>}
    </section>
  );
}
