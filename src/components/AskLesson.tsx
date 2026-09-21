'use client';

import { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { MAX_QUESTION } from '@/lib/learnask';

/**
 * "Hỏi Claude về bài này" — hộp câu hỏi + câu trả lời stream, ở cuối mỗi bài
 * trong tab Learn.
 *
 * Cùng khuôn `AiRead.tsx`: POST một lần, đọc stream, lỗi sau khi stream đã
 * bắt đầu tới dưới dạng dấu `[AI_xxx]` ở cuối văn bản. Khác một chỗ: ở đây
 * người dùng GÕ câu hỏi, nên có trần ký tự (`MAX_QUESTION`, dùng chung với
 * server — hai con số là hai con số sẽ lệch) và bộ đếm hiện ngay cạnh ô.
 *
 * Đổi bài là xoá câu trả lời cũ: một câu trả lời về bài nến nằm dưới bài GEX
 * là một câu trả lời sai trông y như đúng.
 */
export default function AskLesson({ lessonId }: { lessonId: string }) {
  const { t, lang } = useLang();
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [errKey, setErrKey] = useState('ai.failed');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    abort.current?.abort();
    setQ('');
    setText('');
    setState('idle');
  }, [lessonId]);

  const run = async () => {
    const question = q.trim();
    if (!question) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setText('');
    setState('running');
    try {
      const res = await fetch('/api/ai/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, question, lang }),
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

  return (
    <section className="airead learnask">
      <div className="aihead">
        <h3 className="dsec">{t('learn.ask.title')}</h3>
      </div>
      <p className="cap">{t('learn.ask.hint')}</p>
      <textarea
        className="learnask-q"
        value={q}
        maxLength={MAX_QUESTION}
        rows={3}
        placeholder={t('learn.ask.placeholder')}
        onChange={(e) => setQ(e.target.value)}
        disabled={state === 'running'}
        aria-label={t('learn.ask.title')}
      />
      <div className="learnask-row">
        <span className="cap">
          {q.length}/{MAX_QUESTION}
        </span>
        <button className="aibtn" onClick={run} disabled={state === 'running' || !q.trim()}>
          {state === 'running' ? t('ai.running') : t('learn.ask.send')}
        </button>
      </div>
      {text && <div className="aitext">{text}</div>}
      {state === 'error' && <p className="hint hint-warn">{t(errKey)}</p>}
      {(state === 'done' || state === 'running') && text && <p className="cap">{t('learn.ask.caveat')}</p>}
    </section>
  );
}
