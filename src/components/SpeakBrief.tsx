'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRemembered, remember } from '@/lib/remember';
import { pickVoice, ttsChunks, voiceMatches } from '@/lib/tts';

/**
 * Nút Nghe / Tạm dừng / Dừng cho bản tóm tắt, bằng giọng đọc của trình duyệt.
 * Phần thuần (chia đoạn, chọn giọng) ở `lib/tts.ts`; ở đây chỉ là `window`.
 *
 * Ba trạng thái không trạng thái nào câm: trình duyệt không có Web Speech
 * (câu riêng) / có nhưng không có giọng cho ngôn ngữ này (câu riêng, kèm tên
 * và ngôn ngữ các giọng máy CÓ — đó là phép đo để chủ app biết phải cài gì) /
 * có giọng (nút + ô chọn giọng khi có nhiều hơn một).
 */

type State = 'idle' | 'speaking' | 'paused';
const VOICE_KEY = 'ttsvoice';

export default function SpeakBrief({ text, lang }: { text: string; lang: 'vi' | 'en' }) {
  const { t } = useLang();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Chrome bắn `voiceschanged` sau; nhưng một máy KHÔNG có giọng nào (Linux
  // không cài speech engine) thì không bao giờ bắn — không có mốc này thì
  // "đang tìm giọng" treo mãi, trông y hệt "đang chạy".
  const [settled, setSettled] = useState(false);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [state, setState] = useState<State>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Tự tăng mỗi lần bấm Dừng/đọc lại, để callback của đoạn cũ không xếp tiếp
  // đoạn kế của một lượt đã bị huỷ.
  const runRef = useRef(0);

  useEffect(() => {
    const ok = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    setSupported(ok);
    if (!ok) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    // Chrome: getVoices() rỗng cho tới khi voiceschanged bắn.
    window.speechSynthesis.addEventListener('voiceschanged', load);
    setVoiceName(readRemembered(VOICE_KEY));
    const timer = setTimeout(() => setSettled(true), 2000);
    return () => {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, []);

  // Văn bản đổi (tóm tắt mới) thì dừng đọc bản cũ.
  useEffect(() => {
    if (supported) window.speechSynthesis.cancel();
    runRef.current++;
    setState('idle');
    setProgress(null);
  }, [text, supported]);

  const voice = pickVoice(voices, lang, voiceName);
  const sameLang = voices.filter((v) => voiceMatches(v, lang));

  const stop = useCallback(() => {
    runRef.current++;
    window.speechSynthesis.cancel();
    setState('idle');
    setProgress(null);
  }, []);

  const play = useCallback(() => {
    if (!voice) return;
    const chunks = ttsChunks(text);
    if (!chunks.length) return;
    window.speechSynthesis.cancel();
    const run = ++runRef.current;
    setState('speaking');
    setProgress({ done: 0, total: chunks.length });
    const speakAt = (i: number) => {
      if (run !== runRef.current) return;
      if (i >= chunks.length) {
        setState('idle');
        setProgress(null);
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[i]);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 1;
      u.onend = () => {
        setProgress({ done: i + 1, total: chunks.length });
        speakAt(i + 1);
      };
      // `interrupted`/`canceled` là do chính nút Dừng; lỗi khác thì dừng và
      // in ra, không đọc tiếp giả vờ như không có gì.
      u.onerror = (e) => {
        if (run !== runRef.current) return;
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        setState('idle');
        setProgress(null);
      };
      window.speechSynthesis.speak(u);
    };
    speakAt(0);
  }, [text, voice]);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setState('paused');
  }, []);
  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setState('speaking');
  }, []);

  if (supported === null) return null;
  if (!supported) return <p className="cap warnline">{t('tts.unsupported')}</p>;
  if (!voices.length && !settled) return <p className="cap">{t('tts.loadingVoices')}</p>;
  if (!voices.length) return <p className="cap warnline">{t('tts.noVoicesAtAll')} {t('tts.howToAdd')}</p>;
  if (!voice) {
    // Phép đo: in tên + ngôn ngữ các giọng máy CÓ, để biết thiếu gì.
    const have = voices.slice(0, 8).map((v) => `${v.name} (${v.lang})`).join(', ');
    return (
      <p className="cap warnline">
        {t('tts.noVoice', { lang: lang === 'vi' ? 'tiếng Việt' : 'English', n: voices.length, have })}
        {' '}
        {t('tts.howToAdd')}
      </p>
    );
  }

  return (
    <div className="ttsrow">
      {state === 'idle' ? (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={play}>
          🔊 {t('tts.play')}
        </button>
      ) : state === 'speaking' ? (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={pause}>
          ⏸ {t('tts.pause')}
        </button>
      ) : (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={resume}>
          ▶ {t('tts.resume')}
        </button>
      )}
      {state !== 'idle' && (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={stop}>
          ⏹ {t('tts.stop')}
        </button>
      )}
      {progress && state !== 'idle' && (
        <span className="newsat">{t('tts.progress', progress)}</span>
      )}
      {sameLang.length > 1 ? (
        <select
          className="ttsvoice"
          value={voice.name}
          aria-label={t('tts.voice')}
          onChange={(e) => {
            setVoiceName(e.target.value);
            remember(VOICE_KEY, e.target.value);
            if (state !== 'idle') stop();
          }}
        >
          {sameLang.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}{v.localService ? '' : ` · ${t('tts.online')}`}
            </option>
          ))}
        </select>
      ) : (
        <span className="newsat">{voice.name}</span>
      )}
    </div>
  );
}
