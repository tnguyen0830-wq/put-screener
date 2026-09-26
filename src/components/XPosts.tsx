'use client';

import { useLang } from '@/lib/i18n';
import { CACHE_MS, MAX_CASHTAGS, type XSymbolResult } from '@/lib/xsymbol';

/**
 * Bài đăng X về mã đang mở — đúng những bài Claude đọc (`xFacts()`), để câu
 * trả lời tra ngược được về màn hình. Dán nhãn BÀN TÁN CHƯA KIỂM CHỨNG ngay
 * đầu khối: một bài trên X trông y hệt một dòng tin nếu không nói ra.
 */
function ago(iso: string | null, now: number, t: (k: string, v?: any) => string): string {
  const ms = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(ms)) return '—';
  const min = Math.max(0, Math.round((now - ms) / 60_000));
  if (min < 60) return t('xp.min', min);
  const h = Math.round(min / 60);
  if (h < 48) return t('xp.hour', h);
  return t('xp.day', Math.round(h / 24));
}

export default function XPosts({ x, loading }: { x: XSymbolResult | null; loading: boolean }) {
  const { t } = useLang();
  if (loading) return <p className="cap">{t('xp.loading')}</p>;
  if (!x) return <p className="cap hint hint-warn">{t('xp.none')}</p>;
  if (!x.configured) return <p className="cap">{t('xp.notConfigured')}</p>;
  if (x.error) return <p className="cap hint hint-warn xperr">{t('xp.failed', x.error)}</p>;
  const now = Date.parse(x.fetchedAt) || Date.now();
  return (
    <div className="xposts">
      <p className="cap hint hint-warn">{t('xp.caveat')}</p>
      {x.posts.length ? (
        <ul className="newslist xplist">
          {x.posts.map((p) => (
            <li key={p.id}>
              <span className="xptext">{p.text}</span>
              <span className="nmeta">
                {p.authorHandle ? `@${p.authorHandle}` : t('xp.unknownAuthor')} · {ago(p.createdAt, now, t)}
                {p.engagement !== null ? ` · ${t('xp.eng', p.engagement)}` : ''} ·{' '}
                <a href={p.url} target="_blank" rel="noopener">
                  {t('xp.open')}
                </a>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cap">{t('xp.empty', x.returned)}</p>
      )}
      <p className="cap">
        {t('xp.note', {
          q: x.query ?? '',
          returned: x.returned,
          other: x.dropped.otherTicker,
          spam: x.dropped.spam,
          max: MAX_CASHTAGS,
          min: Math.round(CACHE_MS / 60_000),
        })}
        {x.metricsDropped ? ` ${t('xp.noMetrics')}` : ''}
      </p>
      {x.apiErrors.length > 0 && <p className="cap hint hint-warn xperr">{t('xp.partial', x.apiErrors.join(' | '))}</p>}
    </div>
  );
}
