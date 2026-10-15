'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRemembered, readRememberedOneOf, remember } from '@/lib/remember';
import { RATES, TTS_TOTAL_MAX, fmtRate, parseRate, pickVoice, ttsChunks, ttsParts, voiceMatches, type Rate } from '@/lib/tts';

/**
 * Nghe bản tóm tắt. Hai "máy đọc", chọn được, cùng một hàng nút và cùng
 * hàng tốc độ:
 *
 *  - **Giọng AI (ElevenLabs)** — `/api/tts`, giọng neural, tính tiền theo ký
 *    tự (cache phía server nên bấm lại là 0). Mặc định khi server có key.
 *  - **Giọng trình duyệt** (Web Speech API, #182) — miễn phí, giọng máy, là
 *    ĐƯỜNG LÙI khi chưa có key hoặc ElevenLabs hỏng; màn hình nói rõ đang
 *    dùng đường lùi và vì sao.
 *
 * Ba trạng thái của máy trình duyệt không trạng thái nào câm (không có Web
 * Speech / không có giọng nào / có nhưng không có giọng đúng ngôn ngữ — in
 * các giọng máy CÓ), xem #182. Máy AI: lỗi mang mã + lý do thật của
 * ElevenLabs (key sai ≠ hết ký tự ≠ giọng không tồn tại ≠ hỏng tạm).
 */

type State = 'idle' | 'loading' | 'speaking' | 'paused';
const VOICE_KEY = 'ttsvoice';
const RATE_KEY = 'ttsrate';
const ENGINE_KEY = 'ttsengine';
const AI_VOICE_KEY = 'elevenvoice';
const ENGINES = ['ai', 'browser'] as const;
type Engine = (typeof ENGINES)[number];

type AiVoice = { id: string; name: string; labels: Record<string, string>; category: string | null };
type VoicesPayload = { configured: boolean; voices: AiVoice[]; defaultId: string | null; envVoiceMissing?: boolean; envVoiceId?: string; listedAt?: number | null; model: string; error?: string; detail?: string };

/* Một tích tắc im lặng phát NGAY trong cú bấm Nghe (trước mọi lượt tải):
   Safari trên iPhone chỉ cho một thẻ <audio> phát khi lần play() đầu của nó
   nằm trong thao tác của người dùng. Thẻ đã "mở khoá" như vậy được đổi src
   phát tiếp mà không cần bấm lại — đó là điều cho phép nhiều phần (#251) nối
   nhau trên điện thoại. */
const SILENT_WAV = 'data:audio/wav;base64,UklGRuwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YcgAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

const ERR_KEY: Record<string, string> = {
  TTS_NOT_CONFIGURED: 'tts.ai.notConfigured',
  TTS_BAD_KEY: 'tts.ai.badKey',
  TTS_QUOTA: 'tts.ai.quota',
  TTS_VOICE_PLAN: 'tts.ai.voicePlan',
  TTS_BAD_VOICE: 'tts.ai.badVoice',
  TTS_EDGE: 'tts.ai.edge',
  TOO_LONG: 'tts.ai.tooLong',
};

