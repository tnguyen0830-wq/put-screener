import { CANDLE_LESSONS } from './candles';
import { GEX_LESSONS } from './gex';
import { FLOW_LESSONS } from './flow';
import { PUT_LESSONS } from './putselling';
import { FIGURE_IDS, SECTION_IDS, type L, type Lesson, type SectionId } from './types';

export type { L, Lesson, QuizQ, SeeIn, SectionId, FigureId } from './types';
export { SECTION_IDS, FIGURE_IDS } from './types';

/**
 * Bốn phần, thứ tự hiển thị. Tên phần là NHÃN GIAO DIỆN nên nằm ở `i18n.tsx`
 * (`learn.sec.<id>`), không ở đây — cùng luật với `tab.*`.
 */
export const SECTIONS: { id: SectionId; lessons: Lesson[] }[] = [
  { id: 'candles', lessons: CANDLE_LESSONS },
  { id: 'gex', lessons: GEX_LESSONS },
  { id: 'flow', lessons: FLOW_LESSONS },
  { id: 'putselling', lessons: PUT_LESSONS },
];

export const LESSONS: Lesson[] = SECTIONS.flatMap((s) => s.lessons);

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function pick(l: L, lang: 'vi' | 'en'): string {
  return lang === 'en' ? l.en : l.vi;
}

/** Tổng số câu hỏi của một bài — mẫu số của điểm hiện trên màn hình. */
export function quizTotal(l: Lesson): number {
  return l.quiz.length;
}

/**
 * Kiểm tra tính toàn vẹn của toàn bộ nội dung. Chạy trong test, KHÔNG chạy lúc
 * render — nội dung là hằng số, kiểm một lần lúc build là đủ.
 *
 * Trả về danh sách lỗi (rỗng = ổn) thay vì ném, để một lượt chạy in ra HẾT
 * lỗi chứ không dừng ở lỗi đầu tiên.
 */
export function validateLessons(): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  const usedFigures = new Set<string>();
  const hasBoth = (x: L | undefined, where: string) => {
    if (!x) return errs.push(`${where}: thiếu`);
    if (typeof x.vi !== 'string' || !x.vi.trim()) errs.push(`${where}: thiếu vi`);
    if (typeof x.en !== 'string' || !x.en.trim()) errs.push(`${where}: thiếu en`);
  };
  for (const s of SECTIONS) {
    if (!(SECTION_IDS as readonly string[]).includes(s.id)) errs.push(`section lạ: ${s.id}`);
    if (!s.lessons.length) errs.push(`section ${s.id} không có bài`);
    for (const l of s.lessons) {
      const w = `${s.id}/${l.id}`;
      if (ids.has(l.id)) errs.push(`${w}: id trùng`);
      ids.add(l.id);
      if (l.section !== s.id) errs.push(`${w}: section không khớp (${l.section})`);
      hasBoth(l.title, `${w}.title`);
      hasBoth(l.summary, `${w}.summary`);
      if (!l.body.length) errs.push(`${w}: body rỗng`);
      l.body.forEach((p, i) => hasBoth(p, `${w}.body[${i}]`));
      (l.traps ?? []).forEach((p, i) => hasBoth(p, `${w}.traps[${i}]`));
      if (!l.figures?.length) errs.push(`${w}: không có hình`);
      for (const f of l.figures ?? []) {
        if (!(FIGURE_IDS as readonly string[]).includes(f)) errs.push(`${w}: figure lạ ${f}`);
        usedFigures.add(f);
      }
      if (l.seeIn) {
        hasBoth(l.seeIn.label, `${w}.seeIn.label`);
        const okTab = ['news', 'longterm', 'screener', 'analyze', 'heatmap', 'insider'].includes(l.seeIn.tab);
        if (!okTab) errs.push(`${w}: seeIn.tab lạ ${l.seeIn.tab}`);
        const subs: Record<string, string[]> = {
          heatmap: ['map', 'feargreed', 'rrg', 'gex', 'internals'],
          insider: ['form4', 'congress', 'flow', 'darkpool'],
        };
        if (l.seeIn.sub && !(subs[l.seeIn.tab] ?? []).includes(l.seeIn.sub)) errs.push(`${w}: seeIn.sub lạ ${l.seeIn.sub}`);
      }
      if (!l.quiz.length) errs.push(`${w}: không có câu hỏi`);
      l.quiz.forEach((q, i) => {
        const qw = `${w}.quiz[${i}]`;
        hasBoth(q.q, `${qw}.q`);
        hasBoth(q.why, `${qw}.why`);
        if (q.choices.length < 2) errs.push(`${qw}: dưới 2 lựa chọn`);
        q.choices.forEach((c, j) => hasBoth(c, `${qw}.choices[${j}]`));
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) errs.push(`${qw}: answer ${q.answer} ngoài khoảng`);
      });
    }
  }
  for (const f of FIGURE_IDS) if (!usedFigures.has(f)) errs.push(`hình ${f} đã vẽ nhưng không bài nào dùng`);
  return errs;
}
