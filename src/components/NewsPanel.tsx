'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';
import SpeakBrief from './SpeakBrief';

/**
 * Tab Tin tức: hai cột (Thị trường | Chính trị-kinh tế), tiêu đề tiếng Anh
 * nguyên văn, một nút "Tóm tắt tiếng Việt" gọi Claude MỘT lần cho cả hai cột.
 *
 * Bốn trạng thái của một cột phải hiện khác nhau, vì bốn cách sửa khác nhau
 * (degradation idiom): đang tải / mọi nguồn của cột đều hỏng (in lỗi thật
 * từng nguồn) / nguồn sống mà không có bài trong 48 giờ / có bài. Cột trống
 * mà không nói vì sao trông y hệt "hôm nay không có tin".
 */

type Column = 'market' | 'politics';
type Headline = {
  id: string;
  title: string;
  link: string;
  outlet: string;
  published: string;
  column: Column;
  kind: 'rss' | 'gnews' | 'x' | 'uw';
};
type SourceStatus = {
  id: string;
  label: string;
  kind: Headline['kind'];
  column: Column;
  ok: boolean;
  count: number;
  error?: string;
  status?: number;
  skipped?: 'not-configured' | 'paused';
  pausedUntil?: string;
};
type Payload = {
  at: string;
  market: Headline[];
  politics: Headline[];
  sources: SourceStatus[];
  xConfigured: boolean;
  uwConfigured: boolean;
  cached: boolean;
};

type Load = { state: 'loading' } | { state: 'error'; msg: string } | { state: 'ok'; data: Payload };

const KIND_TAG: Record<Headline['kind'], string | null> = { rss: null, gnews: 'G', x: 'X', uw: 'UW' };

/** "3 phút trước" / "2 giờ trước" — tin thì tuổi quan trọng hơn giờ tuyệt đối. */
function ago(iso: string, now: number, t: (k: string, v?: any) => string): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return t('nw.justNow');
  if (m < 60) return t('nw.minAgo', m);
  const h = Math.floor(m / 60);
  if (h < 48) return t('nw.hourAgo', h);
  return t('nw.dayAgo', Math.floor(h / 24));
}

