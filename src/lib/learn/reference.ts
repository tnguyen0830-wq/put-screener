import type { FigureId, L } from './types';

/**
 * Bảng tra cứu nhanh — tab con "Tra cứu" của tab Learn.
 *
 * Bài học là để ĐỌC MỘT LẦN; bảng này là để XEM LẠI: mỗi kiểu nến / mẫu hình
 * một thẻ — hình vẽ đứng một mình, một câu nói nó là gì, khi nào được coi là
 * xác nhận, cái bẫy hay gặp, bài học nào nói kỹ, và app có TỰ DÒ được nó ở
 * tab Patterns không (`patternId` khớp `PATTERN_IDS` của `lib/patterns.ts`).
 *
 * Định nghĩa "xác nhận" ở đây phải KHỚP máy dò: búa chỉ ✓ khi nến sau đóng
 * cao hơn, hai đáy chỉ ✓ khi đóng trên đường cổ — cùng luật `patterns.ts`,
 * để bảng tra và bảng quét không nói hai điều khác nhau.
 *
 * Thuần, không `node:fs`; `validateLessons()` kiểm cả file này.
 */

export const REF_GROUPS = ['candle', 'reversal', 'continuation', 'level'] as const;
export type RefGroup = (typeof REF_GROUPS)[number];

export type RefEntry = {
  id: string;
  group: RefGroup;
  figure: FigureId;
  name: L;
  side: 'bull' | 'bear' | 'neutral';
  /** Một câu: nó là gì. */
  gist: L;
  /** Khi nào được coi là xác nhận — cùng luật máy dò. */
  confirm: L;
  /** Bẫy hay gặp. */
  trap: L;
  /** Bài học nói kỹ (id trong LESSONS). */
  lesson: string;
  /** Id máy dò ở mục Patterns; thiếu = app chưa tự dò kiểu này. */
  patternId?: string;
};

