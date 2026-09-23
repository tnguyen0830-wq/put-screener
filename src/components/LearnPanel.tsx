'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLang } from '@/lib/i18n';
import { LESSONS, REFERENCE, REF_GROUPS, SECTIONS, SECTION_IDS, lessonById, pick, type Lesson, type RefEntry, type RefGroup, type SectionId } from '@/lib/learn';
import type { LessonResult } from '@/lib/learnstore';
import { readRemembered, readRememberedOneOf, remember } from '@/lib/remember';
import AskLesson from './AskLesson';
import LearnFigure from './LearnFigure';
import PatternsPanel from './PatternsPanel';

const LEARN_MODES = ['lessons', 'reference', 'patterns'] as const;
type LearnMode = (typeof LEARN_MODES)[number];

/**
 * Tab Learn — bài học song ngữ về nến/mẫu hình, GEX & bề rộng, flow/dark
 * pool/insider, và cách app chấm điểm bán put.
 *
 * Nội dung là HẰNG SỐ trong `lib/learn/*` (thuần, import thẳng); component
 * này chỉ dựng, chấm câu hỏi tại chỗ, và nói chuyện với hai route:
 *  - `GET/POST /api/learn/progress` — điểm theo NGƯỜI, phía server (cùng ba
 *    lý do `lt-store.ts`: nhiều thiết bị, nhiều người, không mất khi xoá
 *    trình duyệt).
 *  - `POST /api/ai/learn` — qua `AskLesson`.
 *
 * Chấm ở client vì đáp án nằm ngay trong bundle (bài học không phải bí mật);
 * server chỉ giữ TỔNG (mẫu số lấy từ chính bài, không tin client) và điểm cao
 * nhất. Một lượt lưu hỏng không giấu: điểm vẫn hiện, kèm dòng nói HTTP thật.
 *
 * Nút "Xem thật ở tab …" gọi `onOpen(tab, sub)` — bài học đứng cạnh dữ liệu
 * sống của chính app, không phải một cuốn sách rời.
 */
type Progress = Record<string, LessonResult>;

/** `**đậm**` trong dòng — đúng một kiểu đánh dấu, cố ý không hơn. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>));
}

/** Một đoạn: nếu MỌI dòng bắt đầu bằng `- ` thì là danh sách, còn lại là <p>. */
function Para({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length && lines.every((l) => l.startsWith('- '))) {
    return (
      <ul className="learnlist">
        {lines.map((l, i) => (
          <li key={i}>{inline(l.slice(2))}</li>
        ))}
      </ul>
    );
  }
  return <p>{inline(text)}</p>;
}

