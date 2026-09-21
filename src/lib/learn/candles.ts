import type { Lesson } from './types';

/**
 * Phần 1 — Nến Nhật và mẫu hình giá.
 *
 * Mọi con số ngưỡng ở đây (SMA200, "đáy xoay cần 5 nến hai bên", "một đáy
 * không phải hỗ trợ") là con số app ĐANG DÙNG THẬT ở tab Long-term
 * (`lib/support.ts`) và tab Screener — bài học giải thích chính cái máy đang
 * chạy, không phải một cuốn sách khác. Đổi ngưỡng trong code thì phải đổi ở
 * đây, và ngược lại.
 */
export const CANDLE_LESSONS: Lesson[] = [
  {
    id: 'candle-anatomy',
    section: 'candles',
    title: { vi: 'Một cây nến nói gì', en: 'What one candle says' },
    summary: {
      vi: 'Thân, râu, màu — và vì sao râu dài quan trọng hơn thân dài.',
      en: 'Body, wick, colour — and why a long wick matters more than a long body.',
    },
    figures: ['candle-anatomy'],
    body: [
      {
        vi: 'Một cây nến gói bốn con số của một khoảng thời gian: giá **mở**, **cao nhất**, **thấp nhất**, **đóng**. Phần **thân** là khoảng từ mở tới đóng; hai **râu** (bấc) là phần giá đã đi tới rồi quay lại. Nến xanh: đóng cao hơn mở. Nến đỏ: đóng thấp hơn mở.',
        en: 'A candle packs four numbers from one time span: the **open**, **high**, **low** and **close**. The **body** runs from open to close; the two **wicks** are where price went and came back from. Green: closed above the open. Red: closed below it.',
      },
      {
        vi: 'Thân dài nghĩa là một bên thắng áp đảo trong khoảng đó. Râu dài nghĩa là một bên đã **thử** và bị **đẩy lui** — đó là thông tin về ai đang đứng chờ ở mức giá ấy, thứ mà thân nến không nói được.',
        en: 'A long body means one side won decisively during that span. A long wick means one side **tried** and was **pushed back** — that tells you who is waiting at that price, which the body alone cannot.',
      },
      {
        vi: 'Một cây nến đứng một mình gần như không có nghĩa. Nó chỉ có nghĩa ở **vị trí** của nó: cùng một cây búa ở đáy một đợt rớt về vùng hỗ trợ là tín hiệu; cây búa giữa một vùng đi ngang là nhiễu. Mọi bài sau đều quay về câu này.',
        en: 'A single candle on its own means almost nothing. It means something because of **where** it sits: the same hammer at the bottom of a drop into support is a signal; the same hammer in the middle of a sideways range is noise. Every later lesson comes back to this.',
      },
      {
        vi: 'Khung thời gian đổi thì ý nghĩa đổi. Trong app, tab Analyze và Long-term dùng nến **ngày**; tab Bề rộng TT dùng nến **5 phút** cho TICK/VIX. Một mẫu hình trên nến 5 phút nói về vài giờ tới; trên nến ngày nói về vài tuần.',
        en: 'Change the timeframe and the meaning changes. In this app, Analyze and Long-term use **daily** candles; the Internals tab uses **5-minute** candles for TICK/VIX. A pattern on 5-minute candles speaks to the next few hours; on daily candles, to the next few weeks.',
      },
    ],
    traps: [
      {
        vi: 'Đọc màu nến làm xu hướng: một nến đỏ trong xu hướng tăng là chuyện thường, không phải đảo chiều.',
        en: 'Reading candle colour as trend: one red candle inside an uptrend is ordinary, not a reversal.',
      },
      {
        vi: 'Bỏ qua khối lượng: một râu dài với khối lượng lớn là một cuộc đấu thật; râu dài với khối lượng nhỏ có thể chỉ là vài lệnh lẻ.',
        en: 'Ignoring volume: a long wick on heavy volume is a real fight; a long wick on thin volume may be a few stray orders.',
      },
    ],
    seeIn: { tab: 'analyze', label: { vi: 'Xem nến ngày thật ở tab Analyze', en: 'See real daily candles in Analyze' } },
    quiz: [
      {
        q: { vi: 'Nến có râu dưới rất dài, thân nhỏ ở trên, xuất hiện sau nhiều ngày rớt. Điều gì đã xảy ra trong ngày đó?', en: 'A candle with a very long lower wick and a small body near the top appears after several down days. What happened that day?' },
        choices: [
          { vi: 'Bên bán thắng cả ngày', en: 'Sellers won all day' },
          { vi: 'Giá bị đẩy xuống sâu rồi bị mua ngược lên gần mức mở', en: 'Price was pushed deep down, then bought back up near the open' },
          { vi: 'Không có giao dịch', en: 'There was no trading' },
        ],
        answer: 1,
        why: { vi: 'Râu dưới dài là dấu vết của giá đã đi xuống và bị đẩy lui: có người mua chờ sẵn ở dưới.', en: 'A long lower wick is the trace of price going down and being pushed back: buyers were waiting below.' },
      },
      {
        q: { vi: 'Cùng một cây nến búa, ở đâu thì đáng tin hơn?', en: 'The same hammer candle — where is it more credible?' },
        choices: [
          { vi: 'Giữa một vùng đi ngang', en: 'In the middle of a sideways range' },
          { vi: 'Ở đáy một đợt rớt, chạm vùng hỗ trợ cũ', en: 'At the bottom of a drop, touching an old support zone' },
          { vi: 'Như nhau ở mọi chỗ', en: 'The same everywhere' },
        ],
        answer: 1,
        why: { vi: 'Nến chỉ có nghĩa ở vị trí của nó — đây là ý chính của cả bài.', en: 'A candle means something because of where it sits — the main point of the lesson.' },
      },
      {
        q: { vi: 'Tab nào trong app dùng nến 5 phút?', en: 'Which tab in this app uses 5-minute candles?' },
        choices: [
          { vi: 'Long-term', en: 'Long-term' },
          { vi: 'Heatmap → Internals (TICK, VIX)', en: 'Heatmap → Internals (TICK, VIX)' },
          { vi: 'Insider Trade', en: 'Insider Trade' },
        ],
        answer: 1,
        why: { vi: 'Bề rộng thị trường là chuyện trong ngày, nên nến 5 phút; Long-term và Analyze dùng nến ngày.', en: 'Market internals are an intraday story, hence 5-minute candles; Long-term and Analyze use daily candles.' },
      },
    ],
  },

  {
    id: 'doji',
    section: 'candles',
    title: { vi: 'Doji và con quay: thị trường đang do dự', en: 'Doji and spinning tops: the market is undecided' },
    summary: {
      vi: 'Thân gần bằng không nghĩa là hai bên hoà — và hoà SAU một xu hướng mới đáng chú ý.',
      en: 'A near-zero body means a draw — and a draw AFTER a trend is what matters.',
    },
    figures: ['doji'],
    body: [
      {
        vi: '**Doji** là nến mở và đóng gần như cùng giá: thân là một vạch. **Con quay** (spinning top) là thân nhỏ với râu hai đầu. Cả hai nói cùng một điều: trong khoảng đó, không bên nào giữ được ưu thế.',
        en: '**Doji** is a candle that opens and closes at almost the same price: the body is a line. A **spinning top** is a small body with wicks on both ends. Both say the same thing: neither side held the advantage in that span.',
      },
      {
        vi: 'Do dự chỉ có nghĩa khi trước đó có một xu hướng rõ. Doji sau mười phiên tăng mạnh nghĩa là bên mua bắt đầu hết hơi — chưa phải đảo chiều, nhưng là lúc **thôi đuổi theo**. Doji giữa vùng đi ngang thì chỉ là thêm một ngày đi ngang.',
        en: 'Indecision only means something after a clear trend. A doji after ten strong up days means buyers are running out of steam — not a reversal yet, but the moment to **stop chasing**. A doji inside a sideways range is just one more sideways day.',
      },
      {
        vi: 'Cách dùng an toàn: coi doji là **câu hỏi**, và cây nến kế tiếp là **câu trả lời**. Doji rồi nến đỏ mạnh đóng dưới đáy doji: câu trả lời là xuống. Doji rồi nến xanh vượt đỉnh doji: xu hướng cũ tiếp tục.',
        en: 'The safe use: treat the doji as a **question** and the next candle as the **answer**. Doji, then a strong red candle closing below the doji\'s low: the answer is down. Doji, then a green candle clearing the doji\'s high: the old trend continues.',
      },
      {
        vi: 'Với người bán put, doji ở đỉnh sau một đợt tăng là lúc xem lại cushion (khoảng cách từ giá tới strike): giá có thể sắp lùi, và một strike bán lúc giá đang hưng phấn nhất là strike gần nhất với rắc rối.',
        en: 'For a put seller, a doji at the top of a run is when to re-check cushion (distance from price to strike): price may be about to pull back, and a strike sold at peak enthusiasm is the strike closest to trouble.',
      },
    ],
    traps: [
      {
        vi: 'Bán ngay khi thấy doji ở đỉnh. Doji không phải lệnh; nến sau nó mới là lệnh.',
        en: 'Selling the moment a doji prints at a top. The doji is not the order; the candle after it is.',
      },
      {
        vi: 'Nhìn doji trên nến 5 phút rồi kết luận cho vị thế hàng tháng.',
        en: 'Reading a 5-minute doji and concluding about a month-long position.',
      },
    ],
    quiz: [
      {
        q: { vi: 'Doji nói gì về phiên đó?', en: 'What does a doji say about that session?' },
        choices: [
          { vi: 'Bên mua thắng', en: 'Buyers won' },
          { vi: 'Bên bán thắng', en: 'Sellers won' },
          { vi: 'Không bên nào giữ được ưu thế', en: 'Neither side held the advantage' },
        ],
        answer: 2,
        why: { vi: 'Mở và đóng gần bằng nhau: mọi nỗ lực của cả hai bên đều bị đẩy về chỗ cũ.', en: 'Open and close nearly equal: every push by either side was returned to the start.' },
      },
      {
        q: { vi: 'Sau doji ở đỉnh, cây nến nào "trả lời" là xuống?', en: 'After a doji at a top, which next candle "answers" down?' },
        choices: [
          { vi: 'Nến đỏ đóng dưới đáy của doji', en: 'A red candle closing below the doji\'s low' },
          { vi: 'Một doji nữa', en: 'Another doji' },
          { vi: 'Nến xanh vượt đỉnh doji', en: 'A green candle clearing the doji\'s high' },
        ],
        answer: 0,
        why: { vi: 'Đóng dưới đáy doji là bên bán đã thắng cuộc đấu mà doji để ngỏ.', en: 'Closing below the doji\'s low means sellers won the fight the doji left open.' },
      },
    ],
  },

  {
    id: 'hammer',
    section: 'candles',
    title: { vi: 'Búa và sao băng: râu là dấu vết của sự từ chối', en: 'Hammer and shooting star: the wick is the trace of rejection' },
    summary: {
      vi: 'Một râu dài về phía một mức giá nghĩa là mức đó đã được bảo vệ.',
      en: 'A long wick toward a price level means that level was defended.',
    },
    figures: ['hammer'],
    body: [
      {
        vi: '**Búa** (hammer): thân nhỏ ở trên, râu dưới dài ít nhất gấp đôi thân, gần như không có râu trên. Xuất hiện **sau một đợt giảm**. Câu chuyện: giá bị bán xuống sâu trong phiên, rồi người mua nhấc nó về gần mức mở. Mức đáy của râu là nơi có người chờ mua.',
        en: '**Hammer**: small body near the top, lower wick at least twice the body, almost no upper wick. Appears **after a decline**. The story: price was sold hard within the session, then buyers lifted it back near the open. The wick\'s low is where someone was waiting to buy.',
      },
      {
        vi: '**Sao băng** (shooting star) là hình ngược lại ở **đỉnh** một đợt tăng: râu trên dài, thân nhỏ ở dưới. Giá được đẩy lên, rồi bị bán ngược về. Mức đỉnh của râu là nơi có người chờ bán.',
        en: 'A **shooting star** is the mirror image at the **top** of a rise: long upper wick, small body near the bottom. Price was pushed up, then sold back down. The wick\'s high is where someone was waiting to sell.',
      },
      {
        vi: 'Cùng hình búa nhưng ở **đỉnh** thì gọi là **người treo cổ** (hanging man) — cảnh báo yếu hơn nhiều, vì râu dưới ở đỉnh chỉ nói bên mua vẫn còn, chưa nói bên bán đã tới. Cần nến đỏ xác nhận sau đó.',
        en: 'The same hammer shape at a **top** is called a **hanging man** — a much weaker warning, because a lower wick at a top only says buyers are still around, not that sellers have arrived. It needs a red confirming candle.',
      },
      {
        vi: 'Xác nhận là điều làm những mẫu này dùng được: búa cần nến kế tiếp **đóng trên thân búa**; sao băng cần nến kế tiếp **đóng dưới thân sao băng**. Không có xác nhận, tỷ lệ đúng của búa đơn lẻ không cao hơn tung đồng xu bao nhiêu.',
        en: 'Confirmation is what makes these usable: a hammer needs the next candle to **close above the hammer\'s body**; a shooting star needs the next to **close below its body**. Unconfirmed, a lone hammer is not much better than a coin toss.',
      },
    ],
    traps: [
      {
        vi: 'Búa xuất hiện KHÔNG sau một đợt giảm: không có gì để đảo chiều, đó chỉ là một nến có râu.',
        en: 'A hammer that does NOT follow a decline: there is nothing to reverse, it is just a candle with a wick.',
      },
      {
        vi: 'Búa có râu trên cũng dài: đó là con quay (do dự), không phải búa.',
        en: 'A hammer whose upper wick is also long: that is a spinning top (indecision), not a hammer.',
      },
    ],
    quiz: [
      {
        q: { vi: 'Sao băng xuất hiện ở đâu và nói gì?', en: 'Where does a shooting star appear, and what does it say?' },
        choices: [
          { vi: 'Ở đáy; người mua đã tới', en: 'At a bottom; buyers have arrived' },
          { vi: 'Ở đỉnh; giá bị đẩy lên rồi bị bán ngược về', en: 'At a top; price was pushed up then sold back' },
          { vi: 'Bất kỳ đâu; không có nghĩa', en: 'Anywhere; it has no meaning' },
        ],
        answer: 1,
        why: { vi: 'Râu trên dài ở đỉnh là dấu vết của một cú thử lên bị từ chối.', en: 'A long upper wick at a top is the trace of an upside attempt that was rejected.' },
      },
      {
        q: { vi: 'Búa được xác nhận khi nào?', en: 'When is a hammer confirmed?' },
        choices: [
          { vi: 'Ngay khi hình thành', en: 'The moment it forms' },
          { vi: 'Khi nến kế tiếp đóng trên thân búa', en: 'When the next candle closes above the hammer\'s body' },
          { vi: 'Khi có một búa thứ hai', en: 'When a second hammer prints' },
        ],
        answer: 1,
        why: { vi: 'Nến kế tiếp là câu trả lời; không có nó, búa chỉ là một câu hỏi.', en: 'The next candle is the answer; without it, the hammer is only a question.' },
      },
      {
        q: { vi: 'Hình búa nhưng nằm ở đỉnh một đợt tăng gọi là gì?', en: 'A hammer shape sitting at the top of a rise is called what?' },
        choices: [
          { vi: 'Người treo cổ (hanging man)', en: 'Hanging man' },
          { vi: 'Doji', en: 'Doji' },
          { vi: 'Nến nhấn chìm', en: 'Engulfing candle' },
        ],
        answer: 0,
        why: { vi: 'Cùng hình, khác vị trí, và yếu hơn nhiều — cần nến đỏ xác nhận.', en: 'Same shape, different place, and far weaker — it needs a red confirming candle.' },
      },
    ],
  },

  {
    id: 'engulfing',
    section: 'candles',
    title: { vi: 'Nhấn chìm và sao mai/sao hôm: hai-ba nến kể một câu chuyện', en: 'Engulfing and morning/evening star: two or three candles tell a story' },
    summary: {
      vi: 'Nến sau nuốt trọn nến trước là một bên đã đổi ý dứt khoát.',
      en: 'A candle swallowing the one before it means one side changed its mind decisively.',
    },
    figures: ['engulfing', 'star'],
    body: [
      {
        vi: '**Nhấn chìm tăng** (bullish engulfing): sau một đợt giảm, một nến đỏ nhỏ rồi một nến xanh có thân **bao trọn** thân nến đỏ — mở thấp hơn đáy thân đỏ, đóng cao hơn đỉnh thân đỏ. Mọi người bán của ngày trước giờ đều đang lỗ. **Nhấn chìm giảm** là hình ngược lại ở đỉnh.',
        en: '**Bullish engulfing**: after a decline, a small red candle then a green candle whose body **wraps** the red body — opens below the red body\'s low, closes above its high. Everyone who sold yesterday is now underwater. **Bearish engulfing** is the mirror at a top.',
      },
      {
        vi: '**Sao mai** (morning star) là ba nến ở đáy: nến đỏ dài → nến thân nhỏ (do dự, thường có khoảng trống) → nến xanh dài đóng sâu vào thân nến đỏ đầu. **Sao hôm** (evening star) là hình ngược lại ở đỉnh. Nến giữa chính là doji của bài trước, và hai nến quanh nó là câu hỏi và câu trả lời.',
        en: 'A **morning star** is three candles at a bottom: long red → small-bodied candle (indecision, often gapped) → long green closing deep into the first red body. An **evening star** is the mirror at a top. The middle candle is the doji from the previous lesson, and the two around it are the question and the answer.',
      },
      {
        vi: 'Cả hai mẫu mạnh hơn búa đơn lẻ vì chúng **đã chứa xác nhận**: nến cuối là câu trả lời. Chúng cũng mạnh hơn khi nến cuối có khối lượng lớn hơn hai nến trước.',
        en: 'Both patterns are stronger than a lone hammer because they **already contain confirmation**: the last candle is the answer. They are stronger still when that last candle carries more volume than the two before it.',
      },
      {
        vi: 'Trong app, đây là loại nến đáng tìm ở **vùng hỗ trợ** mà tab Long-term đã đánh dấu: một nhấn chìm tăng ngay trên vùng hỗ trợ đã chạm 2–3 lần là hai bằng chứng cùng chỉ một hướng.',
        en: 'In this app, these are the candles worth looking for at the **support zones** the Long-term tab marks: a bullish engulfing right above a zone touched 2–3 times is two pieces of evidence pointing the same way.',
      },
    ],
    traps: [
      {
        vi: 'Chỉ so RÂU thay vì so THÂN: nhấn chìm là thân bao thân; râu không tính.',
        en: 'Comparing WICKS instead of BODIES: engulfing is body wrapping body; wicks do not count.',
      },
      {
        vi: 'Nhấn chìm giảm sau một ngày tăng nhỏ trong xu hướng tăng lớn: nó chỉ đảo ngược một ngày, không đảo ngược xu hướng.',
        en: 'A bearish engulfing after one small up day inside a large uptrend: it reverses one day, not the trend.',
      },
    ],
    seeIn: { tab: 'longterm', label: { vi: 'Xem vùng hỗ trợ thật ở tab Long-term', en: 'See real support zones in Long-term' } },
    quiz: [
      {
        q: { vi: 'Nhấn chìm tăng cần điều kiện nào?', en: 'What does a bullish engulfing require?' },
        choices: [
          { vi: 'Râu nến xanh dài hơn râu nến đỏ', en: 'The green wick longer than the red wick' },
          { vi: 'Thân nến xanh bao trọn thân nến đỏ trước đó, sau một đợt giảm', en: 'The green body wrapping the prior red body, after a decline' },
          { vi: 'Hai nến xanh liên tiếp', en: 'Two green candles in a row' },
        ],
        answer: 1,
        why: { vi: 'Thân bao thân, và phải có đợt giảm trước đó để có gì mà đảo chiều.', en: 'Body wraps body, and there must be a prior decline for there to be anything to reverse.' },
      },
      {
        q: { vi: 'Nến giữa của sao mai là gì?', en: 'What is the middle candle of a morning star?' },
        choices: [
          { vi: 'Nến xanh dài', en: 'A long green candle' },
          { vi: 'Nến thân nhỏ — do dự', en: 'A small-bodied candle — indecision' },
          { vi: 'Nến đỏ dài', en: 'A long red candle' },
        ],
        answer: 1,
        why: { vi: 'Sao mai = giảm mạnh → do dự → tăng mạnh. Nến giữa là chỗ thị trường đổi ý.', en: 'Morning star = strong down → indecision → strong up. The middle is where the market changes its mind.' },
      },
    ],
  },

  {
    id: 'support',
    section: 'candles',
    title: { vi: 'Hỗ trợ, kháng cự và SMA200 — cách app tự vẽ chúng', en: 'Support, resistance and the SMA200 — how the app draws them itself' },
    summary: {
      vi: 'Một đáy không phải hỗ trợ. Hai đáy mới là. Và tại sao tuần này chưa thể là một mức.',
      en: 'One low is not support. Two are. And why this week cannot be a level yet.',
    },
    figures: ['support'],
    body: [
      {
        vi: '**Hỗ trợ** là vùng giá mà nhiều lần rớt tới đó rồi bật lên — nơi người mua đã xuất hiện lặp lại. **Kháng cự** là hình ngược lại ở trên. Chúng là **vùng**, không phải một đường: giá hiếm khi bật đúng đến từng xu.',
        en: '**Support** is a price zone that price has fallen to and bounced from repeatedly — where buyers have shown up more than once. **Resistance** is the mirror above. They are **zones**, not lines: price rarely bounces to the cent.',
      },
      {
        vi: 'Tab Long-term tự tính vùng hỗ trợ từ nến ngày 3 năm theo ba luật, và ba luật đó là nội dung bài này:\n- Một **đáy xoay** là nến có 5 nến mỗi bên cao hơn nó. Nên **5 nến gần nhất không bao giờ là đáy xoay** — chưa có gì xác nhận. Đáy của tuần này chưa phải một mức, đó là giới hạn thật của phép đo, không phải thiếu sót.\n- Các đáy cách nhau **trong 2,5%** gộp thành một vùng.\n- Vùng cần **ít nhất 2 lần chạm**. Một đáy đơn lẻ là một đáy, không phải hỗ trợ.',
        en: 'The Long-term tab computes support zones from 3 years of daily candles by three rules, and those rules are this lesson:\n- A **pivot low** is a candle with 5 higher candles on each side. So the **last 5 candles can never be pivots** — nothing has confirmed them. This week\'s low is not a level yet; that is a real limit of the measurement, not an omission.\n- Lows within **2.5%** of each other merge into one zone.\n- A zone needs **at least 2 touches**. A single low is a low, not support.',
      },
      {
        vi: '**Đang tiến về hỗ trợ** và **đã thủng hỗ trợ** là hai chuyện khác nhau và hành động ngược nhau, dù trên biểu đồ cả hai đều là "giá nằm cạnh một đường". App giữ chúng ở hai ô riêng (`nearest` / `broken`) vì đúng lý do đó.',
        en: '**Approaching support** and **already broken below** are different things with opposite actions, even though on a chart both look like "price sitting next to a line". The app keeps them in separate fields (`nearest` / `broken`) for exactly that reason.',
      },
      {
        vi: '**SMA200** là trung bình 200 phiên đóng cửa — thước đo xu hướng một năm. App dùng nó hai cách: Screener có ô tích "giá phải trên SMA200"; Long-term cố ý chỉ đòi **độ dốc SMA200 dương** (cho phép thủng), vì mã rớt đủ sâu để đáng nhìn thì thường đã thủng SMA200 rồi — đòi chặt là bảng trống quanh năm.',
        en: 'The **SMA200** is the average of the last 200 closes — a one-year trend gauge. The app uses it two ways: the Screener has a "price must be above SMA200" tickbox; Long-term deliberately asks only for a **rising SMA200 slope** (allowing a break), because anything down far enough to be interesting has usually lost its SMA200 already — the strict reading empties the table all year.',
      },
    ],
    traps: [
      {
        vi: 'Vẽ hỗ trợ từ một đáy duy nhất rồi bán put ngay trên nó.',
        en: 'Drawing support from a single low and selling a put right above it.',
      },
      {
        vi: 'Coi giá "chạm" SMA200 là bật lên: SMA200 là thước đo xu hướng, không phải một bức tường.',
        en: 'Treating a "touch" of the SMA200 as a bounce: the SMA200 measures trend, it is not a wall.',
      },
    ],
    seeIn: { tab: 'longterm', label: { vi: 'Xem vùng hỗ trợ và độ dốc SMA200 ở tab Long-term', en: 'See support zones and SMA200 slope in Long-term' } },
    quiz: [
      {
        q: { vi: 'Vì sao đáy của 5 nến gần nhất không được app tính là đáy xoay?', en: 'Why does the app not count a low among the last 5 candles as a pivot?' },
        choices: [
          { vi: 'Vì chưa có 5 nến sau nó để xác nhận', en: 'Because there are not 5 candles after it yet to confirm it' },
          { vi: 'Vì dữ liệu chưa tải', en: 'Because the data has not loaded' },
          { vi: 'Vì giá gần nhất không quan trọng', en: 'Because recent prices do not matter' },
        ],
        answer: 0,
        why: { vi: 'Đáy xoay cần 5 nến cao hơn ở mỗi bên; bên phải của nến tuần này chưa tồn tại.', en: 'A pivot needs 5 higher candles on each side; the right side of this week\'s candle does not exist yet.' },
      },
      {
        q: { vi: 'Vùng hỗ trợ trong app cần ít nhất bao nhiêu lần chạm?', en: 'How many touches does a support zone need in this app?' },
        choices: [{ vi: '1', en: '1' }, { vi: '2', en: '2' }, { vi: '5', en: '5' }],
        answer: 1,
        why: { vi: 'Hỗ trợ là nơi giá quay đầu LẶP LẠI; một đáy là một đáy.', en: 'Support is where price turned REPEATEDLY; one low is one low.' },
      },
      {
        q: { vi: 'Tab Long-term đòi gì về SMA200?', en: 'What does the Long-term tab require of the SMA200?' },
        choices: [
          { vi: 'Giá phải trên SMA200, luôn luôn', en: 'Price above the SMA200, always' },
          { vi: 'Độ dốc SMA200 dương (thủng thì được, nhưng có ô tích bật chặt)', en: 'A rising SMA200 slope (a break is allowed, with a tickbox to be strict)' },
          { vi: 'Không dùng SMA200', en: 'It does not use the SMA200' },
        ],
        answer: 1,
        why: { vi: 'Mã đang rớt đủ sâu để đáng nhìn thường đã thủng SMA200; ô tích để anh tự chọn mức chặt.', en: 'Stocks down far enough to be interesting have usually lost the SMA200; the tickbox lets you choose the strict reading.' },
      },
    ],
  },

  {
    id: 'head-shoulders',
    section: 'candles',
    title: { vi: 'Vai-đầu-vai và hai đỉnh/hai đáy', en: 'Head and shoulders, double tops and bottoms' },
    summary: {
      vi: 'Mẫu đảo chiều lớn — và đường cổ mới là thứ quyết định, không phải hình dáng.',
      en: 'The big reversal patterns — and the neckline decides, not the shape.',
    },
    figures: ['head-shoulders', 'double'],
    body: [
      {
        vi: '**Vai-đầu-vai**: ba đỉnh, đỉnh giữa cao nhất, hai đỉnh bên thấp hơn và xấp xỉ nhau. Nối hai đáy giữa các đỉnh được **đường cổ**. Mẫu chỉ **hoàn thành khi giá đóng cửa dưới đường cổ** — trước đó nó chỉ là ba cái đỉnh. Mục tiêu giá thường ước bằng chiều cao từ đầu tới đường cổ, chiếu xuống từ điểm thủng.',
        en: '**Head and shoulders**: three peaks, the middle one highest, the two outer ones lower and roughly equal. Join the two troughs between them for the **neckline**. The pattern is only **complete on a close below the neckline** — before that it is just three peaks. The usual target is the head-to-neckline height, projected down from the break.',
      },
      {
        vi: '**Hai đỉnh** (double top) là hình chữ M: hai lần lên cùng một vùng, không qua được. **Hai đáy** (double bottom) là chữ W. Cùng luật: chưa thủng đáy giữa (đỉnh giữa với chữ W) thì chưa có gì. Hai đáy chính là **vùng hỗ trợ hai lần chạm** của bài trước, nhìn từ góc khác.',
        en: 'A **double top** is an M: two runs into the same zone that fail. A **double bottom** is a W. Same rule: until the middle trough (middle peak, for a W) breaks, nothing has happened. A double bottom is the **two-touch support zone** from the last lesson, seen from another angle.',
      },
      {
        vi: 'Hai thứ làm các mẫu này đáng tin hơn: **khối lượng giảm dần** qua từng đỉnh (bên mua yếu đi) và **khối lượng tăng vọt** ở nến thủng đường cổ. Thủng với khối lượng nhỏ hay bị **phá giả** — giá thủng rồi quay lại trên đường cổ trong vài phiên.',
        en: 'Two things make these patterns more credible: **declining volume** across the peaks (buyers weakening) and a **volume surge** on the neckline break. A thin-volume break is often a **false break** — price dips through and is back above the neckline within a few sessions.',
      },
      {
        vi: 'Với bán put: một mã đang vẽ vai phải với khối lượng yếu là mã nên chờ. Nếu vẫn bán, strike dưới đường cổ một khoảng bằng chiều cao mẫu là cách tôn trọng mục tiêu giá của chính mẫu hình.',
        en: 'For put selling: a stock drawing its right shoulder on weak volume is one to wait on. If you sell anyway, a strike below the neckline by the pattern\'s height respects the pattern\'s own target.',
      },
    ],
    traps: [
      {
        vi: 'Gọi tên mẫu khi mới có hai đỉnh và một đáy: một nửa vai-đầu-vai chỉ là một đợt tăng đang tiếp diễn.',
        en: 'Naming the pattern with only two peaks and one trough: half a head-and-shoulders is just an ongoing uptrend.',
      },
      {
        vi: 'Hành động khi giá CHẠM đường cổ trong phiên thay vì ĐÓNG CỬA dưới nó.',
        en: 'Acting when price TOUCHES the neckline intraday instead of CLOSING below it.',
      },
    ],
    quiz: [
      {
        q: { vi: 'Vai-đầu-vai hoàn thành khi nào?', en: 'When is a head and shoulders complete?' },
        choices: [
          { vi: 'Khi đỉnh thứ ba hình thành', en: 'When the third peak forms' },
          { vi: 'Khi giá đóng cửa dưới đường cổ', en: 'When price closes below the neckline' },
          { vi: 'Khi khối lượng tăng', en: 'When volume rises' },
        ],
        answer: 1,
        why: { vi: 'Trước khi thủng đường cổ, nó chỉ là ba cái đỉnh — và nhiều "vai-đầu-vai" không bao giờ thủng.', en: 'Before the neckline breaks it is just three peaks — and many "head and shoulders" never break.' },
      },
      {
        q: { vi: 'Dấu hiệu nào làm một cú thủng đường cổ đáng tin hơn?', en: 'What makes a neckline break more credible?' },
        choices: [
          { vi: 'Khối lượng tăng vọt ở nến thủng', en: 'A volume surge on the breaking candle' },
          { vi: 'Thủng vào thứ Sáu', en: 'Breaking on a Friday' },
          { vi: 'Thủng với khối lượng rất nhỏ', en: 'Breaking on very thin volume' },
        ],
        answer: 0,
        why: { vi: 'Thủng với khối lượng nhỏ hay là phá giả.', en: 'Thin-volume breaks are often false breaks.' },
      },
    ],
  },

  {
    id: 'triangle-flag',
    section: 'candles',
    title: { vi: 'Tam giác và cờ: mẫu tiếp diễn', en: 'Triangles and flags: continuation patterns' },
    summary: {
      vi: 'Thị trường nghỉ giữa chừng, rồi thường đi tiếp hướng cũ.',
      en: 'The market pauses mid-move, then usually continues the old direction.',
    },
    figures: ['triangle', 'flag'],
    body: [
      {
        vi: 'Không phải mẫu nào cũng đảo chiều. **Tam giác** và **cờ** là chỗ thị trường **nghỉ**: biên độ hẹp dần, khối lượng cạn dần, rồi giá bung ra — và thường bung theo **hướng đã đi vào**.',
        en: 'Not every pattern reverses. **Triangles** and **flags** are where the market **rests**: range narrows, volume dries up, then price breaks out — usually in the **direction it came in**.',
      },
      {
        vi: '**Tam giác tăng** (ascending): đỉnh ngang, đáy cao dần — người mua sốt ruột hơn người bán, thường bung lên. **Tam giác giảm** là hình ngược lại. **Tam giác cân** (symmetrical): cả hai bên co lại, hướng bung theo xu hướng trước đó.',
        en: '**Ascending triangle**: flat tops, rising lows — buyers more eager than sellers, usually resolves up. **Descending** is the mirror. **Symmetrical**: both sides converge; the break usually follows the prior trend.',
      },
      {
        vi: '**Cờ** (flag): sau một cú tăng dốc (**cột cờ**), giá lùi nhẹ trong một kênh hẹp nghiêng ngược hướng, vài phiên tới vài tuần, rồi bung tiếp. Mục tiêu hay ước bằng chiều cao cột cờ cộng từ điểm bung.',
        en: 'A **flag**: after a steep run (the **pole**), price drifts back inside a narrow channel tilted against the move, for days to weeks, then breaks on. The usual target is the pole height added from the breakout.',
      },
      {
        vi: 'Dấu hiệu phân biệt nghỉ thật với đảo chiều: **khối lượng phải giảm** trong lúc co lại. Nếu khối lượng lớn trong tam giác, đó không phải nghỉ — đó là một cuộc đấu, và kết quả không thiên về bên nào.',
        en: 'The tell that separates a rest from a reversal: **volume must shrink** while the range contracts. Heavy volume inside a triangle is not a rest — it is a fight, and the outcome favours no one.',
      },
      {
        vi: 'Cho người bán put, cờ tăng với khối lượng cạn là bối cảnh dễ chịu: giá đang nghỉ trên một cú tăng, cushion tính từ đáy cờ, và thời gian trôi đang có lợi cho vị thế.',
        en: 'For a put seller, a bull flag on drying volume is a comfortable backdrop: price is resting above a run, cushion measures from the flag\'s low, and time decay is working for the position.',
      },
    ],
    traps: [
      {
        vi: 'Đoán hướng bung trước khi bung. Tam giác cân nói "sắp có chuyển động", không nói hướng.',
        en: 'Guessing the breakout direction before it breaks. A symmetrical triangle says "a move is coming", not which way.',
      },
      {
        vi: 'Cờ kéo dài quá lâu (nhiều tuần với nến ngày) thì không còn là cờ — đà đã tắt.',
        en: 'A flag that drags on too long (many weeks on daily candles) is no longer a flag — the momentum is gone.',
      },
    ],
    quiz: [
      {
        q: { vi: 'Trong một tam giác "nghỉ thật", khối lượng nên thế nào?', en: 'Inside a genuine resting triangle, what should volume do?' },
        choices: [
          { vi: 'Tăng dần', en: 'Rise' },
          { vi: 'Giảm dần', en: 'Shrink' },
          { vi: 'Không quan trọng', en: 'It does not matter' },
        ],
        answer: 1,
        why: { vi: 'Nghỉ là ít người giao dịch; khối lượng lớn trong tam giác là một cuộc đấu.', en: 'A rest means fewer trades; heavy volume inside a triangle is a fight.' },
      },
      {
        q: { vi: 'Tam giác tăng có đặc điểm gì?', en: 'What characterises an ascending triangle?' },
        choices: [
          { vi: 'Đỉnh ngang, đáy cao dần', en: 'Flat tops, rising lows' },
          { vi: 'Đỉnh thấp dần, đáy ngang', en: 'Falling tops, flat lows' },
          { vi: 'Cả đỉnh và đáy đều cao dần', en: 'Both tops and lows rising' },
        ],
        answer: 0,
        why: { vi: 'Người mua trả cao dần trong khi người bán vẫn giữ một mức — thường bung lên.', en: 'Buyers pay more each time while sellers hold one level — usually resolves upward.' },
      },
    ],
  },
];