export const REFERENCE: RefEntry[] = [
  /* ---------------- nến ---------------- */
  {
    id: 'anatomy', group: 'candle', figure: 'candle-anatomy', side: 'neutral',
    name: { vi: 'Cấu tạo một cây nến', en: 'Anatomy of a candle' },
    gist: { vi: 'Thân = mở → đóng; râu = tới đâu rồi quay lại. Xanh đóng cao hơn mở, đỏ đóng thấp hơn mở.', en: 'Body = open → close; wicks = how far price went and came back. Green closes above the open, red below.' },
    confirm: { vi: 'Không phải tín hiệu — là bảng chữ cái để đọc mọi mẫu bên dưới.', en: 'Not a signal — the alphabet every pattern below is written in.' },
    trap: { vi: 'Một nến đứng một mình không nói gì; bối cảnh (xu hướng trước, mức giá) mới cho nó nghĩa.', en: 'A lone candle says nothing; context (prior trend, the level) gives it meaning.' },
    lesson: 'candle-anatomy',
  },
  {
    id: 'doji', group: 'candle', figure: 'doji', side: 'neutral',
    name: { vi: 'Doji', en: 'Doji' },
    gist: { vi: 'Thân gần bằng 0 (≤ 10% biên độ): mở và đóng gần như một chỗ — phe mua và phe bán hoà.', en: 'Almost no body (≤ 10% of the range): open and close nearly equal — buyers and sellers tied.' },
    confirm: { vi: 'Tự nó không xác nhận gì. Nến SAU quyết định: đóng dưới đáy doji sau đợt tăng là đảo chiều xuống, trên đỉnh doji sau đợt giảm là đảo chiều lên.', en: 'Confirms nothing by itself. The NEXT candle decides: a close below the doji low after a rise is a reversal down; above its high after a fall, up.' },
    trap: { vi: 'Doji giữa một đoạn đi ngang chỉ là đi ngang. Doji râu dưới rất dài (dragonfly) không đồng thời là búa — app gọi một tên.', en: 'A doji inside a sideways range is just sideways. A long-lower-wick doji (dragonfly) is not also a hammer — the app names it once.' },
    lesson: 'doji', patternId: 'doji',
  },
  {
    id: 'hammer', group: 'candle', figure: 'hammer', side: 'bull',
    name: { vi: 'Búa', en: 'Hammer' },
    gist: { vi: 'Sau đợt GIẢM: râu dưới ≥ 2× thân, râu trên nhỏ, thân ở phần trên. Phe bán ép xuống rồi bị đẩy lại.', en: 'After a DECLINE: lower wick ≥ 2× body, small upper wick, body near the top. Sellers pushed down and were pushed back.' },
    confirm: { vi: 'Nến sau đóng CAO HƠN đóng cửa của cây búa (✓ ở mục Patterns).', en: 'The next candle closes ABOVE the hammer’s close (✓ in Patterns).' },
    trap: { vi: 'Cùng hình sau đợt TĂNG là người treo cổ — tín hiệu ngược. Không có đợt giảm trước thì không phải búa.', en: 'The same shape after a RISE is a hanging man — the opposite signal. No prior decline, no hammer.' },
    lesson: 'hammer', patternId: 'hammer',
  },
  {
    id: 'hanging-man', group: 'candle', figure: 'hanging-man', side: 'bear',
    name: { vi: 'Người treo cổ', en: 'Hanging man' },
    gist: { vi: 'Hình cây búa nhưng xuất hiện sau đợt TĂNG: trong phiên có người bán ép giá sâu — phe mua đỡ được, nhưng đã có người muốn ra.', en: 'A hammer shape appearing after a RISE: sellers drove price deep intraday — buyers held, but someone wants out.' },
    confirm: { vi: 'Nến sau đóng THẤP HƠN đóng cửa của nó. Chưa có nến đó thì chỉ là cảnh báo.', en: 'The next candle closes BELOW its close. Until then it is only a warning.' },
    trap: { vi: 'Tỉ lệ đúng thấp hơn búa; một mình nó không đủ để bán. Nhìn kèm mức kháng cự.', en: 'Weaker than a hammer; not enough alone to sell. Read it against resistance.' },
    lesson: 'hammer', patternId: 'hanging-man',
  },
  {
    id: 'inverted-hammer', group: 'candle', figure: 'inverted-hammer', side: 'bull',
    name: { vi: 'Búa ngược', en: 'Inverted hammer' },
    gist: { vi: 'Sau đợt GIẢM: râu TRÊN ≥ 2× thân, thân ở phần dưới. Phe mua thử đẩy lên, chưa giữ được — nhưng đã thử.', en: 'After a DECLINE: UPPER wick ≥ 2× body, body near the bottom. Buyers tried to push up and could not hold — but they tried.' },
    confirm: { vi: 'Nến sau đóng CAO HƠN. Cần xác nhận hơn cả búa thường.', en: 'The next candle closes HIGHER. Needs confirmation even more than a hammer.' },
    trap: { vi: 'Cùng hình sau đợt tăng là sao băng (giảm). Đừng mua chỉ vì thấy râu trên dài.', en: 'The same shape after a rise is a shooting star (bearish). Do not buy on a long upper wick alone.' },
    lesson: 'hammer', patternId: 'inverted-hammer',
  },
  {
    id: 'shooting-star', group: 'candle', figure: 'shooting-star', side: 'bear',
    name: { vi: 'Sao băng', en: 'Shooting star' },
    gist: { vi: 'Sau đợt TĂNG: râu trên ≥ 2× thân, thân ở phần dưới. Giá bị đẩy lên rồi bị bán xuống ngay trong phiên.', en: 'After a RISE: upper wick ≥ 2× body, body near the bottom. Price was pushed up and sold back down within the session.' },
    confirm: { vi: 'Nến sau đóng THẤP HƠN đóng cửa của nó.', en: 'The next candle closes BELOW its close.' },
    trap: { vi: 'Sao băng ngay dưới một vùng kháng cự mạnh hơn nhiều so với sao băng giữa khoảng trống.', en: 'A shooting star right under a resistance zone is far stronger than one in open space.' },
    lesson: 'hammer', patternId: 'shooting-star',
  },
  {
    id: 'bull-engulfing', group: 'candle', figure: 'bull-engulfing', side: 'bull',
    name: { vi: 'Nhấn chìm tăng', en: 'Bullish engulfing' },
    gist: { vi: 'Sau đợt giảm: nến đỏ nhỏ rồi nến xanh có thân BAO TRỌN thân nến đỏ (mở thấp hơn, đóng cao hơn). Mọi người bán hôm trước đang lỗ.', en: 'After a decline: a small red candle, then a green one whose body WRAPS the red body (opens lower, closes higher). Everyone who sold yesterday is underwater.' },
    confirm: { vi: 'Nến sau đóng cao hơn nến xanh. Thân xanh càng dài so với thân đỏ càng mạnh.', en: 'The next candle closes above the green one. The bigger the green body relative to the red, the stronger.' },
    trap: { vi: 'Chỉ so THÂN, không so râu. Không có đợt giảm trước thì không gọi là nhấn chìm.', en: 'Compare BODIES, not wicks. With no prior decline it is not an engulfing.' },
    lesson: 'engulfing', patternId: 'bull-engulfing',
  },
  {
    id: 'bear-engulfing', group: 'candle', figure: 'bear-engulfing', side: 'bear',
    name: { vi: 'Nhấn chìm giảm', en: 'Bearish engulfing' },
    gist: { vi: 'Sau đợt tăng: nến xanh nhỏ rồi nến đỏ có thân bao trọn thân nến xanh. Phe mua hôm trước bị nhấn chìm.', en: 'After a rise: a small green candle, then a red one whose body wraps the green body. Yesterday’s buyers are swallowed.' },
    confirm: { vi: 'Nến sau đóng thấp hơn nến đỏ.', en: 'The next candle closes below the red one.' },
    trap: { vi: 'Ở đỉnh một đợt tăng dài, hay xuất hiện cùng khối lượng lớn — không có khối lượng thì yếu hơn.', en: 'At the top of a long rise it usually comes with heavy volume — without it, weaker.' },
    lesson: 'engulfing', patternId: 'bear-engulfing',
  },
  {
    id: 'morning-star', group: 'candle', figure: 'morning-star', side: 'bull',
    name: { vi: 'Sao mai', en: 'Morning star' },
    gist: { vi: 'Ba nến ở đáy: đỏ dài → thân nhỏ (do dự, ≤ 30% thân nến đầu) → xanh dài đóng qua ĐIỂM GIỮA thân nến đỏ.', en: 'Three candles at a bottom: long red → small body (indecision, ≤ 30% of the first body) → long green closing past the MIDPOINT of the red body.' },
    confirm: { vi: 'Ba nến khép lại là mẫu hoàn chỉnh — app coi là ✓ ngay khi nến thứ ba đóng.', en: 'The three candles complete the pattern — the app marks ✓ as soon as the third closes.' },
    trap: { vi: 'Nến thứ ba đóng chưa qua điểm giữa thì chưa phải sao mai, chỉ là một nến xanh.', en: 'If the third candle does not close past the midpoint it is not a morning star, just a green candle.' },
    lesson: 'engulfing', patternId: 'morning-star',
  },
  {
    id: 'evening-star', group: 'candle', figure: 'star', side: 'bear',
    name: { vi: 'Sao hôm', en: 'Evening star' },
    gist: { vi: 'Ba nến ở đỉnh: xanh dài → thân nhỏ → đỏ dài đóng sâu qua điểm giữa thân nến xanh. Ảnh gương của sao mai.', en: 'Three candles at a top: long green → small body → long red closing deep past the midpoint of the green body. The mirror of the morning star.' },
    confirm: { vi: 'Nến thứ ba đóng qua điểm giữa thân nến đầu — mẫu hoàn chỉnh.', en: 'The third candle closes past the midpoint of the first body — the pattern is complete.' },
    trap: { vi: 'Khoảng trống (gap) giữa nến 1 và nến 2 làm mẫu mạnh hơn, nhưng cổ phiếu Mỹ ít gap trong ngày thường.', en: 'A gap between candle 1 and 2 strengthens it, but US stocks rarely gap on ordinary days.' },
    lesson: 'engulfing', patternId: 'evening-star',
  },

  /* ---------------- đảo chiều ---------------- */
  {
    id: 'double-bottom', group: 'reversal', figure: 'double', side: 'bull',
    name: { vi: 'Hai đáy (W)', en: 'Double bottom (W)' },
    gist: { vi: 'Hai đáy xoay cùng một vùng (lệch ≤ 3%), cách nhau 10–80 nến, giữa chúng một đỉnh — đường cổ. Phe bán thử hai lần, thua hai lần.', en: 'Two pivot lows at one level (≤ 3% apart), 10–80 bars apart, with a peak between them — the neckline. Sellers tried twice and lost twice.' },
    confirm: { vi: 'Đóng cửa TRÊN đường cổ. Mục tiêu đo = đường cổ + (đường cổ − đáy).', en: 'A close ABOVE the neckline. Measured target = neckline + (neckline − base).' },
    trap: { vi: 'Hai đáy chưa vượt đường cổ chỉ là hai cái đáy. Có đáy thứ ba thì không còn là "hai đáy" mà là vùng đi ngang.', en: 'Two lows that have not cleared the neckline are just two lows. A third low makes it a range, not a double bottom.' },
    lesson: 'head-shoulders', patternId: 'double-bottom',
  },
  {
    id: 'double-top', group: 'reversal', figure: 'double', side: 'bear',
    name: { vi: 'Hai đỉnh (M)', en: 'Double top (M)' },
    gist: { vi: 'Hai đỉnh xoay cùng một vùng, giữa chúng một đáy — đường cổ. Phe mua không qua được lần hai.', en: 'Two pivot highs at one level with a trough between them — the neckline. Buyers failed the second attempt.' },
    confirm: { vi: 'Đóng cửa DƯỚI đường cổ. Mục tiêu đo = đường cổ − (đỉnh − đường cổ).', en: 'A close BELOW the neckline. Measured target = neckline − (top − neckline).' },
    trap: { vi: 'Cạnh trên phẳng của một tam giác tăng cũng là "hai đỉnh" — app ưu tiên gọi tam giác vì nó nói được cả hai cạnh.', en: 'The flat top of an ascending triangle also looks like a double top — the app prefers the triangle, which describes both edges.' },
    lesson: 'head-shoulders', patternId: 'double-top',
  },
  {
    id: 'head-shoulders', group: 'reversal', figure: 'head-shoulders', side: 'bear',
    name: { vi: 'Vai-đầu-vai', en: 'Head and shoulders' },
    gist: { vi: 'Ba đỉnh: đầu giữa cao hơn hai vai ≥ 3%, hai vai xấp xỉ nhau. Nối hai đáy giữa các đỉnh được đường cổ (có thể dốc).', en: 'Three peaks: the head ≥ 3% above both shoulders, shoulders roughly equal. Join the two troughs for the neckline (may slope).' },
    confirm: { vi: 'Đóng cửa DƯỚI đường cổ. Mục tiêu = đường cổ − (đầu − đường cổ).', en: 'A close BELOW the neckline. Target = neckline − (head − neckline).' },
    trap: { vi: 'Trước khi thủng đường cổ nó chỉ là ba cái đỉnh. Nhiều "vai-đầu-vai" trên mạng được vẽ sau khi giá đã rớt.', en: 'Before the neckline breaks it is just three peaks. Many online head-and-shoulders are drawn after the fall.' },
    lesson: 'head-shoulders', patternId: 'head-shoulders',
  },
  {
    id: 'inv-head-shoulders', group: 'reversal', figure: 'inv-head-shoulders', side: 'bull',
    name: { vi: 'Vai-đầu-vai ngược', en: 'Inverse head and shoulders' },
    gist: { vi: 'Ba đáy: đáy giữa sâu hơn hai bên ≥ 3%. Đường cổ nối hai đỉnh giữa các đáy.', en: 'Three troughs: the middle ≥ 3% deeper than both sides. The neckline joins the two peaks between them.' },
    confirm: { vi: 'Đóng cửa TRÊN đường cổ. Mục tiêu = đường cổ + (đường cổ − đầu).', en: 'A close ABOVE the neckline. Target = neckline + (neckline − head).' },
    trap: { vi: 'Vai phải cao hơn vai trái nhiều (> 8%) thì không còn là mẫu này.', en: 'A right shoulder far above the left (> 8%) is no longer this pattern.' },
    lesson: 'head-shoulders', patternId: 'inv-head-shoulders',
  },

  /* ---------------- tiếp diễn ---------------- */
  {
    id: 'bull-flag', group: 'continuation', figure: 'flag', side: 'bull',
    name: { vi: 'Cờ tăng', en: 'Bull flag' },
    gist: { vi: 'Cột cờ: chạy ≥ 8% trong ≤ 15 nến. Cờ: 4–20 nến đi ngang/hơi xuống, biên độ ≤ nửa cột, không lùi quá nửa cột.', en: 'Pole: a ≥ 8% run in ≤ 15 bars. Flag: 4–20 bars sideways or slightly down, range ≤ half the pole, retracing ≤ half.' },
    confirm: { vi: 'Đóng cửa trên đỉnh của lá cờ. Mục tiêu = điểm phá + chiều cao cột.', en: 'A close above the flag’s high. Target = breakout + pole height.' },
    trap: { vi: 'Cờ lùi quá nửa cột không còn là cờ — đó là một đợt điều chỉnh thật.', en: 'A flag that gives back more than half the pole is not a flag — it is a real correction.' },
    lesson: 'triangle-flag', patternId: 'bull-flag',
  },
  {
    id: 'bear-flag', group: 'continuation', figure: 'bear-flag', side: 'bear',
    name: { vi: 'Cờ giảm', en: 'Bear flag' },
    gist: { vi: 'Cột cờ rớt ≥ 8% trong ≤ 15 nến, rồi cờ hồi nhẹ, hẹp. Ảnh gương của cờ tăng.', en: 'A ≥ 8% drop in ≤ 15 bars, then a narrow, slightly rising flag. The mirror of the bull flag.' },
    confirm: { vi: 'Đóng cửa dưới đáy của lá cờ. Mục tiêu = điểm phá − chiều cao cột.', en: 'A close below the flag’s low. Target = breakdown − pole height.' },
    trap: { vi: 'Sau tin xấu, "cờ giảm" hay thành hai đáy nếu khối lượng cạn ở nhịp hồi — nhìn khối lượng.', en: 'After bad news a "bear flag" often turns into a double bottom when volume dries up in the bounce — watch volume.' },
    lesson: 'triangle-flag', patternId: 'bear-flag',
  },
  {
    id: 'asc-triangle', group: 'continuation', figure: 'triangle', side: 'bull',
    name: { vi: 'Tam giác tăng', en: 'Ascending triangle' },
    gist: { vi: 'Đỉnh NGANG (kháng cự bị thử nhiều lần), đáy CAO DẦN (người mua sốt ruột hơn mỗi lần). Biên độ co lại.', en: 'FLAT tops (resistance tested repeatedly), RISING lows (buyers more eager each time). Range contracts.' },
    confirm: { vi: 'Đóng cửa trên cạnh trên ≥ 0,5%. Mục tiêu = điểm phá + chiều cao đầu tam giác.', en: 'A close ≥ 0.5% above the upper edge. Target = breakout + the triangle’s initial height.' },
    trap: { vi: 'Hai cạnh đã cắt nhau (qua đỉnh tam giác) thì không còn gì để phá; mẫu hết hạn.', en: 'Once the edges have crossed (past the apex) there is nothing left to break; the pattern has expired.' },
    lesson: 'triangle-flag', patternId: 'asc-triangle',
  },
  {
    id: 'desc-triangle', group: 'continuation', figure: 'desc-triangle', side: 'bear',
    name: { vi: 'Tam giác giảm', en: 'Descending triangle' },
    gist: { vi: 'Đáy NGANG (hỗ trợ bị thử nhiều lần), đỉnh THẤP DẦN. Người bán ép xuống mỗi lần thấp hơn.', en: 'FLAT lows (support tested repeatedly), FALLING highs. Sellers press lower each time.' },
    confirm: { vi: 'Đóng cửa dưới cạnh dưới ≥ 0,5%. Mục tiêu = điểm phá − chiều cao đầu tam giác.', en: 'A close ≥ 0.5% below the lower edge. Target = breakdown − initial height.' },
    trap: { vi: 'Thủng cạnh dưới mà không có khối lượng thì hay là bẫy; app in KL/TB20 ngay cạnh.', en: 'A break of the lower edge without volume is often a trap; the app prints vol/20-day avg beside it.' },
    lesson: 'triangle-flag', patternId: 'desc-triangle',
  },
  {
    id: 'sym-triangle', group: 'continuation', figure: 'sym-triangle', side: 'neutral',
    name: { vi: 'Tam giác cân', en: 'Symmetrical triangle' },
    gist: { vi: 'Đỉnh thấp dần VÀ đáy cao dần: cả hai bên nhường, biên độ co lại. Chưa nói hướng nào.', en: 'Falling highs AND rising lows: both sides yield, range contracts. No direction yet.' },
    confirm: { vi: 'Phá cạnh nào thì đi theo cạnh đó (≥ 0,5%); thường cùng hướng với xu hướng đi vào tam giác.', en: 'Whichever edge breaks (≥ 0.5%) sets the direction; usually the trend that entered the triangle.' },
    trap: { vi: 'Đoán hướng trước khi phá là đoán. App để mẫu trung tính tới khi có nến phá.', en: 'Guessing the direction before the break is guessing. The app keeps it neutral until a break.' },
    lesson: 'triangle-flag', patternId: 'sym-triangle',
  },

  /* ---------------- mức ---------------- */
  {
    id: 'support', group: 'level', figure: 'support', side: 'bull',
    name: { vi: 'Vùng hỗ trợ', en: 'Support zone' },
    gist: { vi: 'Đáy xoay (5 nến mỗi bên) gom theo giá 2,5%, ≥ 2 lần chạm. Một đáy đơn KHÔNG phải hỗ trợ.', en: 'Pivot lows (5 bars each side) clustered within 2.5%, ≥ 2 touches. A single low is NOT support.' },
    confirm: { vi: 'Giá tới vùng và bật lên, tốt nhất kèm một mẫu nến tăng ngay tại vùng.', en: 'Price reaches the zone and bounces, ideally with a bullish candle right at the zone.' },
    trap: { vi: '5 nến cuối chưa thể là đáy xoay — mức của tuần này chưa được xác nhận. Thủng vùng = tín hiệu thoát, không phải "cơ hội mua rẻ hơn".', en: 'The last 5 bars cannot yet be pivots — this week’s level is unconfirmed. A break of the zone is an exit signal, not a "cheaper buy".' },
    lesson: 'support',
  },
  {
    id: 'resistance', group: 'level', figure: 'resistance', side: 'bear',
    name: { vi: 'Vùng kháng cự', en: 'Resistance zone' },
    gist: { vi: 'Ảnh gương của hỗ trợ: đỉnh xoay gom theo giá, ≥ 2 lần chạm. Nơi người mua đã bỏ cuộc nhiều lần.', en: 'The mirror of support: pivot highs clustered by price, ≥ 2 touches. Where buyers gave up repeatedly.' },
    confirm: { vi: 'Giá tới vùng và quay xuống, kèm sao băng / nhấn chìm giảm tại vùng.', en: 'Price reaches the zone and turns down, with a shooting star / bearish engulfing at the zone.' },
    trap: { vi: 'Kháng cự bị phá thường thành hỗ trợ mới — mức không biến mất, nó đổi vai.', en: 'Broken resistance usually becomes new support — the level does not vanish, it changes roles.' },
    lesson: 'support',
  },
  {
    id: 'breakout', group: 'level', figure: 'breakout', side: 'bull',
    name: { vi: 'Phá vỡ có khối lượng', en: 'Breakout with volume' },
    gist: { vi: 'Đóng cửa vượt biên trên của vùng kháng cự ≥ 2 lần chạm, nến trước còn nằm trong/dưới vùng.', en: 'A close above the top of a ≥ 2-touch resistance zone, with the previous bar still at or below it.' },
    confirm: { vi: 'Khối lượng ≥ 1,5–2× trung bình 20 phiên. Không có khối lượng, app vẫn báo nhưng in "KL … × TB20" để tự cân.', en: 'Volume ≥ 1.5–2× the 20-day average. Without it the app still flags the break but prints vol/avg so you can weigh it.' },
    trap: { vi: 'Phá vỡ giả: vượt vùng rồi đóng cửa quay lại trong vùng ngay hôm sau. Thủng hỗ trợ là ảnh gương (breakdown).', en: 'False breakout: clears the zone, then closes back inside the next day. A support break is the mirror (breakdown).' },
    lesson: 'support', patternId: 'breakout',
  },
];

export function refById(id: string): RefEntry | undefined {
  return REFERENCE.find((r) => r.id === id);
}