export default function NewsPanel() {
  const { t, lang } = useLang();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [brief, setBrief] = useState<string>('');
  const [briefState, setBriefState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [briefErr, setBriefErr] = useState<string | null>(null);
  const [briefAt, setBriefAt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchNews = useCallback(async (refresh: boolean) => {
    if (refresh) setRefreshing(true);
    try {
      const r = await fetch(`/api/news${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setLoad({ state: 'error', msg: j?.error ?? `HTTP ${r.status}` });
        return;
      }
      setLoad({ state: 'ok', data: await r.json() });
      setNow(Date.now());
    } catch (e: any) {
      setLoad({ state: 'error', msg: String(e?.message ?? e) });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(false);
    // Tự tải lại mỗi 5 phút — đúng nhịp cache của server, nên không tốn thêm
    // request nguồn nào; chỉ để "3 phút trước" không đứng yên cả buổi.
    const id = setInterval(() => fetchNews(false), 5 * 60_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(id);
      clearInterval(tick);
      abortRef.current?.abort();
    };
  }, [fetchNews]);

  const summarize = useCallback(async () => {
    if (load.state !== 'ok' || briefState === 'busy') return;
    const all = [...load.data.market, ...load.data.politics];
    if (!all.length) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setBrief('');
    setBriefErr(null);
    setBriefAt(null);
    setBriefState('busy');
    try {
      const res = await fetch('/api/news/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Gửi lên đúng thứ đang hiện — bản tóm tắt không thể nói về một bộ
        // tiêu đề khác với hai cột bên cạnh.
        body: JSON.stringify({
          lang,
          headlines: all.map((h) => ({
            title: h.title,
            outlet: h.kind === 'x' ? `X ${h.outlet}` : h.outlet,
            published: h.published,
            column: h.column,
          })),
        }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setBriefErr(j?.error === 'AI_NOT_CONFIGURED' ? 'ai.notConfigured' : 'ai.failed');
        setBriefState('error');
        return;
      }
      setBriefAt(res.headers.get('X-Brief-At'));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const marker = acc.match(/\[(AI_[A-Z_]+|REFUSED)\]\s*$/);
        if (marker) {
          setBrief(acc.slice(0, marker.index).trimEnd());
          setBriefErr(
            marker[1] === 'AI_BAD_KEY'
              ? 'ai.badKey'
              : marker[1] === 'AI_RATE_LIMITED'
                ? 'ai.rateLimited'
                : marker[1] === 'REFUSED'
                  ? 'ai.refused'
                  : marker[1] === 'AI_TRUNCATED'
                    ? 'nw.briefTruncated'
                    : 'ai.failed'
          );
          setBriefState('error');
          return;
        }
        setBrief(acc);
      }
      setBriefState('done');
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setBriefErr('ai.failed');
      setBriefState('error');
    }
  }, [load, lang, briefState]);

  const data = load.state === 'ok' ? load.data : null;
  const total = data ? data.market.length + data.politics.length : 0;

  return (
    <section className="panel newspanel">
      <div className="panel-head newshead">
        <span>{t('nw.title')}</span>
        <span className="newsactions">
          {data && (
            <span className="newsat">
              {t('nw.updatedAt', new Date(data.at).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' }))}
            </span>
          )}
          <button type="button" className="rrgfullbtn" onClick={() => fetchNews(true)} disabled={refreshing || load.state === 'loading'}>
            {refreshing ? t('nw.refreshing') : t('nw.refresh')}
          </button>
          <button
            type="button"
            className="run newsbriefbtn"
            onClick={summarize}
            disabled={!data || total === 0 || briefState === 'busy'}
          >
            {briefState === 'busy' ? t('nw.briefBusy') : t('nw.briefBtn')}
          </button>
        </span>
      </div>
      <div className="panel-body">
        <p className="cap">{t('nw.intro')}</p>

        {(briefState !== 'idle' || brief) && (
          <div className="newsbrief">
            <div className="newsbriefhead">
              {t('nw.briefHead')}
              {briefAt && (
                <span className="newsat">
                  {' · '}
                  {t('nw.briefAt', new Date(briefAt).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' }))}
                </span>
              )}
            </div>
            {brief ? <div className="newsbrieftext">{brief}</div> : briefState === 'busy' ? <p className="cap">{t('nw.briefBusy')}</p> : null}
            {/* Chỉ khi ĐÃ VIẾT XONG: đọc một bản đang stream là đọc nửa câu
                rồi im, hoặc đọc bản cụt. */}
            {brief && briefState === 'done' && <SpeakBrief text={brief} lang={lang === 'en' ? 'en' : 'vi'} />}
            {briefErr && <p className="cap warnline">{t(briefErr)}</p>}
            <p className="cap">{t('nw.briefNote')}</p>
          </div>
        )}

        {load.state === 'error' ? (
          <p className="cap warnline">{t('nw.loadFailed', load.msg)}</p>
        ) : (
          <div className="newsgrid">
            <NewsColumn column="market" load={load} now={now} t={t} />
            <NewsColumn column="politics" load={load} now={now} t={t} />
          </div>
        )}

        {data && <Sources sources={data.sources} xConfigured={data.xConfigured} uwConfigured={data.uwConfigured} t={t} />}
      </div>
    </section>
  );
}

function NewsColumn({
  column,
  load,
  now,
  t,
}: {
  column: Column;
  load: Load;
  now: number;
  t: (k: string, v?: any) => string;
}) {
  const title = column === 'market' ? t('nw.colMarket') : t('nw.colPolitics');
  if (load.state !== 'ok') {
    return (
      <div className="newscol">
        <h3 className="newscolhead">{title}</h3>
        <p className="cap">{t('nw.loading')}</p>
      </div>
    );
  }
  const items = load.data[column];
  const srcs = load.data.sources.filter((s) => s.column === column);
  const alive = srcs.filter((s) => s.ok);
  // Nguồn đang NGHỈ vì lần trước đo được là chết cũng tính là hỏng cho câu
  // này — nó không phải "chưa cấu hình", và phần Nguồn in lý do thật.
  const failed = srcs.filter((s) => !s.ok && s.skipped !== 'not-configured');

  return (
    <div className="newscol">
      <h3 className="newscolhead">
        {title} <span className="newscount">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        /* Ba lý do trống, ba câu: mọi nguồn hỏng (kèm lỗi thật ở phần
           Nguồn) / có nguồn sống nhưng 48 giờ không bài / không nguồn nào
           được cấu hình cho cột này. */
        <p className="cap warnline">
          {alive.length ? t('nw.emptyAlive', alive.length) : failed.length ? t('nw.emptyFailed', failed.length) : t('nw.emptyNoSource')}
        </p>
      ) : (
        <ul className="newslist">
          {items.map((h) => (
            <li key={h.id} className={`newsitem kind-${h.kind}`}>
              <a href={h.link} target="_blank" rel="noopener noreferrer" className="newstitle">
                {h.title}
              </a>
              <span className="newsmeta">
                {KIND_TAG[h.kind] && <span className={`newskind newskind-${h.kind}`}>{KIND_TAG[h.kind]}</span>}
                <span className="newsoutlet">{h.outlet}</span>
                <span className="newsago">{ago(h.published, now, t)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Trạng thái TỪNG nguồn — đây là probe của tab (không nguồn nào đo được từ
 * sandbox). Ba nhóm: sống (số bài), hỏng (mã + 160 ký tự thật), tắt/nghỉ.
 */
function Sources({
  sources,
  xConfigured,
  uwConfigured,
  t,
}: {
  sources: SourceStatus[];
  xConfigured: boolean;
  uwConfigured: boolean;
  t: (k: string, v?: any) => string;
}) {
  const [open, setOpen] = useState(false);
  const ok = sources.filter((s) => s.ok);
  const bad = sources.filter((s) => !s.ok && !s.skipped);
  const off = sources.filter((s) => s.skipped);
  return (
    <details className="newssources" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cap">
        {t('nw.sourcesSummary', { ok: ok.length, bad: bad.length, off: off.length })}
      </summary>
      <ul className="newssrclist">
        {sources.map((s) => (
          <li key={s.id} className={s.ok ? 'good' : s.skipped ? 'off' : 'bad'}>
            <span className="newssrcname">
              {s.ok ? '✓' : s.skipped ? '·' : '✗'} {s.label}
              <span className="newssrccol"> · {s.column === 'market' ? t('nw.colMarket') : t('nw.colPolitics')}</span>
            </span>
            <span className="newssrcinfo">
              {s.ok
                ? t('nw.srcOk', s.count)
                : s.skipped === 'paused'
                  ? t('nw.srcPaused', s.pausedUntil ? new Date(s.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '?')
                  : s.skipped === 'not-configured'
                    ? s.kind === 'x'
                      ? xConfigured
                        ? t('nw.srcXNoAccounts')
                        : t('nw.srcXNoToken')
                      : s.kind === 'uw'
                        ? t('nw.srcUwNoKey')
                        : t('nw.srcOff')
                    : s.error ?? t('nw.srcFailed')}
            </span>
          </li>
        ))}
      </ul>
      <p className="cap">{t('nw.sourcesNote')}</p>
      {!uwConfigured || !xConfigured ? <p className="cap">{t('nw.sourcesOptional')}</p> : null}
    </details>
  );
}
