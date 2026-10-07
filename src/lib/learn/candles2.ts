import type { Lesson } from './types';

/**
 * Phần mở rộng của mục "Nến & mẫu hình", lấy từ bài "Phân tích kỹ thuật căn
 * bản" chủ app gửi (artifact, 2026-10-07): các nến đơn, cụm nến và mẫu giá
 * mà bảy bài đầu chưa nói tới.
 *
 * File riêng chứ không nối vào `candles.ts` để hai PR đụng tới mục này không
 * va nhau trên cùng một mảng dài. `index.ts` ghép hai mảng theo thứ tự.
 *
 * Những kiểu ở đây phần lớn app CHƯA tự dò ở mục Patterns — bài nói thẳng
 * điều đó, để người đọc không đi tìm một dấu ✓ không bao giờ hiện.
 */
export const CANDLE_LESSONS_MORE: Lesson[] = [
  {
    id: 'candles-more',
    section: 'candles',
    title: { vi: 'Thêm nến đơn: marubozu, con xoay và họ doji', en: 'More single candles: marubozu, spinning top and the doji family' },
    summary: {
      vi: 'Thân dài là một phe kiểm soát; thân ngắn và râu dài là chưa ai thắng.',
      en: 'A long body is one side in control; a short body with long wicks is no winner yet.',
    },
    figures: ['marubozu', 'spinning-top', 'dragonfly-doji', 'gravestone-doji'],
    seeIn: { tab: 'patterns', label: { vi: 'Xem nến thật ở mục Patterns', en: 'See real candles in Patterns' } },
    body: [
      {
        vi: 'Cách đọc một cây nến bất kỳ chỉ có hai câu: **thân** cho biết ai kiểm soát từ mở tới đóng, **râu** cho biết ai đã thử đẩy giá đi xa rồi thất bại. Mọi tên gọi bên dưới chỉ là các tổ hợp của hai câu đó.',
        en: 'Any candle reads in two sentences: the **body** says who controlled open to close, the **wicks** say who tried to push price far and failed. Every name below is just a combination of those two.',
      },
      {
        vi: '**Marubozu**: thân dài, gần như không có râu. Một phe giữ giá suốt phiên — marubozu xanh mở ở mức thấp nhất và đóng ở mức cao nhất, marubozu đỏ ngược lại. Đây là nến của **quyết tâm**, không phải của đảo chiều: nó thường xuất hiện ở đầu một đợt chạy hoặc ở cú phá vỡ một vùng giá.',
        en: 'A **marubozu**: long body, almost no wicks. One side held price all session — a green marubozu opens at its low and closes at its high, a red one the reverse. It is a candle of **conviction**, not of reversal: it tends to appear at the start of a run or on the break of a zone.',
      },
      {
        vi: '**Con xoay** (spinning top): thân nhỏ, hai râu dài gần bằng nhau. Giá chạy cả hai chiều trong phiên nhưng đóng gần chỗ mở — hai phe ngang sức. Nó giống doji nhưng thân lớn hơn một chút, và nghĩa của nó là **do dự**, không phải tín hiệu đảo chiều tự thân.',
        en: 'A **spinning top**: small body, two long wicks of similar size. Price ran both ways and closed near the open — a draw. It is a doji with a slightly bigger body, and it means **indecision**, not a reversal by itself.',
      },
      {
        vi: '**Họ doji** — mở và đóng gần như bằng nhau, khác nhau ở chỗ râu nằm đâu:',
        en: 'The **doji family** — open and close nearly equal, differing in where the wicks sit:',
      },
      {
        vi: '- **Doji chuồn chuồn** (dragonfly): mở, đóng và cao nhất gần bằng nhau, râu dưới rất dài. Phe bán đạp sâu rồi bị kéo về hết. Mạnh nhất khi nằm ở đáy một đợt giảm.\n- **Doji bia mộ** (gravestone): mở, đóng và thấp nhất gần bằng nhau, râu trên rất dài. Phe mua đẩy cao rồi mất hết. Cảnh báo khi nằm ở đỉnh.\n- **Doji chân dài** (long-legged): cả hai râu đều rất dài. Biến động lớn mà không ai thắng — thị trường cực kỳ do dự.',
        en: '- **Dragonfly doji**: open, close and high nearly equal, a very long lower wick. Sellers drove price deep and were pulled all the way back. Strongest at the bottom of a decline.\n- **Gravestone doji**: open, close and low nearly equal, a very long upper wick. Buyers pushed high and lost it all. A warning at a top.\n- **Long-legged doji**: both wicks very long. A big range and no winner — deep indecision.',
      },
      {
        vi: 'Luật của bài Doji vẫn đứng nguyên: một nến đơn là một **câu hỏi**, nến SAU mới là câu trả lời, và bối cảnh (xu hướng trước, vùng giá) mới cho nó nghĩa. Mục Patterns của app dò mọi nến thân ≤ 10% biên độ và gọi chung là **doji** — nó không tách chuồn chuồn hay bia mộ, và chưa dò marubozu hay con xoay.',
        en: 'The Doji lesson\'s rule still stands: a single candle is a **question**, the NEXT candle is the answer, and context (prior trend, the zone) gives it meaning. The app\'s Patterns mode flags every candle with a body ≤ 10% of its range and calls it a **doji** — it does not separate dragonfly from gravestone, and it does not detect marubozu or spinning tops.',
      },
    ],
    traps: [
      { vi: 'Coi doji chuồn chuồn giữa một vùng đi ngang là tín hiệu tạo đáy: không có đợt giảm trước thì không có đáy nào để tạo.', en: 'Reading a dragonfly doji in the middle of a range as a bottom: with no prior decline there is no bottom to make.' },
      { vi: 'Đuổi theo một marubozu xanh rất dài ngay sau tin: nến đó có thể là cú chạy cạn sức — phiên sau hay lùi lại một phần.', en: 'Chasing a very long green marubozu right after news: it can be an exhaustion run — the next session often gives some back.' },
    ],
    quiz: [
      {
        q: { vi: 'Marubozu xanh cho biết điều gì?', en: 'What does a green marubozu tell you?' },
        choices: [
          { vi: 'Phe mua kiểm soát từ lúc mở tới lúc đóng', en: 'Buyers controlled from open to close' },
          { vi: 'Thị trường do dự', en: 'The market is undecided' },
          { vi: 'Sắp đảo chiều giảm', en: 'A bearish reversal is coming' },
        ],
        answer: 0,
        why: { vi: 'Không râu nghĩa là giá không bao giờ đi ngược đáng kể: mở ở đáy, đóng ở đỉnh.', en: 'No wicks means price never went meaningfully the other way: open at the low, close at the high.' },
      },
      {
        q: { vi: 'Doji nào là cảnh báo khi xuất hiện ở đỉnh một đợt tăng?', en: 'Which doji is a warning at the top of a rise?' },
        choices: [
          { vi: 'Doji chuồn chuồn', en: 'Dragonfly doji' },
          { vi: 'Doji bia mộ', en: 'Gravestone doji' },
          { vi: 'Không doji nào', en: 'None of them' },
        ],
        answer: 1,
        why: { vi: 'Râu trên rất dài: phe mua đẩy lên cao rồi mất hết ngay trong phiên.', en: 'A very long upper wick: buyers pushed high and lost it all within the session.' },
      },
      {
        q: { vi: 'Con xoay khác doji ở điểm nào?', en: 'How does a spinning top differ from a doji?' },
        choices: [
          { vi: 'Thân lớn hơn một chút; nghĩa vẫn là do dự', en: 'A slightly bigger body; it still means indecision' },
          { vi: 'Con xoay luôn là tín hiệu tăng', en: 'A spinning top is always bullish' },
          { vi: 'Con xoay không có râu', en: 'A spinning top has no wicks' },
        ],
        answer: 0,
        why: { vi: 'Cả hai đều là "chưa ai thắng"; khác nhau ở độ lớn thân.', en: 'Both say "no winner yet"; they differ only in body size.' },
      },
    ],
  },

  {
    id: 'candle-clusters',
    section: 'candles',
    title: { vi: 'Cụm 2–3 nến: harami, nhíp, ba lính, ba bước', en: 'Two- and three-candle clusters: harami, tweezers, soldiers, three methods' },
    summary: {
      vi: 'Cụm nến đáng tin hơn nến đơn vì nó cho thấy quyền kiểm soát đổi tay qua nhiều phiên.',
      en: 'Clusters beat single candles because they show control changing hands across sessions.',
    },
    figures: ['bull-harami', 'piercing', 'three-soldiers', 'rising-three'],
    seeIn: { tab: 'patterns', label: { vi: 'Xem nến thật ở mục Patterns', en: 'See real candles in Patterns' } },
    body: [
      {
        vi: 'Bài Nhấn chìm đã có nhấn chìm và sao mai/sao hôm. Bài này là các cụm còn lại. Luật chung: **chờ nến cuối của cụm ĐÓNG CỬA** rồi mới kết luận — giữa phiên, một cụm "gần xong" có thể biến thành bất kỳ thứ gì.',
        en: 'The Engulfing lesson covered engulfing and morning/evening stars. This one covers the rest. One rule for all: **wait for the cluster\'s last candle to CLOSE** before concluding — mid-session, an "almost done" cluster can still become anything.',
      },
      {
        vi: '**Harami** (mẹ bồng con): một nến nhỏ nằm gọn trong THÂN nến lớn trước đó. Đà đang có chững lại, nhưng chưa có ai giành quyền. Nó yếu hơn nhấn chìm — nhấn chìm là "đổi tay", harami chỉ là "dừng lại". Khi nến thứ ba đi đúng hướng và đóng qua nến đầu, cụm thành **ba nến bên trong tăng/giảm** (three inside up/down) — một harami đã được xác nhận.',
        en: 'A **harami**: a small candle sitting entirely inside the prior large BODY. The move pauses, but nobody has taken over. It is weaker than engulfing — engulfing is "control changed hands", harami is only "stopped". When a third candle follows through and closes beyond the first, the cluster becomes **three inside up/down** — a confirmed harami.',
      },
      {
        vi: '**Đường nhọn** (piercing line) và **mây đen che phủ** (dark cloud cover) là nửa của nhấn chìm: nến thứ hai mở vượt qua nến đầu (thấp hơn, hoặc cao hơn) rồi đóng **QUA điểm giữa thân nến đầu**. Chưa qua điểm giữa thì chưa có tín hiệu gì.',
        en: 'The **piercing line** and **dark cloud cover** are half an engulfing: the second candle opens beyond the first (lower, or higher) and closes **PAST the midpoint of the first body**. Short of the midpoint, there is no signal.',
      },
      {
        vi: '**Đỉnh nhíp / đáy nhíp** (tweezer top/bottom): hai nến liên tiếp có đỉnh (hoặc đáy) gần như bằng nhau — giá bị từ chối hai lần ở cùng một mức. Nó là một **vùng hai lần chạm** thu nhỏ còn hai phiên, nên mạnh nhất khi trùng một vùng hỗ trợ/kháng cự có sẵn.',
        en: '**Tweezer tops and bottoms**: two consecutive candles with nearly equal highs (or lows) — price rejected twice at one level. It is a **two-touch zone** compressed into two sessions, so it is strongest where it coincides with an existing support or resistance zone.',
      },
      {
        vi: '**Ba chàng lính trắng / ba con quạ đen**: ba nến thân dài cùng màu, mỗi nến đóng cao hơn (thấp hơn) nến trước — lực bền bỉ. **Em bé bị bỏ rơi** (abandoned baby): sao mai mà nến giữa là doji tách hẳn hai bên bằng khoảng trống giá — hiếm, và mạnh. **Tăng/giảm ba bước** (rising/falling three methods): nến dài, ba nến nhỏ nghỉ ngược hướng nằm trong phạm vi nến đầu, rồi một nến dài vượt đỉnh (phá đáy) — đây là mẫu **tiếp diễn**, không phải đảo chiều.',
        en: '**Three white soldiers / three black crows**: three long bodies of one colour, each closing higher (lower) than the last — sustained pressure. The **abandoned baby**: a morning star whose middle candle is a doji gapped away from both neighbours — rare, and strong. **Rising/falling three methods**: a long candle, three small counter-moves inside its range, then a long candle to a new high (low) — a **continuation** pattern, not a reversal.',
      },
      {
        vi: 'Mục Patterns của app hiện dò nhấn chìm và sao mai/sao hôm, chưa dò các cụm trong bài này — nên muốn thấy chúng trên nến thật thì phải tự nhìn.',
        en: 'The app\'s Patterns mode currently detects engulfing and morning/evening stars, not the clusters in this lesson — to see these on real candles you have to look yourself.',
      },
    ],
    traps: [
      { vi: 'Ba chàng lính trắng sau một đợt tăng đã rất dài thường là cạn sức chứ không phải bắt đầu — vị trí quan trọng hơn hình dạng.', en: 'Three white soldiers after an already long rise is often exhaustion, not a start — location matters more than shape.' },
      { vi: 'Gọi một đường nhọn khi nến xanh mới đóng tới một phần ba thân nến đỏ.', en: 'Calling a piercing line when the green candle only closed a third of the way into the red body.' },
      { vi: 'Đọc tăng ba bước thành đảo chiều giảm vì thấy ba nến đỏ liên tiếp — chúng nằm TRONG nến đầu, đó là nghỉ.', en: 'Reading rising three methods as a reversal because of three red candles in a row — they sit INSIDE the first candle; that is a rest.' },
    ],
    quiz: [
      {
        q: { vi: 'Đường nhọn cần nến xanh đóng cửa tới đâu?', en: 'Where must the green candle close for a piercing line?' },
        choices: [
          { vi: 'Qua điểm giữa thân nến đỏ trước đó', en: 'Past the midpoint of the prior red body' },
          { vi: 'Chỉ cần cao hơn giá mở của nó', en: 'Anywhere above its own open' },
          { vi: 'Trên đỉnh của nến đỏ', en: 'Above the red candle\'s high' },
        ],
        answer: 0,
        why: { vi: 'Qua điểm giữa là ranh giới; vượt hẳn cả thân thì đã là nhấn chìm.', en: 'The midpoint is the line; clearing the whole body would already be an engulfing.' },
      },
      {
        q: { vi: 'Harami khác nhấn chìm ở đâu?', en: 'How does a harami differ from an engulfing?' },
        choices: [
          { vi: 'Harami nằm TRONG thân nến trước — đà chỉ chững lại', en: 'A harami sits INSIDE the prior body — the move only pauses' },
          { vi: 'Harami luôn mạnh hơn', en: 'A harami is always stronger' },
          { vi: 'Không khác gì', en: 'There is no difference' },
        ],
        answer: 0,
        why: { vi: 'Nhấn chìm bao trùm (đổi tay); harami bị bao trùm (dừng lại).', en: 'Engulfing wraps the prior body (control changes); harami is wrapped by it (a pause).' },
      },
      {
        q: { vi: 'Tăng ba bước là mẫu gì?', en: 'What kind of pattern is rising three methods?' },
        choices: [
          { vi: 'Tiếp diễn tăng', en: 'Bullish continuation' },
          { vi: 'Đảo chiều giảm', en: 'Bearish reversal' },
          { vi: 'Do dự', en: 'Indecision' },
        ],
        answer: 0,
        why: { vi: 'Ba nến nghỉ nằm trong phạm vi nến đầu, rồi nến dài vượt đỉnh: xu hướng nghỉ rồi đi tiếp.', en: 'Three resting candles inside the first one, then a long candle to a new high: the trend rests, then continues.' },
      },
    ],
  },

  {
    id: 'patterns-more',
    section: 'candles',
    title: { vi: 'Thêm mẫu giá: ba đỉnh/đáy, nêm, cốc-tay cầm, chữ nhật, kênh', en: 'More chart patterns: triples, wedges, cup and handle, rectangles, channels' },
    summary: {
      vi: 'Cùng một luật: mẫu chỉ hoàn thành khi giá đóng cửa qua biên của nó.',
      en: 'One rule for all: a pattern completes only on a close beyond its boundary.',
    },
    figures: ['triple-top', 'rising-wedge', 'cup-handle', 'rectangle'],
    body: [
      {
        vi: 'Nhìn rộng ra vài chục cây nến, đường giá vẽ nên những hình lặp lại. Trên hình: đường nét đứt là **đường cổ / biên của mẫu**, đường màu là **hướng kỳ vọng sau khi phá**. Luật của bài Vai-đầu-vai áp cho tất cả: chưa đóng cửa qua biên thì mẫu chưa có.',
        en: 'Zoom out to a few dozen candles and the price line draws repeating shapes. In the figures, the dashed line is the **neckline / pattern boundary** and the coloured line is the **expected direction after the break**. The head-and-shoulders rule applies to all of them: no close beyond the boundary, no pattern.',
      },
      {
        vi: '**Ba đỉnh / ba đáy**: như hai đỉnh/hai đáy nhưng giá thử vùng đó lần thứ ba. Xác nhận khi thủng đáy (vượt đỉnh) của cả vùng dao động. Đây cũng là chỗ ranh giới mờ: thêm một lần chạm nữa là nó thành một **hình chữ nhật** đi ngang.',
        en: '**Triple top / bottom**: like the doubles, but price tests the zone a third time. Confirmed when the range\'s lows (highs) break. This is also where the edge blurs: one more touch and it is simply a sideways **rectangle**.',
      },
      {
        vi: '**Nêm** (wedge): hai biên cùng dốc một hướng và hội tụ lại. Điều ngược trực giác: **nêm tăng thường gãy xuống** (mỗi đỉnh mới cao hơn nhưng yếu hơn, biên trên dốc ít hơn biên dưới) và **nêm giảm thường bật lên**. Khác tam giác ở chỗ cả hai cạnh đều nghiêng.',
        en: 'A **wedge**: both edges slope the same way and converge. The counter-intuitive part: **a rising wedge usually breaks down** (each new high is higher but weaker, the upper edge flatter than the lower) and **a falling wedge usually breaks up**. Unlike a triangle, both edges tilt.',
      },
      {
        vi: '**Cờ đuôi nheo** (pennant): sau một cú chạy dốc, giá co lại thành một tam giác nhỏ rồi đi tiếp theo hướng cũ — anh em của cờ, chỉ khác là lá cờ có hình tam giác thay vì kênh. **Hình chữ nhật**: giá đi ngang giữa hai biên song song (tích luỹ); cạnh nào bị phá quyết định bước tiếp theo, và trước đó đoán là đoán.',
        en: 'A **pennant**: after a steep run, price coils into a small triangle and then continues the old way — a sibling of the flag, with a triangular flag instead of a channel. A **rectangle**: price moves sideways between two parallel edges (accumulation); whichever edge breaks decides what comes next, and before that any call is a guess.',
      },
      {
        vi: '**Cốc và tay cầm** (cup and handle) và **đáy tròn** (rounding bottom) là những nền dài: giá giảm chậm dần, đi ngang, rồi tăng chậm dần thành hình cái đĩa. Cốc có thêm một nhịp lùi nhỏ (tay cầm) ở nửa trên trước khi vượt miệng cốc. Chúng thường kéo dài hàng tháng trên nến ngày — một "cốc" ba tuần thường chỉ là một cú hồi.',
        en: '**Cup and handle** and **rounding bottom** are long bases: price falls more and more slowly, goes flat, then rises more and more quickly into a saucer. The cup adds a small dip (the handle) in its upper half before clearing the rim. On daily candles these take months — a three-week "cup" is usually just a bounce.',
      },
      {
        vi: '**Kênh giá** (channel): hai biên song song cùng dốc. Trong kênh tăng, người ta hay mua gần biên dưới và chốt gần biên trên; **thủng biên dưới là cảnh báo** đầu tiên rằng xu hướng đã đổi.',
        en: '**Channel**: two parallel edges sloping together. In a rising channel people tend to buy near the lower edge and take profit near the upper; **losing the lower edge is the first warning** that the trend has changed.',
      },
      {
        vi: 'Mục Patterns của app dò hai đỉnh/hai đáy, vai-đầu-vai, ba loại tam giác, cờ và phá vỡ vùng — chưa dò các mẫu trong bài này. Bảng Tra cứu nhanh có đủ hình của chúng để xem lại.',
        en: 'The app\'s Patterns mode detects doubles, head and shoulders, the three triangles, flags and zone breaks — not the patterns in this lesson. Quick reference has a figure for each of them to look back at.',
      },
    ],
    traps: [
      { vi: 'Mua nêm tăng vì "đang tăng": đó chính là hình dạng hay gãy xuống nhất.', en: 'Buying a rising wedge because "it is going up": that is exactly the shape most prone to breaking down.' },
      { vi: 'Thấy cốc-tay cầm ở mọi đáy chữ U ngắn hạn. Một nền thật cần thời gian.', en: 'Seeing a cup and handle in every short-term U. A real base takes time.' },
    ],
    quiz: [
      {
        q: { vi: 'Nêm tăng thường phá vỡ theo hướng nào?', en: 'Which way does a rising wedge usually break?' },
        choices: [
          { vi: 'Xuống', en: 'Down' },
          { vi: 'Lên', en: 'Up' },
          { vi: 'Không bao giờ phá', en: 'It never breaks' },
        ],
        answer: 0,
        why: { vi: 'Đỉnh mới cao hơn nhưng yếu dần; khi biên dưới thủng, lực mua đã cạn.', en: 'Each high is higher but weaker; when the lower edge goes, the buying has run out.' },
      },
      {
        q: { vi: 'Hình chữ nhật cho biết hướng tiếp theo khi nào?', en: 'When does a rectangle tell you the next direction?' },
        choices: [
          { vi: 'Khi giá đóng cửa qua một trong hai biên', en: 'When price closes beyond one of its edges' },
          { vi: 'Ngay khi nó hình thành', en: 'As soon as it forms' },
          { vi: 'Luôn luôn đi lên', en: 'It always resolves up' },
        ],
        answer: 0,
        why: { vi: 'Đi ngang là hai phe cân bằng; chỉ cú phá mới nói ai thắng.', en: 'Sideways means the sides are balanced; only the break says who won.' },
      },
    ],
  },
];
