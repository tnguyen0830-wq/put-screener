'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRemembered, remember } from '@/lib/remember';
import SpeakBrief from './SpeakBrief';

/**
 * Tab Tin tức: hai cột (Thị trường | Chính trị-kinh tế), ảnh minh hoạ khi
 * nguồn có, một nút "Tóm tắt" gọi Claude MỘT lần cho cả hai cột. Chủ app đặt
 * hàng thêm hai điều: "News phải có hình ảnh nữa" và cả tiêu đề LẪN bản tóm
 * tắt phải theo đúng ngôn ngữ đang chọn (trước đó chỉ bản tóm tắt theo, tiêu
 * đề luôn nguyên văn tiếng Anh).
 *
 * **Tiêu đề tự dịch khi `lang === 'vi'`, không cần bấm — khác hẳn nút "Tóm
 * tắt".** Đây là dịch TỪNG DÒNG (`lib/newstranslate.ts`, `/api/news/translate`)
 * chứ không phải văn xuôi, và cache theo THỜI GIAN SỐNG 72 giờ trong RAM
 * (không phải trên đĩa như `profiletranslate.ts`, vì một tiêu đề không bao
 * giờ lặp lại nguyên văn sau khi rơi khỏi cửa sổ 48 giờ của chính tab này —
 * giữ nó lâu hơn thế chỉ là rác tích luỹ). Tiêu đề CHƯA dịch (đang chờ hoặc
 * dịch lỗi) hiện NGUYÊN VĂN tiếng Anh — không bao giờ một ô trống hay gạch
 * ngang, đúng luật của cả file này. `headlineViRef`/`triedTitlesRef` giữ
 * trạng thái qua `useRef` để effect không tự kích lại chính nó mỗi lần
 * `setState` (xem chú thích tại chỗ khai báo) — thiếu chặn đó là lặp vô hạn
 * khi thiếu `ANTHROPIC_API_KEY`, vì object rỗng mới vẫn đổi identity.
 *
 * **Ảnh: bốn nguồn, bốn cách đọc, không nguồn nào đo được từ sandbox** (cùng
 * lý do cả tab này là probe, xem `newsfeed.ts`). `imageOf()` trong `gnews.ts`
 * thử `<media:thumbnail>` / `<media:content>` / `<enclosure>` / `<img>` đầu
 * tiên trong mô tả theo thứ tự phổ biến nhất; X cần thêm `expansions=
 * attachments.media_keys` trên chính request tìm kiếm; UW đọc dung thứ vài
 * tên trường hay gặp, hoàn toàn chưa đo. Không có ảnh là bình thường (nhiều
 * feed không nhúng ảnh) - `<Thumb>` tự gỡ khi ảnh lỗi, không bao giờ vẽ biểu
 * tượng ảnh vỡ, cùng luật ảnh nghị sĩ #133/#134.
 *
 * Bốn trạng thái của một cột phải hiện khác nhau, vì bốn cách sửa khác nhau
 * (degradation idiom): đang tải / mọi nguồn của cột đều hỏng (in lỗi thật
 * từng nguồn) / nguồn sống mà không có bài trong 48 giờ / có bài. Cột trống
 * mà không nói vì sao trông y hệt "hôm nay không có tin".
 *
 * **Bản tóm tắt sống trong `localStorage`, không chỉ trong state.** Các tab
 * lớn của app loại trừ nhau bằng một chuỗi `? :` trong `page.tsx`
 * (`tab === 'news' ? <NewsPanel /> : …`), nên chuyển sang tab khác rồi quay
 * lại là NewsPanel bị GỠ HẲN khỏi cây React chứ không chỉ ẩn đi — mọi state
 * cục bộ (bản tóm tắt, lỗi, giờ viết) biến mất và mount lại từ đầu. Đúng
 * hình dạng lỗi "SPX bị mất mỗi lần thoát ra" mà #110 đã sửa cho tab GEX,
 * chủ app báo lại y hệt cho bản tóm tắt: "tóm tắt tiếng việt rồi ra app quay
 * lại thì mất hết, làm lại giữa luôn". `briefKeyOf()` băm THUẦN (không
 * `crypto`, chỉ so sánh cục bộ nên không cần) danh sách tiêu đề+cột hiện có;
 * lần mount ĐẦU TIÊN sau khi tải xong tiêu đề, nếu khoá đó khớp bản đã lưu
 * trong `localStorage` thì hiện lại ngay — KHÔNG gọi `/api/news/brief`, vì
 * gọi lại là một lượt Claude tự động mà không ai bấm, trái đúng luật "chỉ
 * chạy khi bấm" của route đó. Tiêu đề đã đổi (quá 5 phút, nguồn khác) thì
 * khoá không khớp và bản cũ không hiện lại — đúng, vì nó có thể đang nói về
 * một bộ tin đã cũ. Chỉ LƯU bản đã VIẾT XONG (`briefState === 'done'`), cùng
 * luật với cache 20 phút phía server (#181): một bản bị cắt/lỗi mà lưu lại
 * là lần sau ai quay lại cũng thấy đúng bản cụt đó.
 */