export default function SpeakBrief({ text, lang }: { text: string; lang: 'vi' | 'en' }) {
  const { t } = useLang();
  const [rate, setRate] = useState<Rate>(1);
  const rateRef = useRef<Rate>(1);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [ai, setAi] = useState<VoicesPayload | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const r = parseRate(readRemembered(RATE_KEY));
    setRate(r);
    rateRef.current = r;
    const remembered = readRememberedOneOf<Engine>(ENGINE_KEY, ENGINES);
    let alive = true;
    fetch('/api/tts/voices', { cache: 'no-store' })
      .then((res) => res.json())
      .catch((e) => ({ configured: true, voices: [], defaultId: null, model: '?', error: 'TTS_FAILED', detail: String(e?.message ?? e) }))
      .then((p: VoicesPayload) => {
        if (!alive) return;
        setAi(p);
        // AI có sẵn và có giọng → mặc định AI; nhưng người dùng đã chọn thì
        // giữ. Không có key → chỉ có đường trình duyệt.
        const aiUsable = p.configured && p.voices.length > 0;
        setEngine(remembered && (remembered === 'browser' || aiUsable) ? remembered : aiUsable ? 'ai' : 'browser');
      });
    return () => {
      alive = false;
    };
  }, []);

  /* "Tải lại danh sách giọng": hỏi ElevenLabs NGAY (`?fresh=1`), không đợi
     hết hạn bản server đang giữ. Giữ nguyên máy đọc đang chọn; chỉ khi AI
     vừa từ không-dùng-được thành dùng-được mới tự chuyển sang AI. */
  const reloadVoices = async () => {
    setReloading(true);
    try {
      const res = await fetch('/api/tts/voices?fresh=1', { cache: 'no-store' });
      const p: VoicesPayload = await res.json();
      setAi((prev) => {
        const wasUsable = !!prev && prev.configured && prev.voices.length > 0;
        if (!wasUsable && p.configured && p.voices.length > 0) setEngine('ai');
        return p;
      });
    } catch (e: any) {
      setAi((prev) => (prev ? { ...prev, error: 'TTS_FAILED', detail: String(e?.message ?? e) } : prev));
    } finally {
      setReloading(false);
    }
  };

  const pickRate = (r: Rate) => {
    setRate(r);
    rateRef.current = r;
    remember(RATE_KEY, String(r));
  };
  const pickEngine = (e: Engine) => {
    setEngine(e);
    remember(ENGINE_KEY, e);
  };

  if (engine === null || ai === null) return <p className="cap">{t('tts.loadingVoices')}</p>;
  const aiUsable = ai.configured && ai.voices.length > 0;

  return (
    <div className="ttsbox">
      {ai.configured && (
        <span className="chiprow ttsengines" role="radiogroup" aria-label={t('tts.engine')}>
          <button type="button" className={engine === 'ai' ? 'on' : undefined} aria-pressed={engine === 'ai'} disabled={!aiUsable} onClick={() => pickEngine('ai')}>
            {t('tts.engineAi')}
          </button>
          <button type="button" className={engine === 'browser' ? 'on' : undefined} aria-pressed={engine === 'browser'} onClick={() => pickEngine('browser')}>
            {t('tts.engineBrowser')}
          </button>
        </span>
      )}
      {/* Vì sao đang ở đường lùi — nói ra, không im. */}
      {!ai.configured && <p className="cap">{t('tts.ai.offNoKey')}</p>}
      {ai.configured && !aiUsable && (
        <p className="cap warnline">{ai.error ? t('tts.ai.listFailed', ai.detail ?? ai.error) : t('tts.ai.noVoices')}</p>
      )}
      {ai.envVoiceMissing && (
        <p className="cap warnline ttserr">
          {t('tts.ai.envVoiceMissing', {
            id: ai.envVoiceId ?? '?',
            at: ai.listedAt ? new Date(ai.listedAt).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '?',
          })}
        </p>
      )}
      {ai.configured && (
        <span className="ttsrow">
          <button type="button" className="rrgfullbtn ttsbtn ttsreload" onClick={reloadVoices} disabled={reloading}>
            {reloading ? t('tts.ai.reloading') : t('tts.ai.reload')}
          </button>
        </span>
      )}

      {engine === 'ai' && aiUsable ? (
        /* key = danh sách giọng: tải lại ra danh sách khác thì dựng lại máy
           đọc, để giọng mặc định mới (ví dụ giọng vừa Add to my voices) được
           chọn thay vì giữ lựa chọn tính từ danh sách cũ. */
        <AiSpeaker key={ai.voices.map((v) => v.id).join(',')} text={text} voices={ai.voices} defaultId={ai.defaultId} model={ai.model} rate={rate} t={t} />
      ) : (
        <BrowserSpeaker text={text} lang={lang} rateRef={rateRef} t={t} />
      )}

      <span className="chiprow ttsrates" role="radiogroup" aria-label={t('tts.rate')}>
        {RATES.map((r) => (
          <button key={r} type="button" className={r === rate ? 'on' : undefined} aria-pressed={r === rate} onClick={() => pickRate(r)}>
            {fmtRate(r)}
          </button>
        ))}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Giọng AI: một file mp3 từ /api/tts, phát bằng <audio>.
 * ------------------------------------------------------------------ */

function AiSpeaker({ text, voices, defaultId, model, rate, t }: {
  text: string; voices: AiVoice[]; defaultId: string | null; model: string; rate: Rate; t: (k: string, v?: any) => string;
}) {
  const [voiceId, setVoiceId] = useState<string>(() => defaultId ?? voices[0].id);
  const [state, setState] = useState<State>('idle');
  const [err, setErr] = useState<{ key: string; detail?: string | { chars: number; max: number } } | null>(null);
  const [meta, setMeta] = useState<{ cached: boolean; chars: number; voice: string } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /* Văn bản dài được gửi thành NHIỀU lượt (`ttsParts`, #251) và phát nối
     tiếp. `partsRef` giữ blob đã tải của đúng văn bản+giọng hiện tại, nên
     bấm Nghe lại không POST lần nữa; `runRef` tăng mỗi lần dừng/đổi để một
     lượt tải hay `onended` của lượt cũ không phát tiếp phần kế. */
  const partsRef = useRef<{
    key: string;
    texts: string[];
    urls: (string | null)[];
    pending: (Promise<string> | null)[];
    meta: { cached: boolean; chars: number; voice: string };
  } | null>(null);
  const runRef = useRef(0);
  const rateRef = useRef(rate);
  rateRef.current = rate;

  useEffect(() => {
    const remembered = readRemembered(AI_VOICE_KEY);
    if (remembered && voices.some((v) => v.id === remembered)) setVoiceId(remembered);
  }, [voices]);

  const dispose = useCallback(() => {
    runRef.current++;
    audioRef.current?.pause();
    for (const u of partsRef.current?.urls ?? []) if (u) URL.revokeObjectURL(u);
    partsRef.current = null;
    setProgress(null);
  }, []);

  // Văn bản mới hoặc rời tab: dừng, thả blob.
  useEffect(() => () => dispose(), [dispose]);
  useEffect(() => {
    dispose();
    setState('idle');
    setMeta(null);
    setErr(null);
  }, [text, dispose]);

  // Tốc độ áp NGAY cả khi đang phát — <audio> đổi playbackRate được giữa chừng.
  useEffect(() => {
    const a = audioRef.current;
    if (a) {
      a.playbackRate = rate;
      a.defaultPlaybackRate = rate;
    }
  }, [rate]);

  const stop = useCallback(() => {
    runRef.current++;
    audioRef.current?.pause();
    setProgress(null);
    setState('idle');
  }, []);

  /** Tải phần i (một lượt /api/tts). Lỗi ném ra dạng `{key, detail}`. */
  const fetchPart = useCallback((i: number): Promise<string> => {
    const P = partsRef.current!;
    if (P.urls[i]) return Promise.resolve(P.urls[i]!);
    if (P.pending[i]) return P.pending[i]!;
    const pr = (async () => {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: P.texts[i], voiceId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j?.error === 'TOO_LONG') throw { key: 'tts.ai.tooLong', detail: { chars: Number(j?.chars ?? 0), max: Number(j?.max ?? 0) } };
        throw { key: ERR_KEY[j?.error] ?? 'tts.ai.failed', detail: j?.detail ?? `HTTP ${res.status}` };
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (partsRef.current !== P) {
        URL.revokeObjectURL(url); // văn bản/giọng đã đổi trong lúc tải
        throw { key: 'stale' };
      }
      P.urls[i] = url;
      const cached = res.headers.get('X-TTS-Cached') === '1';
      P.meta = {
        cached: P.meta.cached && cached,
        chars: P.meta.chars + (cached ? 0 : Number(res.headers.get('X-TTS-Chars') ?? 0)),
        voice: decodeURIComponent(res.headers.get('X-TTS-Voice') ?? '') || P.meta.voice,
      };
      setMeta({ ...P.meta });
      return url;
    })();
    pr.catch(() => {}).finally(() => {
      if (partsRef.current === P) P.pending[i] = null;
    });
    P.pending[i] = pr;
    return pr;
  }, [voiceId]);

  const playFrom = useCallback(async (i: number, run: number) => {
    const P = partsRef.current;
    if (!P) return;
    try {
      if (!P.urls[i]) setState('loading');
      const url = await fetchPart(i);
      if (run !== runRef.current) return;
      const a = audioRef.current;
      if (!a) return;
      a.onended = null;
      a.onerror = null;
      a.src = url;
      // Nạp src mới đặt playbackRate về defaultPlaybackRate — đặt cả hai.
      a.defaultPlaybackRate = rateRef.current;
      a.playbackRate = rateRef.current;
      a.onended = () => {
        if (run !== runRef.current) return;
        if (i + 1 < P.texts.length) void playFrom(i + 1, run);
        else {
          setProgress(null);
          setState('idle');
        }
      };
      a.onerror = () => {
        if (run !== runRef.current) return;
        setErr({ key: 'tts.ai.failed', detail: 'audio element error' });
        setState('idle');
      };
      setProgress(P.texts.length > 1 ? { done: i, total: P.texts.length } : null);
      await a.play();
      if (run !== runRef.current) return;
      setState('speaking');
      // Tải trước phần kế trong lúc phần này đang phát — để chỗ nối không im
      // lâu. Lỗi của nó hiện ra khi tới lượt phát, không phải bây giờ.
      if (i + 1 < P.texts.length) fetchPart(i + 1).catch(() => {});
    } catch (e: any) {
      if (run !== runRef.current || e?.key === 'stale') return;
      setErr(e?.key ? e : { key: 'tts.ai.failed', detail: String(e?.message ?? e) });
      setState('idle');
    }
  }, [fetchPart]);

  const play = useCallback(async () => {
    setErr(null);
    // Mở khoá thẻ <audio> NGAY trong cú bấm, trước mọi `await` (xem SILENT_WAV).
    if (!audioRef.current) audioRef.current = new Audio();
    const el = audioRef.current;
    el.onended = null;
    el.onerror = null;
    el.src = SILENT_WAV;
    el.play().catch(() => {});
    const key = `${voiceId}\n${text}`;
    if (partsRef.current?.key !== key) {
      dispose();
      const texts = ttsParts(text);
      const total = texts.reduce((n, x) => n + x.length, 0);
      if (!texts.length) return;
      if (total > TTS_TOTAL_MAX) {
        // Trần TỔNG là chốt chặn chi phí: từ chối cả bản, không đọc nửa chừng.
        setErr({ key: 'tts.ai.tooLong', detail: { chars: total, max: TTS_TOTAL_MAX } });
        return;
      }
      partsRef.current = {
        key,
        texts,
        urls: texts.map(() => null),
        pending: texts.map(() => null),
        meta: { cached: true, chars: 0, voice: '' },
      };
    }
    const run = ++runRef.current;
    await playFrom(0, run);
  }, [text, voiceId, dispose, playFrom]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setState('paused');
  }, []);
  const resume = useCallback(async () => {
    await audioRef.current?.play().catch(() => {});
    setState('speaking');
  }, []);

  /* `category` in NGUYÊN VĂN chữ ElevenLabs trả về, cho MỌI giọng — không
     dịch, không tự phân loại "dùng được / không dùng được". Lý do: lỗi
     `voice-plan` (#195) nói gói free không gọi được "library voices" qua
     API, nhưng CHÍNH XÁC category nào tương ứng thì chưa đo được từ sandbox;
     in chữ thật để chủ app tự đối chiếu giọng nào chạy, giọng nào không,
     còn hơn app tự dán nhãn theo phỏng đoán rồi giấu mất một giọng vẫn
     dùng được. */
  const label = (v: AiVoice) => {
    const bits = [v.labels.language, v.labels.accent, v.labels.gender].filter(Boolean);
    if (v.category) bits.push(v.category);
    return bits.length ? `${v.name} · ${bits.join(', ')}` : v.name;
  };

  return (
    <div className="ttsrow">
      {state === 'idle' ? (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={play}>🔊 {t('tts.play')}</button>
      ) : state === 'loading' ? (
        <button type="button" className="rrgfullbtn ttsbtn" disabled>{t('tts.ai.making')}</button>
      ) : state === 'speaking' ? (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={pause}>⏸ {t('tts.pause')}</button>
      ) : (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={resume}>▶ {t('tts.resume')}</button>
      )}
      {(state === 'speaking' || state === 'paused' || (state === 'loading' && progress)) && (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={stop}>⏹ {t('tts.stop')}</button>
      )}
      <select
        className="ttsvoice"
        value={voiceId}
        aria-label={t('tts.voice')}
        onChange={(e) => {
          setVoiceId(e.target.value);
          remember(AI_VOICE_KEY, e.target.value);
          dispose();
          setState('idle');
          setMeta(null);
        }}
      >
        {voices.map((v) => (
          <option key={v.id} value={v.id}>{label(v)}</option>
        ))}
      </select>
      {progress && state !== 'idle' && <span className="newsat">{t('tts.progress', progress)}</span>}
      {meta && (
        <span className="newsat">
          {meta.cached ? t('tts.ai.cached') : t('tts.ai.charged', meta.chars)} · {model}
        </span>
      )}
      {err && (
        <span className="cap warnline ttserr">
          {t(err.key, err.detail)}
          {err.key === 'tts.ai.failed' && err.detail ? ` (${err.detail})` : ''}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Giọng trình duyệt (Web Speech API) — đường lùi, nguyên bản #182/#183.
 * ------------------------------------------------------------------ */

function BrowserSpeaker({ text, lang, rateRef, t }: {
  text: string; lang: 'vi' | 'en'; rateRef: React.MutableRefObject<Rate>; t: (k: string, v?: any) => string;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Chrome bắn `voiceschanged` sau; nhưng một máy KHÔNG có giọng nào (Linux
  // không cài speech engine) thì không bao giờ bắn — không có mốc này thì
  // "đang tìm giọng" treo mãi, trông y hệt "đang chạy".
  const [settled, setSettled] = useState(false);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [state, setState] = useState<Exclude<State, 'loading'>>('idle');
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
    window.speechSynthesis.addEventListener('voiceschanged', load);
    setVoiceName(readRemembered(VOICE_KEY));
    const timer = setTimeout(() => setSettled(true), 2000);
    return () => {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, []);

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
      u.rate = rateRef.current;
      u.onend = () => {
        setProgress({ done: i + 1, total: chunks.length });
        speakAt(i + 1);
      };
      u.onerror = (e) => {
        if (run !== runRef.current) return;
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        setState('idle');
        setProgress(null);
      };
      window.speechSynthesis.speak(u);
    };
    speakAt(0);
  }, [text, voice, rateRef]);

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
    const have = voices.slice(0, 8).map((v) => `${v.name} (${v.lang})`).join(', ');
    return (
      <p className="cap warnline">
        {t('tts.noVoice', { lang: lang === 'vi' ? 'tiếng Việt' : 'English', n: voices.length, have })} {t('tts.howToAdd')}
      </p>
    );
  }

  return (
    <div className="ttsrow">
      {state === 'idle' ? (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={play}>🔊 {t('tts.play')}</button>
      ) : state === 'speaking' ? (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={pause}>⏸ {t('tts.pause')}</button>
      ) : (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={resume}>▶ {t('tts.resume')}</button>
      )}
      {state !== 'idle' && (
        <button type="button" className="rrgfullbtn ttsbtn" onClick={stop}>⏹ {t('tts.stop')}</button>
      )}
      {progress && state !== 'idle' && <span className="newsat">{t('tts.progress', progress)}</span>}
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