export default function LearnPanel({ onOpen }: { onOpen: (tab: string, sub?: string) => void }) {
  const { t, lang } = useLang();
  const [section, setSection] = useState<SectionId>('candles');
  const [lessonId, setLessonId] = useState<string>(SECTIONS[0].lessons[0].id);
  const [progress, setProgress] = useState<Progress>({});
  const [progressErr, setProgressErr] = useState<string | null>(null);
  /* Hai chế độ: đọc BÀI (một lần) và TRA CỨU (xem lại). Chủ app đặt hàng
     cái thứ hai đúng bằng lời này: "có những kiểu nến và pattern để coi lại
     khi học hết rồi". */
  /* Chế độ thứ ba, Patterns (#217): máy dò mẫu hình trên nến THẬT. Nó từng
     là một tab chính riêng; chủ app muốn nó nằm trong Learn — đọc bài về
     cây búa xong là bấm sang xem app đang dò được cây búa nào ngay tại chỗ,
     không phải đi ra thanh tab trên cùng. */
  const [mode, setMode] = useState<LearnMode>('lessons');
  const pickMode = (m: LearnMode) => {
    setMode(m);
    remember('learnMode', m);
  };
  /* Mọi lối "sang Patterns" (thẻ tra cứu, nút "Xem thật" của sáu bài nến)
     giờ đổi chế độ NGAY TẠI ĐÂY thay vì gọi lên trang: tab chính 'patterns'
     không còn tồn tại, gọi lên sẽ bị `page.tsx` bỏ qua lặng lẽ — một nút
     bấm không ra gì. */
  const open = (tab: string, sub?: string) => {
    if (tab === 'patterns') pickMode('patterns');
    else onOpen(tab, sub);
  };

  /* Đọc bộ nhớ SAU hydration (#110): render đầu phải giống server. */
  useEffect(() => {
    const m = readRememberedOneOf<LearnMode>('learnMode', LEARN_MODES);
    if (m) setMode(m);
    const s = readRememberedOneOf<SectionId>('learnSection', SECTION_IDS);
    const l = readRemembered('learnLesson');
    const lesson = l ? lessonById(l) : undefined;
    if (lesson) {
      setSection(lesson.section);
      setLessonId(lesson.id);
    } else if (s) {
      setSection(s);
      setLessonId(SECTIONS.find((x) => x.id === s)!.lessons[0].id);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/learn/progress')
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok) {
          setProgressErr(`HTTP ${r.status}${j?.error ? ` ${j.error}` : ''}`);
          return;
        }
        setProgress(j?.progress && typeof j.progress === 'object' ? j.progress : {});
      })
      .catch((e) => alive && setProgressErr(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  const sec = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const lesson = lessonById(lessonId) ?? sec.lessons[0];

  const choose = (id: string) => {
    const l = lessonById(id);
    if (!l) return;
    setSection(l.section);
    setLessonId(l.id);
    remember('learnSection', l.section);
    remember('learnLesson', l.id);
  };
  const chooseSection = (id: SectionId) => {
    setSection(id);
    remember('learnSection', id);
    const first = SECTIONS.find((s) => s.id === id)!.lessons[0];
    setLessonId(first.id);
    remember('learnLesson', first.id);
  };

  const passed = useMemo(
    () => LESSONS.filter((l) => (progress[l.id]?.best ?? 0) >= l.quiz.length).length,
    [progress]
  );

  return (
    <section className="panel learn">
      <div className="panel-head">
        <h2>{t('learn.title')}</h2>
        <span className="cap">{t('learn.done', { n: passed, m: LESSONS.length })}</span>
      </div>
      <div className="panel-body">
        <div className="segmented hmranges learnmode" role="tablist">
          {LEARN_MODES.map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : undefined}
              onClick={() => pickMode(m)}>
              {t(`learn.mode.${m}`)}
            </button>
          ))}
        </div>

        {mode === 'patterns' ? (
          <PatternsPanel
            onOpen={(to, sub) => {
              // "Học cách đọc các mẫu này" — giờ là chế độ Bài học, mở đúng
              // phần nến, chứ không còn là một tab khác.
              if (to === 'learn') {
                chooseSection('candles');
                pickMode('lessons');
              } else open(to, sub);
            }}
          />
        ) : mode === 'reference' ? (
          <ReferenceView onLesson={(id) => { choose(id); pickMode('lessons'); }} onOpen={open} />
        ) : (
        <>
        <p className="cap">{t('learn.intro')}</p>

        <div className="segmented hmranges learnsecs" role="tablist">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === section}
              className={s.id === section ? 'on' : undefined}
              onClick={() => chooseSection(s.id)}
            >
              {t(`learn.sec.${s.id}`)}
            </button>
          ))}
        </div>

        <div className="learnwrap">
          <ol className="learnnav" aria-label={t(`learn.sec.${section}`)}>
            {sec.lessons.map((l, i) => {
              const r = progress[l.id];
              const done = !!r && r.best >= l.quiz.length;
              return (
                <li key={l.id}>
                  <button className={l.id === lesson.id ? 'on' : undefined} onClick={() => choose(l.id)}>
                    <span className="learnnum">{i + 1}</span>
                    <span className="learnttl">{pick(l.title, lang)}</span>
                    <span className={`learnmark${done ? ' ok' : r ? ' part' : ''}`} title={r ? `${r.best}/${r.total}` : undefined}>
                      {done ? '✓' : r ? `${r.best}/${r.total}` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <LessonView
            key={lesson.id}
            lesson={lesson}
            result={progress[lesson.id]}
            onOpen={open}
            onSaved={(r) => setProgress((p) => ({ ...p, [lesson.id]: r }))}
          />
        </div>

        {progressErr && <p className="hint hint-warn">{t('learn.progress.loadFailed', progressErr)}</p>}
        <p className="cap">{t('learn.progress.note')}</p>
        </>
        )}
      </div>
    </section>
  );
}

/**
 * Bảng tra cứu: mọi kiểu nến / mẫu hình trên một trang. Nội dung ở
 * `lib/learn/reference.ts`; ở đây chỉ lọc (nhóm + tìm tên) và dựng thẻ.
 */
function ReferenceView({ onLesson, onOpen }: { onLesson: (lessonId: string) => void; onOpen: (tab: string, sub?: string) => void }) {
  const { t, lang } = useLang();
  const [group, setGroup] = useState<RefGroup | 'all'>('all');
  const [q, setQ] = useState('');
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const needle = norm(q.trim());
  const items = REFERENCE.filter((r) => (group === 'all' || r.group === group) && (!needle || norm(pick(r.name, lang)).includes(needle) || norm(r.name.en).includes(needle) || norm(r.name.vi).includes(needle)));
  return (
    <div className="learnref">
      <p className="cap">{t('learn.ref.intro')}</p>
      <div className="refbar">
        <div className="chiprow" role="group">
          {(['all', ...REF_GROUPS] as const).map((g) => (
            <button key={g} className={group === g ? 'on' : undefined} aria-pressed={group === g} onClick={() => setGroup(g)}>
              {t(`learn.ref.group.${g}`)}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('learn.ref.search')} aria-label={t('learn.ref.search')} />
        <span className="cap">{t('learn.ref.count', { n: items.length })}</span>
      </div>
      {items.length === 0 && <p className="hint">{t('learn.ref.empty')}</p>}
      <div className="refgrid">
        {items.map((r) => (
          <RefCard key={r.id} r={r} onLesson={onLesson} />
        ))}
      </div>
      <p className="cap patlearn">
        <button className="rrgfullbtn" onClick={() => onOpen('patterns')}>{t('learn.ref.seePatterns')} →</button>
      </p>
    </div>
  );
}

function RefCard({ r, onLesson }: { r: RefEntry; onLesson: (lessonId: string) => void }) {
  const { t, lang } = useLang();
  const lesson = lessonById(r.lesson);
  return (
    <article className="refcard" data-ref={r.id}>
      <div className="refhead">
        <h4>{pick(r.name, lang)}</h4>
        <span className={`patchip ${r.side}`}>{t(`learn.ref.side.${r.side}`)}</span>
      </div>
      <LearnFigure id={r.figure} lang={lang} />
      <p>{pick(r.gist, lang)}</p>
      <p><b>{t('learn.ref.confirm')}</b>{pick(r.confirm, lang)}</p>
      <p><b>{t('learn.ref.trap')}</b>{pick(r.trap, lang)}</p>
      <div className="reffoot">
        <span className={`refdet${r.patternId ? ' yes' : ''}`}>{r.patternId ? `✓ ${t('learn.ref.detected')}` : t('learn.ref.notDetected')}</span>
        {lesson && (
          <button className="rrgfullbtn" onClick={() => onLesson(lesson.id)}>{t('learn.ref.lesson')}: {pick(lesson.title, lang)} →</button>
        )}
      </div>
    </article>
  );
}

function LessonView({
  lesson,
  result,
  onOpen,
  onSaved,
}: {
  lesson: Lesson;
  result?: LessonResult;
  onOpen: (tab: string, sub?: string) => void;
  onSaved: (r: LessonResult) => void;
}) {
  const { t, lang } = useLang();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [graded, setGraded] = useState<{ score: number } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = lesson.quiz.length;
  const allAnswered = lesson.quiz.every((_, i) => answers[i] !== undefined);

  const grade = async () => {
    const score = lesson.quiz.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
    setGraded({ score });
    setSaveErr(null);
    setSaving(true);
    try {
      const r = await fetch('/api/learn/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, score }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.result) {
        setSaveErr(`HTTP ${r.status}${j?.error ? ` ${j.error}` : ''}`);
        return;
      }
      onSaved(j.result as LessonResult);
    } catch (e: any) {
      setSaveErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const retry = () => {
    setAnswers({});
    setGraded(null);
    setSaveErr(null);
  };

  return (
    <article className="learnlesson">
      <h3 className="learnh">{pick(lesson.title, lang)}</h3>
      <p className="learnsum">{pick(lesson.summary, lang)}</p>

      {lesson.figures.map((f) => (
        <figure key={f} className="learnfigwrap">
          <LearnFigure id={f} lang={lang} />
        </figure>
      ))}

      <div className="learnbody">
        {lesson.body.map((p, i) => (
          <Para key={i} text={pick(p, lang)} />
        ))}
      </div>

      {lesson.traps?.length ? (
        <div className="learntraps">
          <h4 className="dsec">{t('learn.traps')}</h4>
          <ul className="learnlist">
            {lesson.traps.map((p, i) => (
              <li key={i}>{inline(pick(p, lang))}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {lesson.seeIn && (
        <p className="learnsee">
          <button className="rrgfullbtn" onClick={() => onOpen(lesson.seeIn!.tab, lesson.seeIn!.sub)}>
            {t('learn.seeIn')} {pick(lesson.seeIn.label, lang)} →
          </button>
        </p>
      )}

      <section className="learnquiz">
        <h4 className="dsec">{t('learn.quiz.title')}</h4>
        {result && (
          <p className="cap">
            {t('learn.quiz.prev', { best: result.best, total: result.total, attempts: result.attempts })}
          </p>
        )}
        {lesson.quiz.map((q, qi) => {
          const chosen = answers[qi];
          const right = graded ? chosen === q.answer : null;
          return (
            <fieldset key={qi} className={`learnq${graded ? (right ? ' right' : ' wrong') : ''}`}>
              <legend>
                {qi + 1}. {pick(q.q, lang)}
              </legend>
              {q.choices.map((c, ci) => (
                <label key={ci} className="check learnchoice">
                  <input
                    type="radio"
                    name={`q-${lesson.id}-${qi}`}
                    checked={chosen === ci}
                    disabled={!!graded}
                    onChange={() => setAnswers((a) => ({ ...a, [qi]: ci }))}
                  />
                  <span>{pick(c, lang)}</span>
                  {graded && ci === q.answer && <span className="learnkey">✓</span>}
                </label>
              ))}
              {graded && (
                <p className={`learnwhy${right ? '' : ' hint hint-warn'}`}>
                  <strong>{right ? t('learn.quiz.correct') : t('learn.quiz.wrong')}</strong> {pick(q.why, lang)}
                </p>
              )}
            </fieldset>
          );
        })}
        <div className="learnask-row">
          {graded ? (
            <>
              <strong className="learnscore">{t('learn.quiz.result', { score: graded.score, total })}</strong>
              <button className="aibtn" onClick={retry}>
                {t('learn.quiz.retry')}
              </button>
            </>
          ) : (
            <>
              <span className="cap">{allAnswered ? '' : t('learn.quiz.answerAll')}</span>
              <button className="aibtn" onClick={grade} disabled={!allAnswered || saving}>
                {t('learn.quiz.grade')}
              </button>
            </>
          )}
        </div>
        {saveErr && <p className="hint hint-warn">{t('learn.quiz.saveFailed', saveErr)}</p>}
      </section>

      <AskLesson lessonId={lesson.id} />
    </article>
  );
}
