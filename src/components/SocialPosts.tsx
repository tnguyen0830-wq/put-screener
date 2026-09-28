'use client';

import { useLang } from '@/lib/i18n';
import { MAX_TAGS, type StResult } from '@/lib/stocktwits';
import { CACHE_MS, type RdResult } from '@/lib/reddit';

/**
 * StockTwits và Reddit của mã đang mở — đúng những bài Claude đọc
 * (`socialFacts()`), để câu trả lời tra ngược được về màn hình. Cùng khuôn
 * khối X (#231): nhãn BÀN TÁN CHƯA KIỂM CHỨNG ngay đầu khối, và mỗi trạng
 * thái (đang tải / hỏng kèm lời thật / trả lời mà không có bài / có bài)
 * nói một câu riêng — "bị chặn" không được trông giống "không ai bàn".
 */
type T = (k: string, v?: any) => string;

function ago(iso: string | null, now: number, t: T): string {
  const ms = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(ms)) return '—';
  const min = Math.max(0, Math.round((now - ms) / 60_000));
  if (min < 60) return t('xp.min', min);
  const h = Math.round(min / 60);
  if (h < 48) return t('xp.hour', h);
  return t('xp.day', Math.round(h / 24));
}

function span(min: number | null, t: T): string {
  if (min === null) return t('st.spanUnknown');
  return min < 120 ? t('st.spanMin', min) : t('st.spanHour', Math.round(min / 60));
}

export function StocktwitsPosts({ st, loading }: { st: StResult | null; loading: boolean }) {
  const { t } = useLang();
  if (loading) return <p className="cap">{t('st.loading')}</p>;
  if (!st) return <p className="cap hint hint-warn">{t('st.none')}</p>;
  if (st.error)
    return (
      <p className="cap hint hint-warn xperr">
        {t(`st.fail.${st.errorKind ?? 'unavailable'}`)} {t('st.raw', st.error)}
      </p>
    );
  const now = Date.parse(st.fetchedAt) || Date.now();
  return (
    <div className="xposts">
      <p className="cap hint hint-warn">{t('st.caveat')}</p>
      {st.kept ? (
        <>
          <p className="cap sttags">
            {t('st.tagsLead', { n: st.kept, span: span(st.spanMinutes, t) })}{' '}
            <span className="good">{t('st.bull', st.tags.bullish)}</span> ·{' '}
            <span className="bad">{t('st.bear', st.tags.bearish)}</span> · {t('st.untagged', st.tags.none)}
          </p>
          <ul className="newslist xplist">
            {st.posts.map((p) => (
              <li key={p.id}>
                <span className="xptext">{p.body}</span>
                <span className="nmeta">
                  {p.user ? `@${p.user}` : t('xp.unknownAuthor')} · {ago(p.createdAt, now, t)}
                  {p.likes !== null ? ` · ${t('st.likes', p.likes)}` : ''}
                  {p.sentiment && (
                    <>
                      {' · '}
                      <span className={p.sentiment === 'bullish' ? 'good' : 'bad'}>
                        {p.sentiment === 'bullish' ? 'Bullish' : 'Bearish'}
                      </span>
                    </>
                  )}{' '}
                  ·{' '}
                  <a href={p.url} target="_blank" rel="noopener">
                    {t('st.open')}
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="cap">{t('st.empty', st.returned)}</p>
      )}
      <p className="cap">
        {t('st.note', {
          sym: st.asked,
          returned: st.returned,
          spam: st.dropped.spam,
          other: st.dropped.otherTicker,
          max: MAX_TAGS,
          min: Math.round(CACHE_MS / 60_000),
        })}
      </p>
    </div>
  );
}

export function RedditPosts({ rd, loading }: { rd: RdResult | null; loading: boolean }) {
  const { t } = useLang();
  if (loading) return <p className="cap">{t('rd.loading')}</p>;
  if (!rd) return <p className="cap hint hint-warn">{t('rd.none')}</p>;
  const routeLine = <p className="cap">{t(rd.route === 'oauth' ? 'rd.routeOauth' : 'rd.routePublic')}</p>;
  if (rd.error)
    return (
      <div className="xposts">
        <p className="cap hint hint-warn xperr">
          {t(`rd.fail.${rd.errorKind ?? 'unavailable'}`)} {t('st.raw', rd.error)}
        </p>
        {routeLine}
      </div>
    );
  const now = Date.parse(rd.fetchedAt) || Date.now();
  return (
    <div className="xposts">
      <p className="cap hint hint-warn">{t('rd.caveat')}</p>
      {rd.kept ? (
        <ul className="newslist xplist">
          {rd.posts.map((p) => (
            <li key={p.id}>
              <span className="xptext">
                <strong>{p.title}</strong>
                {p.snippet ? ` — ${p.snippet}` : ''}
              </span>
              <span className="nmeta">
                r/{p.subreddit ?? '?'} · {ago(p.createdAt, now, t)}
                {p.score !== null ? ` · ${t('rd.score', p.score)}` : ''}
                {p.comments !== null ? ` · ${t('rd.comments', p.comments)}` : ''} ·{' '}
                <a href={p.url} target="_blank" rel="noopener">
                  {t('rd.open')}
                </a>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cap">{t('rd.empty', rd.returned)}</p>
      )}
      <p className="cap">
        {t('rd.note', {
          q: rd.query,
          subs: rd.subreddits.map((s) => `r/${s}`).join(', '),
          returned: rd.returned,
          dropped: rd.dropped.notAbout,
          min: Math.round(CACHE_MS / 60_000),
        })}
        {rd.ambiguousTicker ? ` ${t('rd.ambiguous')}` : ''}
      </p>
      {routeLine}
    </div>
  );
}
