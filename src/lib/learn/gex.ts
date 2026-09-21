import type { Lesson } from './types';

/**
 * Phần 2 — GEX và bề rộng thị trường.
 *
 * Mọi định nghĩa ở đây là ĐỊNH NGHĨA APP ĐANG DÙNG (`lib/gex.ts`,
 * `lib/internals.ts`, README): tường tính trên gamma RÒNG từng strike (#94),
 * không có strike ròng dương thì KHÔNG có call wall, zero gamma là chỗ tổng
 * chạy cắt từ âm sang dương và có thể không tồn tại (#143), TICK ±600.
 * Đổi định nghĩa trong code thì đổi ở đây.
 */
export const GEX_LESSONS: Lesson[] = [
  {
    id: 'gex-what',
    section: 'gex',
    title: { vi: 'GEX là gì và vì sao dealer phải mua/bán theo nó', en: 'What GEX is, and why dealers must trade against it' },
    summary: {
      vi: 'Gamma × open interest: bản đồ những mức giá mà nhà tạo lập thị trường bị buộc phải hành động.',
      en: 'Gamma × open interest: a map of the prices where market makers are forced to act.',
    },
    figures: ['gex-profile'],
    body: [
      {
        vi: 'Khi anh mua một quyền chọn, bên kia thường là **dealer** (nhà tạo lập thị trường). Dealer không cá cược hướng; họ **phòng hộ** bằng cách mua/bán cổ phiếu để trung hoà delta. **Gamma** là tốc độ delta đổi theo giá — tức tốc độ dealer phải mua thêm hay bán bớt khi giá nhích.',
        en: 'When you buy an option, the other side is usually a **dealer** (market maker). Dealers do not bet on direction; they **hedge** by buying or selling shares to neutralise delta. **Gamma** is how fast delta changes with price — i.e. how fast the dealer must buy more or sell more as price moves.',
      },
      {
        vi: '**GEX** (gamma exposure) của một strike = gamma × open interest × 100 × giá, quy về "dealer phải mua/bán bao nhiêu đô khi giá đi 1%". App **tự tính** từ chuỗi quyền chọn Schwab (hoặc CBOE với SPX), không mua feed — đơn vị "mỗi 1% dịch chuyển" trùng với Unusual Whales nên hai bên so được với nhau.',
        en: 'A strike\'s **GEX** (gamma exposure) = gamma × open interest × 100 × price, expressed as "how many dollars dealers must buy or sell when price moves 1%". The app **computes it itself** from the Schwab option chain (or CBOE for SPX), no paid feed — the "per 1% move" unit matches Unusual Whales, so the two can be compared.',
      },
      {
        vi: 'Quy ước dấu: dealer thường **long gamma ở call** (họ đã bán call) và **short gamma ở put** (họ đã bán put). Long gamma: giá lên thì họ bán, giá xuống thì họ mua — **dập** dao động. Short gamma: giá lên họ phải mua thêm, giá xuống phải bán thêm — **khuếch đại** dao động.',
        en: 'Sign convention: dealers are typically **long gamma on calls** (they sold the calls) and **short gamma on puts** (they sold the puts). Long gamma: they sell as price rises and buy as it falls — **damping** moves. Short gamma: they must buy as price rises and sell as it falls — **amplifying** moves.',
      },
      {
        vi: 'Vì thế GEX không dự đoán hướng. Nó dự đoán **kiểu chuyển động**: ở đâu giá dễ bị hút và ghìm, ở đâu giá dễ trượt nhanh. Với người bán put, đó là câu hỏi đúng: "nếu tôi sai, tôi sai chậm hay sai nhanh?"',
        en: 'So GEX does not predict direction. It predicts the **kind of movement**: where price tends to get pulled in and pinned, where it tends to slide fast. For a put seller that is the right question: "if I am wrong, am I wrong slowly or fast?"',
      },
    ],
    traps: [
      {
        vi: 'Đọc GEX như một tín hiệu mua/bán. Nó là bản đồ địa hình, không phải la bàn.',
        en: 'Reading GEX as a buy/sell signal. It is a terrain map, not a compass.',
      },
      {
        vi: 'So sánh con số GEX giữa hai nguồn khác đơn vị. App và UW cùng đơn vị "mỗi 1%"; một số trang khác dùng quy ước khác nên số to gấp vài lần.',
        en: 'Comparing GEX numbers across sources with different units. The app and UW share the "per 1%" unit; some sites use another convention and print numbers several times larger.',
      },
    ],
    seeIn: { tab: 'heatmap', sub: 'gex', label: { vi: 'Mở biểu đồ GEX đang chạy (Heatmap → GEX)', en: 'Open the live GEX chart (Heatmap → GEX)' } },
    quiz: [
      {
        q: { vi: 'Dealer long gamma làm gì khi giá tăng?', en: 'What does a long-gamma dealer do as price rises?' },
        choices: [
          { vi: 'Mua thêm', en: 'Buys more' },
          { vi: 'Bán ra', en: 'Sells' },
          { vi: 'Không làm gì', en: 'Nothing' },
        ],
        answer: 1,
        why: { vi: 'Long gamma là bán khi lên, mua khi xuống — dập dao động.', en: 'Long gamma means selling into strength and buying weakness — damping moves.' },
      },
      {
        q: { vi: 'GEX dự đoán gì?', en: 'What does GEX predict?' },
        choices: [
          { vi: 'Hướng đi của giá', en: 'Price direction' },
          { vi: 'Kiểu chuyển động: bị ghìm hay trượt nhanh', en: 'The kind of movement: pinned or fast-sliding' },
          { vi: 'Lợi nhuận quý sau', en: 'Next quarter\'s profit' },
        ],
        answer: 1,
        why: { vi: 'GEX là bản đồ nơi dealer buộc phải hành động, không phải la bàn.', en: 'GEX maps where dealers are forced to act; it is not a compass.' },
      },
      {
        q: { vi: 'App lấy GEX từ đâu?', en: 'Where does the app get GEX?' },
        choices: [
          { vi: 'Mua từ một dịch vụ', en: 'Buys it from a service' },
          { vi: 'Tự tính từ chuỗi quyền chọn Schwab / CBOE', en: 'Computes it from the Schwab / CBOE option chain' },
          { vi: 'Đoán', en: 'Guesses' },
        ],
        answer: 1,
        why: { vi: 'Gamma × OI từ chính chuỗi quyền chọn — đó là nghĩa của "không cần membership".', en: 'Gamma × OI from the option chain itself — that is what "no membership needed" means.' },
      },
    ],
  },

  {
    id: 'gex-chart',
    section: 'gex',
    title: { vi: 'Đọc biểu đồ GEX: put wall, call wall, abs gamma, zero gamma', en: 'Reading the GEX chart: put wall, call wall, abs gamma, zero gamma' },
    summary: {
      vi: 'Bốn con số app in cạnh biểu đồ — định nghĩa chính xác, và trường hợp nào một con số KHÔNG tồn tại.',
      en: 'The four numbers printed beside the chart — their exact definitions, and when one of them does NOT exist.',
    },
    figures: ['gex-profile'],
    body: [
      {
        vi: 'Biểu đồ: mỗi strike một cột. **Đỏ hướng lên** là gamma call, **xanh dương hướng xuống** là gamma put — đây là **phân loại** (call/put), không phải luật xanh-lá/đỏ theo dấu tiền ở chỗ khác trong app. Cả hai vẽ trên **một thang chung**: chia đôi chiều cao là phóng to lặng lẽ bên nhỏ hơn.',
        en: 'The chart: one bar per strike. **Red upward** is call gamma, **blue downward** is put gamma — this is **classification** (call/put), not the green/red money-sign rule used elsewhere in the app. Both sides share **one scale**: splitting the height would silently magnify the smaller side.',
      },
      {
        vi: 'Bốn mức, tính trên **gamma RÒNG** từng strike (call cộng put):\n- **Put wall**: strike có gamma ròng **âm nhất**. Dưới nó dealer short gamma nặng — thủng thì trượt nhanh. Đọc là hỗ trợ "mềm".\n- **Call wall**: strike có gamma ròng **dương nhất**. Trên nó dealer bán vào khi giá lên — kháng cự "mềm".\n- **Abs gamma**: strike ôm nhiều gamma nhất **tính cả hai dấu** — nam châm hút giá về gần đáo hạn.\n- **Zero gamma** (gamma flip): mức giá mà **tổng chạy** gamma ròng cắt từ âm sang dương. Dưới nó thị trường "khuếch đại", trên nó "dập".',
        en: 'Four levels, computed on **NET gamma** per strike (call plus put):\n- **Put wall**: the strike with the **most negative** net gamma. Below it dealers are heavily short gamma — a break slides fast. Read as "soft" support.\n- **Call wall**: the strike with the **most positive** net gamma. Above it dealers sell into strength — "soft" resistance.\n- **Abs gamma**: the strike holding the most gamma **counting both signs** — a magnet near expiry.\n- **Zero gamma** (gamma flip): the price where the **running total** of net gamma crosses from negative to positive. Below it the market "amplifies", above it "damps".',
      },
      {
        vi: 'Vì sao **ròng** chứ không "cột cao nhất mỗi bên": strike ngay tại giá thường là cột cao nhất ở CẢ HAI bên, nên cách cũ cho put wall, call wall và abs gamma trùng nhau tại một chỗ — ba đường vẽ chồng lên nhau, không gọi tên được hỗ trợ dưới hay kháng cự trên. Một strike chỉ ròng dương HOẶC ròng âm, nên ròng luôn tách được hai bên.',
        en: 'Why **net** rather than "tallest bar per side": the at-the-money strike is usually the tallest on BOTH sides, so the old rule put the put wall, call wall and abs gamma on one strike — three lines drawn on top of each other, naming neither support below nor resistance above. A strike can only be net positive OR net negative, so net always separates the two.',
      },
      {
        vi: 'Hai trường hợp một con số **không tồn tại**, và app in `—` thay vì bịa:\n- Không strike nào ròng dương → **không có call wall**. Chọn strike "ít âm nhất" là vẽ một kháng cự không có thật.\n- Tổng chạy không bao giờ cắt 0 → **zero gamma = null**. SPX đã đo được như vậy: âm ở cả 498 strike — dealer short gamma toàn dải — dù vẫn có call wall ở 7800 vì từng strike có thể ròng dương trong khi tổng vẫn âm.',
        en: 'Two cases where a number **does not exist**, and the app prints `—` rather than inventing one:\n- No strike is net positive → **no call wall**. Picking the "least negative" strike would draw a resistance that is not there.\n- The running total never crosses zero → **zero gamma = null**. SPX has measured exactly this: negative at all 498 strikes — dealers short gamma across the range — while still having a call wall at 7800, because a single strike can be net positive while the total stays negative.',
      },
      {
        vi: 'Trục strike là **danh mục**, không phải thang giá tuyến tính: strike thưa dần khi xa giá, nên cột đặt cách đều và mọi mức giá (spot, tường, strike của anh) được nội suy giữa hai strike kề. Một mức nằm ngoài cửa sổ zoom thì **không vẽ** — một đường ghim vào mép trông y hệt một mức thật.',
        en: 'The strike axis is **categorical**, not a linear price scale: strikes thin out away from spot, so bars sit at even slots and any price (spot, a wall, your strike) is interpolated between neighbours. A level outside the zoom window is **not drawn** — a line pinned to the edge looks exactly like a real level.',
      },
    ],
    traps: [
      {
        vi: 'Coi put wall là hỗ trợ cứng. Nó là nơi dealer *bắt đầu* short gamma nặng — thủng nó là giá đi NHANH hơn, không phải bật lên.',
        en: 'Treating the put wall as hard support. It is where dealers *start* being heavily short gamma — breaking it means price moves FASTER, not that it bounces.',
      },
      {
        vi: 'Đọc bảng so sánh App vs UW như "cái nào đúng". Hai bên khác cơ sở (OI vs khối lượng) — lệch là bình thường, lệch LỚN mới đáng hỏi.',
        en: 'Reading the App-vs-UW comparison as "which one is right". They use different bases (OI vs volume) — a gap is normal; a LARGE gap is the thing to question.',
      },
    ],
    seeIn: { tab: 'heatmap', sub: 'gex', label: { vi: 'Đối chiếu bốn mức trên biểu đồ thật', en: 'Check the four levels on the live chart' } },
    quiz: [
      {
        q: { vi: 'Call wall được định nghĩa là gì trong app?', en: 'How does the app define the call wall?' },
        choices: [
          { vi: 'Cột đỏ cao nhất', en: 'The tallest red bar' },
          { vi: 'Strike có gamma ròng dương nhất', en: 'The strike with the most positive net gamma' },
          { vi: 'Strike gần giá nhất', en: 'The strike nearest spot' },
        ],
        answer: 1,
        why: { vi: 'Ròng chứ không một bên, nếu không ba mức trùng lên nhau tại strike gần giá.', en: 'Net, not one-sided, otherwise all three levels collapse onto the at-the-money strike.' },
      },
      {
        q: { vi: 'Khi không strike nào ròng dương, app in gì ở call wall?', en: 'When no strike is net positive, what does the app print for the call wall?' },
        choices: [
          { vi: 'Strike ít âm nhất', en: 'The least negative strike' },
          { vi: '—  (không có)', en: '— (none)' },
          { vi: 'Giá hiện tại', en: 'The current price' },
        ],
        answer: 1,
        why: { vi: 'Một kháng cự vẽ từ số âm là một kháng cự không có thật.', en: 'A resistance drawn from a negative number is a resistance that does not exist.' },
      },
      {
        q: { vi: 'Zero gamma là gì?', en: 'What is zero gamma?' },
        choices: [
          { vi: 'Strike có gamma bằng 0', en: 'The strike whose gamma is 0' },
          { vi: 'Mức giá mà tổng chạy gamma ròng cắt từ âm sang dương', en: 'The price where the running total of net gamma crosses from negative to positive' },
          { vi: 'Giá đóng cửa hôm qua', en: 'Yesterday\'s close' },
        ],
        answer: 1,
        why: { vi: 'Nó là một điểm cắt, không phải một strike — và có thể không tồn tại (SPX).', en: 'It is a crossing, not a strike — and it may not exist (SPX).' },
      },
    ],
  },

  {
    id: 'gamma-regime',
    section: 'gex',
    title: { vi: 'Gamma dương và gamma âm: hai chế độ của thị trường', en: 'Positive and negative gamma: two market regimes' },
    summary: {
      vi: 'Trên zero gamma giá bị ghìm; dưới nó giá bị đẩy. Cùng một tin xấu cho hai kết quả khác nhau.',
      en: 'Above zero gamma price gets pinned; below it, pushed. The same bad news gives two different outcomes.',
    },
    figures: ['gamma-regime'],
    body: [
      {
        vi: '**Chế độ gamma dương** (giá trên zero gamma): dealer long gamma ròng. Giá lên họ bán, giá xuống họ mua. Kết quả: dao động **nhỏ**, giá **bị hút** về các strike ôm nhiều gamma, tin xấu bị hấp thụ. Đây là môi trường dễ chịu để bán put: thời gian trôi và giá đứng yên.',
        en: '**Positive gamma regime** (price above zero gamma): dealers net long gamma. They sell rallies and buy dips. Result: **small** swings, price **pulled** toward gamma-heavy strikes, bad news absorbed. This is the comfortable environment for put selling: time passes and price stays put.',
      },
      {
        vi: '**Chế độ gamma âm** (giá dưới zero gamma): dealer short gamma ròng. Giá xuống họ phải bán thêm, giá lên họ phải mua thêm — họ **đuổi theo** giá. Kết quả: dao động **lớn**, cả hai chiều; một cú rớt 1% dễ thành 3%. Đây là lúc VIX thường nhảy.',
        en: '**Negative gamma regime** (price below zero gamma): dealers net short gamma. As price falls they must sell more; as it rises they must buy more — they **chase** price. Result: **large** swings both ways; a 1% drop turns into 3% easily. This is when VIX tends to jump.',
      },
      {
        vi: 'Với người bán put, câu hỏi thực dụng: strike của tôi nằm ở chế độ nào? Strike **trên** zero gamma và trên put wall: nếu sai, tôi sai **chậm**, có thời gian roll. Strike **dưới** put wall: nếu sai, tôi sai **nhanh**, và premium cao hơn không bù được điều đó.',
        en: 'For a put seller the practical question: which regime is my strike in? A strike **above** zero gamma and above the put wall: if wrong, I am wrong **slowly**, with time to roll. A strike **below** the put wall: if wrong, I am wrong **fast**, and the extra premium does not pay for that.',
      },
      {
        vi: 'Hai lưu ý đo được: gamma tập trung ở các kỳ đáo hạn gần, nên với SPX app chỉ đọc 12 kỳ gần nhất và **nói ra** điều đó trên màn hình (tường tính trên 12 kỳ không được trông như tường cả chuỗi). Và với SPX, zero gamma **có thể không tồn tại** — dealer âm gamma toàn dải — khi đó cả dải là chế độ âm, không phải "app thiếu số".',
        en: 'Two measured caveats: gamma concentrates in the near expirations, so for SPX the app reads the nearest 12 and **says so** on screen (a wall over 12 expirations must not look like a wall over the whole chain). And for SPX, zero gamma **may not exist** — dealers negative across the range — in which case the whole range is the negative regime, not "a missing number".',
      },
    ],
    traps: [
      {
        vi: 'Bán put "vì premium cao" ngay khi giá vừa rơi xuống dưới zero gamma: premium cao chính vì dao động sắp lớn.',
        en: 'Selling a put "because premium is rich" right as price drops below zero gamma: premium is rich precisely because swings are about to be large.',
      },
    ],
    seeIn: { tab: 'analyze', label: { vi: 'Xem strike của anh so với zero gamma ở tab Analyze', en: 'See your strike against zero gamma in Analyze' } },
    quiz: [
      {
        q: { vi: 'Ở chế độ gamma âm, khi giá rớt dealer làm gì?', en: 'In a negative-gamma regime, what do dealers do as price falls?' },
        choices: [
          { vi: 'Mua vào, dập cú rớt', en: 'Buy, damping the drop' },
          { vi: 'Bán thêm, khuếch đại cú rớt', en: 'Sell more, amplifying the drop' },
          { vi: 'Đứng ngoài', en: 'Stand aside' },
        ],
        answer: 1,
        why: { vi: 'Short gamma là đuổi theo giá — đó là cơ chế làm cú rớt 1% thành 3%.', en: 'Short gamma means chasing price — the mechanism that turns 1% into 3%.' },
      },
      {
        q: { vi: 'Chế độ nào dễ chịu hơn cho người bán put?', en: 'Which regime is more comfortable for a put seller?' },
        choices: [
          { vi: 'Gamma dương — giá bị ghìm, thời gian trôi', en: 'Positive gamma — price pinned, time passes' },
          { vi: 'Gamma âm — premium cao', en: 'Negative gamma — rich premium' },
        ],
        answer: 0,
        why: { vi: 'Premium cao ở chế độ âm là giá của dao động sắp tới, không phải quà.', en: 'The rich premium in the negative regime is the price of the coming swings, not a gift.' },
      },
    ],
  },

  {
    id: 'internals',
    section: 'gex',
    title: { vi: 'Bề rộng thị trường: TICK, ADD, VOLD, put/call', en: 'Market internals: TICK, ADD, VOLD, put/call' },
    summary: {
      vi: 'Chỉ số có thể tăng nhờ năm mã; bề rộng cho biết cả sàn có đi cùng không.',
      en: 'An index can rise on five names; breadth tells you whether the whole exchange came along.',
    },
    figures: ['tick'],
    body: [
      {
        vi: '**TICK** (NYSE): số mã vừa khớp ở giá **lên** trừ số mã khớp ở giá **xuống**, ngay lúc này. Dao động quanh 0. **Trên +600** là cả sàn cùng mua — dễ quá mua ngắn hạn; **dưới −600** là cả sàn cùng bán — dễ quá bán. App vẽ hai đường ±600 và tô vùng vượt ngưỡng vì đúng lý do đó. NASDAQ có **TICKQ** với ngưỡng ±300.',
        en: '**TICK** (NYSE): the number of stocks whose last trade was an **uptick** minus those on a **downtick**, right now. Oscillates around 0. **Above +600** the whole exchange is buying — short-term overbought; **below −600** everyone is selling — oversold. The app draws the ±600 lines and shades the excursions for exactly that reason. NASDAQ has **TICKQ** with ±300.',
      },
      {
        vi: '**ADD** (advance-decline): số mã tăng trừ số mã giảm trong ngày. **VOLD** (UVOL − DVOL): khối lượng ở mã tăng trừ khối lượng ở mã giảm. App in tỉ lệ kiểu **"−2.94:1"** = phe bán gấp 2,94 lần phe mua. Chỉ số xanh mà ADD âm nghĩa là vài mã lớn kéo — nền tảng yếu.',
        en: '**ADD** (advance-decline): stocks up minus stocks down on the day. **VOLD** (UVOL − DVOL): volume in advancing names minus volume in declining names. The app prints a ratio like **"−2.94:1"** = sellers 2.94× buyers. A green index with a negative ADD means a few large names are carrying it — weak foundations.',
      },
      {
        vi: '**Put/call ratio**: khối lượng put chia khối lượng call. Cao (>1) là nhiều phòng hộ/sợ hãi — thường gần đáy ngắn hạn; thấp (<0,7) là tự mãn. Đây là chỉ báo **ngược chiều**, và chỉ có nghĩa ở cực trị.',
        en: '**Put/call ratio**: put volume over call volume. High (>1) means heavy hedging/fear — often near a short-term low; low (<0.7) means complacency. It is a **contrarian** indicator, and only meaningful at extremes.',
      },
      {
        vi: 'Ô **VIX** trong lưới là thẻ của app đọc từ Schwab, không phải widget TradingView — vì widget nhúng chỉ vẽ được CFD của một sàn môi giới (định giá theo hợp đồng tương lai VIX, cao hơn chỉ số tiền mặt ~3 điểm khi contango). Cùng chữ "VIX", hai công cụ khác nhau; app cố ý không đặt CFD cạnh chỉ số thật với cùng nhãn.',
        en: 'The **VIX** tile in the grid is the app\'s own card read from Schwab, not a TradingView widget — the embeddable widget can only draw a broker\'s CFD (priced off VIX futures, ~3 points above the cash index in contango). Same word "VIX", two instruments; the app deliberately does not put a CFD beside the real index under one label.',
      },
      {
        vi: 'Cách dùng cho vị thế đang mở: một phiên đỏ với TICK không xuống dưới −600 và ADD chỉ hơi âm là **bán nhẹ** — thường không cần làm gì. Một phiên đỏ với TICK ghim dưới −800 nhiều lần và VOLD −5:1 là **bán tháo** — lúc kiểm lại cushion của mọi put đang bán.',
        en: 'How to use it with open positions: a red session where TICK never breaks −600 and ADD is only mildly negative is **light selling** — usually nothing to do. A red session with TICK pinned below −800 repeatedly and VOLD at −5:1 is **liquidation** — time to re-check the cushion on every open put.',
      },
    ],
    traps: [
      {
        vi: 'Đọc một cú TICK −900 đơn lẻ làm tín hiệu. TICK nhảy từng giây; một cú vượt ngưỡng là nhiễu, nhiều cú liên tiếp mới là bề rộng.',
        en: 'Reading one lone TICK −900 print as a signal. TICK jumps every second; one excursion is noise, repeated ones are breadth.',
      },
    ],
    seeIn: { tab: 'heatmap', sub: 'internals', label: { vi: 'Mở lưới Bề rộng TT đang chạy', en: 'Open the live Internals grid' } },
    quiz: [
      {
        q: { vi: 'TICK NYSE dưới −600 nghĩa là gì?', en: 'What does NYSE TICK below −600 mean?' },
        choices: [
          { vi: 'Cả sàn đang cùng bán — quá bán ngắn hạn', en: 'The whole exchange is selling — short-term oversold' },
          { vi: 'Chỉ số tăng', en: 'The index is rising' },
          { vi: 'Không có gì', en: 'Nothing' },
        ],
        answer: 0,
        why: { vi: '±600 là ngưỡng app vẽ và tô vùng — cực trị bề rộng.', en: '±600 is the threshold the app draws and shades — a breadth extreme.' },
      },
      {
        q: { vi: 'Chỉ số xanh nhưng ADD âm nói gì?', en: 'A green index with a negative ADD says what?' },
        choices: [
          { vi: 'Cả sàn đang tăng', en: 'The whole exchange is rising' },
          { vi: 'Vài mã lớn kéo chỉ số, nền tảng yếu', en: 'A few large names carry the index; weak foundations' },
          { vi: 'Dữ liệu lỗi', en: 'The data is wrong' },
        ],
        answer: 1,
        why: { vi: 'Đó là toàn bộ lý do nhìn bề rộng thay vì chỉ nhìn chỉ số.', en: 'That is the entire reason to look at breadth instead of the index alone.' },
      },
      {
        q: { vi: 'Vì sao ô VIX trong lưới là thẻ app chứ không phải widget TradingView?', en: 'Why is the VIX tile the app\'s own card rather than a TradingView widget?' },
        choices: [
          { vi: 'Widget nhúng chỉ vẽ được CFD, lệch chỉ số tiền mặt vài điểm', en: 'The embed can only draw a CFD, several points off the cash index' },
          { vi: 'TradingView không có VIX', en: 'TradingView has no VIX' },
          { vi: 'Cho đẹp', en: 'For looks' },
        ],
        answer: 0,
        why: { vi: 'Đo được: CFD 18 khi chỉ số 14,82 — cùng chữ, khác công cụ.', en: 'Measured: CFD at 18 while the index was 14.82 — same word, different instrument.' },
      },
    ],
  },

  {
    id: 'feargreed-rrg',
    section: 'gex',
    title: { vi: 'Fear & Greed và RRG: cảm xúc và dòng tiền ngành', en: 'Fear & Greed and RRG: sentiment and sector rotation' },
    summary: {
      vi: 'Sợ hãi cực độ là lúc premium put đắt nhất; RRG cho biết tiền đang chảy vào ngành nào.',
      en: 'Extreme fear is when put premium is richest; RRG shows which sectors money is flowing into.',
    },
    figures: ['rrg'],
    body: [
      {
        vi: '**Fear & Greed** gom bảy thước đo (đà chỉ số, bề rộng, put/call, VIX, cầu trái phiếu rác, chênh lệch cổ phiếu-trái phiếu, đỉnh/đáy mới) thành một số 0–100. Dưới 25 là **sợ hãi cực độ**, trên 75 là **tham lam cực độ**. Với người bán put, sợ hãi cực độ là lúc **premium đắt nhất** — và cũng là lúc dễ bị cuốn theo đám đông không dám bán.',
        en: '**Fear & Greed** folds seven gauges (index momentum, breadth, put/call, VIX, junk-bond demand, stock-bond spread, new highs/lows) into one 0–100 number. Below 25 is **extreme fear**, above 75 **extreme greed**. For a put seller, extreme fear is when **premium is richest** — and also when it is easiest to be swept along with a crowd too scared to sell.',
      },
      {
        vi: '**RRG** (Relative Rotation Graph) đặt 11 ngành lên hai trục: **sức mạnh tương đối** so với S&P 500 (ngang) và **đà** của sức mạnh đó (dọc). Bốn góc quay theo chiều kim đồng hồ: **Đang hồi** (yếu nhưng mạnh dần) → **Dẫn đầu** (mạnh và mạnh dần) → **Suy yếu** (mạnh nhưng yếu dần) → **Tụt hậu** (yếu và yếu dần) → lại Đang hồi.',
        en: '**RRG** (Relative Rotation Graph) places 11 sectors on two axes: **relative strength** versus the S&P 500 (horizontal) and the **momentum** of that strength (vertical). Four quadrants rotate clockwise: **Improving** (weak but strengthening) → **Leading** (strong and strengthening) → **Weakening** (strong but fading) → **Lagging** (weak and fading) → back to Improving.',
      },
      {
        vi: 'Điều quan trọng nhất và dễ hiểu sai nhất: toạ độ RRG là của **ngành**, so với 10 ngành còn lại trong cùng tuần. **Không tồn tại toạ độ RRG cho một cổ phiếu** — bỏ nhóm so sánh đi thì hai trục mất định nghĩa. Tab Long-term lọc theo góc phần tư của **ngành** mà mã thuộc về, và in tên ngành ngay cạnh để "Đang hồi" không bị đọc thành nhận định về công ty.',
        en: 'The most important and most misread point: RRG coordinates belong to the **sector**, scored against the other 10 in the same week. **There is no RRG coordinate for a single stock** — remove the peer group and both axes lose their meaning. The Long-term tab filters by the quadrant of the **sector** a stock belongs to, and prints the sector name beside it so "Improving" is not read as a claim about the company.',
      },
      {
        vi: 'Cách dùng: bán put trên mã thuộc ngành **Dẫn đầu** hoặc **Đang hồi** có gió xuôi; ngành **Tụt hậu** là nơi những cú rớt "rẻ" hay rớt tiếp. Đây là bối cảnh, không phải bộ lọc cứng — app để anh chọn góc nào muốn giữ.',
        en: 'Use: selling puts on names in **Leading** or **Improving** sectors has a tailwind; **Lagging** sectors are where "cheap" drops keep dropping. It is context, not a hard filter — the app lets you choose which quadrants to keep.',
      },
    ],
    traps: [
      {
        vi: 'Đọc "ngành Đang hồi" thành "công ty này đang hồi".',
        en: 'Reading "sector Improving" as "this company is improving".',
      },
      {
        vi: 'Chờ Fear & Greed xuống 10 mới bán put: cực trị hiếm, và premium ở 25 đã đắt.',
        en: 'Waiting for Fear & Greed to hit 10 before selling puts: extremes are rare, and premium at 25 is already rich.',
      },
    ],
    seeIn: { tab: 'heatmap', sub: 'rrg', label: { vi: 'Xem vòng xoay ngành tuần này (Heatmap → RRG)', en: 'See this week\'s sector rotation (Heatmap → RRG)' } },
    quiz: [
      {
        q: { vi: 'RRG cho toạ độ của cái gì?', en: 'What does RRG give coordinates for?' },
        choices: [
          { vi: 'Từng cổ phiếu', en: 'Each stock' },
          { vi: 'Từng ngành, so với các ngành còn lại', en: 'Each sector, against the other sectors' },
          { vi: 'Toàn thị trường', en: 'The whole market' },
        ],
        answer: 1,
        why: { vi: 'Đó là vị trí cắt ngang; bỏ nhóm so sánh thì hai trục mất định nghĩa.', en: 'It is a cross-sectional position; without the peer group the axes are undefined.' },
      },
      {
        q: { vi: 'Góc "Dẫn đầu" nghĩa là gì?', en: 'What does the "Leading" quadrant mean?' },
        choices: [
          { vi: 'Mạnh hơn thị trường và đang mạnh dần', en: 'Stronger than the market and still strengthening' },
          { vi: 'Yếu hơn thị trường', en: 'Weaker than the market' },
          { vi: 'Giá cao nhất', en: 'Highest price' },
        ],
        answer: 0,
        why: { vi: 'Đó là góc chủ app chọn khi nói "ngành đang uptrend mạnh".', en: 'That is the quadrant the owner meant by "sectors in a strong uptrend".' },
      },
    ],
  },
];
