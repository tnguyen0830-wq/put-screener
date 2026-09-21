import type { Lesson } from './types';

/**
 * Phần 3 — Options flow, dark pool, người nội bộ, Quốc hội, và một bài về
 * order flow/footprint (thứ app CHƯA có, và bài nói thẳng như vậy).
 *
 * Mọi ngưỡng ở đây là ngưỡng app đang chạy: dark pool ≥ $1M (`MIN_PREMIUM`),
 * cửa sổ 14 ngày, Form 4 chỉ mã P và loại 10b5-1, đếm NGƯỜI mua chứ không
 * đếm lượt, độ trễ công bố Quốc hội đo được ~116 ngày so với trần 30–45.
 */
export const FLOW_LESSONS: Lesson[] = [
  {
    id: 'options-flow',
    section: 'flow',
    title: { vi: 'Options flow: tiền lớn đang đặt ở đâu — và điều nó KHÔNG nói', en: 'Options flow: where big money is placed — and what it does NOT say' },
    summary: {
      vi: 'Sweep, premium, KL/OI, multileg. Và cái bẫy lớn nhất: flow không cho biết ai mua ai bán.',
      en: 'Sweeps, premium, vol/OI, multi-leg. And the biggest trap: flow does not say who bought and who sold.',
    },
    figures: ['flow-bar'],
    body: [
      {
        vi: 'Mỗi dòng flow là một giao dịch quyền chọn **bất thường** mà Unusual Whales gắn cờ: premium lớn, hoặc kiểu khớp lệnh đặc biệt. **Sweep** là một lệnh quét qua nhiều sàn cùng lúc để lấy hết thanh khoản — dấu hiệu ai đó **vội**. **Block** là một khối lớn khớp một chỗ, thường được thương lượng — ít vội hơn.',
        en: 'Each flow row is an **unusual** option trade Unusual Whales flagged: large premium, or a distinctive execution. A **sweep** hits several exchanges at once to take all available liquidity — a sign someone is **in a hurry**. A **block** is one large fill in one place, usually negotiated — less urgent.',
      },
      {
        vi: 'App xếp bảng theo **tiền** (premium), không theo số sweep: ba sweep nhỏ không đáng đứng trên một lệnh 5 triệu đô. Thanh call/put mỗi mã có **bề rộng** là tổng tiền trên một thang chung, và tỷ lệ bên trong là call so với put. Màu đỏ/xanh dương ở đây là **phân loại** call/put, không phải tốt/xấu.',
        en: 'The app sorts by **money** (premium), not sweep count: three small sweeps do not deserve to sit above one $5M trade. Each symbol\'s call/put bar has a **width** equal to total premium on one shared scale, and the split inside it is call versus put. Red/blue here is call/put **classification**, not good/bad.',
      },
      {
        vi: '**KL/OI** (volume ÷ open interest) là con số mạnh nhất trong một dòng flow. **Trên 1** nghĩa là hôm nay giao dịch nhiều hơn toàn bộ hợp đồng từng tồn tại ở strike đó — gần như chắc chắn là **vị thế mới**, không phải đóng vị thế cũ. Dưới 1 có thể chỉ là ai đó đang thoát.',
        en: '**Vol/OI** (volume ÷ open interest) is the strongest single read in a flow row. **Above 1** means more traded today than every contract that existed at that strike — almost certainly a **new position**, not someone closing. Below 1 may just be someone getting out.',
      },
      {
        vi: '**Multileg**: giao dịch có nhiều chân (spread). Một premium call lớn được gắn cờ multileg **không phải** cược một chiều — nó có thể là một spread với rủi ro giới hạn, hoặc một chân của giao dịch phòng hộ. App hiện cờ này vì giấu nó là mời đọc sai.',
        en: '**Multileg**: a trade with several legs (a spread). A large call premium flagged multileg is **not** a one-directional bet — it may be a spread with capped risk, or one leg of a hedge. The app shows the flag because hiding it invites a wrong reading.',
      },
      {
        vi: 'Và cái bẫy lớn nhất, in ngay trong chú giải của tab: **dữ liệu này KHÔNG cho biết ai mua ai bán.** Một lệnh call 5 triệu đô có thể là người ta **bán** call (thu premium, kỳ vọng giá không lên). "Tiền vào call" không bằng "ai đó đang bullish". Thiếu câu đó không phải thiếu thông tin — đó là một kết luận sai.',
        en: 'And the biggest trap, printed in the tab\'s own legend: **this data does NOT say who bought and who sold.** A $5M call trade may be someone **selling** calls (collecting premium, expecting price not to rise). "Money into calls" is not "someone is bullish". Leaving that out would not be a missing fact — it would be a wrong one.',
      },
    ],
    traps: [
      {
        vi: 'Chạy theo một sweep call lớn như tín hiệu mua. Anh không biết đó là mua hay bán call, và không biết chân còn lại của spread.',
        en: 'Chasing a large call sweep as a buy signal. You do not know whether the calls were bought or sold, or what the other leg of the spread is.',
      },
      {
        vi: 'Bỏ qua ngày đáo hạn: một sweep put 0DTE là chuyện của hôm nay, không phải nhận định về công ty.',
        en: 'Ignoring expiry: a 0DTE put sweep is about today, not a view on the company.',
      },
    ],
    seeIn: { tab: 'insider', sub: 'flow', label: { vi: 'Xem bảng flow thật (Insider Trade → Options)', en: 'See real flow (Insider Trade → Options)' } },
    quiz: [
      {
        q: { vi: 'KL/OI trên 1 nghĩa là gì?', en: 'What does vol/OI above 1 mean?' },
        choices: [
          { vi: 'Gần như chắc chắn là vị thế MỚI', en: 'Almost certainly a NEW position' },
          { vi: 'Ai đó đang đóng vị thế', en: 'Someone is closing' },
          { vi: 'Dữ liệu lỗi', en: 'Bad data' },
        ],
        answer: 0,
        why: { vi: 'Hôm nay giao dịch nhiều hơn mọi hợp đồng từng tồn tại ở strike đó — không thể toàn là đóng.', en: 'More traded today than every contract that existed at that strike — it cannot all be closing.' },
      },
      {
        q: { vi: 'Một lệnh call premium 5 triệu đô cho biết gì về hướng?', en: 'What does a $5M call trade say about direction?' },
        choices: [
          { vi: 'Ai đó bullish', en: 'Someone is bullish' },
          { vi: 'Không biết — có thể là bán call', en: 'Unknown — it could be calls being sold' },
          { vi: 'Ai đó bearish', en: 'Someone is bearish' },
        ],
        answer: 1,
        why: { vi: 'Flow không mang phía mua/bán. Đây là câu quan trọng nhất của bài.', en: 'Flow carries no buy/sell side. This is the most important line of the lesson.' },
      },
      {
        q: { vi: 'App xếp bảng flow theo gì?', en: 'What does the app sort the flow table by?' },
        choices: [
          { vi: 'Số sweep', en: 'Sweep count' },
          { vi: 'Tổng premium', en: 'Total premium' },
          { vi: 'Bảng chữ cái', en: 'Alphabetically' },
        ],
        answer: 1,
        why: { vi: 'Tiền là thứ đáng xếp; ba sweep nhỏ từng đứng trên một lệnh 5 triệu.', en: 'Money is the thing worth ranking; three small sweeps once sat above one $5M trade.' },
      },
    ],
  },

  {
    id: 'darkpool',
    section: 'flow',
    title: { vi: 'Dark pool: những khối lớn khớp ngoài sàn', en: 'Dark pool: large blocks matched off-exchange' },
    summary: {
      vi: 'Khoảng 40% khối lượng cổ phiếu Mỹ khớp ở nơi không hiện sổ lệnh — app chỉ giữ những khối từ 1 triệu đô.',
      en: 'Roughly 40% of US equity volume is matched where no order book shows — the app keeps only blocks from $1M.',
    },
    figures: ['darkpool'],
    body: [
      {
        vi: '**Dark pool** là nơi các tổ chức khớp lệnh lớn với nhau mà không đưa lệnh lên sổ công khai — để một quỹ mua 2 triệu cổ phiếu không đẩy giá lên trước khi mua xong. Giao dịch vẫn phải **báo cáo sau khi khớp**, và đó là thứ app thấy: một **print** (dấu in) với giá, khối lượng, thời điểm.',
        en: 'A **dark pool** is where institutions match large orders with each other without posting them on a public book — so a fund buying 2 million shares does not push the price up before it is done. Trades must still be **reported after the fill**, and that is what the app sees: a **print** with price, size and time.',
      },
      {
        vi: 'App chỉ giữ print **từ 1 triệu đô** trở lên (`MIN_PREMIUM`), lọc cả ở phía UW lẫn kiểm lại trong app: không có sàn thì một mã thanh khoản cao một mình đẻ ra nhiều print hơn cả tính năng đáng giá. Cửa sổ giữ là **14 ngày** — một khối lớn tuần trước không nói gì về hôm nay.',
        en: 'The app keeps only prints **from $1M** up (`MIN_PREMIUM`), filtered at UW and re-checked in the app: without a floor, one liquid name alone produces more prints than the feature is worth. The retention window is **14 days** — a big block last week says nothing about today.',
      },
      {
        vi: 'Phía **mua/bán** của một print là **suy luận**, không phải dữ liệu sàn: so giá khớp với bid/ask lúc đó (khớp gần ask → mua chủ động; gần bid → bán chủ động). Suy luận này sai được, nhất là khi print khớp đúng giữa spread. App tô màu theo suy luận đó và nói rõ đó là suy luận.',
        en: 'A print\'s **buy/sell side** is an **inference**, not exchange data: compare the fill price with the bid/ask at the time (near the ask → active buy; near the bid → active sell). The inference can be wrong, especially for prints filled mid-spread. The app colours by that inference and says it is one.',
      },
      {
        vi: 'Cách đọc hữu ích: **nhiều print cùng chiều ở cùng vùng giá trong vài ngày** là một tổ chức đang gom hoặc xả — mức giá đó là nơi họ nghĩ là hợp lý. Một print đơn lẻ, dù lớn, có thể là tái cân bằng quỹ chỉ số và không mang ý kiến gì.',
        en: 'The useful read: **several same-side prints at the same price area over a few days** is an institution accumulating or distributing — that price is where they think value is. A lone print, however large, may be index-fund rebalancing carrying no opinion.',
      },
      {
        vi: 'Chi phí đo được: hỏi từng mã trong watchlist 96 lần/ngày từng **đốt sạch hạn mức 30.000 request/ngày** của UW (#78). Nên nút "Đồng bộ ngay" chỉ chủ app bấm được, và đồng bộ tự động chỉ chạy trong giờ giao dịch, 1 trong 4 nhịp.',
        en: 'A measured cost: asking every watchlist name 96 times a day once **burned through UW\'s entire 30,000 requests/day cap** (#78). So "Sync now" is owner-only, and automatic sync runs only during market hours, 1 tick in 4.',
      },
    ],
    traps: [
      {
        vi: 'Đọc một print "mua" 3 triệu đô làm tin tốt. Phía là suy luận, và một print đơn lẻ có thể là tái cân bằng.',
        en: 'Reading one $3M "buy" print as good news. The side is inferred, and a lone print may be rebalancing.',
      },
    ],
    seeIn: { tab: 'insider', sub: 'darkpool', label: { vi: 'Xem print dark pool thật', en: 'See real dark-pool prints' } },
    quiz: [
      {
        q: { vi: 'Phía mua/bán của một print dark pool đến từ đâu?', en: 'Where does a dark-pool print\'s buy/sell side come from?' },
        choices: [
          { vi: 'Sàn báo cáo', en: 'The exchange reports it' },
          { vi: 'Suy luận từ giá khớp so với bid/ask', en: 'Inferred from the fill price against bid/ask' },
          { vi: 'Người mua tự khai', en: 'The buyer declares it' },
        ],
        answer: 1,
        why: { vi: 'Print chỉ mang giá, khối lượng, thời điểm; phía là suy ra và có thể sai.', en: 'A print carries price, size and time; the side is inferred and can be wrong.' },
      },
      {
        q: { vi: 'App giữ print từ bao nhiêu đô?', en: 'From what size does the app keep prints?' },
        choices: [{ vi: '$10.000', en: '$10,000' }, { vi: '$1.000.000', en: '$1,000,000' }, { vi: 'Mọi print', en: 'All prints' }],
        answer: 1,
        why: { vi: 'Không có sàn thì một mã thanh khoản cao nhấn chìm cả bảng.', en: 'Without a floor one liquid name drowns the whole table.' },
      },
    ],
  },

  {
    id: 'insider-form4',
    section: 'flow',
    title: { vi: 'Người nội bộ mua: Form 4, mã P, và vì sao đếm người chứ không đếm lượt', en: 'Insider buying: Form 4, code P, and why we count people rather than purchases' },
    summary: {
      vi: 'Chỉ mua bằng tiền túi trên thị trường mở mới tính. Cổ phiếu thưởng, quyền chọn thực hiện, kế hoạch 10b5-1 — không.',
      en: 'Only open-market buys with their own money count. Grants, exercised options, 10b5-1 plans — no.',
    },
    figures: ['insider'],
    body: [
      {
        vi: '**Form 4** là hồ sơ một lãnh đạo hay thành viên HĐQT phải nộp lên SEC trong **2 ngày làm việc** sau khi giao dịch cổ phiếu công ty mình. Nó công khai, miễn phí, và app đọc thẳng từ SEC — không qua bên thứ ba.',
        en: '**Form 4** is the filing an officer or director must submit to the SEC within **2 business days** of trading their own company\'s stock. It is public, free, and the app reads it straight from the SEC — no intermediary.',
      },
      {
        vi: 'Chỉ **mã giao dịch P** (open-market purchase) mới tính: họ **bỏ tiền túi** mua trên thị trường mở. Cổ phiếu được cấp, quyền chọn thực hiện (mã M), cổ phiếu nộp lại để đóng thuế — đó là **lương thưởng**, không phải niềm tin. App loại hết.',
        en: 'Only **transaction code P** (open-market purchase) counts: they **spent their own money** on the open market. Granted stock, exercised options (code M), shares handed back for tax — that is **compensation**, not conviction. The app drops them all.',
      },
      {
        vi: 'Loại thêm mua theo **kế hoạch 10b5-1**: lịch mua được đặt trước hàng tháng. Một hồ sơ toàn mã P vẫn có thể là kế hoạch đã lên từ nửa năm trước, không nói gì về hôm nay. Cờ này SEC viết **hai kiểu** (`0`/`true`) — app đọc cả hai, vì đọc sai là đếm một kế hoạch tự động thành một quyết định.',
        en: 'Also dropped: buys under a **10b5-1 plan** — a purchase schedule set months ahead. An all-code-P filing can still be a plan adopted half a year ago that says nothing about today. The SEC writes that flag **two ways** (`0`/`true`) — the app reads both, because misreading it counts an automatic plan as a decision.',
      },
      {
        vi: 'App đếm **người mua**, không đếm **lượt mua**: một người mua năm lần là một người; năm người mỗi người mua một lần là tín hiệu mạnh hơn nhiều. Bảng hiện số người, và chi tiết mở ra từng hồ sơ.',
        en: 'The app counts **buyers**, not **purchases**: one person buying five times is one person; five people buying once each is a far stronger signal. The table shows the count of people, and the detail opens each filing.',
      },
      {
        vi: 'Bốn trạng thái trống khác nhau và phải nhìn khác nhau: **chưa đồng bộ** / **không có người nộp Form 4** (ETF) / **SEC từ chối** / **SEC trả lời và không ai mua**. Chỉ cái cuối là tin tốt. Và với mega-cap, "không ai mua" là trạng thái bình thường — 15 hồ sơ gần nhất của Apple không có một mã P nào.',
        en: 'Four empty states that must not look alike: **not synced yet** / **no Form 4 filer exists** (ETFs) / **SEC refused** / **SEC answered and nobody is buying**. Only the last is good news. And for a mega-cap, "nobody buying" is the normal state — Apple\'s last 15 filings held not one code P.',
      },
    ],
    traps: [
      {
        vi: 'Đọc một CEO "mua" 2 triệu đô mà thật ra là thực hiện quyền chọn đã được cấp — giá gốc bằng 0.',
        en: 'Reading a CEO "buying" $2M that is actually exercising granted options — at a cost basis of zero.',
      },
      {
        vi: 'Coi bảng trống của một ETF là "đã kiểm, sạch". ETF không có người nội bộ.',
        en: 'Reading an ETF\'s empty table as "checked, clean". ETFs have no insiders.',
      },
    ],
    seeIn: { tab: 'insider', sub: 'form4', label: { vi: 'Xem Form 4 thật (Insider Trade → Insiders)', en: 'See real Form 4s (Insider Trade → Insiders)' } },
    quiz: [
      {
        q: { vi: 'Mã giao dịch nào được app tính là "người nội bộ mua"?', en: 'Which transaction code does the app count as "insider buying"?' },
        choices: [{ vi: 'M — thực hiện quyền chọn', en: 'M — option exercise' }, { vi: 'P — mua trên thị trường mở', en: 'P — open-market purchase' }, { vi: 'A — được cấp', en: 'A — grant' }],
        answer: 1,
        why: { vi: 'Chỉ P là bỏ tiền túi; còn lại là lương thưởng.', en: 'Only P is their own money; the rest is compensation.' },
      },
      {
        q: { vi: 'Vì sao mua theo kế hoạch 10b5-1 bị loại?', en: 'Why are 10b5-1 plan purchases excluded?' },
        choices: [
          { vi: 'Vì lịch mua đặt trước hàng tháng, không nói gì về hôm nay', en: 'Because the schedule was set months ahead and says nothing about today' },
          { vi: 'Vì chúng bất hợp pháp', en: 'Because they are illegal' },
          { vi: 'Vì SEC không công bố', en: 'Because the SEC does not publish them' },
        ],
        answer: 0,
        why: { vi: 'Một quyết định từ nửa năm trước không phải một quyết định của hôm nay.', en: 'A decision from half a year ago is not a decision about today.' },
      },
      {
        q: { vi: 'App đếm gì?', en: 'What does the app count?' },
        choices: [{ vi: 'Số lượt mua', en: 'Number of purchases' }, { vi: 'Số NGƯỜI mua khác nhau', en: 'Number of DISTINCT buyers' }, { vi: 'Tổng cổ phiếu', en: 'Total shares' }],
        answer: 1,
        why: { vi: 'Năm người mua một lần mạnh hơn hẳn một người mua năm lần.', en: 'Five people buying once each beats one person buying five times.' },
      },
    ],
  },

  {
    id: 'congress',
    section: 'flow',
    title: { vi: 'Quốc hội giao dịch: khoảng tiền, độ trễ 116 ngày, và bán không phải tin xấu', en: 'Congress trades: ranges, a 116-day lag, and why a sale is not bad news' },
    summary: {
      vi: 'Luật cho phép khai KHOẢNG chứ không phải số, và trần 30–45 ngày là trần, không phải thực tế.',
      en: 'The law allows a RANGE, not a figure, and the 30–45 day ceiling is a ceiling, not what happens.',
    },
    figures: ['congress-lag'],
    body: [
      {
        vi: 'Theo **STOCK Act**, nghị sĩ và người nhà phải công bố giao dịch cổ phiếu. Số tiền chỉ được khai theo **khoảng** ("$1.000.001 – $5.000.000") — đó là luật, nên app giữ nguyên chuỗi và **cố ý không có cột tổng tiền**: mọi con số tổng là ai đó tự chọn một điểm giữa khoảng rồi cộng lại.',
        en: 'Under the **STOCK Act**, members of Congress and their families must disclose stock trades. Amounts may only be declared as a **range** ("$1,000,001 – $5,000,000") — that is the law, so the app keeps the string as-is and **deliberately has no total-value column**: any total is someone picking a point inside each range and summing.',
      },
      {
        vi: 'Luật nói công bố "trong 30–45 ngày". Đo trên hồ sơ thật: trung vị Thượng viện là **~116 ngày**, và trong 250 bản ghi mới nhất **không bản nào** là giao dịch của 7 ngày gần nhất. Một bảng tiêu đề "ai đang mua" mà thực ra là "ai đã mua bốn tháng trước" dẫn tới quyết định sai — nên app đo độ trễ từ chính các bản ghi trên màn hình và in trung vị ngay trên bảng.',
        en: 'The law says "within 30–45 days". Measured on real filings: the Senate median is **~116 days**, and in the 250 newest records **none** were trades from the last 7 days. A table headed "who is buying" that is really "who bought four months ago" invites wrong decisions — so the app measures the lag from the records on screen and prints the median above the table.',
      },
      {
        vi: '**Bán không có nghĩa là họ biết tin xấu.** Phần lớn tài khoản là quỹ uỷ thác mù, tái cân bằng, hay bán để đóng thuế; nhiều tài khoản do người nhà quản lý. App tô mua/bán bằng xanh/đỏ vì đó là chiều tiền, nhưng chú giải nói thẳng điều này.',
        en: '**A sale does not mean they know something bad.** Most accounts are blind trusts, rebalancing, or selling to pay tax; many are run by a family member. The app colours buy/sell green/red because that is the direction of money, but the legend says this outright.',
      },
      {
        vi: 'Hai cách xem: **theo mã** ("mã này ai đụng vào") và **theo nghị sĩ** ("người này đang làm gì") — bảng xếp theo mã không bao giờ trả lời được câu thứ hai dù thêm bao nhiêu cột. Cả hai dựng từ cùng một dữ liệu đang hiện, không thêm request.',
        en: 'Two views: **by symbol** ("who touched this ticker") and **by member** ("what is this person doing") — a symbol-sorted table never answers the second however many columns it grows. Both are built from the same payload on screen, no extra request.',
      },
    ],
    traps: [
      {
        vi: 'Mua theo một nghị sĩ vì "họ biết trước". Tới lúc anh thấy, giao dịch đã bốn tháng tuổi.',
        en: 'Following a member because "they know first". By the time you see it, the trade is four months old.',
      },
    ],
    seeIn: { tab: 'insider', sub: 'congress', label: { vi: 'Xem độ trễ công bố đo được thật', en: 'See the measured disclosure lag' } },
    quiz: [
      {
        q: { vi: 'Vì sao app không có cột tổng tiền cho giao dịch Quốc hội?', en: 'Why has the app no total-value column for Congress trades?' },
        choices: [
          { vi: 'Vì luật chỉ cho khai khoảng; mọi tổng là tự đoán', en: 'Because the law allows only a range; any total is a guess' },
          { vi: 'Vì UW không trả', en: 'Because UW does not return it' },
          { vi: 'Vì hết chỗ', en: 'No room on screen' },
        ],
        answer: 0,
        why: { vi: 'Một con số tổng trông chắc chắn hơn dữ liệu cho phép.', en: 'A total looks more certain than the data allows.' },
      },
      {
        q: { vi: 'Độ trễ công bố đo được của Thượng viện khoảng bao nhiêu?', en: 'What is the measured Senate disclosure lag, roughly?' },
        choices: [{ vi: '30 ngày', en: '30 days' }, { vi: '~116 ngày', en: '~116 days' }, { vi: '2 ngày', en: '2 days' }],
        answer: 1,
        why: { vi: '30–45 là trần luật; đo thật ra trung vị ~116.', en: '30–45 is the legal ceiling; the measured median is ~116.' },
      },
    ],
  },

  {
    id: 'footprint',
    section: 'flow',
    title: { vi: 'Order flow và footprint: đọc bên trong một cây nến', en: 'Order flow and footprint: reading inside a candle' },
    summary: {
      vi: 'Khối lượng khớp ở bid và ở ask, từng mức giá. App chưa có — bài này để biết mình đang thiếu gì.',
      en: 'Volume matched at the bid and at the ask, per price level. Not in the app yet — this lesson is to know what is missing.',
    },
    figures: ['footprint'],
    body: [
      {
        vi: '**Footprint** là một cây nến bị "mở ruột": thay vì bốn con số, mỗi mức giá bên trong nến ghi hai số — khối lượng khớp **ở bid** (người bán chủ động đập vào lệnh mua chờ) và **ở ask** (người mua chủ động đập vào lệnh bán chờ). Ví dụ `340 × 1.250` ở một giá: 340 bán chủ động, 1.250 mua chủ động.',
        en: 'A **footprint** is a candle "opened up": instead of four numbers, each price level inside the candle carries two — volume matched **at the bid** (aggressive sellers hitting resting bids) and **at the ask** (aggressive buyers lifting resting offers). `340 × 1,250` at a level: 340 sold aggressively, 1,250 bought aggressively.',
      },
      {
        vi: 'Từ đó đọc ra:\n- **Delta** = mua chủ động − bán chủ động của cả nến. Nến xanh mà delta âm là chuyện đáng nghi.\n- **Imbalance**: ask ở giá này gấp ≥3× bid ở giá ngay dưới (hoặc ngược lại) — một bên đang nuốt bên kia; vài imbalance xếp chồng là một mức thật.\n- **Absorption**: bán chủ động rất lớn mà giá không rớt — có người gom hết. Tín hiệu đảo chiều mạnh nhất footprint cho được.\n- **Unfinished auction**: nến kết thúc ở một giá mà một bên còn 0 — thị trường thường quay lại "hoàn thành" chỗ đó.',
        en: 'From that you read:\n- **Delta** = aggressive buys − aggressive sells for the candle. A green candle with negative delta is suspicious.\n- **Imbalance**: ask volume at one level ≥3× the bid volume one level below (or vice versa) — one side is eating the other; stacked imbalances make a real level.\n- **Absorption**: heavy aggressive selling and price does not fall — someone is taking it all. The strongest reversal signal footprint offers.\n- **Unfinished auction**: a candle ending at a level where one side shows 0 — the market usually returns to "finish" it.',
      },
      {
        vi: 'Người dùng footprint chủ yếu là scalper/day-trader futures (ES, NQ, CL) ở khung 1–5 phút. Với bán put 20–65 ngày, nó không phải công cụ ra quyết định — nhiều nhất là chọn điểm vào đẹp hơn trong ngày.',
        en: 'Footprint users are mostly futures scalpers/day-traders (ES, NQ, CL) on 1–5 minute charts. For 20–65 day put selling it is not a decision tool — at most it picks a better entry within the day.',
      },
      {
        vi: '**App chưa có footprint, và bài này nói thẳng vì sao**: nó cần dữ liệu **từng giao dịch** kèm phía khớp. Schwab `/pricehistory` chỉ cho OHLCV. Cái gần nhất app có là **Dark pool** (khối lớn kèm phía suy luận) và **Bề rộng TT** (TICK/VOLD). Nếu có ngày nó được xây, đường đi là stream Tradovate/NinjaTrader hoặc dxFeed — và theo luật của repo, phải đo hình dạng dữ liệu thật trước rồi mới vẽ.',
        en: '**The app has no footprint, and this lesson says why**: it needs **per-trade** data with the aggressor side. Schwab `/pricehistory` gives OHLCV only. The closest things the app has are **Dark pool** (large blocks with an inferred side) and **Internals** (TICK/VOLD). If it is ever built, the path is a Tradovate/NinjaTrader or dxFeed stream — and by this repo\'s rule, the real data shape gets measured first, then drawn.',
      },
    ],
    traps: [
      {
        vi: 'Đọc delta của một nến 1 phút thành nhận định về xu hướng ngày.',
        en: 'Reading one 1-minute candle\'s delta as a view on the daily trend.',
      },
    ],
    seeIn: { tab: 'insider', sub: 'darkpool', label: { vi: 'Thứ gần footprint nhất app đang có: dark pool', en: 'The closest thing the app has: dark pool' } },
    quiz: [
      {
        q: { vi: 'Khối lượng khớp "ở ask" nghĩa là gì?', en: 'What does volume "at the ask" mean?' },
        choices: [
          { vi: 'Người mua chủ động đập vào lệnh bán đang chờ', en: 'Aggressive buyers lifting resting offers' },
          { vi: 'Người bán chủ động', en: 'Aggressive sellers' },
          { vi: 'Lệnh chưa khớp', en: 'Unfilled orders' },
        ],
        answer: 0,
        why: { vi: 'Ask là giá người bán đang chào; khớp ở đó là người mua chấp nhận trả.', en: 'The ask is what sellers are offering; a fill there is a buyer agreeing to pay it.' },
      },
      {
        q: { vi: 'Absorption là gì?', en: 'What is absorption?' },
        choices: [
          { vi: 'Bán chủ động rất lớn mà giá không rớt', en: 'Heavy aggressive selling with price not falling' },
          { vi: 'Nến không có râu', en: 'A candle with no wick' },
          { vi: 'Khối lượng bằng 0', en: 'Zero volume' },
        ],
        answer: 0,
        why: { vi: 'Có người đứng mua hết — tín hiệu đảo chiều mạnh nhất footprint cho được.', en: 'Someone is standing there buying it all — the strongest reversal signal footprint gives.' },
      },
      {
        q: { vi: 'Vì sao app chưa có footprint?', en: 'Why has the app no footprint yet?' },
        choices: [
          { vi: 'Vì cần dữ liệu từng giao dịch kèm phía khớp, Schwab REST không có', en: 'It needs per-trade data with the aggressor side, which Schwab REST lacks' },
          { vi: 'Vì không ai muốn', en: 'Nobody wants it' },
          { vi: 'Vì bất hợp pháp', en: 'It is illegal' },
        ],
        answer: 0,
        why: { vi: 'OHLCV không tách được bid/ask; phải có stream tick và phải đo trước.', en: 'OHLCV cannot separate bid from ask; it needs a tick stream, measured first.' },
      },
    ],
  },
];
