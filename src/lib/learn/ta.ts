import type { Lesson } from './types';

/**
 * Mục "Xu hướng, chỉ báo & rủi ro" — phần còn lại của bài "Phân tích kỹ thuật
 * căn bản" chủ app gửi (artifact, 2026-10-07).
 *
 * Như mọi bài ở đây, định nghĩa đi theo CÁCH APP TÍNH: chỉ báo ở bài 2 là
 * đúng bộ thông số tab Analyze đang in (SMA20/50/200, RSI 14, MACD 12/26/9,
 * Bollinger 20/2), để đọc xong là đọc được màn hình bên cạnh. Bài 3 thêm một
 * điều bài gốc không nói: luật "lời ≥ 2× lỗ" KHÔNG áp nguyên cho người BÁN
 * put — với họ, kiểm soát rủi ro là khối lượng vị thế.
 */
export const TA_LESSONS: Lesson[] = [
  {
    id: 'trend',
    section: 'ta',
    title: { vi: 'Xu hướng, đường xu hướng và đổi vai', en: 'Trends, trendlines and role reversal' },
    summary: {
      vi: 'Đỉnh cao dần và đáy cao dần là xu hướng tăng; vùng bị phá thường đổi vai.',
      en: 'Higher highs and higher lows make an uptrend; a broken zone usually changes roles.',
    },
    figures: ['trendline', 'sr-flip'],
    seeIn: { tab: 'analyze', label: { vi: 'Xem SMA20/50/200 và vùng giá của một mã ở tab Analyze', en: 'See a symbol’s SMA20/50/200 and price zones in Analyze' } },
    body: [
      {
        vi: '**Xu hướng tăng** là một chuỗi **đỉnh sau cao hơn đỉnh trước VÀ đáy sau cao hơn đáy trước**. Xu hướng giảm là ngược lại: đỉnh thấp dần, đáy thấp dần. Khi giá không tạo được đỉnh và đáy rõ ràng theo một hướng, thị trường đang **đi ngang** — và phần lớn thời gian thị trường đi ngang.',
        en: 'An **uptrend** is a sequence of **higher highs AND higher lows**. A downtrend is the reverse: lower highs, lower lows. When price makes no clear highs and lows in one direction, the market is **ranging** — and markets range most of the time.',
      },
      {
        vi: '**Đường xu hướng** (trendline): trong xu hướng tăng, nối các đáy lại; trong xu hướng giảm, nối các đỉnh. Hai điểm vẽ được một đường, **điểm chạm thứ ba** mới làm nó đáng tin. Nó đóng vai một hỗ trợ (kháng cự) **động** — dốc theo giá chứ không nằm ngang.',
        en: 'A **trendline**: in an uptrend join the lows; in a downtrend join the highs. Two points draw a line; a **third touch** is what makes it credible. It acts as **dynamic** support (resistance) — sloping with price instead of lying flat.',
      },
      {
        vi: 'Khi giá **đóng cửa hẳn bên dưới** đường xu hướng tăng, xu hướng có dấu hiệu yếu đi — chưa phải đã đảo chiều. Xu hướng tăng chỉ thật sự kết thúc khi cấu trúc gãy: một **đáy thấp hơn** đáy trước. Thủng đường mà đáy vẫn cao dần thường chỉ là xu hướng chậm lại.',
        en: 'A **close clearly below** an uptrend line says the trend is weakening — not yet that it has reversed. An uptrend truly ends when its structure breaks: a **lower low** than the previous one. A broken line with lows still rising is usually just a trend slowing down.',
      },
      {
        vi: '**Đổi vai**: kháng cự bị phá lên thường trở thành **hỗ trợ mới**, và giá hay quay lại **kiểm tra** (retest) vùng đó từ phía trên trước khi đi tiếp. Ngược lại, hỗ trợ bị thủng thường thành kháng cự. Mức giá không biến mất khi bị phá — nó đổi vai. Đó cũng là lý do app coi một cú thủng hỗ trợ là tín hiệu THOÁT, không phải "cơ hội mua rẻ hơn".',
        en: '**Role reversal**: resistance that breaks upward often becomes **new support**, and price frequently comes back to **retest** it from above before moving on. Broken support likewise tends to become resistance. A level does not vanish when it breaks — it changes roles. That is also why the app treats a support break as an EXIT signal, not a "cheaper buy".',
      },
      {
        vi: '"Xu hướng là bạn": giao dịch thuận xu hướng thường dễ hơn bắt đỉnh, bắt đáy. Với người bán put, điều này có nghĩa cụ thể — bán put trên một mã có xu hướng tăng và **SMA200 dốc lên** là để thời gian và xu hướng cùng làm việc cho mình; đó chính là lý do Screener có ô tích "giá trên SMA200" và Long-term đòi độ dốc SMA200 dương.',
        en: '"The trend is your friend": trading with the trend is usually easier than picking tops and bottoms. For a put seller this is concrete — selling puts on a stock in an uptrend with a **rising SMA200** lets time and trend work together; that is why the Screener has an "above SMA200" tickbox and Long-term requires a rising SMA200 slope.',
      },
    ],
    traps: [
      { vi: 'Vẽ lại đường xu hướng mỗi lần giá thủng nó, cho tới khi nó "đúng". Một đường phải sửa liên tục là một đường không giữ được.', en: 'Redrawing the trendline every time price breaks it until it "fits". A line that needs constant redrawing is a line that does not hold.' },
      { vi: 'Coi một lần chạm đường xu hướng trong phiên là thủng. Cũng như mọi mức khác, thứ đáng tính là giá ĐÓNG CỬA.', en: 'Treating an intraday poke through the line as a break. As with every level, the CLOSE is what counts.' },
    ],
    quiz: [
      {
        q: { vi: 'Xu hướng tăng được định nghĩa thế nào?', en: 'How is an uptrend defined?' },
        choices: [
          { vi: 'Đỉnh cao dần và đáy cao dần', en: 'Higher highs and higher lows' },
          { vi: 'Ba nến xanh liên tiếp', en: 'Three green candles in a row' },
          { vi: 'Giá trên 100', en: 'Price above 100' },
        ],
        answer: 0,
        why: { vi: 'Cả đỉnh lẫn đáy phải nâng lên; một bên thôi là chưa đủ.', en: 'Both highs and lows must step up; one side alone is not enough.' },
      },
      {
        q: { vi: 'Kháng cự vừa bị phá lên thường trở thành gì?', en: 'What does freshly broken resistance usually become?' },
        choices: [
          { vi: 'Hỗ trợ mới — giá hay quay lại kiểm tra nó', en: 'New support — price often comes back to retest it' },
          { vi: 'Không còn ý nghĩa gì', en: 'Meaningless' },
          { vi: 'Kháng cự mạnh hơn', en: 'Stronger resistance' },
        ],
        answer: 0,
        why: { vi: 'Mức giá không mất đi khi bị phá; nó đổi vai.', en: 'A level does not disappear when broken; it changes roles.' },
      },
      {
        q: { vi: 'Giá đóng cửa dưới đường xu hướng tăng nghĩa là gì?', en: 'What does a close below an uptrend line mean?' },
        choices: [
          { vi: 'Xu hướng đang yếu đi; kết thúc thật khi có đáy thấp hơn', en: 'The trend is weakening; it truly ends on a lower low' },
          { vi: 'Chắc chắn đảo chiều giảm', en: 'A certain bearish reversal' },
          { vi: 'Không có ý nghĩa gì', en: 'Nothing at all' },
        ],
        answer: 0,
        why: { vi: 'Đường xu hướng là một cảnh báo sớm; cấu trúc đỉnh-đáy mới là định nghĩa.', en: 'The trendline is an early warning; the high-low structure is the definition.' },
      },
    ],
  },

  {
    id: 'indicators',
    section: 'ta',
    title: { vi: 'Chỉ báo: MA, khối lượng, RSI, MACD, Bollinger', en: 'Indicators: moving averages, volume, RSI, MACD, Bollinger' },
    summary: {
      vi: 'Chỉ báo tính từ giá nên luôn đi sau giá — dùng để xác nhận, không để đoán trước.',
      en: 'Indicators are computed from price, so they lag it — use them to confirm, not to predict.',
    },
    figures: ['ma-cross', 'volume-confirm', 'rsi', 'macd', 'bollinger'],
    seeIn: { tab: 'analyze', label: { vi: 'Xem các chỉ báo này của một mã thật ở tab Analyze', en: 'See these indicators for a real symbol in Analyze' } },
    body: [
      {
        vi: 'Chỉ báo là công thức tính từ giá và khối lượng, giúp thấy rõ thứ mắt thường khó thấy. Vì tính từ giá đã xảy ra, **chúng luôn đi sau giá**. Bài này dùng đúng bộ thông số tab Analyze đang in, và Claude ở tab đó đọc chính những con số này.',
        en: 'An indicator is a formula over price and volume that makes visible what the eye misses. Because it is computed from prices that already happened, **it always lags price**. This lesson uses exactly the settings the Analyze tab prints, and Claude in that tab reads these same numbers.',
      },
      {
        vi: '**Đường trung bình (MA / SMA)**: giá đóng cửa trung bình của N phiên gần nhất, làm mượt nhiễu. Analyze in SMA20, SMA50, SMA200. Giá nằm trên MA là thiên về tăng. MA ngắn cắt lên MA dài là **giao cắt vàng** (golden cross), cắt xuống là **giao cắt tử thần** (death cross); cặp hay dùng nhất là 50 và 200. Hình minh hoạ dùng 9 và 21 chỉ để thấy được hai lần cắt trong một khung nhỏ.',
        en: '**Moving average (MA / SMA)**: the average close of the last N sessions, smoothing out noise. Analyze prints SMA20, SMA50 and SMA200. Price above its MA leans bullish. A short MA crossing above a long one is a **golden cross**; crossing below is a **death cross**; the classic pair is 50 and 200. The figure uses 9 and 21 only so both crosses fit in a small frame.',
      },
      {
        vi: '**Khối lượng**: số cổ phiếu giao dịch trong phiên — bằng chứng đứng sau một cú chạy. Phá vỡ kèm khối lượng lớn (app so với **trung bình 20 phiên**) đáng tin hơn hẳn. Giá tăng mà khối lượng cạn dần là đà tăng đang mệt.',
        en: '**Volume**: shares traded in the session — the evidence behind a move. A breakout on heavy volume (the app compares to the **20-session average**) is far more credible. Price rising on shrinking volume is a rally running out of breath.',
      },
      {
        vi: '**RSI (14)**: so sức của các phiên tăng với các phiên giảm trong 14 phiên, thang 0–100. Trên 70 là **quá mua**, dưới 30 là **quá bán** — nghĩa là giá đã chạy xa và nhanh, KHÔNG phải lệnh bán hay mua. Trong xu hướng mạnh RSI có thể nằm trên 70 hàng tuần. Tín hiệu đáng giá hơn là **phân kỳ**: giá tạo đỉnh mới mà RSI không theo.',
        en: '**RSI (14)**: compares the strength of up sessions against down sessions over 14 sessions, on a 0–100 scale. Above 70 is **overbought**, below 30 **oversold** — meaning price has moved far and fast, NOT an order to sell or buy. In a strong trend RSI can sit above 70 for weeks. The more valuable signal is **divergence**: price makes a new high and RSI does not.',
      },
      {
        vi: '**MACD (12, 26, 9)**: khoảng cách giữa hai đường trung bình luỹ thừa 12 và 26 phiên, so với đường tín hiệu là trung bình 9 phiên của chính nó. MACD cắt lên đường tín hiệu là động lượng tăng, cắt xuống là động lượng giảm; cột histogram là hiệu của hai đường, đổi dấu đúng lúc chúng cắt nhau.',
        en: '**MACD (12, 26, 9)**: the gap between the 12- and 26-session exponential averages, compared with a signal line that is its own 9-session average. MACD crossing above the signal is rising momentum, crossing below is falling momentum; the histogram is the difference between the two and flips sign exactly when they cross.',
      },
      {
        vi: '**Dải Bollinger (20, 2)**: SMA20 cộng trừ 2 độ lệch chuẩn — một thước đo biến động. Dải **bó hẹp** (squeeze) thường báo trước một đợt chạy mạnh, nhưng không nói hướng. Giá chạm dải ngoài **tự nó không phải tín hiệu mua hay bán** — trong xu hướng mạnh giá có thể bám dải trên rất lâu. Analyze in %B: vị trí của giá trong dải (0 = dải dưới, 1 = dải trên).',
        en: '**Bollinger Bands (20, 2)**: SMA20 plus and minus 2 standard deviations — a volatility gauge. A **squeeze** often precedes a big move, but does not say which way. Touching an outer band is **not a buy or sell signal by itself** — in a strong trend price can ride the upper band for a long time. Analyze prints %B: where price sits in the bands (0 = lower band, 1 = upper).',
      },
    ],
    traps: [
      { vi: 'Bán chỉ vì RSI trên 70. Quá mua là một mô tả, không phải dự báo.', en: 'Selling just because RSI is above 70. Overbought is a description, not a forecast.' },
      { vi: 'Chồng năm chỉ báo cùng tính từ giá rồi coi đó là năm bằng chứng độc lập. Chúng đều nhìn cùng một chuỗi giá.', en: 'Stacking five price-derived indicators and counting them as five independent confirmations. They all look at the same price series.' },
      { vi: 'Coi giao cắt MA là tín hiệu sớm: nó đến SAU khi phần lớn cú chạy đã xảy ra, và trong thị trường đi ngang nó cắt qua cắt lại liên tục.', en: 'Treating an MA cross as an early signal: it arrives AFTER most of the move, and in a ranging market it whipsaws back and forth.' },
    ],
    quiz: [
      {
        q: { vi: 'RSI 78 nghĩa là gì?', en: 'What does an RSI of 78 mean?' },
        choices: [
          { vi: 'Giá đã tăng xa và nhanh — chưa phải lệnh bán', en: 'Price has risen far and fast — not yet a sell order' },
          { vi: 'Phải bán ngay', en: 'Sell immediately' },
          { vi: 'Cổ phiếu rẻ', en: 'The stock is cheap' },
        ],
        answer: 0,
        why: { vi: 'Trong xu hướng mạnh RSI có thể ở trên 70 rất lâu.', en: 'In a strong trend RSI can stay above 70 for a long time.' },
      },
      {
        q: { vi: 'Giao cắt vàng là gì?', en: 'What is a golden cross?' },
        choices: [
          { vi: 'MA ngắn cắt LÊN MA dài', en: 'The short MA crossing ABOVE the long MA' },
          { vi: 'Giá vàng tăng', en: 'Gold prices rising' },
          { vi: 'RSI vượt 50', en: 'RSI crossing 50' },
        ],
        answer: 0,
        why: { vi: 'Ngược lại, MA ngắn cắt xuống là giao cắt tử thần.', en: 'The reverse, a short MA crossing below, is a death cross.' },
      },
      {
        q: { vi: 'Dải Bollinger bó hẹp báo điều gì?', en: 'What does a Bollinger squeeze signal?' },
        choices: [
          { vi: 'Thường sắp có một đợt chạy mạnh, chưa rõ hướng', en: 'A big move often follows, direction unknown' },
          { vi: 'Chắc chắn tăng', en: 'A certain rise' },
          { vi: 'Thị trường sắp đóng cửa', en: 'The market is about to close' },
        ],
        answer: 0,
        why: { vi: 'Biến động thấp hiếm khi kéo dài mãi; dải chỉ nói biên độ, không nói hướng.', en: 'Low volatility rarely lasts; the bands measure range, not direction.' },
      },
    ],
  },

  {
    id: 'risk',
    section: 'ta',
    title: { vi: 'Ghép tín hiệu và quản lý rủi ro', en: 'Putting it together, and managing risk' },
    summary: {
      vi: 'Không tín hiệu nào đúng mọi lúc. Thứ sống sót lâu là cách cắt lỗ và cỡ lệnh.',
      en: 'No signal is always right. What survives is how you size and where you cut.',
    },
    figures: ['risk-reward'],
    seeIn: { tab: 'screener', label: { vi: 'Xem các gate và điểm số ở Sell Put Screener', en: 'See the gates and scores in the Sell Put Screener' } },
    body: [
      {
        vi: 'Người giao dịch lâu năm tìm sự **hội tụ**: nhiều yếu tố độc lập cùng chỉ về một hướng. Một danh sách kiểm sáu bước:\n- **Xu hướng lớn** đang là gì? Ưu tiên thuận chiều.\n- Giá đang ở gần **vùng hỗ trợ hay kháng cự** nào?\n- Có **mẫu nến xác nhận** ngay tại vùng đó không (búa, nhấn chìm tăng ở hỗ trợ)?\n- **Khối lượng và chỉ báo** có ủng hộ không?\n- Đặt **điểm cắt lỗ TRƯỚC khi vào lệnh**, thường ngay dưới vùng hỗ trợ.\n- Giới hạn rủi ro mỗi lệnh ở mức nhỏ so với tài khoản — nhiều người dùng **1–2%**.',
        en: 'Experienced traders look for **confluence**: several independent factors pointing the same way. A six-step checklist:\n- What is the **bigger trend**? Prefer trading with it.\n- Which **support or resistance zone** is price near?\n- Is there a **confirming candle** right at that zone (a hammer, a bullish engulfing at support)?\n- Do **volume and indicators** agree?\n- Set the **stop BEFORE entering**, usually just below the support zone.\n- Keep each trade\'s risk small against the account — many use **1–2%**.',
      },
      {
        vi: '**Rủi ro : lợi nhuận**. Gọi khoảng từ giá vào tới điểm cắt lỗ là **1R**. Chỉ vào lệnh khi mục tiêu hợp lý xa ít nhất **2R** — khi đó dù chỉ đúng 4 lần trong 10, tổng vẫn dương (4 × 2R − 6 × 1R = +2R).',
        en: '**Risk : reward**. Call the distance from entry to stop **1R**. Take a trade only when a reasonable target is at least **2R** away — then even being right 4 times in 10 still nets positive (4 × 2R − 6 × 1R = +2R).',
      },
      {
        vi: '**Cỡ lệnh** suy ra từ điểm cắt lỗ, không phải từ cảm giác: số cổ phiếu = (tài khoản × % rủi ro) ÷ (giá vào − giá cắt lỗ). Ví dụ tài khoản $50.000, rủi ro 1% = $500, vào ở $100, cắt lỗ ở $96 → $500 ÷ $4 = **125 cổ phiếu**. Cắt lỗ xa hơn thì mua ít hơn — rủi ro tính bằng tiền giữ nguyên.',
        en: '**Position size** comes from the stop, not from a feeling: shares = (account × risk %) ÷ (entry − stop). Example: a $50,000 account at 1% risk = $500; entry $100, stop $96 → $500 ÷ $4 = **125 shares**. A wider stop means fewer shares — the dollar risk stays the same.',
      },
      {
        vi: '**Với người BÁN put, luật 2R không áp nguyên.** Bán put là lời tối đa bằng premium nhận được, còn lỗ tối đa là strike trừ premium — tỉ lệ ngược hẳn, đổi lại xác suất thắng cao. Nên với vị thế này, kiểm soát rủi ro nằm ở **khối lượng** và **chỗ đặt strike**, không ở một mục tiêu 2R: strike dưới vùng hỗ trợ hai lần chạm, không earnings trong kỳ, và bốn giới hạn app kiểm trên tài khoản thật — **5% mỗi mã, 20% mỗi ngành, 50% tổng tiền bảo đảm, 30% cụm tương quan** (bài Quản lý vị thế).',
        en: '**For a put SELLER, the 2R rule does not apply as is.** A short put earns at most the premium and can lose up to strike minus premium — the ratio is inverted, in exchange for a high win rate. So for this position risk control lives in **size** and **strike placement**, not in a 2R target: a strike below a two-touch support zone, no earnings in the window, and the four limits the app checks on the real account — **5% per symbol, 20% per sector, 50% total cash-secured, 30% correlated cluster** (the Managing the position lesson).',
      },
      {
        vi: 'Phân tích kỹ thuật nói về **xác suất**, không có gì chắc chắn. Bài này chỉ nhằm mục đích giáo dục, không phải lời khuyên đầu tư; mọi biểu đồ trong mục này là dữ liệu minh hoạ, không phải cổ phiếu thật.',
        en: 'Technical analysis deals in **probabilities**; nothing is certain. This lesson is educational, not investment advice; every chart in this section is illustrative data, not a real stock.',
      },
    ],
    traps: [
      { vi: 'Dời điểm cắt lỗ xa thêm khi giá chạm tới nó. Đó là biến một khoản lỗ nhỏ đã tính trước thành một khoản lỗ không giới hạn.', en: 'Moving the stop further away when price reaches it. That turns a small, planned loss into an unbounded one.' },
      { vi: 'Bán put "vì xác suất thắng 85%" mà không giới hạn khối lượng: một lần thua có thể xoá mười lần thắng.', en: 'Selling puts "because the win rate is 85%" with no size limit: one loss can erase ten wins.' },
    ],
    quiz: [
      {
        q: { vi: 'Tài khoản $20.000, rủi ro 1%, vào ở $50, cắt lỗ ở $48. Mua bao nhiêu cổ phiếu?', en: 'A $20,000 account, 1% risk, entry $50, stop $48. How many shares?' },
        choices: [
          { vi: '100', en: '100' },
          { vi: '400', en: '400' },
          { vi: '10', en: '10' },
        ],
        answer: 0,
        why: { vi: '1% của $20.000 = $200; $200 ÷ ($50 − $48) = 100 cổ phiếu.', en: '1% of $20,000 = $200; $200 ÷ ($50 − $48) = 100 shares.' },
      },
      {
        q: { vi: 'Khi nào đặt điểm cắt lỗ?', en: 'When do you set the stop?' },
        choices: [
          { vi: 'Trước khi vào lệnh', en: 'Before entering' },
          { vi: 'Khi đã lỗ 10%', en: 'Once down 10%' },
          { vi: 'Không cần', en: 'Never' },
        ],
        answer: 0,
        why: { vi: 'Cỡ lệnh tính từ điểm cắt lỗ — không có nó thì không biết mình đang rủi ro bao nhiêu.', en: 'Size is computed from the stop — without it you do not know what you are risking.' },
      },
      {
        q: { vi: 'Với người bán put, rủi ro được kiểm soát chủ yếu bằng gì?', en: 'For a put seller, what mainly controls risk?' },
        choices: [
          { vi: 'Khối lượng vị thế và chỗ đặt strike', en: 'Position size and strike placement' },
          { vi: 'Mục tiêu lời gấp đôi lỗ', en: 'A reward twice the risk' },
          { vi: 'Bán càng nhiều hợp đồng càng an toàn', en: 'More contracts is safer' },
        ],
        answer: 0,
        why: { vi: 'Lời tối đa là premium, lỗ tối đa lớn hơn nhiều; nên khối lượng mới là thứ giới hạn thiệt hại.', en: 'The maximum gain is the premium and the maximum loss far larger; size is what caps the damage.' },
      },
    ],
  },
];