const BRIEF_STORE_KEY = 'newsbrief';

type StoredBrief = { key: string; lang: string; text: string; at: string | null };

/** Khoá THUẦN từ nội dung tiêu đề đang hiện — không phụ thuộc thứ tự, không
 *  phân biệt hoa/thường, giống hệt cách server tự băm (`briefKey()` trong
 *  `lib/newsbrief.ts`) nhưng không cần SHA-256 vì chỉ so sánh trên máy này. */
function briefKeyOf(items: { title: string; column: string }[]): string {
  return items
    .map((h) => `${h.column}|${h.title.trim().toLowerCase()}`)
    .sort()
    .join('\n');
}

type Column = 'market' | 'politics';
type Headline = {
  id: string;
  title: string;
  link: string;
  outlet: string;
  published: string;
  column: Column;
  kind: 'rss' | 'gnews' | 'x' | 'uw';
  image: string | null;
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
  // Chỉ thử khôi phục MỘT lần, ngay sau lần tải tiêu đề đầu tiên — không
  // phải mỗi khi `load` đổi (lượt tự tải lại mỗi 5 phút không được phép
  // ghi đè một bản tóm tắt đang hiện hoặc vừa viết xong trong phiên này).
  const restoredRef = useRef(false);

  /**
   * Dịch tiêu đề sang tiếng Việt, TỰ ĐỘNG khi `lang === 'vi'` — khác nút
   * "Tóm tắt", đây không cần bấm. `headlineViRef` giữ bản đầy đủ để tính
   * "tiêu đề nào CHƯA dịch" mà không phải đưa `headlineVi` vào deps của
   * effect (làm vậy sẽ tự kích lại chính nó mỗi lần setState, và nếu lượt
   * dịch thất bại — ví dụ thiếu key — sẽ lặp lại vô hạn vì object rỗng mới
   * vẫn đổi identity). `triedTitlesRef` nhớ những tiêu đề ĐÃ hỏi dù thành
   * hay bại, nên một tiêu đề dịch lỗi không bị hỏi lại liên tục trong cùng
   * một lượt mount — mở lại tab (App gỡ hẳn NewsPanel khi chuyển tab, xem
   * chú thích đầu file) là mount mới, tự thử lại từ đầu.
   */
  const headlineViRef = useRef<Record<string, string>>({});
  const [headlineVi, setHeadlineVi] = useState<Record<string, string>>({});
  const [headlineTrReason, setHeadlineTrReason] = useState<string | null>(null);
  const triedTitlesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (load.state !== 'ok' || lang !== 'vi') return;
    const all = [...load.data.market, ...load.data.politics];
    const need = [...new Set(all.map((h) => h.title))].filter(
      (t) => !(t in headlineViRef.current) && !triedTitlesRef.current.has(t)
    );
    if (!need.length) return;
    for (const t of need) triedTitlesRef.current.add(t);
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/news/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titles: need }),
        });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        if (j?.translations && Object.keys(j.translations).length) {
          headlineViRef.current = { ...headlineViRef.current, ...j.translations };
          setHeadlineVi(headlineViRef.current);
        }
        setHeadlineTrReason(j?.reason ?? null);
      } catch {
        if (alive) setHeadlineTrReason('failed');
      }
    })();
    return () => {
      alive = false;
    };
  }, [load, lang]);

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

  // Khôi phục bản tóm tắt đã lưu, đúng MỘT lần, khi tiêu đề vừa tải xong lần
  // đầu sau khi component này mount lại (tức sau khi chuyển tab rồi quay
  // lại). So khoá bằng đúng bộ tiêu đề đang hiện — không gọi mạng, không
  // tốn một lượt Claude nào.
  useEffect(() => {
    if (load.state !== 'ok' || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = readRemembered(BRIEF_STORE_KEY);
      if (!raw) return;
      const saved: StoredBrief = JSON.parse(raw);
      if (typeof saved?.text !== 'string' || !saved.text.trim() || saved.lang !== lang) return;
      const key = briefKeyOf([...load.data.market, ...load.data.politics]);
      if (saved.key !== key) return; // tiêu đề đã đổi - bản cũ có thể đang nói chuyện cũ
      setBrief(saved.text);
      setBriefAt(saved.at);
      setBriefState('done');
    } catch {
      /* localStorage hỏng hoặc JSON hỏng - bỏ qua, không được làm hỏng trang */
    }
  }, [load, lang]);

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
      const at = res.headers.get('X-Brief-At');
      setBriefAt(at);
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
      // Lưu CHỈ bản đã viết xong (không phải bản dở dang) - qua tab khác rồi
      // quay lại vẫn thấy được, đúng lý do effect khôi phục ở trên tồn tại.
      try {
        const stored: StoredBrief = { key: briefKeyOf(all), lang, text: acc, at };
        remember(BRIEF_STORE_KEY, JSON.stringify(stored));
      } catch {
        /* localStorage đầy/bị chặn - chạy tiếp, chỉ không nhớ được */
      }
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

        {/* Chỉ nói khi THẬT SỰ có lỗi — dịch xong không cần một dòng nào,
            im lặng đúng là kết quả tốt. Tiêu đề chưa dịch vẫn hiện tiếng
            Anh ngay bên dưới, không có ô trống hay gạch ngang nào. */}
        {lang === 'vi' && headlineTrReason && (
          <p className="cap warnline">
            {t(
              headlineTrReason === 'no-key'
                ? 'nw.headlinesTrNoKey'
                : headlineTrReason === 'bad-key'
                  ? 'nw.headlinesTrBadKey'
                  : headlineTrReason === 'rate-limited'
                    ? 'nw.headlinesTrRateLimited'
                    : headlineTrReason === 'truncated'
                      ? 'nw.headlinesTrTruncated'
                      : headlineTrReason === 'bad-request'
                        ? 'nw.headlinesTrBadRequest'
                        : 'nw.headlinesTrFailed'
            )}
          </p>
        )}

        {load.state === 'error' ? (
          <p className="cap warnline">{t('nw.loadFailed', load.msg)}</p>
        ) : (
          <div className="newsgrid">
            <NewsColumn column="market" load={load} now={now} t={t} lang={lang} headlineVi={headlineVi} />
            <NewsColumn column="politics" load={load} now={now} t={t} lang={lang} headlineVi={headlineVi} />
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
  lang,
  headlineVi,
}: {
  column: Column;
  load: Load;
  now: number;
  t: (k: string, v?: any) => string;
  lang: string;
  headlineVi: Record<string, string>;
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
          {items.map((h) => {
            // Tiếng Việt: dùng bản dịch nếu ĐÃ dịch xong, nguyên văn tiếng
            // Anh trong lúc chờ hoặc khi dịch lỗi — không bao giờ ô trống.
            const title = lang === 'vi' ? headlineVi[h.title] ?? h.title : h.title;
            return (
              <li key={h.id} className={`newsitem kind-${h.kind}`}>
                {h.image && <Thumb src={h.image} />}
                <div className="newsbody">
                  <a href={h.link} target="_blank" rel="noopener noreferrer" className="newstitle">
                    {title}
                  </a>
                  <span className="newsmeta">
                    {KIND_TAG[h.kind] && <span className={`newskind newskind-${h.kind}`}>{KIND_TAG[h.kind]}</span>}
                    <span className="newsoutlet">{h.outlet}</span>
                    <span className="newsago">{ago(h.published, now, t)}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Ảnh minh hoạ một dòng tin. Ảnh hỏng (URL chết, chặn hotlink, CORS) thì tự
 * GỠ chứ không để trình duyệt vẽ biểu tượng ảnh vỡ — cùng luật "không bao
 * giờ hiện ảnh vỡ" đã áp cho ảnh nghị sĩ (#133/#134): fallback ở đây là
 * KHÔNG có gì, đơn giản hơn ảnh nghị sĩ (không cần vẽ chữ cái thay thế) vì
 * dòng tin vẫn đọc được đầy đủ mà không cần ảnh.
 */
function Thumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className="newsthumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
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
