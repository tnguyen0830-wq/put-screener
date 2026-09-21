import type { Lesson } from './types';

/**
 * Phần 4 — Bán put có bảo đảm, và CÁCH APP CHẤM ĐIỂM.
 *
 * Đây là phần đáng giá nhất của cả tab: nó giải thích chính những con số tab
 * Screener đang in. Trọng số 45/25/15/15, bảy hard gate, giới hạn khối lượng
 * 5/20/50/30 — tất cả là quyết định sản phẩm ghi ở README, không phải công
 * thức suy ra. Đổi trong code thì phải đổi ở đây.
 */
export const PUT_LESSONS: Lesson[] = [
  {
    id: 'csp-what',
    section: 'putselling',
    title: { vi: 'Bán put có bảo đảm là gì', en: 'What a cash-secured put is' },
    summary: {
      vi: 'Nhận tiền ngay để hứa mua cổ phiếu ở giá thấp hơn — và giữ sẵn tiền để giữ lời hứa.',
      en: 'Get paid now for promising to buy shares at a lower price — and keep the cash ready to honour it.',
    },
    figures: ['short-put-payoff'],
    body: [
      {
        vi: 'Bán một put strike 95 khi cổ phiếu 100, thu premium 2 đô/cổ phiếu (200 đô/hợp đồng). Anh **hứa mua 100 cổ phiếu ở 95** nếu người mua put muốn bán cho anh trước ngày đáo hạn. "Có bảo đảm" nghĩa là anh giữ sẵn **95 × 100 = 9.500 đô** tiền mặt để làm điều đó — không vay.',
        en: 'Sell one put at strike 95 with the stock at 100, collecting $2/share premium ($200 per contract). You **promise to buy 100 shares at 95** if the put buyer chooses to sell to you before expiry. "Cash-secured" means you hold **95 × 100 = $9,500** in cash to do it — no margin.',
      },
      {
        vi: 'Ba kết cục:\n- Giá ở trên 95 lúc đáo hạn: put hết hạn vô giá trị, anh giữ 200 đô. **Lợi nhuận tối đa = premium.**\n- Giá dưới 95: anh mua 100 cổ phiếu ở 95, giá vốn thực là **93** (95 − 2). Anh sở hữu cổ phiếu — mà anh đã muốn sở hữu, ở giá thấp hơn lúc bắt đầu.\n- Giá sập về 0: lỗ tối đa **9.300 đô** — hữu hạn, không phải "không giới hạn".',
        en: 'Three outcomes:\n- Price above 95 at expiry: the put expires worthless, you keep $200. **Max profit = the premium.**\n- Price below 95: you buy 100 shares at 95, effective cost **93** (95 − 2). You own the stock — which you wanted to own, at a lower price than when you started.\n- Price collapses to 0: max loss **$9,300** — finite, not "unlimited".',
      },
      {
        vi: 'Câu duy nhất quyết định chiến lược này có hợp với anh không: **anh có sẵn lòng sở hữu cổ phiếu đó ở giá strike không?** Nếu không, đừng bán put trên nó — premium không bù được việc phải cầm một thứ mình không muốn. Đó là lý do mọi bộ lọc trong app xoay quanh **chất lượng công ty** trước, premium sau.',
        en: 'The one question that decides whether this strategy suits you: **are you willing to own that stock at the strike?** If not, do not sell the put — no premium pays for holding something you never wanted. That is why every filter in the app puts **company quality** first, premium second.',
      },
      {
        vi: 'Hai con số app in cho mỗi ứng viên: **ROC** (return on collateral) = premium ÷ tiền bảo đảm, **năm hoá** để so sánh các kỳ khác nhau; và **cushion** = giá cách strike bao nhiêu phần trăm — tức cổ phiếu được rớt bao nhiêu trước khi anh bắt đầu lỗ.',
        en: 'Two numbers the app prints for every candidate: **ROC** (return on collateral) = premium ÷ cash held, **annualised** so different expiries compare; and **cushion** = how far price sits above the strike in percent — i.e. how much the stock can fall before you start losing.',
      },
    ],
    traps: [
      {
        vi: 'Bán put trên mã "vì premium cao". Premium cao là thị trường đang định giá một cú rớt lớn — anh đang nhận tiền để ôm đúng rủi ro đó.',
        en: 'Selling a put "because premium is high". High premium is the market pricing a large drop — you are being paid to carry exactly that risk.',
      },
      {
        vi: 'Không giữ đủ tiền mặt ("bán put ký quỹ"). Một cú rớt 30% trên vài vị thế cùng lúc là lệnh gọi ký quỹ.',
        en: 'Not holding the cash ("naked" on margin). A 30% drop across a few positions at once is a margin call.',
      },
    ],
    seeIn: { tab: 'screener', label: { vi: 'Xem ROC và cushion thật ở tab Screener', en: 'See real ROC and cushion in the Screener' } },
    quiz: [
      {
        q: { vi: 'Bán put 95 thu premium 2, cổ phiếu về 90 lúc đáo hạn. Giá vốn thực của anh?', en: 'Sold a 95 put for $2; stock at 90 at expiry. Your effective cost?' },
        choices: [{ vi: '95', en: '95' }, { vi: '93', en: '93' }, { vi: '90', en: '90' }],
        answer: 1,
        why: { vi: 'Mua ở 95, đã nhận 2 → 93. Thấp hơn giá 100 lúc bắt đầu.', en: 'Bought at 95, already received 2 → 93. Below the 100 you started at.' },
      },
      {
        q: { vi: 'Lỗ tối đa của một put có bảo đảm là gì?', en: 'What is the max loss of a cash-secured put?' },
        choices: [
          { vi: 'Không giới hạn', en: 'Unlimited' },
          { vi: 'Strike − premium, nhân 100', en: 'Strike − premium, times 100' },
          { vi: 'Bằng premium', en: 'The premium' },
        ],
        answer: 1,
        why: { vi: 'Giá không xuống dưới 0 được, nên lỗ hữu hạn — nhưng lớn.', en: 'Price cannot go below zero, so the loss is finite — but large.' },
      },
      {
        q: { vi: 'Câu hỏi quyết định trước khi bán put là gì?', en: 'The deciding question before selling a put?' },
        choices: [
          { vi: 'Premium có cao không', en: 'Is premium high' },
          { vi: 'Tôi có sẵn lòng sở hữu cổ phiếu này ở strike không', en: 'Am I willing to own this stock at the strike' },
          { vi: 'Hôm nay thứ mấy', en: 'What day is it' },
        ],
        answer: 1,
        why: { vi: 'Nếu câu trả lời là không, không premium nào đủ.', en: 'If the answer is no, no premium is enough.' },
      },
    ],
  },

  {
    id: 'score',
    section: 'putselling',
    title: { vi: 'Điểm số: 45 / 25 / 15 / 15', en: 'The score: 45 / 25 / 15 / 15' },
    summary: {
      vi: 'Bốn phần của điểm, vì sao ROC nặng nhất, và vì sao điểm cao không bao giờ cứu được một gate hỏng.',
      en: 'The four parts of the score, why ROC weighs most, and why a high score never rescues a failed gate.',
    },
    figures: ['score'],
    body: [
      {
        vi: 'Điểm của mỗi ứng viên là tổng có trọng số của bốn phần:\n- **ROC năm hoá — 45**: anh được trả bao nhiêu cho tiền bị khoá. Nặng nhất vì đó là lý do làm việc này.\n- **Cushion — 25**: cổ phiếu được rớt bao nhiêu trước khi anh lỗ. An toàn.\n- **IV/HV — 15**: biến động ẩn so với biến động thực — premium có đang đắt so với cách cổ phiếu thật sự dao động không.\n- **Thanh khoản — 15**: OI, khối lượng, spread — vào và ra có dễ không.',
        en: 'Each candidate\'s score is a weighted sum of four parts:\n- **Annualised ROC — 45**: what you are paid for the cash locked up. Heaviest, because it is the reason for doing this.\n- **Cushion — 25**: how far the stock can fall before you lose. Safety.\n- **IV/HV — 15**: implied versus realised volatility — is the premium rich relative to how the stock actually moves.\n- **Liquidity — 15**: OI, volume, spread — how easy it is to get in and out.',
      },
      {
        vi: 'Trọng số là **quyết định sản phẩm**, không phải công thức suy ra — README ghi vậy và code chỉ cộng bốn phần lại. Ngăn chi tiết của mỗi ứng viên in **từng phần** (`scoreBreakdown`) để hai ứng viên bằng điểm vẫn thấy được vì sao: một cái nhiều ROC ít cushion, cái kia ngược lại.',
        en: 'The weights are a **product decision**, not a derived formula — the README says so and the code only sums the four parts. Each candidate\'s detail drawer prints **each part** (`scoreBreakdown`) so two candidates on the same total still show why: one heavy on ROC and light on cushion, the other the reverse.',
      },
      {
        vi: 'Luật quan trọng nhất: **điểm cao không bao giờ cứu được một hard gate hỏng.** Bảy gate (bài sau) là đạt/không đạt; một ứng viên ROC 40%/năm mà có earnings trong kỳ vẫn bị loại. Điểm chỉ xếp hạng những gì đã qua cổng.',
        en: 'The most important rule: **a high score never rescues a failed hard gate.** The seven gates (next lesson) are pass/fail; a candidate at 40%/yr ROC with earnings inside the window is still dropped. The score only ranks what got through the gates.',
      },
      {
        vi: 'Khi một phần **thiếu dữ liệu** (không có HV20, không có lịch sử), phần đó chấm **trung lập**, không chấm 0. Chấm 0 là dựng một bộ lọc ngầm đẩy mọi mã thiếu dữ liệu xuống đáy bảng mà không ai biết vì sao — và app đã cấm chuyện "chưa biết trông giống như xấu".',
        en: 'When a part is **missing data** (no HV20, no history), it scores **neutral**, not zero. Scoring zero builds a hidden filter that sinks every data-poor name to the bottom without anyone knowing why — and the app forbids "unknown looking like bad".',
      },
    ],
    traps: [
      {
        vi: 'Xếp theo điểm rồi bán cái đầu bảng mà không mở ngăn chi tiết. Điểm là tổng; ngăn chi tiết mới nói tổng đó gồm gì.',
        en: 'Sorting by score and selling the top row without opening the drawer. The score is a total; the drawer says what it is made of.',
      },
    ],
    seeIn: { tab: 'screener', label: { vi: 'Mở một ứng viên và xem scoreBreakdown', en: 'Open a candidate and see its scoreBreakdown' } },
    quiz: [
      {
        q: { vi: 'Phần nào nặng nhất trong điểm số?', en: 'Which part weighs most in the score?' },
        choices: [{ vi: 'Cushion', en: 'Cushion' }, { vi: 'ROC năm hoá', en: 'Annualised ROC' }, { vi: 'Thanh khoản', en: 'Liquidity' }],
        answer: 1,
        why: { vi: '45 điểm — đó là lý do làm việc này.', en: '45 points — it is the reason for doing this.' },
      },
      {
        q: { vi: 'Ứng viên điểm 95 nhưng có earnings trong kỳ hợp đồng thì sao?', en: 'A candidate scoring 95 but with earnings inside the contract window?' },
        choices: [{ vi: 'Vẫn hiện, vì điểm cao', en: 'Still shown, the score is high' }, { vi: 'Bị loại — gate hỏng, điểm không cứu', en: 'Dropped — a failed gate, the score does not rescue it' }],
        answer: 1,
        why: { vi: 'Gate là đạt/không đạt; điểm chỉ xếp hạng những gì đã qua.', en: 'Gates are pass/fail; the score only ranks what got through.' },
      },
      {
        q: { vi: 'Thiếu HV20 thì phần IV/HV chấm bao nhiêu?', en: 'With HV20 missing, what does the IV/HV part score?' },
        choices: [{ vi: '0', en: '0' }, { vi: 'Trung lập', en: 'Neutral' }, { vi: 'Tối đa', en: 'Maximum' }],
        answer: 1,
        why: { vi: 'Chấm 0 là biến "chưa biết" thành "xấu" — bộ lọc ngầm.', en: 'Zero would turn "unknown" into "bad" — a hidden filter.' },
      },
    ],
  },

  {
    id: 'gates',
    section: 'putselling',
    title: { vi: 'Bảy hard gate — và dấu hỏi "?"', en: 'The seven hard gates — and the "?" mark' },
    summary: {
      vi: 'Bảy điều kiện điểm số không cứu được, và vì sao "chưa có dữ liệu" hiện thành ? chứ không phải ✓.',
      en: 'Seven conditions the score cannot rescue, and why "no data" shows as ? rather than ✓.',
    },
    figures: ['gates'],
    body: [
      {
        vi: 'Bảy gate, cố định, không chỉnh được:\n- **VRP ≥ 1,0** — premium ẩn phải ít nhất bằng biến động thực; bán put khi thị trường trả kém hơn rủi ro thật là bán rẻ.\n- **Không có earnings trong kỳ hợp đồng** — một đêm earnings là cú nhảy 8–15% mà cushion của anh không tính tới.\n- **OI ≥ 500 và khối lượng ≥ 100** — đủ người để thoát khi cần.\n- **Spread ≤ 5%** — spread rộng là anh trả phí ẩn hai lần, vào và ra.\n- **Không rớt quá 20% trong 20 phiên** — tránh bắt dao rơi.\n- **Term structure ≥ 0,95** — IV gần không cao hơn IV xa quá nhiều (backwardation là thị trường đang sợ một chuyện sắp xảy ra).\n- **Put skew z ≤ 2** — put không đắt bất thường so với chính lịch sử của mã.',
        en: 'Seven gates, fixed, not user-editable:\n- **VRP ≥ 1.0** — implied premium must at least match realised movement; selling when the market pays less than the real risk is selling cheap.\n- **No earnings inside the contract window** — one earnings night is an 8–15% gap your cushion did not price.\n- **OI ≥ 500 and volume ≥ 100** — enough participants to exit when needed.\n- **Spread ≤ 5%** — a wide spread is a hidden fee paid twice, in and out.\n- **Not down more than 20% over 20 sessions** — no falling knives.\n- **Term structure ≥ 0.95** — near IV not far above later IV (backwardation is the market fearing something imminent).\n- **Put skew z ≤ 2** — puts not unusually expensive against the stock\'s own history.',
      },
      {
        vi: 'Gate được tính cho **mọi** ứng viên, kể cả khi anh tắt công tắc hard gates: tắt đi thì ngăn chi tiết vẫn hiện ✓/✗ thật cho từng gate, chỉ là không loại nữa. Một đường code, hai cách dùng.',
        en: 'Gates are computed for **every** candidate, even with the hard-gates switch off: turned off, the drawer still shows the real ✓/✗ per gate, it just stops dropping. One code path, two uses.',
      },
      {
        vi: '**Dấu hỏi là bài học quan trọng nhất của tab này.** Gate earnings từng vẽ ✓ cho mã **chưa ai từng tra** — vì lịch earnings chỉ dựng cho watchlist, nên quét cả S&P 500 thì ~450 mã "qua cổng" do không có dữ liệu chứ không phải do không có earnings. Một màn hình nói "đã kiểm, sạch" về thứ chưa kiểm là cách người ta bỏ lỡ CRWD. Giờ: thiếu dữ liệu vẫn **qua** (thiếu dữ liệu không phải bằng chứng có vấn đề), nhưng hiện **?** màu cam kèm "chưa có dữ liệu", không bao giờ là ✓.',
        en: '**The question mark is the most important lesson in this tab.** The earnings gate once drew ✓ for stocks **nobody had ever looked up** — the earnings calendar covered the watchlist only, so a full S&P 500 scan let ~450 names "pass" for lack of data, not for lack of earnings. A screen saying "checked, clean" about something unchecked is how CRWD got missed. Now: missing data still **passes** (a data gap is not evidence of a problem), but shows an orange **?** with "no data" — never a ✓.',
      },
      {
        vi: 'Ngày earnings giờ có hai nguồn (file tay + tastytrade), và một ngày **ước tính** hiện kèm nhãn "ước tính": hợp đồng bị loại vì ngày đoán là bị loại trên bằng chứng yếu hơn hẳn, và app cố ý cảnh báo thừa — nói "kiểm lại" nhầm thì vô hại, nói "chắc chắn" nhầm thì không.',
        en: 'Earnings dates now have two sources (hand file + tastytrade), and an **estimated** date carries an "estimated" tag: a contract rejected on a guessed date is rejected on much weaker evidence, and the app deliberately over-warns — saying "check this" wrongly is harmless; saying "certain" wrongly is not.',
      },
    ],
    traps: [
      {
        vi: 'Tắt hard gates "để thấy nhiều ứng viên hơn" rồi quên bật lại. Bảng dài hơn toàn những thứ đã bị loại có lý do.',
        en: 'Turning hard gates off "to see more candidates" and forgetting to turn them back on. The longer table is full of things dropped for a reason.',
      },
      {
        vi: 'Đọc ? như ✓. ? nghĩa là app không biết — anh phải tự tra.',
        en: 'Reading ? as ✓. ? means the app does not know — you have to look it up.',
      },
    ],
    seeIn: { tab: 'screener', label: { vi: 'Mở ngăn chi tiết và đọc bảy gate', en: 'Open the drawer and read the seven gates' } },
    quiz: [
      {
        q: { vi: 'Gate earnings hiện "?" nghĩa là gì?', en: 'The earnings gate shows "?" — what does it mean?' },
        choices: [
          { vi: 'Đã kiểm, không có earnings', en: 'Checked, no earnings' },
          { vi: 'App không có dữ liệu earnings cho mã này — tự tra', en: 'The app has no earnings data for this name — look it up yourself' },
          { vi: 'Có earnings ngày mai', en: 'Earnings are tomorrow' },
        ],
        answer: 1,
        why: { vi: '"Chưa biết" không được trông giống "sạch" — đó là bài học CRWD.', en: '"Unknown" must not look like "clean" — the CRWD lesson.' },
      },
      {
        q: { vi: 'Term structure dưới 0,95 nói gì?', en: 'Term structure below 0.95 says what?' },
        choices: [
          { vi: 'Thị trường đang sợ một chuyện sắp xảy ra (backwardation)', en: 'The market fears something imminent (backwardation)' },
          { vi: 'Cổ phiếu rẻ', en: 'The stock is cheap' },
          { vi: 'Thanh khoản thấp', en: 'Low liquidity' },
        ],
        answer: 0,
        why: { vi: 'IV gần cao hơn IV xa: rủi ro tập trung trong kỳ của anh.', en: 'Near IV above far IV: the risk sits inside your window.' },
      },
      {
        q: { vi: 'Tắt công tắc hard gates thì ngăn chi tiết hiện gì?', en: 'With hard gates switched off, what does the drawer show?' },
        choices: [
          { vi: 'Không hiện gate nữa', en: 'No gates at all' },
          { vi: 'Vẫn hiện ✓/✗ thật, chỉ không loại', en: 'The real ✓/✗ still, just no dropping' },
          { vi: 'Toàn ✓', en: 'All ✓' },
        ],
        answer: 1,
        why: { vi: 'Gate tính cho mọi ứng viên; công tắc chỉ quyết định có loại hay không.', en: 'Gates are computed for everyone; the switch only decides whether to drop.' },
      },
    ],
  },

  {
    id: 'iv-hv',
    section: 'putselling',
    title: { vi: 'IV, HV, VRP và IV rank: premium đang đắt hay rẻ', en: 'IV, HV, VRP and IV rank: is premium rich or cheap' },
    summary: {
      vi: 'Bốn con số nói cùng một chuyện từ bốn góc — và hai trong số đó cần thời gian "khởi động".',
      en: 'Four numbers saying one thing from four angles — and two of them need time to "warm up".',
    },
    figures: ['iv-hv'],
    body: [
      {
        vi: '**HV** (historical volatility) là cổ phiếu **đã** dao động bao nhiêu — app dùng HV20, tính từ 20 phiên gần nhất, năm hoá. **IV** (implied volatility) là thị trường quyền chọn **đang định giá** cổ phiếu sẽ dao động bao nhiêu — rút ra từ premium. Cả hai là phần trăm/năm.',
        en: '**HV** (historical volatility) is how much the stock **has** moved — the app uses HV20, from the last 20 sessions, annualised. **IV** (implied volatility) is how much the options market **is pricing** the stock to move — backed out of premium. Both are percent per year.',
      },
      {
        vi: '**VRP** (volatility risk premium) = IV ÷ HV. Trên 1: thị trường trả nhiều hơn cổ phiếu thật sự dao động — người bán quyền chọn có lợi thế thống kê. Dưới 1: anh đang bán bảo hiểm rẻ hơn rủi ro. Đó là gate **VRP ≥ 1,0**.',
        en: '**VRP** (volatility risk premium) = IV ÷ HV. Above 1: the market pays more than the stock actually moves — the option seller has a statistical edge. Below 1: you are selling insurance below the risk. That is the **VRP ≥ 1.0** gate.',
      },
      {
        vi: '**IV rank** đặt IV hôm nay trên thang 0–100 so với **chính mã đó** trong một năm: 80 nghĩa là IV cao hơn 80% số ngày của năm qua. IV 40% là cao với KO và thấp với TSLA — IV rank là thứ làm hai mã so được với nhau. App tự tích luỹ lịch sử IV **mỗi ngày một điểm mỗi mã**, nên mã mới quét lần đầu chưa có IV rank — đó là khởi động, không phải lỗi.',
        en: '**IV rank** places today\'s IV on a 0–100 scale against **the same stock** over a year: 80 means IV is higher than on 80% of the past year\'s days. IV of 40% is high for KO and low for TSLA — IV rank is what makes two names comparable. The app accumulates its own IV history **one reading per symbol per day**, so a freshly scanned name has no IV rank yet — warm-up, not a bug.',
      },
      {
        vi: '**Put skew** đo put đắt hơn call bao nhiêu ở cùng khoảng cách; **z-score** của nó so với lịch sử của mã cần **~60 lần đọc** trước khi có nghĩa, nên gate "skew z ≤ 2" trả `null` (qua, kèm ?) cho tới lúc đó. **Term structure** thì là tỷ lệ IV kỳ gần / kỳ xa trong cùng một ngày, sống ngay từ lượt quét đầu.',
        en: '**Put skew** measures how much more expensive puts are than calls at the same distance; its **z-score** against the stock\'s own history needs **~60 readings** to mean anything, so the "skew z ≤ 2" gate returns `null` (pass, with ?) until then. **Term structure** is the near-expiry / far-expiry IV ratio on the same day, live from the first scan.',
      },
      {
        vi: 'Với lịch sử một cách khác: tastytrade trả **ba** trường IV rank khác nhau cho cùng một mã cùng một lúc (lệch ~6 điểm) và tính trên thang **0–1**, còn app tính **0–100**. Đó là lý do app chưa lấy IV rank từ tastytrade — nhét 0,41 vào chỗ chờ 41 là sai 100 lần mà vẫn trông như một con số.',
        en: 'A side note on history: tastytrade returns **three** different IV-rank fields for the same name at the same instant (~6 points apart), on a **0–1** scale, while the app computes **0–100**. That is why the app does not yet take IV rank from tastytrade — feeding 0.41 where 41 is expected is a 100× error that still looks like a number.',
      },
    ],
    traps: [
      {
        vi: 'So IV tuyệt đối giữa hai mã. 40% ở KO không phải 40% ở TSLA — dùng IV rank.',
        en: 'Comparing absolute IV across two names. 40% at KO is not 40% at TSLA — use IV rank.',
      },
      {
        vi: 'Đọc "IV rank —" ngày đầu như lỗi. Nó là lịch sử chưa đủ; ngày mai có thêm một điểm.',
        en: 'Reading "IV rank —" on day one as a bug. It is history not yet long enough; tomorrow adds a point.',
      },
    ],
    seeIn: { tab: 'analyze', label: { vi: 'Xem IV, HV20 và IV rank thật ở tab Analyze', en: 'See real IV, HV20 and IV rank in Analyze' } },
    quiz: [
      {
        q: { vi: 'VRP = 1,4 nghĩa là gì?', en: 'VRP = 1.4 means what?' },
        choices: [
          { vi: 'Thị trường trả nhiều hơn cổ phiếu thật sự dao động — lợi thế cho người bán', en: 'The market pays more than the stock actually moves — edge for the seller' },
          { vi: 'Cổ phiếu sắp rớt 40%', en: 'The stock will drop 40%' },
          { vi: 'Premium rẻ', en: 'Premium is cheap' },
        ],
        answer: 0,
        why: { vi: 'IV/HV > 1 là bảo hiểm bán được cao hơn rủi ro đo được.', en: 'IV/HV > 1 is insurance selling above the measured risk.' },
      },
      {
        q: { vi: 'Vì sao mã mới quét lần đầu không có IV rank?', en: 'Why does a freshly scanned name have no IV rank?' },
        choices: [
          { vi: 'App tự tích luỹ lịch sử IV, mỗi ngày một điểm', en: 'The app builds its own IV history, one point per day' },
          { vi: 'Schwab không có IV', en: 'Schwab has no IV' },
          { vi: 'Mã đó không có quyền chọn', en: 'The name has no options' },
        ],
        answer: 0,
        why: { vi: 'Rank cần một năm để so; ngày đầu chưa có gì để so.', en: 'Rank needs a year to compare against; day one has nothing.' },
      },
    ],
  },

  {
    id: 'manage',
    section: 'putselling',
    title: { vi: 'Quản lý vị thế: ITM, roll, 21 ngày, và bốn giới hạn khối lượng', en: 'Managing the position: ITM, rolling, 21 days, and four sizing limits' },
    summary: {
      vi: 'Bán put dễ; giữ nó đến cùng mới là việc. Và không có vị thế nào được lớn hơn 5% tài khoản.',
      en: 'Selling the put is easy; carrying it is the work. And no position gets bigger than 5% of the account.',
    },
    figures: ['manage'],
    body: [
      {
        vi: '**ITM** (in the money): giá đã xuống dưới strike. Chưa phải thảm hoạ — anh vẫn có premium, và cushion âm chỉ nói anh đang ở đúng kịch bản "sở hữu cổ phiếu ở giá vốn thấp hơn". Tab My Portfolio đếm số put ITM và **báo qua Telegram** khi có, vì đó là lúc phải quyết: nhận cổ phiếu, hay roll.',
        en: '**ITM** (in the money): price has dropped below the strike. Not a disaster yet — you still have the premium, and a negative cushion only says you are in the "own the stock at a lower cost" scenario. My Portfolio counts ITM puts and **alerts on Telegram** when there are any, because that is when to decide: take the shares, or roll.',
      },
      {
        vi: '**Roll**: mua lại put đang có, bán một put khác **xa hơn về thời gian** (và thường **thấp hơn về strike**), sao cho tổng vẫn **nhận thêm tiền** (net credit). Roll để lấy thêm thời gian cho cổ phiếu hồi; roll mà phải **trả tiền** là đang trả để trì hoãn một khoản lỗ, không phải sửa nó.',
        en: 'A **roll**: buy back the current put, sell another **further out in time** (and usually **lower in strike**), so the combination still **collects money** (net credit). Roll to give the stock time to recover; a roll that **costs money** is paying to postpone a loss, not fixing it.',
      },
      {
        vi: '**Luật 21 ngày**: quyền chọn mất giá trị thời gian nhanh nhất trong 3 tuần cuối, nhưng gamma cũng tăng — tức một cú rớt nhỏ làm lỗ lớn. Nhiều người bán put đóng hoặc roll ở **21 DTE** dù đang lãi, lấy 50–70% premium tối đa và bỏ phần rủi ro nhất. App quét ở cửa sổ 20–65 DTE vì lý do này.',
        en: 'The **21-day rule**: options lose time value fastest in the last 3 weeks, but gamma also rises — a small drop becomes a large loss. Many put sellers close or roll at **21 DTE** even when profitable, taking 50–70% of max premium and skipping the riskiest part. The app scans a 20–65 DTE window for this reason.',
      },
      {
        vi: 'Bốn giới hạn khối lượng app kiểm trên tài khoản thật:\n- **5% mỗi mã** — một công ty phá sản không được làm mất hơn 5%.\n- **20% mỗi ngành** — năm ngân hàng là một cược, không phải năm.\n- **50% tổng tiền bảo đảm** — giữ một nửa tiền mặt cho lúc cả thị trường rớt.\n- **30% cụm tương quan** — tính bằng tương quan giá 60 phiên giữa các mã đang cầm; hai mã tương quan 0,9 là một vị thế đội hai cái tên.',
        en: 'Four sizing limits the app checks against the real account:\n- **5% per symbol** — one bankruptcy must not cost more than 5%.\n- **20% per sector** — five banks are one bet, not five.\n- **50% total cash-secured** — keep half the cash for when the whole market drops.\n- **30% correlated cluster** — computed from 60-session price correlation among held names; two names at 0.9 correlation are one position wearing two tickers.',
      },
      {
        vi: 'Và một cảnh báo không phải về giá: **phiên Schwab hết hạn sau 7 ngày, không gia hạn được** — app báo ở 2/1/0 ngày còn lại vì khi phiên chết, mọi con số trên màn hình đứng im mà trông vẫn sống.',
        en: 'And one alert not about price: **the Schwab session expires after 7 days, non-renewable** — the app alerts at 2/1/0 days left because when it dies, every number on screen freezes while still looking alive.',
      },
    ],
    traps: [
      {
        vi: 'Roll với net debit "để cứu vị thế". Đó là trả tiền để đẩy khoản lỗ sang tháng sau.',
        en: 'Rolling for a net debit "to save the position". That is paying to push the loss into next month.',
      },
      {
        vi: 'Bán put trên năm mã cùng ngành vì cả năm đều đẹp. Giới hạn 20%/ngành tồn tại vì chúng rớt cùng nhau.',
        en: 'Selling puts on five names in one sector because all five look good. The 20%/sector limit exists because they fall together.',
      },
    ],
    seeIn: { tab: 'screener', label: { vi: 'Xem cửa sổ DTE và cushion khi quét', en: 'See the DTE window and cushion when scanning' } },
    quiz: [
      {
        q: { vi: 'Một cú roll "đúng" phải thoả điều gì?', en: 'What must a "proper" roll satisfy?' },
        choices: [
          { vi: 'Nhận thêm tiền (net credit)', en: 'Collect more money (net credit)' },
          { vi: 'Strike cao hơn', en: 'A higher strike' },
          { vi: 'Cùng ngày đáo hạn', en: 'The same expiry' },
        ],
        answer: 0,
        why: { vi: 'Roll trả tiền là trì hoãn lỗ, không phải sửa lỗ.', en: 'A debit roll postpones the loss; it does not fix it.' },
      },
      {
        q: { vi: 'Vì sao nhiều người đóng put ở 21 DTE dù đang lãi?', en: 'Why do many close a put at 21 DTE even when profitable?' },
        choices: [
          { vi: 'Ba tuần cuối gamma tăng — cú rớt nhỏ thành lỗ lớn', en: 'Gamma rises in the last three weeks — a small drop becomes a large loss' },
          { vi: 'Vì phí giao dịch', en: 'Because of commissions' },
          { vi: 'Vì luật', en: 'Because of a rule' },
        ],
        answer: 0,
        why: { vi: 'Lấy 50–70% premium, bỏ phần rủi ro nhất.', en: 'Take 50–70% of the premium, skip the riskiest part.' },
      },
      {
        q: { vi: 'Giới hạn khối lượng mỗi mã là bao nhiêu?', en: 'What is the per-symbol sizing limit?' },
        choices: [{ vi: '5%', en: '5%' }, { vi: '20%', en: '20%' }, { vi: '50%', en: '50%' }],
        answer: 0,
        why: { vi: '5% mỗi mã, 20% mỗi ngành, 50% tổng bảo đảm, 30% cụm tương quan.', en: '5% per symbol, 20% per sector, 50% total cash-secured, 30% correlated cluster.' },
      },
    ],
  },
];
