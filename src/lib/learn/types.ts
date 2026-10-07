/**
 * Kiểu dữ liệu của tab Learn.
 *
 * Bài học nằm ở `src/lib/learn/*.ts` chứ KHÔNG ở `i18n.tsx`: mỗi bài là vài
 * nghìn chữ ở hai ngôn ngữ, mà `i18n.tsx` là file gần như mọi PR đều đụng tới
 * (xem "Two Claude accounts" trong CLAUDE.md) — nhét bài học vào đó là biến
 * file va chạm nhiều nhất thành file lớn gấp ba. Chỉ NHÃN GIAO DIỆN của tab
 * (tên nút, tên phần, chữ trên nút ôn tập) mới ở `i18n.tsx`.
 *
 * Toàn bộ thư mục này THUẦN: không `node:fs`, không mạng — `LearnPanel.tsx`
 * là client component và import thẳng, cùng luật `lib/tabs.ts`.
 */

/** Một câu ở hai ngôn ngữ. Cả hai BẮT BUỘC có — test ghim điều đó. */
export type L = { vi: string; en: string };

export const SECTION_IDS = ['candles', 'ta', 'gex', 'flow', 'putselling'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/**
 * Hình vẽ đi kèm bài — vẽ bằng SVG trong `LearnFigure.tsx`, KHÔNG phải ảnh
 * tải từ host ngoài (không đo được từ sandbox, và ảnh vỡ trông như app hỏng
 * — bài học #133). Mỗi id ở đây phải có một nhánh vẽ VÀ được ít nhất một
 * bài học HOẶC một mục tra cứu (`reference.ts`) dùng; test ghim cả hai chiều.
 */
export const FIGURE_IDS = [
  'candle-anatomy',
  'doji',
  'hammer',
  'engulfing',
  'star',
  'support',
  'head-shoulders',
  'double',
  'triangle',
  'flag',
  /* Hình riêng cho bảng tra cứu (#199) — mỗi kiểu nến/mẫu một hình đứng
     một mình, thay vì hình ghép của bài học. */
  'hanging-man',
  'inverted-hammer',
  'shooting-star',
  'bull-engulfing',
  'bear-engulfing',
  'morning-star',
  'inv-head-shoulders',
  'bear-flag',
  'desc-triangle',
  'sym-triangle',
  'breakout',
  'resistance',
  /* Bài "Phân tích kỹ thuật căn bản" chủ app gửi (2026-10-07): các nến,
     cụm nến và mẫu giá còn thiếu, cộng xu hướng / chỉ báo / rủi ro. Phần lớn
     vẽ từ DỮ LIỆU (`CANDLE_SETS` / `LINE_SETS` trong LearnFigure.tsx) chứ
     không mỗi hình một nhánh tay — nhưng mỗi id vẫn phải có dữ liệu, không
     thì rơi vào khung "?" và test bắt. */
  'marubozu',
  'bear-marubozu',
  'spinning-top',
  'dragonfly-doji',
  'gravestone-doji',
  'long-legged-doji',
  'bull-harami',
  'bear-harami',
  'piercing',
  'dark-cloud',
  'tweezer-top',
  'tweezer-bottom',
  'three-soldiers',
  'three-crows',
  'three-inside-up',
  'three-inside-down',
  'abandoned-baby',
  'rising-three',
  'falling-three',
  'triple-top',
  'triple-bottom',
  'rising-wedge',
  'falling-wedge',
  'rounding-bottom',
  'cup-handle',
  'pennant',
  'rectangle',
  'channel',
  'trendline',
  'sr-flip',
  'ma-cross',
  'rsi',
  'macd',
  'bollinger',
  'volume-confirm',
  'risk-reward',
  'gex-profile',
  'gamma-regime',
  'tick',
  'rrg',
  'flow-bar',
  'darkpool',
  'insider',
  'congress-lag',
  'footprint',
  'short-put-payoff',
  'score',
  'gates',
  'iv-hv',
  'manage',
] as const;
export type FigureId = (typeof FIGURE_IDS)[number];

/** Nút "Xem thật ở tab …" — nhảy tới đúng tab (và tab con) đang có dữ liệu sống. */
export type SeeIn = {
  tab: 'news' | 'longterm' | 'screener' | 'analyze' | 'heatmap' | 'insider' | 'patterns';
  /** Tab con của Market Data, mã tab 'heatmap' (`map|feargreed|rrg|gex|mmexposure|liveflow|internals`) hoặc Insider Trade (`form4|congress|flow|darkpool`). */
  sub?: string;
  label: L;
};

export type QuizQ = {
  q: L;
  choices: L[];
  /** Chỉ số trong `choices`. Test ghim nằm trong khoảng. */
  answer: number;
  /** Vì sao đáp án đúng — hiện sau khi chấm, dù đúng hay sai. */
  why: L;
};

export type Lesson = {
  id: string;
  section: SectionId;
  title: L;
  /** Một câu, hiện trong danh sách bài. */
  summary: L;
  /**
   * Các đoạn văn. Hỗ trợ đúng hai kiểu đánh dấu, cố ý tối giản: `**đậm**`
   * trong dòng, và đoạn mà MỌI dòng bắt đầu bằng `- ` thì thành danh sách.
   * Không Markdown đầy đủ — một trình dựng Markdown là một bề mặt lỗi
   * riêng, và bài học chỉ cần chừng này.
   */
  body: L[];
  /**
   * Một hoặc nhiều hình, theo thứ tự hiện. Mảng chứ không phải một id: bài
   * "nhấn chìm và sao mai" cần hai hình, và một hình đã vẽ mà không bài nào
   * dùng là công vẽ bỏ phí — `validateLessons()` ghim rằng MỌI id trong
   * `FIGURE_IDS` được ít nhất một bài dùng, và mọi bài có ít nhất một hình.
   */
  figures: FigureId[];
  /** "Bẫy thường gặp" — mỗi mục một câu. */
  traps?: L[];
  seeIn?: SeeIn;
  quiz: QuizQ[];
};
