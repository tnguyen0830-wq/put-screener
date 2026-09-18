# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
cp .env.example .env          # fill in SCHWAB_APP_KEY / SCHWAB_APP_SECRET at minimum
npm run dev                   # HTTPS on https://127.0.0.1:3000 (Schwab requires HTTPS callbacks)
npm run dev:http              # plain HTTP on :3000, for work that doesn't touch Schwab auth
npm run build                 # next build — this repo has no test suite or lint script
npm run start                 # next start, after build
```

There is no test runner configured. **Network from this sandbox is an allowlist, not a blackout — and the owner has now changed it.** An earlier version of this file said "no outbound network", which is wrong in a way that matters.

**Measured 2026-09-17, after the owner set the environment's Network access to `Custom`** (claude.ai/code → the `☁ Default` chip at the composer → Edit cloud environment → Network access → Custom → *Allowed domains*, with *"Also include default list of common package managers"* left ticked): `data.sec.gov`, `www.sec.gov`, `unitedstates.github.io`, `registry.npmjs.org` and `api.github.com` all answer **200**. `cdn.cboe.com` answers 403 on `/` but **200 with 13.3 MB** on the real path `/api/global/delayed_quotes/options/_SPX.json` — the CDN simply serves no root page, and the proxy logged **zero** denials for it. Still refused: `api.schwabapi.com`, `api.unusualwhales.com`, `api.tastyworks.com`, `finviz.com`, `financialmodelingprep.com`, `api.telegram.org` — deliberately, since calling those needs credentials.

**Node's global `fetch` does NOT use `HTTPS_PROXY`; `curl` does.** Measured on the same URL in the same second: `curl` → 200, bare `fetch` → **403**. So a sandbox script that fetches an allowed host with `fetch` gets a 403 that is *its own*, not the vendor's — the #130 lesson in a new costume. Use `curl` (or configure a dispatcher) when measuring from here. This does not affect production, where there is no proxy. **Check rather than assume**: `curl -sS "$HTTPS_PROXY/__agentproxy/status"` prints the proxy state and its most recent refusals by host, and a plain `curl -o /dev/null -w "%{http_code}"` settles any one host in a second.

**The practical rule still holds for the keyed hosts** — anything needing a credential can only be verified in production, which is why the self-diagnosing idiom below matters and why real numbers from the owner's own accounts have repeatedly caught bugs the tests missed. Credentials pasted into a session live in that session's transcript, so Schwab / UW / tastytrade stay measured by the production probes (`/api/uwprobe`, `/api/ttprobe`).

For the keyless hosts that rule is now lifted, and it paid for itself the same hour: opening `data.sec.gov` turned four guesses into measurements and exposed two further real bugs (#142). **The CBOE chain shape (#109) and the portrait URLs (#133) have since been measured too (#143) — both guesses were right, and the exercise still found a comment that would have led a later reader to break the CBOE ladder.**

Verification in this repo has historically meant: `npx tsc --noEmit`, `npm run build`, small standalone Node scripts (compile a single `src/lib/*.ts` with `npx tsc <file> --outDir <tmp> --module commonjs --target es2020 --skipLibCheck --esModuleInterop`, then `require()` it from a plain `.js` test script) for pure logic, and Playwright (`playwright-core`, launched with `executablePath: '/opt/pw-browsers/chromium-*/chrome-linux/chrome'` in the sandbox) against `next start` for UI changes — check both themes (`colorScheme: 'light'|'dark'`) and both languages where relevant.

## Two Claude accounts share this repo

The owner runs this project from two Claude accounts so work can continue when
one hits its usage limit. Both push to the same GitHub repo, so the only thing
preventing lost work is discipline about branches.

**One branch per task. Never share a branch name between accounts.** Reusing a
single long-lived branch is what actually destroys work: the other account
force-pushes and your commits are gone. Name a branch after the task
(`claude/wheel-covered-calls`), not after the session, and open a PR from it.
`--force-with-lease` is the only acceptable force, and only on a branch this
session created.

**Read what already landed before starting.** `git fetch origin main && git log
--oneline origin/main -15` costs nothing and shows whether the other account
just changed the files you were about to rewrite. Check open PRs too - work in
review is work that exists, and rewriting the same file from `main` will collide
with it at merge time.

**"What are you working on?" is a live-state question, not a memory question.**
A session's own memory of "I'm on PR #58" goes stale the moment the *other*
account merges anything - and the owner asks this exact question specifically
to route work between the two accounts, so a stale answer sends them to fix a
bug that's already merged, or skip a PR that's still genuinely open. Before
answering it, always run `git fetch origin main && git log --oneline
origin/main -15` and list open PRs - never answer from session memory alone.
The "Recent work" log below is a cheap cross-check, not a substitute for this:
it is written by whichever session happens to remember to update it, so it can
also be stale - `git log`/open PRs are the actual source of truth.

**Say which files a PR touches, in the PR body.** That is the cheapest way for
the other account to notice an overlap before it becomes a conflict.

**Do not rewrite a whole file the other account is mid-way through.** If two
tasks genuinely need the same file, they go one after the other, not in
parallel. `src/lib/i18n.tsx` and `src/components/PortfolioPanel.tsx` are the two
files nearly every change touches, so they collide most.

Merging used to wait on the owner explicitly saying "merge" for every PR. The
owner changed that: Claude now merges its own PRs automatically once its own
verification (typecheck, build, and whatever tests apply) is green — no more
waiting for a "merge" reply per PR. This still means: verify before merging,
never merge a PR with failing checks or unresolved review feedback, and still
say plainly what was merged. A PR that touches something risky or ambiguous
enough to want the owner's eyes first is still worth flagging before merging,
using judgment - "auto-merge" is not "never ask anything."

### In progress right now (update this at start, mid-task, and finish)

The owner asked for this explicitly: write down what a session is doing at
every stage, not just after merging - so asking either account "what's
happening" gets a real answer even mid-task, without waiting for a PR.

- **Starting a task** - before writing code, replace the line below with:
  date, one-line task description, and the branch name.
- **Still working / blocked / scope changed** - update that same line in
  place (e.g. "blocked on X", "turned out bigger than expected, doing Y
  first") rather than leaving a stale description sitting there.
- **Finished and merged** - delete the line here and add the real entry to
  "Recent work" below instead (with the PR number). Set this back to "Nothing
  in progress."
- **Abandoned without merging** - delete the line here and say why in one
  sentence, so the next session (or the owner) knows it was a deliberate
  stop, not a crash mid-task.

This is still just a snapshot, same caveat as "Recent work" below - a
session that forgets to update it makes it stale. `git log` / open PRs are
still the only *live* truth; this is the cheap first check before that.

2026-09-18 — Không có việc đang làm dở. Tab Đầu tư dài hạn: lưu kết quả quét (#144), ô tích trên SMA200 (#145), nút vốn hoá (#146), nút dòng tiền RRG (#147), nút "Tại sao rớt?" trả lời đúng tiếng Việt + nguồn hồ sơ SEC (#148), Google News thành nguồn tin thứ ba (#149), thêm chỉ số kỹ thuật/IV của tab Analyze (#151), sửa nhãn 424B + đọc body 503 (#153), cảnh báo sự kiện thời gian thực cho vị thế nắm + watchlist (#155). tiêu đề báo chí thành tầng cảnh báo thứ BA + tự phân loại cái 503 của Google (#157). probe X cho cảnh báo mã đang nắm (#159). sửa lại mô hình giá X sau ảnh chụp của chủ app (#161) — X giờ TRẢ THEO LƯỢNG DÙNG chứ không phải gói tháng. **MỚI: chủ app tự chạy `/api/xprobe`, cả ba câu quyết định đều đo được, tầng cảnh báo X đã BẬT THẬT (#162) — tầng thứ tư, nhanh nhất, chạy chung nhịp 15 phút với 8-K.**

**ĐÃ XÁC NHẬN Ở PRODUCTION (#153):** câu trả lời RA TIẾNG VIỆT; mã mục 8-K giải mã đúng và được dùng thật; hỏng-độc-lập chạy đúng (Claude tự nói "Google News 503 nên phần tin báo chí bị thiếu, ở đây tôi bị mù một phần"). **CÒN TREO:** Google News trả **503** từ Render — chưa biết là sập tạm hay chặn dải IP trung tâm dữ liệu; #153 đã cho lỗi mang theo BODY nên lần bấm tới sẽ nói ra (trang chặn của Google viết thẳng "unusual traffic from your computer network"). Chủ app bấm lại một lần nữa là đủ để quyết: thử-lại-được hay phải bỏ hẳn Google News.

**SPX: the "entitlement" conclusion was WRONG and has been corrected (#108).** The owner's thinkorswim screen, same account, 26 minutes after the API reading, shows **real open interest** on the same contracts (7800C = 5,671 while the API said 0). Open interest is exchange data, not computed locally — so the account has the data and `/marketdata/v1/chains` is not returning it. This is a Schwab **API defect** for `assetMainType=INDEX`, reported to `traderapi@schwab.com`, not something to buy. Do not restart the symbol-spelling hunt; the measurement was never the problem, the interpretation was. Full correction at the top of the GEX section.

**Known gaps nobody has claimed** (not in-progress work - listed here so the
next session can pick one up rather than rediscovering it):

- README has an Insider Trade row in the tab table but **no section of its
  own**, unlike every other tab. So code-P-only filtering, the 10b5-1
  exclusion, and "UW is paid and self-disables without a key" are documented
  in this file for Claude but nowhere for the person using the app.
- ~~Congress disclosure lag shown only as the legal "30-45 days".~~ **Closed
  by #133**: the tab now measures the lag from the records actually on screen
  (transaction date → filing date), prints the median above the table and per
  symbol in its own column, and names 30-45 as the statutory *ceiling* rather
  than the observed number. The original observation is why it was worth
  doing: sampling 250 recently-disclosed records gave a Senate **median of
  116 days**, and **0 of 250** were trades from the last 7 days.
- SPX-in-GEX, latest state: Schwab is **not** a dead end after all. Chasing
  symbol spellings (#86-#91) was chasing the wrong thing - once the real
  error text was surfaced, SPX started returning `502 {"faultstring":"Body
  buffer overflow","errorcode":"protocol.http.TooBigBody"}`, which means
  Schwab accepted the symbol and its own gateway then refused the response
  for being too large. SPX expires almost every trading day, so 60 days ×
  every strike is tens of thousands of contracts; ordinary equities never
  come close. #92 answers that by narrowing the request instead
  (`fullChainAdaptive`: 60d/all → 21d/120 strikes → 7d/60 strikes, stopping
  at the first that fits), keeping the UW levels fallback only for when even
  the narrowest request is refused. Open question for whoever picks this up:
  the earlier `400 "Check Param Values"` responses are still unexplained -
  same symbol, different error, so something changed between then and now
  (a Schwab-side fix, or the 400 was itself a symptom of size). Worth
  watching whether 400s come back.

### Recent work (snapshot, not live truth - see the rule above)

Whichever session finishes a PR should append one line here, newest on top,
before signing off - not a full changelog, just enough that the *other*
account skimming this file sees roughly where things stand without a live git
check. Trim entries once they are clearly old news (a dozen or so is plenty).

- 2026-09-18 — #174 **`CBOE:VIX` cũng hỏng, kiểu thứ HAI — nên thôi đoán, đưa nút đổi mã lên màn hình.** Chủ app gửi ảnh: widget NHẬN RA `CBOE:VIX` (tiêu đề in "CBOE:VIX · 5") rồi bật hộp "Mã giao dịch này chỉ có trên TradingView" — dữ liệu CBOE bị giữ cho trang chính, widget nhúng không được vẽ. Cộng thêm: "vold không coi được khung 1m hay 5m" — biểu thức trừ `USI:UVOL-USI:DVOL` vẽ được nhưng KHÔNG có nến trong ngày trong widget miễn phí, mà trong ngày là toàn bộ lý do ô đó tồn tại. Tức ba lần đo là ba cách hỏng khác nhau (Apple / "chỉ có trên TradingView" / không khung phút), không cái nào là "invalid symbol", và mỗi lần đoán tốn một deploy + một ảnh. **Sửa bằng cấu trúc**: mỗi ô mang DANH SÁCH mã ứng viên + hàng nút chọn-một (dùng lại CSS `.chiprow`, cố ý KHÔNG dùng component `ChipRow` vì đó là chọn-nhiều — hai hàng nút giống nhau mà hành xử khác là bẫy ChipRow được tách ra để tránh); lựa chọn nhớ RIÊNG từng ô qua `remember()` (#110), chỉ nhận giá trị còn trong danh sách ứng viên (một mã đã bị gỡ vì đo được là hỏng không được sống dậy từ bộ nhớ cũ). `key={symbol}` trên iframe để đổi mã là dựng iframe MỚI — chỉ đổi `src` thì widget giữ hộp thoại của mã trước. Ứng viên hiệu số ưu tiên mã ĐƠN của TradingView (`USI:VOLD`/`USI:ADD`/`USI:ADDQ`, cùng họ với `USI:PCCE` đã đo chạy tốt ở 5m), biểu thức trừ làm đường lùi; VIX: `TVC:VIX` và `CBOE:VIX` bị loại, còn `CAPITALCOM:VIX`/`FOREXCOM:VIX`/`SP:VIX`/`VIX` chưa đo — đưa hết lên nút. `s.tradingview.com` vẫn 403 CONNECT từ sandbox nên không mã nào xác nhận được từ đây; phép đo giờ diễn ra ở đúng chỗ đo được — trình duyệt chủ app — và không tốn deploy. Đo thật trong trình duyệt (2 theme × 1280/400, tradingview.com bị chặn giả lập): 8 ô, số nút đúng từng ô (2/2/2/0/0/0/4/0), bấm nút đổi đúng `src` iframe và dòng mã in dưới ô, tải lại trang vẫn nhớ, nút sáng đúng `--stamp` ở cả hai theme, dòng cảnh báo đúng `--warn`, không tràn khung nhìn ở 400px. Touches TradingViewInternals.tsx, i18n (`int.tvFallback` viết lại, thêm `int.tvPick`).
- 2026-09-18 — #173 **Ô VIX trong khung TradingView hiện APPLE — và lời hứa "mã sai thì hỏng to" trong #168 là SAI.** Chủ app: "Vix sao lại ra apple, vix trong schwab có mà?". VIX của Schwab (chế độ "Số liệu app") vẫn đúng; ô hỏng là ô nhúng TradingView với `TVC:VIX`. Đo được từ chính màn hình chủ app: widget nhúng KHÔNG in "invalid symbol" như chú thích cũ khẳng định, nó LẶNG LẼ rơi về mã mặc định NASDAQ:AAPL và vẽ một biểu đồ hoàn chỉnh đúng theme — tức đúng cái bẫy "đoán sai ra thứ sai trông y như thứ đúng" mà #168 tưởng đã né. Đổi sang `CBOE:VIX` (vẫn là phỏng đoán, `s.tradingview.com` bị chặn 403 CONNECT từ sandbox), sửa hai chú thích sai thành phép đo thật, và thêm `int.tvFallback` nói thẳng với người dùng: ô hiện CỔ PHIẾU thay vì chỉ báo nghĩa là chuỗi mã in dưới ô đó sai — dòng mã in dưới ô giờ là dấu hiệu DUY NHẤT vì iframe khác origin không cho app tự so. Chỉ typecheck + build; cần chủ app xác nhận ô VIX hiện VIX. Touches TradingViewInternals.tsx, i18n (chỉ thêm).
- 2026-09-19 — #162 **Tầng cảnh báo X BẬT THẬT — probe đo xong, cả ba câu quyết định đều trả lời CÓ.** Chủ app tự lấy token rồi chạy `/api/xprobe` ở production, dán JSON về. Đo được: cashtag `$AAPL OR $TSLA OR $NVDA` ra 10 bài, **cả 10 đều mang `entities.cashtags` do CHÍNH X gắn (10/10)** — tìm thẳng theo mã là đường đúng, không cần đường lùi "bám danh sách tài khoản". `since_id` được TÔN TRỌNG (hỏi lại → đúng 0 bài). Trần câu truy vấn ĐO được là **512 ký tự** — đúng con số đã đặt sẵn từ #159 (chưa đo lúc đó, giờ khớp). Hạn mức `project_cap` 3.000.000, đang dùng 0. **Kiến trúc: MỘT câu truy vấn cho NHIỀU mã, không phải một request/mã** — khác hẳn tầng báo chí (Yahoo bắt hỏi TỪNG MÃ); X cho gộp `$A OR $B OR $C` trong một request, nên `cashtagBatches()` (mới, trong xnews.ts) nhét càng nhiều mã càng tốt vào mỗi câu ≤512 ký tự, cả watchlist chỉ tốn vài LÔ. Vì vậy **không cần giãn nhịp theo tick như tầng báo chí** — Yahoo tốn 1 request/mã nên phải giãn còn ~60 phút, X đã rẻ sẵn nhờ gộp lô nên chạy CHUNG NHỊP 15 phút với 8-K, đúng cũng là lý do X đáng làm: ưu thế duy nhất của nó là NHANH hơn báo chí. **`since_id` là một con số TOÀN CỤC, không theo từng lô** — ID của X tăng dần theo thời gian trên TOÀN NỀN TẢNG (snowflake id), nên lưu since_id theo từng lô sẽ vỡ ngay khi watchlist đổi kích thước làm mã rơi vào lô khác giữa hai lượt chạy; một con số dùng chung cho mọi lô mới đúng. **Cửa sổ 90 phút (`X_FRESH_MS`) vẫn chặn LƯỢT ĐẦU TIÊN** dù chưa có since_id — không có nó thì X trả bài 7 ngày gần nhất cho MỌI mã theo dõi, có thể là hàng trăm bài toàn chuyện cũ; mất file since_id (redeploy) chỉ khiến lượt kế tiếp bị coi là lượt đầu, AN TOÀN vì cửa sổ vẫn chặn — đúng lý do file lưu ở `.cache/`, không cần `/var/data`. **DÙNG LẠI bảng từ khoá của tầng báo chí (`pressSeverity()`), không viết bảng thứ hai** — bảng đó đã đo và sửa ba lỗi im lặng ở #157 (chia động từ, rụng `e` câm, từ đệm); viết bảng riêng cho X là lặp lại đúng ba lỗi đó từ đầu, và bài trên X ít trang trọng hơn báo chí nhưng sự kiện KHẨN vẫn dùng đúng những từ đó. **Vẫn là bài đăng chưa kiểm chứng — yếu hơn cả tầng báo chí**: 8-K là công ty tự khai bắt buộc, báo chí có biên tập, một bài trên X là người dùng bất kỳ gõ không ai kiểm trước — nên mang nhãn `[X]` và thân nói thẳng điều đó. Nối vào `collectEventAlerts()` như nguồn thứ TƯ qua `allSettled`, cùng khuôn SEC/giá/báo chí: một tầng hỏng không được kéo mất tầng khác — test ghim cả hai chiều (X chết → 8-K vẫn sống; SEC chết → X vẫn sống). `report.xConfigured` tách riêng khỏi "đã hỏi và không có gì", đúng luật "chưa biết không được trông giống không có gì" — X tự tắt như UW/Telegram/web push khi chưa đặt `X_BEARER_TOKEN`. 64 khẳng định độc lập (`cashtagBatches` phủ hết không bỏ mã nào, cửa sổ tươi/mã trần không khớp/trần mỗi mã/trần mỗi lượt/khoá ổn định, `since_id` đi vòng qua file thật, một lô hỏng không xoá lô khác, token không bao giờ lộ ra lỗi, bốn nguồn hỏng độc lập cả hai chiều) + typecheck + build. Không biến môi trường bắt buộc mới: `X_BEARER_TOKEN` tự tắt cả tầng khi chưa đặt, `X_SINCE_PATH` tuỳ chọn. Touches liveevents.ts, xnews.ts (thêm `cashtagBatches`), AlertSettings.tsx, i18n (chỉ thêm), README, DEPLOY.md, .env.example; mới lib/xalerts.ts.
- 2026-09-18 — #161 **Ảnh chụp của chủ app lật mô hình giá X mà #159 vừa ghi — docs, không đụng code chạy.** Chủ app xin link mua X API, tôi đưa link kèm câu "đây là tôi NHỚ chứ không đo được" (cả bốn host X đều bị chặn 403 CONNECT từ sandbox), chủ app mở rồi gửi ảnh về. **Và trí nhớ của tôi sai ở đúng chỗ quan trọng nhất**: trang đó giờ bán **X API — Pay-per-use** (tín dụng, KHÔNG cam kết, trả đúng phần đã dùng) và **Enterprise**, chứ không phải mấy bậc tính theo THÁNG mà #159 đã ghi vào ba file. **Đây là tin tốt và nó đổi hẳn cách quyết định**: mô hình tháng bắt phải trả lời "có đáng tiền hằng tháng không" TRƯỚC khi đo được gì; trả-theo-lượng-dùng thì nạp một ít tín dụng, chạy probe, đọc chi phí thật rồi mới mở rộng — rủi ro lớn nhất của cả việc này biến mất, và nó cũng đúng luật repo (đo trước, code sau) ở tầng tiền bạc chứ không chỉ tầng dữ liệu. **Một con số trên trang đó rất dễ đọc nhầm và đọc nhầm là tốn tiền**: "$0.001 mỗi tài nguyên" là giá **Owned Reads** — đọc dữ liệu của CHÍNH MÌNH (bài mình đăng, bookmark, follower, like) — và chính trang đó gọi đó là giá GIẢM; thứ tính năng này cần là đọc bài NGƯỜI KHÁC nói về mã mình nắm, một mức giá khác và cao hơn. Đã ghi cảnh báo đó vào cả DEPLOY.md lẫn README. **`since_id` từ "quan trọng" thành QUAN TRỌNG HƠN, chứ không nhẹ đi**: một hạn mức tháng ít ra còn TỰ DỪNG khi cạn; trả-theo-lượng-dùng mà đọc lại cùng đống bài cũ là tiền chảy ra liên tục, không trần nào chặn. **Bước `usage` của probe được nói thật về chính nó**: nó hỏi `/2/usage/tweets`, endpoint của mô hình CŨ, nên với gói mới có thể trả 404/403 — và đó KHÔNG phải lỗi, chính lời từ chối là phát hiện (số dư phải đọc chỗ khác); `step()` vốn đã giữ nguyên trạng thái thật nên không phải sửa code, chỉ phải thôi hứa sai trong tài liệu. **Luật "không chép con số giá vào runbook" nay có biên lai**: #159 cố ý không ghi giá và đúng một ngày sau thì X đổi hẳn MÔ HÌNH, chứ không chỉ đổi con số — một giá nhớ nhầm nằm trong tài liệu triển khai trông y hệt một giá đã kiểm. Câu QUYẾT ĐỊNH vẫn nguyên và vẫn chưa đo được: toán tử `$AAPL` (cashtag) có dùng được ở gói này không. Chỉ docs + chú thích; `npx tsc --noEmit` + build; không đổi một dòng hành vi nào. Touches DEPLOY.md, README.md, CLAUDE.md, .env.example, xnews.ts (chú thích), xprobe route (chú thích).
- 2026-09-18 — #159 **Probe X trước khi mua X: CHƯA có tính năng, và đó là chủ ý.** Chủ app: "Tôi muốn tin tức cảnh báo từ x cho những stock tôi đang nắm giữ". **Đây đúng là chỗ X đáng tiền, và #155 đã nói trước như vậy**: ưu thế duy nhất của X là nhanh hơn báo chí vài chục phút — thứ không đổi được quyết định mua-và-giữ (nên #155 từ chối X cho tab Đầu tư dài hạn) nhưng đổi được quyết định trên một vị thế đang mở. **X là host CÓ KEY nên luật repo là đo ở production trước**, đúng khuôn #127 (tastytrade): đo hôm nay thì `api.x.com`, `api.twitter.com`, `developer.x.com`, `docs.x.com` đều bị từ chối 403 ở CONNECT, nên KHÔNG một chữ nào về X xác nhận được từ sandbox — và viết code theo tài liệu nhớ được đã sai ba lần ở repo này (`congress-trader` mặc định `name`, `gex-levels` toàn chuỗi, cách gắn header của tastytrade). **Bốn câu probe phải trả lời, và câu ĐẦU là kiến trúc chứ không phải chi tiết**: (1) toán tử `$AAPL` có dùng được ở gói của chủ app không — có thì tìm thẳng theo mã, KHÔNG thì phải bám DANH SÁCH TÀI KHOẢN (`from:`) rồi lọc mã trong app, tức một tính năng khác cần chủ app tự chọn danh sách; nên CẢ HAI kiểu câu truy vấn đều được viết sẵn và probe thử cả hai, và một cái 403 ở đây KHÔNG phải lỗi của probe mà CHÍNH LÀ câu trả lời. (2) hạn mức THÁNG còn bao nhiêu — X tính theo SỐ BÀI ĐỌC mỗi tháng chứ không phải số request, nên đó mới là con số quyết định rẻ hay đắt. (3) `since_id` có được tôn trọng không — đây là CƠ CHẾ giữ chi phí xuống: hỏi lại mà không có bài mới phải ra 0 bài; bị bỏ qua thì mỗi lượt đọc lại cùng đống bài cũ và hạn mức tháng bốc hơi trong vài ngày. (4) trần độ dài câu truy vấn — ĐO bằng cách gửi hẳn một câu dài quá mức rồi đọc lời từ chối của chính X, không đoán con số. **An toàn: CHỈ token app-only, không bao giờ token người dùng** — app-only chỉ đọc và KHÔNG ĐĂNG ĐƯỢC BÀI, token người dùng thì đăng được dưới tên chủ app, mà token nằm trong bảng env của Render: rò cái đầu là mất vài dòng tin vốn đã công khai, rò cái sau là người lạ đăng bài dưới tên chủ app — đúng lập luận least-privilege đã ghi cho scope `read` của tastytrade. `/api/xprobe` nằm trong OWNER_ONLY vì mỗi lượt bấm ĂN VÀO hạn mức tháng chủ app trả tiền, và một test ghim rằng câu trả lời KHÔNG BAO GIỜ chứa token. **Ba cái bẫy xử trước, mỗi cái đã trả giá một lần ở đây**: 401 kèm JSON (giấy tờ bị từ chối) tách hẳn khỏi 401 kèm HTML (chặn ở rìa, request chưa từng tới API) — đoán nhầm chỗ này từng tốn cả buổi (#130); một cái 200 VẪN có thể mang `errors` từng phần, đọc `data` rồi bỏ qua chúng là biến "một nửa bị từ chối" thành "không có gì"; và `symbolsIn()` KHÔNG BAO GIỜ khớp mã trần, chỉ khớp `$CASHTAG` hoặc TÊN công ty — ALL/ON/IT/NOW/KEY vừa là mã vừa là từ thông dụng, mà trên X văn viết là văn nói nên "it is all on now" sẽ báo ba mã (test ghim cả bản viết HOA). Header hạn mức thiếu đọc thành `null` chứ không `0`: "không biết còn bao nhiêu" và "đã hết sạch" cần hai hành động ngược nhau. **Cố ý KHÔNG ghi con số giá vào DEPLOY.md**: giá và danh sách toán tử của X đổi luôn, mà một con số nhớ nhầm trong tài liệu triển khai trông y hệt một con số đã kiểm — runbook chỉ nói phải tìm đúng HAI dòng nào trên trang giá của X trước khi trả tiền (`recent search` có trong gói không, và toán tử cashtag có không). 65 khẳng định độc lập + typecheck + build. Không đụng một đường cảnh báo nào; không có `X_BEARER_TOKEN` thì mọi thứ tự tắt như UW/Telegram/web push. Touches users.ts (một dòng OWNER_ONLY), .env.example, DEPLOY.md, README; mới lib/xnews.ts, api/xprobe.
- 2026-09-18 — #157 **Tiêu đề báo chí thành tầng cảnh báo thứ BA, và cái 503 của Google giờ tự phân loại.** Chủ app: "thêm tiêu đề báo chí vô đi, va Google new chưa work". **Tầng riêng chứ không trộn vào 8-K, và lý do là BẰNG CHỨNG**: 8-K là chính công ty bị luật bắt buộc khai, tiêu đề báo là bên thứ ba viết về công ty — nhanh hơn (phóng viên không phải chờ hết hạn nộp hồ sơ) nhưng yếu hơn hẳn, có thể là tin đồn hoặc bài suy diễn; nên mỗi cảnh báo mang nhãn `[Báo chí]` ngay đầu tiêu đề và thân nói thẳng đây không phải công ty tự khai. **Mặc định của tin tức là ỒN nên ba cổng, và chúng mới là tính năng**: (1) chỉ bài riêng MỘT mã — Yahoo tự gắn `relatedTickers` nên đây là số ĐO ĐƯỢC, bài gắn nhiều mã gần như luôn là bản tin thị trường; cố ý KHÔNG nới cổng này cho tin nặng, vì chuyện thật sự nghiêm trọng thì tầng 8-K bắt được, và hai tầng che cho nhau chính là lý do có hai tầng. (2) danh sách từ khoá CHO PHÉP, cùng khuôn `MATERIAL_ITEMS`; bộ `urgent` được DẪN RA từ chính bốn mục 8-K khẩn chứ không tự nghĩ (phá sản, khai lại báo cáo tài chính, an ninh mạng, huỷ niêm yết) cộng ngừng giao dịch; không khớp thì ĐẾM chứ không gửi. Cố ý vắng mặt: `plunge`/`soar` (tầng giá đã báo rồi — cho vào là rung điện thoại hai lần cho cùng một chuyện) và `upgrade`/`downgrade` (nhà phân tích đổi khuyến nghị gần như mỗi ngày). (3) trần 5 cảnh báo mỗi lượt, mỗi mã nhiều nhất một. **CHỈ Yahoo, và hai nguồn kia bị loại vì hai lý do khác nhau**: hồ sơ SEC thì tầng 8-K đã đọc bằng MỘT feed chung, còn `secFilingNews()` hỏi TỪNG MÃ và KHÔNG cache; Google News thì **không gắn mã cho bài** nên cổng 1 không áp được — một tiêu đề khớp từ khoá mà không ai xác nhận nó nói về công ty NÀY là một thông báo có thể báo nhầm công ty. **Chạy bất kể giờ** (tin quan trọng nhất ra sau khi sàn đóng) nhưng **giãn còn 1 trong 4 tick (~60 phút)** vì Yahoo tốn 1 request MỖI MÃ — đúng hình dạng đã đốt sạch hạn mức UW của dark pool; **cửa sổ 90 phút khiến nhịp giãn đó KHÔNG mất bài nào**. `pressRan` tách "lượt này chưa hỏi" khỏi "đã hỏi và không có gì" — gộp lại là để mấy con số 0 nói dối. **Ba lỗi THẬT do test bắt, cả ba đều nằm trong bộ so khớp từ khoá và cả ba đều im lặng**: `recall` không khớp "recalls" (tiêu đề tiếng Anh gần như luôn chia động từ, tức cổng lọc bỏ sót phần lớn tiêu đề thật); `probe` không khớp "probing" (rụng `e` câm); `cut dividend` không khớp "cuts ITS dividend" (tiêu đề thật hay chèn từ đệm). Luật chèn cố ý giữ CHẶT — nhiều nhất hai từ ≤4 chữ cái — nên "cut costs to fund dividend" và "new products ceo says" vẫn không khớp; chỗ chặt quá làm mất một tiêu đề thật ("FDA delays approval", từ chèn 6 chữ) thì sửa bằng một TỪ KHOÁ TƯỜNG MINH chứ không nới luật: nới một lần cho một tiêu đề là biến danh sách có chủ đích thành lưới bắt bừa, mà một cảnh báo sai trông y hệt cảnh báo đúng. **Google 503 giờ được ĐỌC HỘ**: #153 đã cho lỗi mang theo body nhưng vẫn bắt người đọc tự kết luận; `classifyGnewsBody()` tự phân loại vì trang chặn của Google tự xưng tên ("unusual traffic from your computer network") — đo ra `blocked` thì nghỉ hỏi 6 tiếng và nói thẳng đó là quyết định của APP chứ không phải câu trả lời của Google (một dòng lỗi lặp vô hạn là một dòng lỗi bị bỏ qua), 6 tiếng chứ không vĩnh viễn để app tự hồi phục nếu hoá ra Google chỉ chặn theo nhịp; không khớp chữ nào thì vẫn `unavailable` và vẫn thử lại — **không đoán**. Thứ tự trường: trạng thái → kết luận → trích body, vì chuỗi bị cắt ở 200 ký tự (#102). **Cố ý CHƯA thêm nguồn gom tin thay thế**: đo lại hôm nay thì `news.google.com`, `query1.finance.yahoo.com`, `feeds.finance.yahoo.com` và `www.bing.com` đều bị proxy từ chối 403 ở CONNECT — kể cả Yahoo, nguồn ĐANG CHẠY THẬT ở production; nên chồng một nguồn mù nữa lên một nguyên nhân chưa đo chính là thứ repo này liên tục bị bỏng, và làm thế ngay trong PR sửa phép chẩn đoán thì càng lạ. 85 khẳng định độc lập + typecheck + build. Không biến môi trường mới, không bước deploy. Touches liveevents.ts, alert-runner.ts, news.ts (chỉ xuất thêm `yahooNews`), gnews.ts, AlertSettings.tsx, i18n (chỉ thêm), README; mới lib/pressalerts.ts.
- 2026-09-18 — #155 **Cảnh báo thời gian thực: có chuyện gì đang xảy ra với mã đang nắm.** Chủ app hỏi trước "lấy tin từ X thì làm sao" — tôi đo được cả bốn host của X đều bị chặn từ sandbox, nói thẳng là **với tab Đầu tư dài hạn thì X không đáng tiền** (ưu thế của nó là nhanh hơn báo chí vài chục phút, mà tiền mua-và-giữ không đổi quyết định vì 30 phút), và chỉ ra chỗ X *thật sự* đáng tiền là một tính năng KHÁC mà app chưa có: cảnh báo thời gian thực cho vị thế. Chủ app chọn đúng cái đó. **Và hoá ra không cần X**: mọi cảnh báo cũ đều tính từ giá/greek/ngày tháng, không cái nào đọc được sự kiện doanh nghiệp — còn **8-K là chính công ty bị luật bắt buộc khai sự kiện trọng yếu, tức NGUỒN GỐC chứ không phải bài viết về nguồn gốc**, miễn phí và không cần key. **ĐO chứ không nhớ**: `browse-edgar?action=getcurrent&type=8-K&output=atom` trả 8-K mới nhất của TOÀN THỊ TRƯỜNG trong MỘT request (đúng khuôn "một feed chung, lọc trong app" của tab Quốc hội, rẻ hơn hẳn hỏi từng mã vì `recentFilings` KHÔNG cache) — `count=100` ra 100 dòng/72 KB ổn định, `count=400` vẫn 100 nên 100 là TRẦN, 100 dòng phủ **17h30m** còn 20 dòng mới nhất phủ 1h09m, CIK bóc được 100/100, mã mục có mặt 100/100. Feed này cho **hai thứ `filings.recent` KHÔNG có và cả hai load-bearing**: dấu thời gian tới PHÚT (kia chỉ có ngày — không có phút thì không làm được cảnh báo thời gian thực) và TÊN MỤC do chính SEC viết (nên bảng `EIGHT_K_ITEMS` của ta không thể cũ đi). **Chạy parser trên feed THẬT lòi ra ba lỗi, một cái nghiêm trọng**: SEC escape `<summary>` thành HTML và ngăn các mục bằng `&lt;br&gt;`, giải mã xong thì chúng thành THẺ THẬT nằm giữa văn bản nên regex chỉ bóc được mục CUỐI CÙNG — đo được 100 dòng ra đúng 100 mã mục, tức MỌI hồ sơ nhiều mục đều bị cắt; hệ quả là một 8-K `2.02,9.01` (công bố kết quả kinh doanh) bóc thành mỗi `9.01` → không trọng yếu → **KHÔNG BÁO**, tức cảnh báo giá trị nhất bị giết lặng lẽ. Gỡ thẻ SAU khi giải mã: 225 mã mục trên cùng 100 dòng, 75 hồ sơ nhiều mục, hồ sơ trọng yếu 9→48. Cùng lỗi đó giấu số hồ sơ sau `</b>` (0/100 → 100/100) và để CIK dính trong tên công ty. **Cửa sổ 90 phút KHÔNG phải để tiết kiệm — nó chặn một lỗi báo-lại có thật**: chống lặp khoá theo NGÀY GIAO DỊCH và `prune()` xoá khoá ngày cũ, nên một 8-K nộp tối thứ Sáu sẽ thành "chưa gửi" khi sang ngày mới và báo lại; chỉ hồ sơ trong 90 phút mới được báo thì điều đó bất khả. **Cổng giờ giao dịch đổi từ "chặn cả lượt chạy" thành "quyết định nguồn nào chạy"**: cảnh báo danh mục giữ NGUYÊN hành vi cũ, cảnh báo 8-K chạy bất kể giờ vì **8-K phần lớn nộp SAU khi sàn đóng** — ba chỗ khác trong repo (Form 4, lịch earnings, Quốc hội) đã đứng ngoài `runOnce()` vì đúng lý do này. Hai nửa **hỏng độc lập** qua `allSettled`: phiên Schwab hết hạn không còn nuốt mất cảnh báo SEC, và ngược lại (trước đây một cú ném từ `collectAlerts()` giết cả lượt). **Yên tĩnh có chủ đích**, theo đúng luật sẵn có của `alerts.ts` ("một hộp thư kêu suốt là một hộp thư bị bỏ qua"): danh sách CHO PHÉP chứ không loại trừ, bốn mục khẩn (1.03 phá sản, **4.02 báo cáo tài chính cũ không còn đáng tin**, 1.05 an ninh mạng, 3.01 huỷ niêm yết); mục thủ tục (5.07, 9.01, 7.01, 8.01) bị ĐẾM chứ không gửi, mã lạ không bao giờ báo theo phỏng đoán nhưng hiện thành một CON SỐ trên màn hình. Giá chạy ≥7% (≥12% khẩn), hai bậc khoá RIÊNG nên rớt 7% rồi rớt tiếp thành 14% thì cả hai đều tới được điện thoại. Hai câu chữ đã thành SAI được sửa (`al.closed` và README đều nói "ngoài giờ không kiểm tra") — bẫy #136. 66 khẳng định trong hai script + chạy parser trên feed EDGAR thật. Không biến môi trường mới, không bước deploy. Touches alert-runner.ts, AlertSettings.tsx, i18n (chỉ thêm), README; mới lib/liveevents.ts.
- 2026-09-18 — #153 **Phép đo production đầu tiên của #148/#149: xác nhận ba thứ, và CHÍNH CLAUDE bắt được một lỗi thật trong code của tôi.** Chủ app bấm nút ở production rồi dán câu trả lời về. **Xác nhận chạy đúng**: (1) câu trả lời RA TIẾNG VIỆT — neo ngôn ngữ #148 hiệu quả; (2) mã mục 8-K được giải mã và dùng thật ("Item 8.01 sự kiện khác", "Item 5.02 departure or appointment of directors"); (3) hỏng-độc-lập chạy đúng như thiết kế — Claude nói thẳng "Google News trả về lỗi 503 nên phần tin báo chí bị thiếu, ở đây tôi bị mù một phần" thay vì đọc một nguồn chết thành "không có tin gì xấu". **Lỗi Claude bắt được, và nó ĐÚNG**: nó viết "nhãn pha loãng này do công cụ tự suy ra, không được kiểm chứng; các bản 424B thường cũng được dùng cho phát hành nợ." Code cũ khẳng định `a share offering has been priced (dilution)` cho MỌI 424B. **ĐO trên `data.sec.gov`**: Bank of America 10.626/11.416 dòng là 424B (**93%**), Morgan Stanley 16.716/19.909 (**84%**), NVIDIA đúng 4/1.001 (0,4%). Phiếu của Morgan Stanley đánh số tới **"PRICING SUPPLEMENT NO. 18,867"** — chương trình phát hành TRÁI PHIẾU trung hạn; nhãn cũ gọi từng cái trong số đó là pha loãng cổ đông, tức một lời khẳng định SAI về cấu trúc vốn của công ty thật, ở quy mô hàng chục nghìn hồ sơ. Giờ nói đúng thứ biết được và nói thẳng thứ không biết: bảng kê hồ sơ KHÔNG cho biết cổ phiếu hay trái phiếu. **Lỗi thứ hai, cùng lúc đo ra, và đúng cái bẫy repo đã tránh được một lần**: 424B chiếm 84-93% bảng kê của một ngân hàng, trong khi Form 4 bị loại khỏi nguồn tin này vì nhấn chìm mọi thứ ở 591/1001 (59%) — 424B TỆ HƠN mà vẫn được thả vào, nên với mọi mã ngân hàng cả 4 chỗ đều là phiếu chào giá và MỌI 8-K thật bị đẩy ra. Chặn ở **1 bản cáo bạch**; test dựng lại đúng tỷ lệ BAC (200 phiếu + 3 cái 8-K) và cả 3 cái 8-K giờ đều lọt, trước là 0. **`primaryDocDescription` load-bearing ở đây**: #148 đo được nó VÔ DỤNG với 8-K (chỉ chép lại "8-K") nhưng với 424B nó mang "PRICING SUPPLEMENT"/"PRODUCT SUPPLEMENT" — chữ ký chương trình trái phiếu; cùng một trường, vô dụng ở loại này và quyết định ở loại kia. **Google 503 — bộ đo của tôi thiếu đúng thứ cần biết**: `if (!r.ok) throw` NÉM TRƯỚC KHI ĐỌC BODY, nên phần "in ra thứ thật sự nhận được" của #149 không bao giờ chạy ở nhánh này. Một cái 503 của Google có HAI nghĩa dẫn tới hai cách sửa NGƯỢC nhau (sập tạm → thử lại được; chặn dải IP trung tâm dữ liệu → thử lại vô ích vĩnh viễn) và CHỈ BODY nói ra được, vì trang chặn viết thẳng "unusual traffic from your computer network". Giờ body được đọc và cắt gọn vào lỗi, trạng thái đứng TRƯỚC để cú cắt 200 ký tự không ăn mất nó (#102). **Cố ý CHƯA thêm retry** — chồng một cách chữa đoán mò lên một nguyên nhân chưa đo chính là thứ repo này liên tục bị bỏng. Vết nhỏ được test lôi ra: mục 9.01 có nghĩa rõ ràng và `BOILERPLATE` đã gọi đúng tên nó, nhưng đứng một mình thì in "app chưa biết nghĩa" — app nói dối về chính bảng tra của nó; đã thêm vào bảng, vẫn bị bỏ khi có mục khác. 42 khẳng định trong ba script. Touches sec.ts (chỉ thêm `primaryDocDescription`), secnews.ts, gnews.ts.
- 2026-09-18 — #151 **Nút "Tại sao rớt?" giờ có thêm chỉ số kỹ thuật/IV của tab Analyze.** Chủ app hỏi trước "longterm hỏi claude có tự search giống analysis không" (đáp: KHÔNG, cả hai đều không có `tools`, chỉ đọc dữ kiện code đã lấy sẵn), rồi đặt hàng thẳng: "lấy thêm thông tin bên tab analysis nữa". Tab Đầu tư dài hạn tự nó chỉ tính SMA200 + vùng hỗ trợ, không có RSI/MACD/Bollinger/ATR/biến động thực tế/ẩn ý - toàn bộ mảng đó nằm ở route Analyze. **Bóc phần tính đó ra `lib/technical.ts` (`technicalSnapshot()`), dùng CHUNG cho cả `/api/analyze` lẫn `/api/longterm/why`**, đúng bài học #96/#99/#147 lặp lại lần thứ tư: hai đường tính song song sẽ trôi lệch, và ở đây trôi lệch đặc biệt lộ liễu - người dùng mở CẢ HAI tab cho cùng một mã sẽ thấy hai con số RSI khác nhau trả lời cùng một câu hỏi trong cùng một phiên. `/api/analyze/route.ts` giờ chỉ là vỏ mỏng cộng thêm earnings/tin tức/Finviz/hồ sơ FMP - hành vi giữ NGUYÊN VẸN (cùng 3 request Schwab song song, cùng hình dạng JSON, cùng cách chia 401/404/500: hai điểm `return 404` cũ giờ là `throw` trong `technicalSnapshot`, route ngoài dò tên lỗi để trả lại đúng mã cũ). `/api/longterm/why` gọi `technicalSnapshot()` SONG SONG với lấy tin qua `Promise.allSettled`, và **hỏng độc lập** - phiên Schwab hết hạn không được làm mất phần tin tức đã lấy, và ngược lại; thiếu thì nói rõ lý do thật (REAUTH_REQUIRED, không đủ lịch sử giá...), không bao giờ để trống - trống bị Claude đọc thành "không có gì đáng nói", đúng bẫy `gexError` trong airead.ts. **Cố ý KHÔNG gọi lại Finviz hay tin tức**: Long-term đã có Finviz riêng từ chính lượt quét (`row.fa`) và tin tức riêng từ `news.ts` - gọi lại chỉ tốn thêm và có thể ra một con số LỆCH với con số đã hiện ngay trên bảng bên cạnh. **Prompt dặn dùng phần kỹ thuật làm MÀU SẮC BỔ SUNG, không phải NGUYÊN NHÂN**: RSI/MACD/IV là thứ thị trường đang định giá NGAY BÂY GIỜ, không phải lý do cổ phiếu rớt - tin tức và nền tảng doanh nghiệp vẫn là bằng chứng chính cho câu "vì sao"; không có câu này thì Claude rất dễ đọc "RSI 28 quá bán" thành một LÝ DO rớt giá thay vì một TRIỆU CHỨNG của nó. 20 khẳng định độc lập + typecheck + build. Không biến môi trường mới, không bước deploy. Touches ltwhy.ts, api/analyze/route.ts, api/longterm/why/route.ts, README; mới lib/technical.ts.
- 2026-09-18 — #149 **Google News thành nguồn tin thứ ba, và Reddit cố ý chưa làm.** Chủ app: "tôi muốn tin tức tại sao rớt, còn reddit thì sao". **Google News RSS** miễn phí, không cần key, không cần đăng ký — và nó không phải MỘT toà báo mà là bộ gom tin của hàng trăm toà báo. Có mặt vì hai lý do đo được: Yahoo một mình là MỘT điểm chết duy nhất, và Yahoo chỉ trả bài mà CHÍNH NÓ gắn `relatedTickers`, nên bài nào Yahoo không gắn mã là bài app không bao giờ thấy. **"Không đo được từ sandbox" ở đây KHÔNG phải rủi ro mới**: đo hôm nay `news.google.com` bị proxy từ chối 403 ở bước CONNECT — nhưng `query1.finance.yahoo.com`, nguồn ĐANG CHẠY THẬT trong production từ lâu, cũng bị từ chối y hệt. Nên theo đúng khuôn CBOE #109: đọc dung thứ, và khi bóc hụt thì IN RA thứ thật sự nhận được. **Khác biệt thật và nó định hình cả bản vá: Google KHÔNG gắn mã cho bài.** Nên `tickerCount` thành `number | null`, `null` = CHƯA BIẾT — ghi `1` là khẳng định bài viết riêng về công ty này trong khi không ai kiểm chứng, đúng bẫy "chưa biết thành lời khẳng định". Xếp hạng đặt chưa-biết ở **1.5**: dưới bài đã xác nhận riêng về mã (1), trên bản tin thị trường đã xác nhận (≥2) — đúng chỗ của một phép chưa đo. Prompt có NHÃN THỨ BA và dặn Claude bỏ tiêu đề rõ ràng nói về công ty khác; tab Analyze in "chưa rõ có riêng mã này không" thay vì "riêng mã này". **Tìm theo TÊN công ty chứ không theo mã**: ALL, ON, IT, KEY, CAR, NOW vừa là mã vừa là từ tiếng Anh thông dụng, tìm theo mã trần ra một trang tin rác TRÔNG Y NHƯ tin thật; route `why` truyền sẵn tên đang có trên dòng, hậu tố pháp nhân bị cắt vì `"Nike, Inc."` trong nháy kép gần như không khớp tiêu đề báo nào (test ghim rằng `Incyte Corporation` → `Incyte`, không ăn mất chữ trong lòng tên). **Cắt đuôi tên báo trong tiêu đề phải khớp `<source>`**, không được cắt ở dấu gạch ngang CUỐI CÙNG bất kỳ — rất nhiều tiêu đề có sẵn dấu gạch giữa câu. **Gộp trùng SAU khi xếp** nên bản sống sót là bản xếp cao hơn: không gộp thì hạn mức 8 bài bị bản sao ăn hết, và Claude đọc MỘT tin lặp lại thành HAI nguồn độc lập cùng xác nhận — một bằng chứng mạnh hơn sự thật. **Thân không phải RSS thì NÉM kèm 160 ký tự đầu** chứ không trả rỗng: một trang chặn phải đọc thành "hỏng", không phải "không có tin gì xấu"; feed thật mà rỗng thì ra `[]`, hai nhánh khác nhau vì hai cách sửa khác nhau. Bài không có ngày đọc được bị BỎ (một tiêu đề không gắn được vào thời gian thì không trả lời được câu "vì sao rớt tuần này"), bài cũ hơn 45 ngày cũng vậy. **Reddit cố ý chưa làm, hai lý do khác nhau**: (1) cần đăng ký app lấy client id + secret, tức host CÓ KEY → luật repo là probe trước; (2) quan trọng hơn, Reddit là BÀN TÁN chứ không phải tin — người ta đoán lý do SAU khi giá đã rớt và thường đoán sai, đổ thẳng vào prompt "tại sao rớt" là mời đúng cái bịa đặt mà prompt đó sinh ra để chặn; nếu làm thì phải là một TẦNG RIÊNG dán nhãn bàn tán chưa kiểm chứng, cả trong prompt lẫn trên màn hình. X/Twitter vẫn không có đường miễn phí nào còn sống. 63 khẳng định độc lập trong ba script. Touches news.ts, ltwhy.ts, route longterm/why, AnalysisPanel, i18n (chỉ thêm), README; mới lib/gnews.ts.
- 2026-09-18 — #148 **Nút "Tại sao rớt?" trả lời tiếng Anh, và hồ sơ SEC thành nguồn tin thứ hai.** Chủ app báo hai chuyện. (1) **Ngôn ngữ**: plumbing chưa bao giờ hỏng — panel gửi `lang`, route mặc định `vi`, prompt CÓ câu "Answer entirely in Vietnamese." Nhưng câu đó viết BẰNG TIẾNG ANH, đúng MỘT lần, ở CUỐI một prompt hệ thống toàn tiếng Anh, rồi ngay sau là bảng dữ kiện tiếng Anh với tiêu đề tin tiếng Anh — đúng tình huống một dòng chỉ dẫn lẻ loi bị ngữ cảnh cuốn đi. Sửa bằng CẤU TRÚC chứ không bằng nói to hơn: `LANG_LINE` viết BẰNG chính ngôn ngữ đích, đặt ĐẦU và nhắc lại CUỐI. Manh mối là `/api/ai` (nút Ask Claude, xưa nay chạy đúng) đặt dòng ngôn ngữ ở gần ĐẦU chứ không ở đáy. Test ghim neo ở cả hai đầu và ghim rằng chọn tiếng Anh không rò chữ tiếng Việt; **còn việc Claude có thật sự trả lời tiếng Việt hay không thì CHƯA XÁC NHẬN được — sandbox không gọi được Anthropic, cần chủ app bấm thử ở production**. (2) **Nguồn tin**: X/Twitter cần gói API TRẢ PHÍ, không còn đường miễn phí nào (Nitter chết), nên không đo được gì từ đây — theo đúng luật repo với host cần key thì phải probe trước, nên nó ở lại dạng đề nghị chứ không phải tích hợp chưa test. Đo egress: `news.google.com` KHÔNG nằm trong allowlist (Yahoo — nguồn đang dùng — cũng không), nên mọi nguồn báo chí thêm vào đều là code mù; **`data.sec.gov` trả 200**, nên chọn SEC vì đó là nguồn DUY NHẤT đo được. Và nó không cùng loại với báo chí: báo là người ngoài viết VỀ công ty, 8-K là công ty BẮT BUỘC tự khai sự kiện trọng yếu — với câu hỏi "tại sao rớt" thì cái sau thường chính là nguyên nhân. **ĐO thật**: `filings.recent` có mảng **`items`** mang mã mục 8-K thật (`"2.02,9.01"`, `"5.02"`) — thứ biến dòng "8-K" vô nghĩa thành "công bố kết quả kinh doanh"; `primaryDocDescription` có nhưng với 8-K chỉ ghi lại "8-K" nên vô dụng. Chạy đầu-cuối với SEC thật: AAPL/NKE/**BRK/B** đều ra dòng đọc được (BRK/B chạy được là nhờ chuẩn hoá gạch chéo #141), còn SPY và mã bịa trả rỗng im lặng — đúng, vì ETF không có người nộp. **Form 4 cố ý bị loại**: tab Insider Trade đã đọc kỹ hơn hẳn, và về số lượng nó nhấn chìm mọi thứ — đo trên AAPL 591/1001 dòng là Form 4 so với 103 8-K. Mục 9.01 (phụ lục thủ tục) bị bỏ KHI còn mục khác, giữ khi đứng một mình. Mã mục LẠ in nguyên văn kèm câu "app chưa biết nghĩa", không đoán — SEC thêm mục, và nhãn sai trông y hệt nhãn đúng. **Hai nguồn HỎNG ĐỘC LẬP** (`symbolNewsAll` → `{items, ok, failed}`): Yahoo chết không xoá hồ sơ SEC, và prompt gọi tên nguồn nào sống nguồn nào chết để Clause biết nó chỉ mù MỘT NỬA — gộp lại là biến "không có tin" và "nửa số nguồn chết" thành một, mà hai thứ đó dẫn tới hai kết luận ngược nhau; `symbolNews()` giữ nguyên chữ ký và chỉ ném khi MỌI nguồn chết. Thứ tự xếp giữ nguyên và ôm được nguồn mới: hồ sơ SEC mang `tickerCount: 1` nên vào nhóm trên cùng và cạnh tranh bằng NGÀY — 8-K hai tháng trước không đứng trên tiêu đề hôm nay, còn bản tin thị trường chung vẫn nằm dưới cả hai. 55 khẳng định độc lập + đo thật với SEC production. Touches sec.ts (chỉ thêm `items`), news.ts, ltwhy.ts, route longterm/why; mới lib/secnews.ts.
- 2026-09-18 — #147 **Bốn nút dòng tiền RRG (theo NGÀNH) cho tab Đầu tư dài hạn.** Chủ app: "thêm tiêu chuẩn dòng tiền rrg trong tab heatmap vô longterm", rồi nói rõ thêm giữa chừng: "lọc ngành nào đang uptrend mạnh" — tức góc **Dẫn đầu**, và câu chú thích dưới mấy cái nút gọi thẳng tên như vậy thay vì bắt người đọc tự giải mã chữ "Dẫn đầu". **Đây là góc phần tư của NGÀNH và không bao giờ có thể là của mã**: toạ độ RRG là vị trí CẮT NGANG — `crossZ()` chấm mỗi ngành so với 10 ngành còn lại trong CÙNG một tuần, và `MIN_SECTORS = 5` ép đúng điều đó; bỏ mặt bằng chung đi thì hai trục mất luôn định nghĩa, nên không tồn tại toạ độ RRG cho một cổ phiếu. Nhãn cổng ghi "ngành", chú thích nhắc lại hai lần, ngăn chi tiết in tên ngành ngay cạnh góc — nếu không thì "Đang hồi" bị đọc thành nhận định về chính công ty. **Phần tính được bóc sang `lib/rrgsectors.ts` để hai nơi dùng CHUNG một con số**: `/api/rrg/route.ts` giờ chỉ là lớp vỏ HTTP. Hai đường tính song song sẽ trôi lệch, và ở đây trôi lệch đặc biệt tệ — biểu đồ nói ngành đang hồi trong khi bộ lọc loại sạch mã ngành đó, không gì trên màn hình nói bên nào đúng; đúng bài học #96/#99, chặn trước khi nó kịp xảy ra. Cache một giờ đi theo vào lib nên mở biểu đồ bên Heatmap rồi quét ngay sau đó KHÔNG tốn thêm request nào. **`GICS_TO_KEY` load-bearing và được ĐO chứ không nhớ**: rổ ghi tên GICS ("Information Technology"), RRG dùng khoá riêng (`tech`); cả 11 tên đọc thẳng từ `data/sp500.json` (503 dòng, đúng 11 giá trị riêng biệt) và test ghim rằng mọi tên tra ra được, đồng thời tên gần đúng ("Tech", "Healthcare", "Real estate") trả `undefined` chứ KHÔNG rơi về một ngành mặc định — một nhãn góc sai trông y hệt nhãn đúng. **Mã watchlist giờ lấy ngành từ file rổ** (đúng phép tra `bySymbol` mà `scan-job.ts` làm từ lâu): trước đây watchlist mang `sector: ''` tới tận tầng 2 nên không có gì để tra vòng xoay ở tầng 0; mã ngoài rổ vẫn là chưa biết và đi qua kèm `?`. **Tính vòng xoay ở MỌI lượt quét, không chỉ khi đang lọc**: 12 request sau một cache một giờ dùng chung là nhỏ so với 6 lượt báo giá + hàng trăm lượt nến của chính lượt quét, đổi lại cột "dòng tiền ngành" có số ngay cả khi chưa bật nút nào; hỏng thì không chết — mọi cổng RRG ra `?` và màn hình in LÝ DO THẬT, câu khác hẳn câu "ngành này không nằm trong góc đã chọn" vì hai cách sửa khác nhau. Chọn đủ CẢ BỐN góc thu về "không lọc", y như `parseCaps`. Khoá kho lưu thêm `:rrg=improving`, không chọn thì không thêm hậu tố nên bản ghi cũ không cần di trú. `rrgDropped` đếm số mã bị loại ở tầng 0, in bằng `--warn`. **`ChipRow.tsx` được tách ra** khi đây thành hàng nút chọn-nhiều THỨ HAI: hai hàng nút trông giống nhau mà hành xử lệch nhau (một bên nhớ `aria-pressed`, một bên quên; một bên khoá lúc quét, một bên không) là thứ người dùng phát hiện trước lập trình viên; `CapChips` và `RrgChips` đều là vỏ mỏng của nó, `.capchips` đổi tên thành `.chiprow`. 62 khẳng định độc lập (41 cổng+kho, 21 bảng tra ngành) + đo thật trong trình duyệt (2 theme × 1280/400: hai hàng chip, bốn nhãn đúng thứ tự vòng xoay, cột dòng tiền hiện đúng và ra `—` cho mã không tra được ngành, bấm góc đổi đúng bảng rồi bỏ thì quay về, nút sáng ra đúng `--stamp`, dòng đếm ra đúng `--warn`, không tràn khung nhìn) + kiểm `/api/rrg` sau khi bóc vẫn trả đúng hình dạng lỗi cũ (`RRG_NO_BENCHMARK` kèm weeks/need, 502). Touches rrg route, longterm.ts, lt-store.ts, route longterm + last, LongTermPanel, CapChips, globals.css, i18n (chỉ thêm); mới lib/rrgsectors.ts, components/ChipRow.tsx, components/RrgChips.tsx.
- 2026-09-18 — #146 **Ba nút vốn hoá Mega/Big/Mid, dùng chung CẢ HAI tab.** Chủ app đặt hàng; chốt trước hai điều: áp cho cả Screener lẫn Đầu tư dài hạn, mốc chuẩn 200B/10B/2B. **Chỗ đặt quyết định giá trị của tính năng**: `quotes()` ĐÃ trả sẵn `fundamental.sharesOutstanding` trong chính lượt gộp lô mà cả hai tab đều gọi đầu tiên, nên vốn hoá = giá × số cổ phiếu tốn KHÔNG một request nào — tức lọc được ở TẦNG 0, trước chuỗi quyền chọn (Screener) và trước cả nến lẫn Finviz lẫn SEC (Đầu tư dài hạn). Tab Heatmap đã tính vốn hoá đúng cách này từ lâu nên đây là DÙNG LẠI, không phải nguồn mới. **Một module (`marketcap.ts`) + một component (`CapChips.tsx`) dùng chung**, không chép sang hai nơi — hai tab phải hiểu "mega" y hệt nhau, và bản chép là bản sẽ trôi lệch (đúng lý do `ratelimit.ts` được tách ra). **Ba luật số học, test ghim cả ba**: (1) số cổ phiếu bằng 0 hoặc thiếu ra `null` chứ KHÔNG ra vốn hoá 0 — số 0 sẽ bị `capTier` đọc thành "small cap", tức biến CHƯA BIẾT thành lời khẳng định về cỡ công ty, đúng bẫy #142 ở nguồn khác; (2) không biết vốn hoá thì ĐI QUA kèm cờ `unknown`, luật #131 — loại nó là để Schwab thiếu một trường mà quyết định thay người dùng; (3) đọc được chuỗi số, vì `Number.isFinite('100')` là false và nếu dùng nó thì một ngày Schwab đổi kiểu trường là CẢ RỔ mất vốn hoá lặng lẽ (bẫy gex, chặn trước). **KHÔNG bấm nút nào = KHÔNG lọc** (mã dưới 2 tỷ vẫn vào), và màn hình nói ra câu đó — ba nút tối thui trông y hệt một bộ lọc đang chặn hết. `parseCaps` chuẩn hoá thứ tự và bỏ giá trị lạ; chọn đủ cả bốn bậc thu về "không lọc" vì đó đúng là ý nghĩa của nó, và để khoá kho lưu không mọc hậu tố cho một phép lọc không loại ai. **Mỗi tab giữ quy ước riêng của nó**: bên Đầu tư dài hạn mọi tiêu chí đều là cổng nên đây là cổng (chỉ có mặt khi có chọn, đúng khuôn ô tích SMA200 #145); bên Screener các tiêu chí người dùng sửa được đều là bộ lọc còn hard gates là bảy cái cố định, nên đây là bộ lọc nằm cạnh `sectors` — thứ nó giống nhất, vì cả hai cắt theo thuộc tính CÔNG TY chứ không theo hợp đồng và cả hai cắt ở tầng 0. `Filters.caps` là tuỳ chọn (`?? []` ở mọi nơi đọc) nên bộ lọc đã lưu từ trước không bao giờ đọc thành "đã chọn gì đó". Khoá kho lưu của tab Đầu tư dài hạn thêm `:cap=mega+big`, cùng lý do đã gồm phạm vi và ô tích SMA200; không chọn gì thì không thêm hậu tố nên bản ghi cũ vẫn là bản ghi "không lọc", không cần di trú. `capDropped` đếm số mã bị loại ở tầng 0 và in bằng `--warn`, cùng lý do `belowSma200` tồn tại. CSS `.capchips` cố ý KHÔNG dùng lại `.segmented` (lưới hai cột, chọn MỘT, tô `--ink`): tô bằng `--stamp` — đúng màu ô tích của app — để nhìn là biết chọn được nhiều; chỉ dùng biến màu có sẵn nên không đụng bẫy ba khối theme. 64 khẳng định độc lập + đo thật trong trình duyệt (2 theme × 1280/400: nút có mặt ở CẢ HAI tab, nút sáng ra đúng `--stamp` ở cả hai theme, bấm Mega đổi đúng bảng của trạng thái đó rồi bỏ bấm thì quay về, dòng đếm ra đúng `--warn`, không tràn khung nhìn). Touches types.ts, longterm.ts, lt-store.ts, scan-job.ts, route longterm + last, FilterPanel, LongTermPanel, page.tsx, i18n (chỉ thêm), globals.css (chỉ thêm); mới lib/marketcap.ts, components/CapChips.tsx.
- 2026-09-18 — #145 **Ô tích "chỉ lấy mã còn trên SMA200" cho tab Đầu tư dài hạn.** Chủ app: "tôi muốn quét không được qua sma200". Câu này đọc được HAI nghĩa ngược nhau (phải nằm trên SMA200, hay phải nằm dưới) nên hỏi trước một câu thay vì đoán — đáp: phải nằm TRÊN. Đây chính là mức chặt mà #137 cố ý không làm, và lý do cũ vẫn đúng và vẫn đo được: tab này tìm mã ĐANG RỚT, mà rớt đủ sâu để đáng nhìn thì phần lớn đã thủng SMA200, nên đóng cứng là bảng trống gần như quanh năm. Vì vậy nó là Ô TÍCH (mặc định BẬT ở màn hình, TẮT ở server — request thiếu tham số phải ra bảng rộng hơn, không phải bảng bị lọc thêm mà không ai yêu cầu), đúng khuôn ô `requireAboveSma200` đã có bên tab Sell Put. **Ba chỗ load-bearing**: (1) tắt thì cổng KHÔNG có mặt trong `gates`, chứ không phải "có mặt và luôn đạt" — một dấu ✓ không loại ai là nhiễu, một dấu ✗ không loại ai thì tệ hơn vì nó dạy người đọc bỏ qua dấu ✗; thông tin không mất, cột Xu hướng vẫn ghi "Dưới SMA200". (2) Xét ở TẦNG 1, tức cắt trước khi tốn một lần cào Finviz hay một file SEC — đúng lý do ba tầng tồn tại, và cổng này cắt mạnh lại rẻ. (3) **`belowSma200` đếm số mã rụng CHỈ vì cổng này** (đúng một cổng tầng 1 hỏng) và màn hình in bằng `--warn`: không có con số đó thì "ô tích làm trống bảng" và "thị trường không có mã nào đạt" hiện y hệt nhau, mà hai thứ cần hai hành động ngược nhau; cố ý đếm kiểu chỉ-mình-nó-hỏng để trả lời trung thực được câu "bỏ tích thì mấy mã này xét tiếp chứ", và câu chữ vẫn nói rõ chúng còn phải qua các cổng còn lại. **Khoá kho lưu gồm cả ô tích** (`user:universe:sma200`), cùng lý do đã gồm phạm vi quét; trạng thái TẮT cố ý giữ nguyên khoá cũ không hậu tố — mọi bản ghi lưu trước đó đều quét khi chưa có cổng này, tức đúng bằng trạng thái tắt, nên không cần di trú. Thiếu SMA200 (chưa đủ 200 phiên) ĐI QUA kèm cờ `?`, đúng luật #131. **Điểm số không đụng tới**: `scoreComponents()` không đọc `aboveSma200` — đây là bộ lọc chứ không phải phép chấm lại, test ghim hai bên ra components giống hệt nhau. 40 khẳng định độc lập + đo thật trong trình duyệt (2 theme × 1280/400: gạt ô tích đổi đúng bảng của từng trạng thái, dòng cảnh báo ra đúng màu `--warn` ở cả hai theme, cổng mới chỉ xuất hiện trong ngăn chi tiết khi bật, không tràn khung nhìn). Touches longterm.ts, lt-store.ts, route longterm + last, LongTermPanel, i18n (chỉ thêm), README.
- 2026-09-18 — #144 **Quét Long-term xong, ra khỏi tab là mất sạch — và lý do #137 không lưu là một phép đo nhầm đối tượng.** Chủ app báo: "screener longterm rồi out vô lại bị mất những con stock, phải screen lại". #137 cố ý không lưu, lập luận: lượt quét này bị chặn trên bởi tầng 0 và mọi thứ đắt đều cache theo ngày nên chạy lại gần như tức thì, khác hẳn quét put 4-8 phút vốn đáng một bộ máy job. Lập luận ấy đúng về MẠNG và sai về NGƯỜI: cache không làm người dùng khỏi phải bấm quét rồi ngồi nhìn ba tầng chạy hết 503 mã — và tệ hơn, bảng trống lúc quay lại trông y hệt "lần trước không ra mã nào", tức lại đúng cái lỗi "chưa nạp hiện giống không có gì" mà cả repo này cấm. `lt-store.ts` theo đúng khuôn `scan-store.ts` và cùng ba lý do: lưu phía SERVER (quét ở máy tính, mở lại ở điện thoại vẫn thấy), RIÊNG theo người (mỗi người một watchlist nên kết quả khác nhau), RIÊNG theo phạm vi (một lượt watchlist vài chục giây không được xoá lượt cả rổ vài phút). **KHÔNG có biến môi trường mới**: đường dẫn suy ra từ THƯ MỤC của `SCAN_PATH` (`last-longterm.json` nằm cạnh `last-scan.json`), nên tự rơi vào `/var/data` mà không có bước tay nào — né đúng bẫy `USERS_PATH`, nơi Render không tự thêm biến vào service đã tạo và dữ liệu lặng lẽ rơi vào thư mục build. File RIÊNG chứ không nhét chung một khoá vào `last-scan.json`: hai bảng có hình dạng hàng khác hẳn, và hai tiến trình ghi chung một file là một phép đọc-sửa-ghi đè được lên nhau. **Lưu TRƯỚC khi phát dòng `candidate` đầu tiên**, cạnh `flushPe()` sẵn có và vì đúng lý do đã ghi ở đó: tới điểm ấy mọi thứ đắt đã xong, nên client ngắt giữa lúc đang đọc bảng không được phép làm mất lượt quét. Lượt quét vẫn KHÔNG có job nền — đóng tab GIỮA CHỪNG vẫn mất, đánh đổi có ý thức — nhưng lượt ĐÃ XONG thì sống. **Đổi phạm vi thì NẠP LẠI bản lưu của phạm vi đó, thay bảng**, chứ không giữ lại như tab Screener (`prev.length ? prev : …`): giữ là để bảng cả rổ nằm dưới cái nút watchlist đang sáng, một lời nói dối im lặng. Bảng khôi phục in `lt.saved` bằng `--warn` và cố ý y NGUYÊN VĂN câu `res.saved` của tab Screener — một bảng số nhìn giống hệt nhau dù là số sống hay ảnh chụp bốn tiếng trước, nói giống nhau ở hai tab thì học một lần là hiểu cả hai. Đọc kho HỎNG tách khỏi CHƯA QUÉT LẦN NÀO (500 + lý do thật vs `{scan:null}`) vì hai cách sửa khác nhau; ghi tạm-rồi-đổi-tên nên sập giữa chừng không để lại JSON cụt. 19 khẳng định độc lập + đo thật trong trình duyệt (2 theme × 1280/400: bảng khôi phục đúng, `--warn` ra đúng màu ở cả hai theme, gạt phạm vi xoá bảng đúng, mở chi tiết từ payload đã lưu render nguyên vẹn, ngăn chi tiết 350px không tràn ở 400px). Touches route longterm, LongTermPanel, i18n (chỉ thêm), render.yaml (chỉ chú thích); mới lib/lt-store.ts, api/longterm/last.
- 2026-09-17 — #143 **Hai phỏng đoán cuối được đo: cả hai ĐÚNG, và vẫn lòi ra một chú thích sẽ làm người sau phá hỏng thang CBOE.** Với host đã mở, đo nốt hai chỗ #142 ghi là "chưa ai nhìn". **CBOE (#109) đúng từng chi tiết**: payload `{timestamp,data,symbol}`, mỗi option có `option`/`bid`/`ask`/`iv`/`open_interest`/`gamma` và **toàn là SỐ**; 29.914 hợp đồng vào, giữ 15.586 qua 32 kỳ sau bộ lọc 60 ngày, spot 7637,76, tổng OI 25,9 triệu; `computeGex()` chạy nguyên si trên chuỗi đã chuyển và ra mức hợp lý (put wall 7500, call wall 7800, abs gamma 7600). **Tôi nghi sai một lần và dữ liệu chỉnh lại**: mấy giá trị `iv` khác 0 ĐẦU TIÊN trong file là 7,99 / 7,71 — trông y như đã là phần trăm, làm tôi tưởng phép ×100 là lỗi đơn vị kiểu AMT; nhưng đó là hợp đồng rác ở strike 200 trên chỉ số 7637. Gần tiền `iv = 0,1362` → ×100 = 13,62%, khớp `iv30 = 12,155` CBOE tự công bố. **Bài học lấy mẫu: lấy mẫu QUANH SPOT, đừng lấy từ đầu mảng.** **`zeroGamma: null` của SPX là ĐÚNG, không phải lỗ hổng**: tích luỹ gamma ròng âm ở cả 498 strike và không bao giờ cắt 0 — dealer âm gamma toàn dải; từng strike vẫn có thể ròng dương (nên mới có call wall 7800) trong khi tổng chạy vẫn âm. Phép quét giao cắt cố ý MỘT CHIỀU (âm→dương) vì đó chính là định nghĩa gamma flip. File chứa cả gốc `SPX` (10.040) lẫn `SPXW` (19.874), giữ cả hai là đúng. **Ảnh nghị sĩ (#133) cũng đúng**: `P000197`/`S000148`/`M000355` đều 200 `image/jpeg`, mã Bioguide đúng dạng nhưng không tồn tại (`X999999`) trả 404 — mẫu URL chuẩn và id sai hỏng sạch sẽ; vế CHƯA xác nhận là nửa app không kiểm soát được: `politician_id` của UW có phải Bioguide hay không. **Thứ duy nhất phải sửa là một chú thích**, và nó load-bearing: đo được `_SPX.json` → 200 nhưng `SPX.json` → **403** (không phải 404), `_VIX` → 200, `AAPL` → 200. Code vốn đã `continue` với MỌI mã lỗi nên hành vi đúng; nhưng chú thích cạnh đó viết "404 = tên sai, mã khác đổi tên cũng không cứu được, thử cho hết vì rẻ" — tức người sau "dọn" lại thành chỉ-404 là giết hẳn đường CBOE cho mọi mã đoán hụt tên, đúng hình dạng #100. Chú thích giờ mang chính phép đo. Docs + một chú thích; không đổi hành vi.
- 2026-09-17 — #142 **Mở được `data.sec.gov`, và bốn phỏng đoán thành phép đo — kèm hai lỗi thật nữa.** Chủ app đặt Network access = `Custom` với 4 host keyless; đo ngay: SEC/GitHub/npm 200, `cdn.cboe.com` 403 ở `/` nhưng **200 + 13.3 MB** ở đường dữ liệu thật (CDN không phục vụ trang gốc, proxy từ chối 0 lần). **Và `fetch` trần của Node KHÔNG dùng `HTTPS_PROXY`** — cùng URL, cùng giây: curl 200, fetch 403; 33 mã "SEC từ chối" trong phép đo đầu của tôi là lỗi của chính bộ đo, đúng hình dạng #130 lần thứ ba. **Bốn thứ nay đã ĐO chứ không đoán**: (1) SEC viết mã nhiều lớp bằng GẠCH NGANG — `BRK-B`=1067983, `BF-B`=14693; trong 10.422 mã có 543 dùng `-` và đúng 1 dùng `.`, nên nấc đầu thang #141 là nấc đúng. (2) **Độ phủ trên 33 mã lấy mẫu phân tầng 11 ngành**: doanh thu cả năm **100%**, EPS 97%, FCF 91%, số cổ phiếu 97%, CAGR 3 năm 100%. (3) **Cả bốn nấc thang doanh thu đều được dùng thật**: `Revenues` 17, ASC606-Excluding 12, ASC606-Including 3, và `RevenuesNetOfInterestExpense` đúng 1 lần — ở MS, tức nấc tôi thêm theo phỏng đoán "ngân hàng" hoá ra có thật. (4) **Ngân hàng không có CapEx**: BAC, MS, JPM đều không có MỘT thẻ `Payments*` vốn nào, nên FCF rỗng — không phải lỗi, và cổng hiện `?` là đúng; EOG (dầu khí) cũng vậy. **Hai lỗi thật**: (a) **AMT sai ĐƠN VỊ giữa hai lần nộp** — cùng `end` 2015-12-31 có hai fact, 10-K FY2015 khai 423.015.000 còn 10-K FY2016 khai 423.000 (đơn vị nghìn); luật "bản nộp mới nhất thắng" trung thành nhặt con số sai, chuỗi thành 400M→0,4M→429M, sinh hai vết gãy split giả rồi làm câm cổng pha loãng. Phân biệt được vì **một bản điều chỉnh thật gần như không bao giờ đổi con số tới 100 lần** — lệch ≥100× là sai đơn vị, giữ bản CŨ; test ghim cả chiều ngược (điều chỉnh 3,5% và 90% vẫn nhận bản mới). Sau vá, AMT đọc 399M→400M→423M→429M, vết gãy 2→0, còn 9 vết gãy THẬT của 9 mã khác không đụng tới. (b) Lớp phòng thứ hai: số cổ phiếu ≤ 0 bị loại (công ty niêm yết không thể có 0 cổ phiếu bình quân) — `splitBreaks` vốn đã có chốt `a>0&&b>0` nên số 0 không sinh vết gãy, nhưng `cagr()` trả null khi điểm đầu ≤0 nên một số 0 rác trong cửa sổ 3 năm làm CÂM phép đo; lọc chỉ áp cho số cổ phiếu, KHÔNG áp cho EPS (0 = hoà vốn thật) hay FCF (âm = đốt tiền thật), test ghim. **Berkshire xác nhận bộ lọc độ dài kỳ đáng giá**: `EarningsPerShareBasic` có 32 fact 10-K/`fp=FY` nhưng TOÀN LÀ quý (89-91 ngày), không một fact cả năm — tin `fp=FY` mà bỏ kiểm độ dài là cộng EPS quý thành EPS năm. 242 khẳng định trong 5 script. Touches secfacts.ts, CLAUDE.md.
- 2026-09-17 — #141 **`BRK/B` không tra được CIK — và lỗi này CÓ TỪ TRƯỚC, nằm ở Form 4 chứ không ở tab mới.** Chủ app chạy `/api/secprobe?symbol=BRK%2FB` ở production: `{"ok":false,"reason":"no-cik"}`. Nguyên nhân: Schwab viết cổ phiếu nhiều lớp bằng GẠCH CHÉO (`BRK/B`, `BF/B`), và **sáu module khác trong repo đã xử chuyện này từ lâu** — `finviz.ts` và `news.ts` đổi sang `-`, `links.ts` sang `.`, ba lớp cache sang `_` — chỉ `sec.ts` là chưa bao giờ đổi. **Hậu quả không nằm ở tab mới**: `insiders.ts` ghi mọi mã trong `missing` thành `noFiler: true`, tức câu trả lời DỨT KHOÁT "SEC không có ai nộp Form 4 cho mã này" vốn chỉ dành cho ETF — nên từ khi Form 4 ra mắt, app đã khẳng định chắc nịch một điều SAI về hai công ty thật đang niêm yết, và im lặng suốt. Đúng hình dạng degradation idiom, chỉ khác là nguyên nhân nằm ở phép chuẩn hoá của CHÍNH CHÚNG TA chứ không ở dữ liệu của SEC — và đó là lý do nó sống lâu: mọi phép tự chẩn đoán đều soi dữ liệu bên ngoài, không soi đầu vào của mình. **Danh bạ SEC dùng cách viết nào thì CHƯA ĐO được** (`www.sec.gov` bị chặn), nên không đoán: `secTickerCandidates()` thử cả thang `BRK-B` → `BRK.B` → `BRKB` → `BRK/B`, đúng lối Schwab ($SPX/$SPX.X/SPX) và CBOE (_SPX/SPX) đã dùng; test ghim CẢ BA quy ước nên kết quả đúng bất kể SEC chọn cái nào, tức câu chưa đo được không còn chặn tính đúng đắn. `found` vẫn khoá theo mã gốc (mọi nơi gọi đang dùng khoá đó), `spelling` ghi riêng mã phải đổi để probe nói ra được thay vì biến đổi thầm lặng. Đường `no-cik` giờ in `triedSpellings` — không có nó thì `no-cik` của một ETF (đúng) và của một mã chuẩn hoá sai (lỗi) trông y hệt nhau, bài học #102. **Không cần di trú dữ liệu**: `syncInsiders` có `maxAge` 24 giờ nên bản ghi `noFiler` sai tự được kiểm lại trong một ngày sau deploy — khác hẳn #134, nơi bản ghi cũ phải chờ 90 ngày mới hết hạn. 17 khẳng định mới.
- 2026-09-17 — #139 **Probe SEC trả lời, và hai lỗi thật lộ ra — cả hai fixture tự dựng không thể bắt.** Chủ app chạy `/api/secprobe?symbol=AAPL` ở production. Hình dạng KHỚP (top `cik,entityName,facts`; taxonomy `dei,us-gaap`; fact mang `start|end|val|accn|fy|fp|form|filed|frame`, `fy` là SỐ, `frame` "CY2018"/"CY2018Q3"), bẫy quý-4-mang-`fp=FY` **được xác nhận thật** (`start 2018-07-01 end 2018-09-29 fp FY frame CY2018Q3` nằm cạnh fact cả năm) và bộ lọc độ dài kỳ đã chặn đúng. **Lỗi 1 — thang thẻ chọn thẻ ĐẦU TIÊN có dữ liệu chứ không phải thẻ MỚI NHẤT**: `Revenues` của Apple chỉ tới FY2018 (ASC 606 chuyển sang `RevenueFromContractWithCustomerExcludingAssessedTax`), nên `latestFy` = 2018, CAGR 3 năm null, biên FCF null, trong khi thẻ mới đủ 2018-2025 nằm ngay cạnh. `pickSeries()` giờ chọn theo ngày kết thúc mới nhất (hoà → dài hơn); cố ý KHÔNG ghép hai thẻ thành một chuỗi vì ở ngân hàng `Revenues` và `RevenuesNetOfInterestExpense` là hai định nghĩa. **Lỗi 2 — chia tách cổ phiếu làm chuỗi per-share gãy khúc**: số cổ phiếu 2017 = 5.25B, 2018 = 20.0B — không phải phát hành gấp bốn, mà năm 2018 được 10-K FY2020 (sau split 4:1) báo cáo lại đã điều chỉnh, còn bản cuối nhắc tới 2017 là 10-K FY2019, TRƯỚC split. Mỗi 10-K chỉ mang 3 năm so sánh nên điều chỉnh split chỉ với ngược 3 năm; cùng vết ở 2011→2012 (split 7:1 2014) và ở EPS (9.21→2.98). Hệ quả nếu không chặn: công ty split 2 năm trước ra CAGR 3 năm "pha loãng +300%" và bị cổng LOẠI OAN — test ghim đúng cảnh đó (`cagr()` trần in +40%+, `cagrAcrossBreaks()` ra null). `splitBreaks()` bắt bước nhảy ≥1.8× của số cổ phiếu (ngưỡng đủ cao để KHÔNG bắt nhầm một đợt phát hành 70% thật — đó chính là pha loãng cần bắt), CAGR của EPS và số cổ phiếu vắt qua vết gãy ra null, màn hình và prompt nói vì sao; doanh thu/FCF là tổng nên không đụng. **ĐÃ XÁC NHẬN sau deploy** (probe lần 2, AAPL): `tagsUsed.revenue` = thẻ ASC 606, `latestFy` 2025-09-27 (nộp 2025-10-31), doanh thu CAGR 3 năm **1.81%** / 5 năm 8.67%, biên FCF 23.7% (= 98.8/416.2 tỷ), số cổ phiếu −2.77%/năm, EPS +6.86%/năm, `splitBreaks` đúng `[2012-09-29, 2018-09-29]`; fact mẫu giờ là 10-Q 2026 kể cả một số luỹ kế 9 tháng, đều bị lọc đúng. Khoảng trống nhỏ chưa sửa: chuỗi FCF thiếu FY2014 (CapEx không khớp kỳ năm đó), không ảnh hưởng CAGR 3 năm. 212 khẳng định. Touches secfacts.ts, LongTermPanel.tsx, ltwhy.ts, secprobe, i18n (chỉ thêm).
- 2026-09-17 — #138 **SEC 10-K vào tab Đầu tư dài hạn — chưa đo được, và nói rõ thế.** Chủ app đưa một tài liệu "Professional Long-Term Screener" (SEC → Alpha Vantage → Nasdaq Data Link → AI chấm moat/TAM/risk → DCF ba kịch bản). Ý kiến đã nói: phần triết lý (cấm NULL→0, hiện nguồn cạnh số, hard filter trước điểm) là NGUYÊN VĂN degradation idiom của repo; phần kiến trúc quá tay; **hai chỗ đi ngược kỷ luật repo**: AI sinh `MOAT_SCORE` là LLM *tạo ra* con số (repo chỉ cho Claude diễn giải số code tính), và DCF ba kịch bản với input giả định cho ra ba fair value giả định trông rất chắc chắn. Không mua Alpha Vantage (hạn mức free ~25 req/ngày, và nó chắt từ chính SEC) hay Sharadar. **Cái đáng làm và đã làm**: Finviz là ảnh chụp ttm, không trả lời được "doanh thu/EPS/FCF có tăng 3-5 năm không" và "số cổ phiếu có phình không" — SEC XBRL `companyfacts` trả lời cả hai, miễn phí, và `sec.ts` đã có sẵn client tới `data.sec.gov`. `secfacts.ts` thuần logic, xử ba bẫy đã biết của companyfacts: (1) cùng một kỳ xuất hiện trong nhiều 10-K (số so sánh) nên gom theo `end` và giữ `filed` mới nhất — cũng chính là cách hấp thụ restatement; (2) `fp=FY` KHÔNG đủ nói "cả năm" vì số quý 4 trong 10-K cũng mang FY, phải đòi start→end ≈ 1 năm; (3) một khái niệm nhiều thẻ (`Revenues` / `RevenueFromContractWithCustomerExcludingAssessedTax` / `SalesRevenueNet`) nên có THANG thẻ và `tagsUsed` ghi thẻ thắng. CAGR tính từ hai điểm THẬT cách nhau ~k năm theo khoảng ngày thật (test bắt đúng: 366 ngày nhuận ra 9.98% chứ không 10.00% — code đúng, test phải nới), điểm đầu ≤ 0 ra null. Ba cổng mới (doanh thu không co lại / FCF dương / pha loãng ≤ 5%/năm) đi qua với `unknown` khi thiếu, đúng luật #131; điểm có thêm `growth` 15 và bốn phần kia nhường lại (25/25/20/15/15). **`data.sec.gov` vẫn bị chặn 403 CONNECT** nên hình dạng chưa đo — xử theo khuôn CBOE #109: đọc dung thứ, `secDiagnosis()` in khoá thật khi bóc hụt, và `/api/secprobe?symbol=X` in taxonomy/thẻ có mặt/3 fact nguyên văn/chuỗi đã bóc. Ba lý do thiếu SEC tách riêng trên màn hình (`no-cik` / `no-data`+diagnosis / lỗi mạng) vì ba cách sửa khác nhau. 194 khẳng định trong 4 script. Touches longterm.ts, route longterm, ltwhy.ts, sec.ts (chỉ thêm `companyFacts`), i18n.tsx (chỉ thêm), globals.css (chỉ thêm), LongTermPanel.tsx, README; mới lib/secfacts.ts, api/secprobe.
- 2026-09-17 — #137 **Tab chính thứ SÁU: Đầu tư dài hạn.** Chủ app đặt hàng: tìm mã đang rớt về hỗ trợ mà công ty vẫn có lãi, định giá còn hợp lý, kiểm tin tức xem rớt vì sao, và vẫn uptrend. Chốt ba điều trước khi viết dòng code nào, vì ba câu đó ra ba sản phẩm khác hẳn: uptrend mức VỪA (cho thủng SMA200 miễn ĐỘ DỐC SMA200 còn dương — mã rớt đủ sâu để đáng nhìn thì thường đã thủng SMA200 rồi, đòi chặt là bảng trống quanh năm), "tại sao rớt" là nút BẤM MỚI CHẠY, định giá gồm CẢ bội số Finviz LẪN so với chính lịch sử P/E của mã. **Ràng buộc quyết định toàn bộ kiến trúc là chi phí**: Finviz là MỘT lần cào HTML mỗi mã, nên 503 mã kiểu thẳng là không dùng được — ba tầng, và tầng rẻ nhất cắt mạnh nhất: `quotes()` vốn đã gộp lô 100 mã và ĐÃ TRẢ SẴN `52WeekHigh`/`52WeekLow`, nên cả rổ tốn SÁU request và hai cổng "đã rớt khỏi đỉnh"/"chưa sát đáy" tính được miễn phí trước khi tốn bất cứ request nào theo mã. **Bộ test bắt một lỗi thật trong phần lõi**: chuỗi giá phẳng làm MỌI nến thành đáy xoay (21 nến phẳng ra 8 "đáy") rồi gom thành một vùng ghi "đã chạm 8 lần" — mà `touches` chính là con số cả tab dựa vào để nói vùng có đáng tin không, nên thổi phồng nó là hỏng đúng chỗ quan trọng nhất; sửa bằng phép so sánh BẤT ĐỐI XỨNG (trái đòi cao hơn hẳn, phải chỉ đòi không thấp hơn) nên mỗi đoạn bằng nhau chỉ còn một đáy, mà đáy đôi thật vẫn đếm đủ hai. **Hai lỗi hiển thị chỉ render thật mới thấy, đọc CSS không thấy được**: (1) `.pftable td` đặt `white-space: nowrap` cho các CỘT SỐ, ngăn kéo chi tiết nằm trong một `td` của chính bảng đó nên THỪA KẾ nowrap — mọi đoạn văn xuôi chạy thành một dòng 1462px trong khung 777px rồi bị cắt cụt, và cái bị cắt đúng là mấy câu nói thật (giá mục tiêu không phải cổng lọc, Finviz thiếu ô nào, kho P/E chưa đủ); (2) sửa xong nowrap thì trên điện thoại 400px vẫn mất nửa phải, vì ngăn chi tiết nằm trong `<td>` nên rộng theo BẢNG (784px) chứ không theo màn hình — với bảng số thì cuộn ngang là đúng (tab Quốc hội làm thế) nhưng với văn xuôi là hỏng, nên ngăn chi tiết ĐƯỢC ĐƯA RA NGOÀI khung cuộn; đo lại: `detailW` 784→350, không phần tử nào tràn khung nhìn ở cả bốn tổ hợp theme × bề ngang. Ba chỗ nói thật cố ý: **giá mục tiêu được HIỆN nhưng không làm cổng** (nó gần như luôn trên giá hiện tại, lấy làm cổng là giao quyền lọc cho sự lạc quan nghề nghiệp của người khác); **vế "rẻ so với chính nó" trả null kèm CÒN THIẾU BAO NHIÊU LẦN ĐỌC** thay vì một phân vị tính trên 4 mẫu, và nó không kéo điểm lên hay xuống trong lúc đó; **điểm thiếu dữ liệu là 0.5 chứ không phải 0** — cho 0 là dựng một bộ lọc NGẦM đẩy mọi mã Finviz cào hụt xuống đáy bảng mà không ai biết. Lỗi hết phiên Schwab được tách riêng chứ không in nguyên `REAUTH_REQUIRED` (cách sửa là bấm kết nối lại, không phải quét lại). Prompt dặn Claude coi tiêu đề tin là DỮ LIỆU, không phải lệnh. 121 khẳng định trong 3 script độc lập. Không biến môi trường mới, không bước deploy (kho P/E ở `.cache/`). Touches page.tsx, i18n.tsx (chỉ thêm khoá), globals.css (chỉ thêm), history.ts (chỉ thêm), README.md; mới lib/support.ts, lib/pehistory.ts, lib/longterm.ts, lib/ltwhy.ts, LongTermPanel.tsx, api/longterm/*.
- 2026-09-17 — #136 **Chú thích earnings ở tab Analyze hứa một thứ màn hình không hề có.** Chủ app hỏi "coi earning chỗ nào"; đi rà bốn nơi hiện earnings thì lòi ra câu `an.earningsNote` nói sai hai chuyện. Chuyện nhỏ: sau #135 nguồn không còn là MỘT file — `loadEarnings()` HỢP `data/earnings.json` với lịch tastytrade, nên câu cũ nói thiếu đúng một nửa nguồn. **Chuyện nặng hơn là vế thứ hai: "File phân biệt rõ ngày công ty đã công bố với ngày ước tính."** Sự phân biệt ấy có thật nhưng nằm ở chỗ KHÁC — trong `_comment` của file (văn xuôi cho người đọc, không phải dữ liệu theo mã) và trong cờ `estimated` của tastytrade — còn dòng "Earnings kế tiếp" trên màn hình in một NGÀY TRƠ, không mang nhãn nào. Tức chú thích cấp cho người đọc một sự chắc chắn mà thứ họ đang nhìn không hề thể hiện, đúng hình dạng degradation idiom mà repo này cấm, chỉ khác là lần này lời hứa nằm ở chú thích chứ không ở dữ liệu. Câu mới nói thẳng nhãn "ngày ước tính" **chỉ có ở Hard gates bên tab Screener** (nơi #135 thực sự dựng nó), và nói luôn dấu `—` GỘP hai trạng thái: `nextEarnings` là `find(d => d >= today) ?? null` nên mã vắng mặt (chưa biết gì), mã mang mảng rỗng (ETF, đã kiểm và không có) và mã chỉ còn ngày quá khứ đều ra cùng một gạch ngang. **Cố ý KHÔNG sửa bằng cách đẩy cờ `estimated` ra tab Analyze**: làm thế phải sửa route, và việc đó là một thay đổi thật đáng làm riêng chứ không phải đính kèm vào một bản vá chữ. Chỉ i18n.tsx, một khoá.

- 2026-09-16 — #135 **Cổng earnings hết mù — lý do mở tài khoản tastytrade, nay xong.** #127 mở tài khoản đúng vì việc này, #131 làm cho lỗ hổng NHÌN THẤY được, probe production đo xong hình dạng, giờ mới vá. Cổng đọc `data/earnings.json` chỉ dựng cho watchlist, nên quét cả rổ thì ~450/503 mã qua cổng vì KHÔNG AI BIẾT GÌ chứ không phải vì không có earnings. **`visible` là trường làm nên phép tách ba, và nó được ĐO chứ không đoán**: AAPL trả `visible: true` + `expected-report-date: "2026-10-29"`; SPY (ETF) trả `visible: false` và KHÔNG có ngày — tức tastytrade NÓI RA "mã này không có earnings" chứ không im lặng, đúng cái ranh giới #131 xoay quanh. `parseEarnings()` có ba lối ra: `visible false` → đã kiểm, không có; `visible true` + ngày → đã kiểm, có ngày; `visible true` mà THIẾU ngày → **vẫn là chưa biết**, không ghi vào kho, cổng vẫn gắn cờ — gộp lối ra thứ ba vào "không có earnings" là vẽ dấu ✓ chắc nịch lên thứ chưa ai biết, tức lặp lại #131 ở tầng sâu hơn. **Tích hợp nhỏ vì khuôn #131 đã đúng sẵn**: cổng đọc `!(symbol in earnings)` nên mã mang MẢNG RỖNG đọc thành "đã kiểm, không có gì" mà cổng không sửa một dòng. Nối ở `loadEarnings()` — điểm nghẽn DUY NHẤT của cả năm nơi dùng (cổng Screener, ô cần-để-ý của My Portfolio, Analyze, API điện thoại, scan đã lưu) — nên một chỗ sửa là cả năm cùng hết mù và không chỗ nào trôi lệch. **HỢP chứ không ĐÈ**: file tay có nhiều ngày còn tastytrade chỉ trả ngày kế tiếp, đè lên là mất ngày quý sau mà không ai thấy (test ghim). **Cờ `estimated` được HIỆN chứ không chỉ lưu** — hợp đồng bị loại vì ngày ĐOÁN bị loại trên bằng chứng yếu hơn hẳn, và lưu cờ mà không hiện đúng bằng lỗi `hasMultileg` #125 phê bình; cố ý cảnh báo THỪA (ngày có ở cả hai nguồn vẫn hiện là ước tính) vì nói "kiểm lại" nhầm thì vô hại, nói "chắc chắn" nhầm thì không. **Không biến môi trường mới, không bước deploy nào**: kho là `.cache/ttearnings.json`, repo đã ghi rõ `.cache` là thứ mất được và dựng lại được, deploy xong lấp lại ~500 mã hết ~6 request — né sạch cái bẫy `USERS_PATH`. Trần lô CHƯA đo được, xử bằng THIẾT KẾ chứ không bằng đoán: `BATCH = 100`, và mỗi lô đối chiếu hỏi/về rồi đẩy phần chênh vào `missing`, nên trần thật thấp hơn sẽ lộ ra thành một CON SỐ chứ không thành lỗ hổng im lặng; một lô ném lỗi thì bỏ qua chứ không làm hỏng cả lượt. Đồng bộ đi nhờ vòng lặp cảnh báo nhưng ĐỨNG NGOÀI `runOnce()`, cùng lý do Form 4: công ty công bố ngày earnings phần lớn SAU khi sàn đóng, đúng lúc `runOnce()` đang nghỉ. 27 khẳng định, gồm cả `evaluate()` đầu-cuối: cổng cứng giờ LOẠI hẳn hợp đồng có earnings trong kỳ. Touches types.ts, screener.ts, scan-job.ts, alert-runner.ts, i18n.tsx (chỉ thêm khoá), DetailDrawer.tsx, mới lib/ttearnings.ts.
- 2026-09-16 — #134 **Ba lỗi hiển thị chủ app thấy mà ĐỌC CSS không thấy được.** Báo: "theo mã kéo qua trái dài quá, chữ mã và chữ nghị sĩ bị lỗi, theo nghị sĩ chưa có hình ảnh và đảng". Cả ba tái hiện bằng cuộn thật rồi chụp màn hình. (1) **Cột ghim `z-index: auto` KHÔNG nằm trên.** Chú thích cũ nói nền đục là đủ - chỉ đúng một nửa: sticky mà `z-index: auto` thì không tạo tầng riêng, nên mọi ô ĐỨNG SAU trong DOM mà có `position` (thanh mua/bán, thanh call/put, vòng tròn ảnh đều thế) vẽ ĐÈ lên. Kéo sang trái là mã cổ phiếu bị thanh đỏ và nửa chữ "không rõ" trườn qua. Nằm ở `.pftable` nên **Options Flow dính y hệt**, sửa chung hai dòng. Viết luôn `padding-left: 10px` - không có thì ô lấy mặc định 1px của trình duyệt, mã dính sát mép; vế `padding-right: 10px` ngay cạnh cho thấy ý định vốn là đệm đều, chỉ mới viết một nửa. (2) **Xếp chồng ảnh đúng cho ẢNH, sai cho CHỮ.** `margin-left: -8px` an toàn với ảnh chân dung (mép ngoài là tóc và nền) nhưng ô sau che mất chữ cái thứ hai của ô trước: "NP" thành "NF", "BS" thành "B5" - cái vòng tròn sinh ra để nói AI lại in sai tên người. Đổi sang khoảng hở 3px. (3) **Bảng con `nowrap` quyết định bề ngang bảng cha.** Bảng chi tiết 8 cột nằm trong `<td colSpan={7}>`, mở một dòng là bảng ngoài phình 640→832px trên điện thoại; `overflow-x: auto` trần KHÔNG cứu được vì ô cha vẫn co theo nội dung. Đo sáu cách: cho ô xuống dòng giữ được bề ngang nhưng bóp bảng chi tiết còn 625px cột dính nhau; **`width: 0` + `min-width: 100%` trên khung bọc** thắng - giữ nguyên 817px và cuộn trong khung của chính nó, bảng ngoài đứng yên 640px. Và **hai câu hỏi kia được trả lời bằng cách NÓI RA**: bốn trạng thái ("chưa đồng bộ từ khi app biết đọc trường này" / "mã định danh không đúng dạng Bioguide" / "UW không trả trường đảng" / "chạy tốt") trước đây trông y hệt nhau là một vòng tròn chữ cái, mà cách sửa khác hẳn - giờ màn hình in NGUYÊN VĂN `politician_id` thật, đọc từ bản ghi đang hiện chứ không phải từ `lastRun` (nằm trong RAM, deploy xong là rỗng - bắt bấm đồng bộ để đọc thứ đã nằm trên màn hình là bắt chờ vô ích). **Kèm một lỗi suýt giấu bản vá đảng suốt 90 ngày**: `syncCongress` chỉ ghi khi khoá CHƯA có, mà bản ghi cũ trên đĩa do code CŨ phân tích nên thiếu đúng những trường mới thêm - thêm code đọc `party` xong màn hình vẫn trống cho tới khi bản ghi cũ hết hạn, và trông y hệt "UW không trả trường đó". Giờ ghi đè mỗi lần đồng bộ; `saved` vẫn chỉ đếm khoá mới, `allSeenAlready` vẫn tính trước khi ghi nên cách dừng trang không đổi. `CongressRun` mang thêm `sampleKeys` - tên trường THẬT của UW đo tại lúc đồng bộ, đúng khuôn `/api/uwprobe`. Touches globals.css (một quy tắc dùng chung `.pftable`), i18n.tsx (chỉ thêm khoá).
- 2026-09-16 — #133 **Tab Quốc hội đọc được, và con số quan trọng nhất trước giờ không hề hiện.** Chủ app hỏi "làm nhìn dễ và có hình ảnh nghị sĩ, thông tin chi tiết, rõ giống tab quyền chọn hay dark pool", giữa chừng gửi thêm ảnh `capitoltrades.com/politicians` làm mẫu. Bảng cũ 3 cột + danh sách gạch đầu dòng `.pfskipped` (style của vị thế BỊ BỎ QUA) - đúng hình dạng Options Flow trước #125. Sửa: mặt người ngay trên hàng (4 ảnh chồng + chip +N); thanh mua/bán trên thang CHUNG; chi tiết thành BẢNG 8 cột; và nút gạt **Theo mã / Theo nghị sĩ** - bảng xếp theo mã trả lời "mã này ai đụng vào", không bao giờ trả lời được "người này đang làm gì" dù thêm bao nhiêu cột. `byMember()` gom từ CHÍNH payload đang hiện, không thêm endpoint: một đường tính thứ hai là một con số có thể cãi nhau với cái bảng ngay bên cạnh. **Thứ đáng giá nhất là ĐỘ TRỄ CÔNG BỐ** (khoảng trống ghi trong file này bấy lâu, nay đóng): màn hình nói "30-45 ngày" theo luật, nhưng đó là TRẦN - đo thật thì trung vị Thượng viện ~116 ngày, và trong 250 bản ghi KHÔNG bản nào là giao dịch trong 7 ngày gần nhất. Một bảng tiêu đề "ai đang mua" mà thật ra là "ai đã mua bốn tháng trước" không phải thiếu thông tin, nó dẫn tới quyết định sai. Hai luật số học màn hình dựa vào: thiếu ngày công bố ra `null` chứ KHÔNG ra `0` (số 0 đọc thành "công bố ngay trong ngày"), và lag ÂM cũng ra `null` chứ không in một con số vô lý trông như thật. `tradeSide()` đúng cái bẫy `flowSide()` từng là - `'Sale' ? sell : buy` là phép ĐẾM SAI từ lúc bắt đầu cộng theo phía; "Exchange" có phía `other` thật, test ghim. Ảnh: phép kiểm dạng Bioguide `^[A-Z]\d{6}$` CHÍNH LÀ phép đo, không khớp thì null, không bao giờ bịa đường dẫn; nằm ở route chứ không ở component vì `congress.ts` đọc `node:fs`. **Lỗi thật tự lòi ra khi chụp ảnh cả trang: `loading="lazy"` biến chính cái fallback thành lỗi nó sinh ra để chặn** - ảnh dưới màn hình chưa hề được tải nên `onError` chưa chạy nên nhánh "hỏng thì vẽ chữ" chưa tới lượt, thẻ hiện VÒNG TRÒN RỖNG. Sửa bằng cấu trúc chứ không thêm trạng thái: chữ cái đầu LUÔN vẽ, ảnh đè lên. `party`/`state` đọc dung thứ và CHƯA XÁC NHẬN UW có trả - không có thì không vẽ vòng màu đảng, tuyệt đối không suy đảng từ tên hay bang (bịa một sự thật chính trị, mà vòng màu bịa trông y hệt vòng màu đúng). Cố ý KHÔNG có cột "tổng tiền" như trang mẫu: luật chỉ cho khai KHOẢNG nên mọi số tổng là trang đó tự đoán một điểm giữa khoảng - và màn hình nói ra lý do, nếu không thì trông như thiếu dữ liệu. Vòng màu đảng dùng lại `--gexput`/`--gexcall` (đảng là PHÂN LOẠI như call/put) nên không đụng bẫy ba khối theme. Touches i18n.tsx, globals.css (chỉ thêm). Không có biến môi trường mới, không di trú dữ liệu.
- 2026-09-16 — #131 **Cổng earnings từng vẽ dấu ✓ cho mã chưa bao giờ được kiểm.** `earnings.json` chỉ dựng cho mã trong WATCHLIST, mà cổng đọc `passed: !earn` - `earn` undefined ở HAI tình huống khác hẳn nhau: "đã kiểm, không có earnings trong kỳ" và "không biết gì về mã này". Cả hai ra dấu ✓ xanh, tức màn hình nói "đã kiểm, sạch" về ~450/503 mã không ai từng tra. Đúng thứ degradation idiom gọi tên, và đúng hình dạng vụ CRWD. **KHÔNG sửa bằng cách cho trượt** - làm thế là loại ~450 mã, quét cả rổ ra bảng trống, và trái quy tắc sẵn có (thiếu dữ liệu không phải bằng chứng có vấn đề; ivHv/chg20Pct đều pass khi null). `passed` giữ nguyên, SỐ MÃ QUA CỔNG KHÔNG ĐỔI (test ghim đúng điều đó). Thêm `unknown: true`, DetailDrawer vẽ `?` màu --warn kèm nhãn "chưa có dữ liệu", tooltip nói rõ lịch earnings chỉ phủ watchlist. **Khuôn mẫu ĐÃ CÓ SẴN ở tab kia**: `portfolio.ts` phân biệt chuyện này từ lâu bằng `earningsUnknown`/`earningsDataGap`; Screener chỉ là chưa được áp. Bài học tìm kiếm: gặp lỗ hổng thì grep xem mặt khác của chính app đã giải chưa, trước khi tự nghĩ cách. Touches i18n.tsx, globals.css (chỉ thêm).
- 2026-09-16 — #130 **Cái 401 của tastytrade KHÔNG phải của tastytrade.** Lần chạy probe đầu tiên ở production: 401 nhưng thân là `<title>401 Authorization Required</title> … <hr><center>nginx</center>` + `<script src="/Bwlu3He5C3/…">` - HTML của proxy ở RÌA, không phải JSON của API, và đường dẫn script ngẫu nhiên là chữ ký lớp chống bot. Tức request chưa từng tới API, giấy tờ chưa từng bị soi; không phân biệt được chỗ này là mất cả buổi đi cấp lại secret/refresh token vốn không sai. Tìm nguyên nhân bằng cách SO với client đang chạy thật trong repo: `schwab.ts` gửi token request bằng `x-www-form-urlencoded` (đúng RFC 6749; JSON là ngoài chuẩn) còn tastytrade.ts gửi JSON; `sec.ts` gửi User-Agent (comment ghi thiếu là 403) còn tastytrade.ts không gửi. Không đoán cái nào - `TOKEN_VARIANTS` thử cả 4 tổ hợp (form/json × có/không UA) theo thứ tự khả năng rồi NHỚ cái chạy được. `classifyBody()` tách hai loại 401: `json-api-error` = API đã đọc giấy tờ và từ chối (sửa phía tastytrade) vs `bot-wall`/`html-other` = chặn ở rìa (sửa phía mình) - và vòng lặp DỪNG NGAY ở `json-api-error`, vì đổi cách gửi thêm chỉ đốt thêm lượt gọi với đúng bộ khoá đã bị từ chối. `ttGet()` cũng gửi UA. Kiểm bằng mock dựng đúng cái tường production.
- 2026-09-15 — #127 **Probe tastytrade, chưa có tính năng.** Chủ app mở tài khoản tastytrade vì Schwab không có ngày earnings lẫn IV rank - và ĐO được rằng đó là lỗ hổng thật: hard gate "không có earnings trong kỳ hợp đồng" đọc `earnings[u.symbol] || []`, mà `earnings.json` chỉ dựng cho watchlist, nên quét cả S&P 500 thì ~450 mã ĐI QUA CỔNG vì không có dữ liệu chứ không phải vì không có earnings ("chưa biết" hiện y hệt "an toàn" - đúng kiểu CRWD bị bỏ lỡ). Chỉ xây `/api/ttprobe` theo khuôn `/api/uwprobe`: gọi một lần trong production, in KHOÁ + KIỂU thật của `/market-metrics`, rồi mới code theo cái đo được. Nó trả lời: xác thực cách nào chạy (OAuth ưu tiên; username/password là mật khẩu môi giới nằm trong env, chỉ dự phòng); token phiên gắn header có "Bearer" hay không (tài liệu nói KHÔNG - `ttGet()` bị 401 thì thử cách kia đúng một lần rồi nhớ, probe báo `schemeAccepted`); `found.earnings` có không và tên thật là gì; và **hỏi N mã về đủ N không** - mã rơi im lặng là thứ một cái gate phải biết trước. `/api/ttprobe` nằm trong OWNER_ONLY: chỉ trả hình dạng nhưng là lượt gọi trên TÀI KHOẢN MÔI GIỚI của chủ app. Kiểm bằng server giả: 13 khẳng định máy khách (kể cả mock ĐÒI Bearer → thử lại một lần rồi nhớ, không lộ token/mật khẩu/email), route qua cổng 400/403/401/200, mock cố tình rơi SPY và probe gọi đúng tên. Tính năng chưa viết dòng nào - chờ một lần đo thật.
- 2026-09-15 — #125 **Options Flow đọc được.** Chủ app hỏi "quyền chọn trong mục insider có cách nào nhìn dễ hơn không" - bảng cũ có 3 cột (mã, số sweep, ngày) và một danh sách gạch đầu dòng, tức câu hỏi DUY NHẤT của luồng quyền chọn (tiền lớn ở đâu, phía nào) không nhìn thấy được nếu không bấm từng dòng. Sửa: xếp theo TIỀN chứ không theo số sweep (3 sweep nhỏ từng đứng trên một lệnh 5 triệu đô); mỗi mã một thanh call/put - BỀ RỘNG là tổng tiền trên thang CHUNG (thang riêng từng dòng thì mã 50 nghìn vẽ dài bằng mã 5 triệu), tỷ lệ bên trong là call/put; chi tiết thành BẢNG thật 6 cột thay cho `.pfskipped` (style của vị thế bị bỏ qua, chạy chữ liền nên so hai lệnh phải đọc lại từ đầu); và hiện KL/OI - trên 1 là vị thế MỚI, tín hiệu mạnh nhất trong một dòng flow, vốn đã có sẵn trong payload mà chưa bao giờ hiện. **Bẫy đã suýt tự tạo ra: `type === 'put' ? put : call` là một phép CỘNG SAI.** Lúc chỉ in một chữ thì giá trị lạ hiện thành "call" là lỗi trang trí; từ khi tiền được cộng THEO PHÍA thì mọi giá trị UW đổi tên sẽ chảy hết vào cột call và thanh vẫn vẽ đẹp - một con số sai trông y như số đúng. `flowSide()` có phía `other` thật, màn hình gọi tên nó khi khác 0, test ghim bằng bản ghi "mystery-side". Hai chỗ nói thật: `hasMultileg` giờ được hiện (spread chứ không phải cược một chiều), và chú giải nói rõ **dữ liệu này KHÔNG cho biết ai mua ai bán** - lệnh call lớn có thể là người ta BÁN call; thiếu câu đó không phải thiếu thông tin mà là một kết luận sai. Màu dùng lại `--gexcall`/`--gexput` của GEX (call/put là PHÂN LOẠI; lấy --credit/--risk sẽ đọc thành "call tốt, put xấu" - đúng thứ ColorLegend sinh ra để tránh) nên không đụng tới bẫy ba khối theme. `alert_rule` lạ in TÊN THẬT của UW chứ không in `of.rule.xxx` - `t()` trả về khoá khi thiếu, mà UW thêm quy tắc không báo. Touches i18n.tsx, globals.css (chỉ thêm). Không có biến môi trường mới, không di trú dữ liệu.
- 2026-09-13 — #123 **Quên mật khẩu: mã đặt lại một lần.** Chủ app bấm "Tạo mã đặt lại" trong Quản lý tài khoản → mã 8 ký tự hiện ĐÚNG MỘT LẦN (trên đĩa chỉ có bản băm scrypt + salt riêng), sống 30 phút, dùng một lần → người nhà vào trang đăng nhập bấm "Quên mật khẩu?" và TỰ đặt mật khẩu mới. Chủ app không bao giờ biết mật khẩu của họ, và không phải nhắn mật khẩu qua tin nhắn nữa. **Lập luận an toàn nằm ở đúng một chỗ: CHỦ APP KHÔNG BAO GIỜ CÓ MÃ.** Cửa nhập mã bắt buộc phải mở ra Internet (người quên mật khẩu thì chưa đăng nhập được), nên nếu mã đặt lại được `APP_PASSWORD` thì một mã lọt ra ngoài không mất một tài khoản phụ mà mất cả tab danh mục - vị thế Schwab thật. `createResetCode()` từ chối thẳng OWNER, `redeemResetCode()` không thèm tra OWNER. Chủ app quên thì đổi `APP_PASSWORD` trên Render - đã ghi ở DEPLOY.md VÀ nói ngay trên màn hình đăng nhập, nếu không chủ app ngồi chờ một cái mã không thể tồn tại. Bốn quyết định nhỏ đều có lý do: bảng chữ bỏ I L O 0 1 (mã đọc qua điện thoại, nghe nhầm O/0 thì trên màn hình không phân biệt được với mã bịa); lấy mẫu có LOẠI BỎ chứ không `% 31` (256 không chia hết cho 31 → chữ đầu bảng ra nhiều hơn, mất entropy lặng lẽ; đo 300 mã, đủ 31 chữ, lệch 1.48 lần); `expired` được nói thẳng còn tên sai/chưa phát mã/mã sai gộp một câu (nói "hết hạn" chỉ nói được với người ĐÃ gõ đúng mã); và mật khẩu mới quá ngắn KHÔNG đốt mã lẫn lượt thử. `lib/ratelimit.ts` tách ra dùng chung với `/api/session` - **một cơ chế, hai cái xô riêng**: người nhà gõ nhầm mã 5 lần không được làm chủ app hết lượt đăng nhập (đo được: cửa mã khoá, đăng nhập vẫn 200). Touches i18n.tsx, globals.css (chỉ thêm). Không có biến môi trường mới, không có bước deploy nào.
- 2026-09-13 — #121 **Chủ app bị khoá ngoài sau #120, và màn hình đổ lỗi sai.** Báo "Sai mật khẩu." - mà đó là chữ của #119; #120 viết "Sai tên đăng nhập hoặc mật khẩu." Tức trình duyệt chạy trang CŨ với server MỚI, mật khẩu chưa bao giờ sai. ĐO được: `next start` trả `/login` kèm `Cache-Control: s-maxage=31536000` vì đó là trang tĩnh dựng sẵn - `s-maxage` nói với bộ đệm CHUNG, và app nằm sau proxy của Render. Chuỗi lỗi: trang cũ một ô → gửi `{password}` thiếu tên → server mới từ chối đúng bằng `WRONG_LOGIN` → client cũ không biết mã đó nên rơi vào nhánh mặc định "Sai mật khẩu". Sửa hai tầng: middleware đặt `no-store, must-revalidate` cho các đường trong `OPEN` (trang, không phải API), và trang đăng nhập KHÔNG gộp mã lạ vào "sai mật khẩu" nữa mà in mã thật + nhắc tải lại trang. **Bài học chung, không riêng gì đăng nhập: một trang tĩnh mà đổi giao thức với server là một trang không được phép cũ - và gộp "không biết" vào một câu trả lời chắc nịch là cách biến lệch phiên bản thành lời buộc tội người dùng.** Touches i18n.tsx (thêm một khoá).
- 2026-09-12 — #120 **Ô tên đăng nhập + màn hình quản lý tài khoản.** #119 suy danh tính từ mật khẩu nào khớp; hai người trùng mật khẩu là người sau lặng lẽ đăng nhập THÀNH người trước - có ô tên thì lỗi đó không tồn tại được. Tài khoản rời `APP_USERS` sang file trên đĩa (`USERS_PATH`), **băm scrypt, salt riêng từng người và từng lần đổi**, quản lý ngay trong app (⚙ → Quản lý tài khoản, chỉ chủ app). `APP_USERS` giờ là HẠT GIỐNG MỘT LẦN - nếu để nó làm chủ thì xoá người trong app rồi deploy lại là họ sống dậy. Mật khẩu chủ app cố tình nằm NGOÀI kho đó (`APP_PASSWORD`), để file hỏng cũng không tự khoá mình ra ngoài. Ràng buộc định hình cả thiết kế: **middleware chạy Edge, không có `fs`**, nên `knownUser()` của #119 không hỏi được nữa - bù bằng ba thứ (cổng vai trò đọc từ cookie ĐÃ KÝ vẫn nguyên; `requireUser()` kiểm tra tồn tại phía Node, 401 `ACCOUNT_GONE` + đẩy ra `/login`; phiên người nhà rút còn 7 ngày vì route dữ liệu thị trường thuần tuý vẫn trả lời cookie của người đã xoá - ĐO được, không phải đoán). Hai lỗi tự soi ra và sửa luôn: `GET /api/session` trả tên chủ app trên một route ai cũng gọi được (đã xoá hẳn endpoint), và nhánh chưa xác thực của middleware chuyển tiếp `x-ps-user` của client (`strip()`). **Deploy: phải tự thêm `USERS_PATH` trên Render, và mọi người đăng nhập lại một lần.** Touches i18n.tsx, globals.css (chỉ thêm).
- 2026-09-12 — #119 **Tài khoản cho người nhà.** `APP_USERS="ten:matkhau,..."` mở tài khoản phụ: dùng được Screener/Analyze/Heatmap/Insider Trade + watchlist RIÊNG, nhưng 403 với danh mục, P/L, cảnh báo và OAuth Schwab. Đăng nhập vẫn chỉ một ô mật khẩu - mật khẩu nào khớp thì đó là danh tính. Cookie giờ mang tên người dùng trong phần được ký; **định dạng cookie cũ bị từ chối, nên deploy lần đầu là mọi người phải đăng nhập lại một lần**. Watchlist trên đĩa đổi sang `{ten: [...]}`, mảng phẳng cũ vẫn đọc là của chủ app (đừng sửa chỗ đó - nó giữ watchlist thật trên Render). Đây là phân tách VAI TRÒ trên một phiên Schwab, không phải đa người dùng.
- 2026-09-09 — #118 **Real root cause of the company profile staying English** (third report of the same symptom; #112 built it, #117 only made it visible). `claude-opus-5` runs adaptive thinking BY DEFAULT when `thinking` isn't passed — a change from Opus 4.8/4.7 — and thinking eats the same `max_tokens` as the answer. `profiletranslate.ts` capped it at 3072 believing "effort thấp" meant shallow/no reasoning; effort only tunes depth, it never turns thinking off. Long FMP description + Vietnamese diacritics + thinking overruns 3072 → JSON cut mid-string → `JSON.parse` throws → old code filed it as `failed`, identical on screen to a network blip. Cap now 16_000, matching `/api/ai`, which documents this exact hazard and had never been followed here. New reasons `truncated` (checked before the parse) and `bad-request` (`output_config.effort` is the repo's only use of that param and has never run live). Test fails against pre-fix code on all three points.
- 2026-09-08 — #112 Analyze tab's company-profile card (sector/industry/country from Finviz, description from FMP - all English-only sources) now auto-translates to Vietnamese via Claude, cached on disk per symbol (`lib/profiletranslate.ts`) so it costs one API call ever per symbol, not per page view. Cache checked before the API-key check so an existing translation survives a key rotation. Falls back to English on any failure. Owner report: "phần thông tin công ty lúc tiếng việt phần thông tin vẫn là tiếng anh".
- 2026-09-08 — #111 Analyze tab's "Ask Claude" now reads EVERY indicator in one pass: technical + implied vol + fundamentals + the GEX profile from the page's own chart (`GexChart.onData` → `AnalysisPanel` → `AiRead`; falls back to one `/api/gex` fetch, and the prompt says NOT AVAILABLE and why when there is none). Prompt lives in new `lib/airead.ts` (standalone-testable). Fixed on the way: `macd.histogram` vs `macd.hist` (histogram was always n/a), and %B/bid/ask/volume/sector never sent. Owner's ask: "gom technical và gex tất cả chỉ số".
- 2026-09-08 — #110 UI now remembers the open tab, both sub-tabs, the GEX ticker and zoom in localStorage (new `lib/remember.ts`, validated allow-lists, read after hydration), and `GexChart` keeps the last good reading per symbol in memory so coming back to the tab shows the chart at once (a failed refresh keeps it and warns). SPY added to the Heatmap GEX presets. Owner's ask: "SPX bị mất mỗi lần thoát ra".
- 2026-09-09 — #117 Owner reported the EXACT #112 symptom again ("chọn tiếng Việt mà thông tin công ty vẫn tiếng Anh"), because #112 swallowed every translation failure into the same silent null - no way to tell "not translated yet" from "translated and failed because X". translateProfile() now returns a reason (no-key/bad-key/rate-limited/failed), classified the same way /api/ai/route.ts already classifies Anthropic SDK errors, and AnalysisPanel shows it via a real caption. Also found and fixed while wiring the caption: `.hint-warn` alone has the SAME specificity as `.hint`, and a later `.hint { color: var(--muted) }` block wins - so all 10 existing `.hint.hint-warn` usages app-wide (AiRead, FearGreed, FilterPanel×3, GexChart, TradeBriefingPanel×3) were silently rendering grey instead of the warning colour. Third instance of this exact specificity trap in this repo (#58, #101, now this) - caught by measuring computed color in a real browser, not by reading the CSS. Also: the actual wiring bug in the new caption itself was forgetting to pass the reason prop at the call site - caught by the same measurement, not by the type checker (both types were optional).
- 2026-09-09 — #116 Checkbox row label text (from #115) now font-weight 700 - owner's follow-up ask, same rows. Neither .field-toggle nor .check had a weight set before.
- 2026-09-08 — #115 Checkbox row label text now matches the checkbox's own accent-color (var(--stamp)) in the Sell Put filter panel - both .field-toggle (was --muted grey) and .check (was no colour set, and its checkbox had no accent-color at all, so box and label weren't guaranteed to be the same blue). Owner's ask: "chữ trong hàng ô tích sẽ là màu nền của ô tích xanh luôn". Contrast checked on --card: 5.70:1 dark, 4.87:1 light.
- 2026-09-08 — #114 Light theme brought onto the same Schwab palette. The screenshots are dark-mode only, so light is DERIVED: hue and saturation held, lightness lowered to the lightest value still clearing contrast, measured against the PAGE background (harder than the white card). accent #009dda→#0079a9, green #4cb84c→#3a933a, orange #ed7e12→#c6690f; red and the brand pill were already dark enough and are byte-identical in both themes. Two wrong derivations caught by their own contrast table (one returned #000000 for red, one missed accent-on-page at 4.19:1).
- 2026-09-08 — #113 Dark theme reskinned to match the owner's Schwab app, from colours SAMPLED out of their screenshots (per-pixel classification, not eyeballing): paper #111518, card #161a1d, gain #4cb84c, loss #e5484d, accent #009dda, brand pill #016e99, and the distinctive blue-tinted muted #8f99a3. All pairs contrast-checked. Type scale lifted (body 14→15, .stats dd 15→18) after measuring the reference's 0.72 label:number ratio. Light theme untouched; font family deliberately kept (Be Vietnam Pro, for Vietnamese diacritics). Touches globals.css only.
- 2026-09-07 — #109 SPX has its bar chart and AI briefing back, via **CBOE's public 15-min-delayed chain** (`cdn.cboe.com/.../_SPX.json`, the feed tapchiphowall reads - no key, no quota). New `lib/cboe.ts` converts it to the Schwab chain shape; new `lib/gexchain.ts` owns the Schwab→CBOE rungs and is shared by /api/gex AND /api/tradebrief. Ladder is now Schwab → CBOE → UW → disk → error. CBOE's JSON shape is UNVERIFIED from the sandbox: a mismatch prints the real keys on screen - if the owner reports that line, fix the field names, don't guess. Touches i18n.tsx.
- 2026-09-06 — #108 **Overturns #103.** SPX is a Schwab **API defect**, not a missing entitlement. The owner's thinkorswim, same account, 26 min after the API reading, shows real open interest on the same contracts (8 SEP 26: 7800C = 5,671, 7650P = 3,653) where the API returns 0 on all 3600. OI is exchange data, not computed locally, so the account HAS the data. Reported to traderapi@schwab.com. The measurements in #103 were right; the interpretation was not - it was inferred from one surface and never cross-checked against a second. Docs only.
- 2026-09-06 — #107 Second uwprobe reading closes it: spot-exposures is a TIME SERIES (564 buckets, exactly 1 price each, looksLikePriceCurve=false), not a gamma-vs-price curve. So no UW endpoint can draw an SPX chart either - SPX stays 4 numbers unless Schwab opens index-option data. Logged what UW's unused endpoints CAN do (251-day + intraday time series of chain-wide greeks - a "is dealer gamma rising or falling" chart the app lacks) and that only the _oi basis is populated for SPX. Kept /api/uwprobe rather than deleting it - it paid for itself three times in one day.
- 2026-09-06 — #106 First uwprobe reading from production: NO UW endpoint has gamma per strike (greek-exposure is 251 rows by date, spot-exposures 564 by time, gex-levels is 4 levels) - so the SPX bar chart can't come from UW either. Probe's own heuristic misfired though: 'price' was in STRIKE_HINTS, and at spot-exposures that's the spot price. Fixed, plus curveShape groups by the bucket key (start_time, not per-row time) to tell a gamma-vs-price curve from a time series. Also learned: UW's _oi basis is comparable to ours, gex-levels runs on 'vol', and UW's unit is per-1%-move - same as ours.
- 2026-09-06 — #105 Added /api/uwprobe: measures the SHAPE of UW's greek-exposure / spot-exposures / gex-levels (keys, array-or-not, field TYPES, one capped sample, and looksPerStrike) without dumping payloads or the API key. Scaffolding, not a feature - UW is unreachable from the dev sandbox, and this repo has been burned by coding from UW docs before. Run once in production, code against what it measured, then delete.
- 2026-09-06 — #103 SPX CLOSED (docs only). Production, all three spellings tried: gamma=0 AND openInterest=0 on all 3600 contracts, status=SUCCESS, assetMainType=INDEX. The account has no index-option market data - GEX = gamma x OI, so no code change can compute it. #86-#91 (spellings), #92/#96 (size), #97/#98 (field types) were all the wrong tree. UW stays the source for SPX. Logged one untried idea: SPY chain x10 as an SPX proxy.
- 2026-09-06 — #102 The "đã thử" list added in #100 never actually appeared: the detail string is 353 chars, the cut was at 300, and the raw ~120-char sample sat in front of the list. Same trap as #90. Fields now ordered by information value (spellings tried first, raw sample last), one shared cap (600), and a clipped string ends in "…" so a cut can't read as "Schwab only sent this much".
- 2026-09-06 — #101 App-wide session bug: a Schwab 401 that survived the forced-refresh retry threw "Schwab <path> 401: ...", which does NOT contain REAUTH_REQUIRED - the string every route uses to detect a dead session. So it slipped past all of them; /api/gex read it as "Schwab unusable" and showed UW levels while the whole app had lost its Schwab connection. Now throws REAUTH_REQUIRED (original status/body kept after the marker). Test fails against the pre-fix code with 200 + UW levels, reproducing the owner's screenshot.
- 2026-09-06 — #100 SPX cause MEASURED from production: Schwab sends 3600 contracts over 28 expirations with openInterest=0 on every one (gamma 0 too, 38 at -999). Not a parse bug - GEX = gamma x OI, so a chain with no OI can't produce one. Also fixed: the index-symbol fallback only advanced on a 400, so a 200-with-hollow-data stopped at "$SPX" and never tried "$SPX.X"/"SPX". Wording fixed too - it claimed Schwab "refused" while status was SUCCESS.
- 2026-09-06 — #99 REGRESSION FIX (mine): #96 stopped Schwab throwing for SPX, which moved it onto the "Schwab succeeded" branch - and that branch returned a bare 404 while discarding the UW levels already fetched in parallel. So fixing the error made SPX go from showing UW numbers to showing an error. Both branches now share one degradation ladder (schwabUnusable): UW → disk → error. Test pins it by failing against the pre-fix route.
- 2026-09-06 — #98 SPY/QQQ work, SPX still doesn't - so it's index vs ETF, not response size. Diagnosis now also reports Schwab's own status/numberOfContracts/isIndex/isDelayed/isChainTruncated/assetMainType (an EMPTY chain leaves every drop counter at 0, so those fields are the only thing that speaks), and a 200-with-status-FAILED is now a separate error from "chain arrived but unusable". Does NOT claim to fix SPX - waiting on the owner's next error line.
- 2026-09-06 — #97 SPX got past the 502 but still computed nothing: Number.isFinite() does not coerce strings, so string-typed greeks drop the whole chain silently; Schwab's -999 "greek unavailable" sentinel was also being summed as real gamma. All numeric reads now tolerant, and the error reports contracts dropped per reason plus a real contract with its field TYPES (the only thing that tells "missing" from "string"). String-gamma as the real SPX cause is NOT confirmed - no network here.
- 2026-09-06 — #96 SPX on the Schwab side: when all three narrowed windows still get 502 TooBigBody, the chain is now stitched one expiration at a time (probe with strikeCount=1, then 12 nearest expirations merged). Keeps the bar chart and AI briefing, which the UW fallback can never provide. Screen says how many expirations the walls actually cover. Touches i18n.tsx.
- 2026-09-05 — #95 GEX calls Schwab and UW in parallel every request: comparison table of the four mappable levels on screen, UW covers immediately when Schwab fails (not just on 400/502), and both readings are saved to /var/data (gexhistory.ts, 15-min throttle, 30-day prune) so the last one shows when both sources die. Session expiry still returns 401 and is never papered over. Touches i18n.tsx and globals.css.
- 2026-09-05 — #94 GEX put/call wall now computed from NET gamma per strike, not a one-sided max. Found by comparing TSLA against tapchiphowall: put wall/abs gamma/spot matched exactly, call wall didn't (355 vs 400) - their own tallest call bar is at 355 too, so it was a definition gap, not data. Also fixes the old rule collapsing all three levels onto the ATM strike. Touches i18n.tsx.
- 2026-09-04 — #93 GEX chart redrawn to the layout the owner asked for (their screenshot of tapchiphowall's chart): labelled $M axis, red calls up / blue puts down on one shared scale, key-levels box, current-price line, ticker watermark, per-strike hover tooltip. New GexProfile.absGamma (biggest strike counting both signs). Touches i18n.tsx and globals.css - both shared files.
- 2026-09-04 — #92 Real cause of the SPX GEX failure found: Schwab's gateway refuses the response as too large (502 TooBigBody), not the symbol. Chain requests now narrow themselves (60d → 21d/120 strikes → 7d/60) until one fits, and the screen says when a narrowed window was used since the walls then only cover that window.
- 2026-09-04 — #91 SPX in GEX now falls back to Unusual Whales' gex-levels when Schwab 400s. Schwab index chains look genuinely unavailable to this account (every spelling 400s), so this stops chasing symbol formats. Levels only - no bar chart, no AI briefing - and the screen says which source it is showing.
- 2026-09-04 — #90 Made a bare index root ("SPX" typed by hand) take the same fallback path as "$SPX", and compacted the error detail so all attempted spellings fit on screen instead of being truncated.
- 2026-09-04 — #88 SPX-in-GEX fix attempt: fall back through "$SPX" → "$SPX.X" → "SPX" on a 400, stop at the first that works. Logic verified by standalone test, but the actual correct Schwab symbol is still unconfirmed against a live session (see the known gap above) - don't assume this is done without checking.
- 2026-09-04 — #86 /api/gex now surfaces the real Schwab error text instead of a generic message, after the owner reported SPX (but not QQQ/VIX) failing in GEX - doesn't fix the underlying symbol issue, makes it diagnosable from production instead of guessed at (logged as a known gap above, waiting on the owner to report back the real error text).
- 2026-09-03 — #85 Documented UW_API_KEY in .env.example, fixed a stale reference in this file, logged the README Insider Trade gap and the Congress disclosure-lag gap (both above, still unclaimed).
- 2026-09-04 — #83 Added the "In progress right now" log (this section's neighbor above) per owner's explicit request - status visible mid-task, not just after merge.
- 2026-09-04 — #58 Fixed /api/md/session reading its own stored clock instead of actually testing the token (read healthy long after Schwab had revoked it), and a CSS specificity bug hiding the sign colour on the results table's annualised-return cell. Sat open since 2026-08-26; verified both bugs were still real on current main and the merge was clean before merging.
- 2026-09-04 — #81 Split Heatmap into sub-tabs (price treemap / Fear & Greed / RRG / GEX), same pattern as Insider Trade's four-source split.
- 2026-09-04 — #80 Wrote down the "check git log, not memory" rule for status questions (this section) + the Recent work log itself, after one account answered from stale memory.
- 2026-09-04 — #79 AI Trade Briefing in the GEX frame (Analyze/DetailDrawer/Heatmap): real strikes/greeks/max-gain-loss from the live chain, Claude narrates only. Heston vol model and Calendar spreads explicitly NOT built (flagged in the code/PR, not silently skipped) - real follow-up work if wanted.
- 2026-09-04 — #78 Fixed Dark Pool sync burning through UW's 30k/day quota (was hitting the daily cap every day). Market-hours gating + slower auto cadence.
- 2026-09-04 — #77 SPX Market Maker Exposure panel (Heatmap tab), self-computed from Schwab, no paid feed.
- 2026-09-04 — #76 Dark Pool buy/sell colour-coding + volume summary.
- 2026-09-03/04 — #68-75 Unusual Whales integration: Congress trading, Options Flow, Dark Pool, sub-tabs, abbreviation fixes.

No PR is currently open and unmerged as of #162. If you're reading this and a
PR number below the highest merged one here is still open, something stalled
- check it before starting new work.

## Architecture

This is a single-user Next.js 14 App Router tool with five tabs (`src/app/page.tsx`): **Sell Put Screener**, **Analyze**, **Heatmap**, **My Portfolio**, **Insider Trade**, plus a login gate. Everything reads from Charles Schwab's API using the app owner's own OAuth session — there is no multi-tenant concept anywhere in the code.

### Schwab client (`src/lib/schwab.ts`)

One shared module wraps both of Schwab's APIs:
- **Market Data** (`get()`) — quotes, price history, option chains. No API key needed beyond OAuth.
- **Trader API** (`traderGet()`) — accounts, positions, transactions. Requires the app to have the "Accounts and Trading Production" product approved on developer.schwab.com (a manual, multi-day Schwab review), separate from Market Data approval.

**A Schwab HTTP 401 that survives the forced-refresh retry now throws `REAUTH_REQUIRED`, not `Schwab <path> 401: …`.** That string is how *every* route in the app recognises a dead session (`portfolio.ts`, analyze, heatmap, gex, tape, rrg, scan-job, all of `/api/md/*`), so a raw 401 slipped past all of them and each route then mishandled it in its own way. The worst case was `/api/gex`: a 401 read as "Schwab unusable", so it fell through to the Unusual Whales levels and the screen showed a normal-looking GEX table while the whole app had lost its Schwab connection — precisely what that route's own comment says must never happen. One 401 can be a stale access token, which is why the retry exists; a second one means the session is gone. The original status and body are kept after the marker so the failure is still diagnosable.

Both share one `RateLimiter` (100 req/min, under Schwab's 120 documented ceiling) and one token cache file. OAuth refresh tokens are **hard-capped at 7 days by Schwab, non-renewable** — there is no way to keep a session alive longer than that; the UI surfaces days-remaining and a reconnect button, and that's the ceiling, not a bug to fix. `appOrigin()` derives the app's public URL from `SCHWAB_CALLBACK_URL` rather than `req.nextUrl.origin`, because the latter resolves to Render's internal bind address specifically for the Schwab-initiated OAuth callback (proven unreliable behind Render's proxy; same-origin redirects like `/login` don't have this problem).

### Two gates in `src/middleware.ts`, not one

`/api/md/*` is a separate surface for a companion phone app, gated by a bearer/header token (`MD_API_TOKEN`) that must match the phone app's own config — no cookies involved. Everything else (pages + all other `/api/*`, including the Schwab OAuth callback itself) is gated by a username-and-password login — `APP_PASSWORD` for the owner, the hashed account store for everyone else — via an HMAC-signed session cookie (`src/lib/session.ts`, Web Crypto so it works in Edge middleware — not `node:crypto`). The signing key defaults to the password itself, so changing the password invalidates every existing session at once. Both gates are opt-in: an unset env var means that gate is open, which is correct for local dev but means a deploy that forgets to set `APP_PASSWORD` is silently public — `/api/auth/status` reports lock state and the UI shows a red warning.

### Family accounts: roles, not tenants (`src/lib/users.ts`, `userstore.ts`)

The app was built single-user, and `APP_PASSWORD` gated *everything* — so handing a family member the password also handed them the My Portfolio tab, i.e. real positions in the owner's Schwab account. Member accounts get the market tools (Screener, Analyze, Heatmap, Insider Trade) and **their own watchlist**, but not the portfolio, the realized P/L, the alerts, the Schwab OAuth endpoints, or account management.

**This is role separation on one Schwab session, not multi-tenancy.** Everyone shares the owner's token, the 100 req/min Schwab limit, the UW quota and the Anthropic key. Real isolation means a second deploy, not more code here.

**Login takes a username and a password.** #119 shipped a single password field and inferred identity from whichever password matched (`resolveUser`). That has a silent failure mode: two people who happen to pick the same password mean the second one quietly logs in *as the first* — same watchlist, same saved scans, no error anywhere. A username field makes that mistake unrepresentable. The owner's username is `APP_OWNER_USER` (default `owner`), reserved so no member can claim it.

**`APP_OWNER_USER` changes only what the owner types.** Internally the owner is always the `OWNER` constant, and that is what goes in the cookie and in watchlist/scan keys — otherwise renaming the env var later would orphan every piece of data keyed to the old name. `authenticate()` returns `{ name: OWNER }` no matter which spelling was typed.

**The owner's password is deliberately NOT in the account store.** It stays `APP_PASSWORD`. A corrupt or deleted `users.json` must never be able to lock the owner out of their own app, so the two credentials live in different places on purpose, and `userExists()` short-circuits `true` for `OWNER` rather than looking him up.

#### The Edge constraint is the thing that shapes this design

`middleware.ts` runs on the **Edge runtime**, which has neither `fs` nor `node:crypto`. So the code splits in two, and the split is not cosmetic:

- `users.ts` must stay **Edge-safe**: pure logic only — name validation, `roleOf`, the owner-only path lists. `middleware.ts` imports it.
- `userstore.ts` is **Node-only**: scrypt hashing, the on-disk store, `authenticate()`, `requireUser()`. Middleware can never import it.

That is why #119's `knownUser()` could not survive. It read `APP_USERS` from the environment — something Edge *can* do — to make a removed member lose access instantly even with a live cookie. Once accounts moved to a file, middleware lost the ability to ask the question at all. Three compensations, written down so a later reader does not mistake this for an oversight:

1. **The role gate in middleware is untouched.** Role is derived from the name inside the *signed* cookie, so a deleted member still never reaches the portfolio, the alerts, or `/api/users` — they get 403 as before.
2. **`requireUser()` does the existence check on the Node side**, and every route that needs to know *who* is calling goes through it (`/api/me`, `/api/watchlist`, `/api/screen`, `/api/screen/last`), returning 401 `ACCOUNT_GONE`. `page.tsx` turns that 401 into a redirect to `/login` rather than rendering a half-broken app.
3. **Member sessions are 7 days, the owner's 30** (`sessionMsFor()` in `session.ts`). What actually leaks is the residue: pure market-data routes that never ask for identity keep answering a deleted member's cookie until it expires. Measured, not assumed — `/api/feargreed` still executed for a deleted member. The short session is the bound on that window.

#### Password storage

scrypt (`node:crypto`), **a fresh 16-byte salt per user and per password change**, compared with `timingSafeEqual` — `===` returns at the first differing byte and that timing is measurable from outside. An unknown username still runs a **dummy hash** so a wrong name and a wrong password take the same time; otherwise the login form becomes a username oracle. The store is written tmp-then-rename so a crash mid-write cannot leave a truncated file where everyone's account used to be.

`listUsers()` returns only `{name, createdAt, updatedAt}` — never the salt or the hash, not even to the owner. `updatedAt` is shown on the management screen as "password last changed", which is the only reason it exists.

**Login never says which field was wrong** (`WRONG_LOGIN`), and `GET /api/session` was **removed**: it had returned the owner's username to prefill the form, on a route that is necessarily reachable without a session — handing a brute-forcer half the credential. The form prefills the literal string `owner` client-side instead, which tells an attacker only what the default already is.

#### `APP_USERS` is now a one-time seed, not a source of truth

The env var is read **only when the store file does not yet exist**, to migrate #119's accounts into hashed form. After that, editing it does nothing. That is deliberate and it is the interesting half: if the env var stayed authoritative, deleting someone in the app and then redeploying would silently **resurrect** them. A test pins exactly that.

#### Forgot password: a one-time code the owner hands over

The owner could already reset a member's password from `/accounts`, but that
means inventing a password and then *transmitting* it — and a password sent
over a messaging app stays in that thread forever. The code flow inverts it:
the owner hands over a short-lived token, the member chooses their own
password, and the owner never learns it.

`createResetCode()` issues an 8-character code, returns it **once**, and
stores only a scrypt hash with its own salt and a 30-minute expiry.
`redeemResetCode()` verifies it, rotates the password salt, and deletes the
code. `/api/users/reset-code` (owner-only, inherited from `/api/users`'s
prefix in `OWNER_ONLY`) issues; `/api/password-reset` (in `OPEN`) redeems.

**The owner can never have a reset code, and that is the whole security
argument.** The redeem endpoint has to be reachable without a session —
someone who forgot their password cannot log in first — so it is open to the
internet. If a code could reset `APP_PASSWORD`, a leaked code would not cost
one member account; it would hand over My Portfolio, i.e. real Schwab
positions. `createResetCode()` refuses `OWNER` outright and `redeemResetCode()`
never even looks the owner up. Owner recovery is changing `APP_PASSWORD` on
Render, which is documented in `DEPLOY.md` and stated on the login screen
itself — otherwise the owner waits for a code that cannot exist.

Four smaller decisions, each of which was a real choice:

- **The alphabet excludes I, L, O, 0 and 1.** The code is read aloud down a
  phone. A mis-heard `O`/`0` is indistinguishable from a made-up code on the
  screen — the member just sees "wrong code" and has no idea why.
- **Rejection sampling, not modulo.** `randomBytes % 31` looks tidy but 256 is
  not a multiple of 31, so the early letters would come up more often and the
  code would quietly lose entropy. Bytes ≥ 248 are discarded instead.
- **`expired` is reported; everything else collapses into `bad-code`.** The
  app's rule is never to reveal which usernames exist, so unknown name / no
  code issued / wrong code all return one message. But "expired" is only ever
  said to someone who *typed the right code*, i.e. someone already holding it —
  they learn nothing new, and without it they would retype a dead code forever.
  An unknown user still runs a dummy hash, same as `verifyPassword`.
- **A too-short new password does not consume the code or a rate-limit try.**
  The check runs *after* the code verifies, so fumbling your own new password
  does not cost you the code you were just given.

`lib/ratelimit.ts` exists because this endpoint needed the counter
`/api/session` already had. Copying it would have accepted two copies that
drift, and the one that drifts is the one nobody looks at — which is the one
holding a door open. One mechanism, **separate buckets per door**: a member
fumbling a reset code must not use up the owner's login attempts. Verified by
measurement, not assumption — five wrong codes lock the reset door while login
still returns 200.

#### Load-bearing, easy to undo by accident

- **The session cookie carries the username** (`user.expiresAt.signature`), inside the signed payload. Renaming it breaks the signature — verified by a test that rewrites `vo.` to `owner.` and expects rejection. The old two-part cookie format is refused outright rather than assumed to be the owner, so the first deploy after this logs everyone out once.
- **`middleware.ts` always overwrites `USER_HEADER` on every path that passes** (`pass()`), including the no-password and phone-app branches, and `strip()` deletes it on the unauthenticated ones (`/login`, `/api/session`, `/api/auth/status`, CORS preflight). A single branch that forwarded the client's own header would let a member send `x-ps-user: owner` and become the owner. Tested with curl — the spoofed header still resolves to `{"user":"vo","role":"member"}`.
- **The owner-only list lives in middleware, not in each route.** A new portfolio route that forgets its own check is still gated; `/api/users` and the `/accounts` page are on it, so the management screen and its API have exactly one gate rather than two that can drift. `/api/auth/status` is deliberately *not* — Render health-checks it and it leaks no numbers. `/api/alerts` *is*, because subscribing to web push there would deliver the owner's ITM/sizing alerts to a member: the same data leaking through a different door.
- **Members hitting an owner-only *page* get a redirect, not a 403.** A 403 on a navigation renders as a broken app; the API keeps the 403, which is what a curl deserves.

Per-user state is deliberately narrow: watchlists (`{ [user]: string[] }`, and a flat array on disk still reads as the owner's — the Render disk holds the owner's real list in that old shape) and saved scans (`user:universe`, with the bare old keys still readable by the owner only). `allWatchlistSymbols()` is the union, used by the Form 4 background sync so a member's tickers are not permanently blank. `startScan` refuses to hand a running job to a *different* user — joining is there to protect the rate limit, but the job carries the starter's watchlist and filters, so serving it to someone else is serving wrong results silently.

`USERS_PATH` must point at `/var/data` on Render. Render does **not** add a new env var to an already-created service, so this is a manual step — the same trap `WATCHLIST_PATH` documents in `DEPLOY.md`, and with a worse failure: accounts land in the build directory and vanish on the next deploy while the app keeps running as if nothing happened.

### My Portfolio: read-only, live-synced, no manual entry

`src/lib/positions.ts` + `src/app/api/positions/route.ts` map Schwab's raw `/accounts?fields=positions` response into two shapes this app tracks: short cash-secured puts and long equity/ETF. Everything else (calls, long puts, short stock, other asset types) is pushed to a `skipped` list with a reason, not silently dropped. Both of the account owner's Schwab accounts are combined into one flat list (a deliberate choice, not a limitation).

**Cost basis is the one field that took three iterations to get right** — `p.cost` reads `averageLongPrice`, not `averagePrice`. Verified by direct comparison against the real Schwab app: `averagePrice`/`taxLotAverageLongPrice` is Schwab's "Cost" column (tax-lot adjusted, not what P/L is computed from in their own UI); `averageLongPrice` is their "Trade Price" column, confirmed to match exactly across every symbol in a live account. `longOpenProfitLoss` looked like a second, independent source of truth but turned out to itself be derived from `averagePrice` — using it just reproduced the same wrong number under a different field name. P/L is now always self-computed from `(value − cost × shares)`, never trusted from a Schwab-computed P/L field directly.

Realized (closed-lot) P/L (`src/lib/realized.ts`, `src/app/api/realized/route.ts`) is **not** live data — Schwab's positions endpoint only knows what's currently open, and reconstructing realized gains from raw transaction history (FIFO-matching every buy/sell) turned out to require tax-lot and wash-sale adjustments that aren't recoverable from the transaction log. It reads instead from `data/realized/*.csv`, Schwab's own "Realized Gain/Loss - Lot Details" export — static snapshots the account owner re-exports and drops in by hand when they want the number to update. The `asOf` date from the report header is surfaced on screen for exactly this reason: so a stale snapshot never silently looks current.

Earnings-date awareness (the "Needs attention" tile) depends on `data/earnings.json`, which Schwab's API does not provide at all. It's built by `scripts/earnings-sync.js` (Yahoo → Nasdaq → Schwab-estimate fallback, run manually, needs network) **for symbols in `data/watchlist.json` only**. A held position whose symbol was never added to the watchlist has no earnings data and cannot be warned about — this is surfaced explicitly (`earningsUnknown` per row, `summary.earningsDataGap` listing affected symbols) rather than silently reading as "nothing upcoming."

### One rulebook for the page and the alerts (`src/lib/portfolio.ts`)

`/api/positions` used to hold all the reading and computing inline. It was extracted wholesale into `loadPortfolio()` so the background alert checker runs the *same* code — duplicating it would let the phone and the screen drift into saying different things about the same position. The route is now a thin wrapper that only maps `PortfolioLoadError` onto its two statuses: session expired (401, press reconnect) versus missing Accounts and Trading approval (502, ask Schwab). Those need opposite fixes, so they must not collapse into one error.

### Four position kinds, and why they need separate maths

`positions.ts` recognises short put, short call, long put and long stock. Long calls stay skipped (a directional bet, not part of the put-selling lifecycle). The three tables in My Portfolio are separate because the arithmetic genuinely differs, not for layout:

- A **short call** mirrors a short put. A put fears price falling through the strike (you must buy); a call fears it rising through (shares called away). So `itm` and `cushion` invert. Whether it is *covered* decides the whole risk profile, so shares held per symbol are counted and printed beside the ticker.
- A **long put** is insurance: you paid a debit, so P/L is `value now − what you paid`, the reverse of `credit − buyback`. In the money there is **good** news, so it renders green and is excluded from the ITM warning count.

Two summary rules that are easy to get wrong: call credit **does** count toward "credit received" (money in the account), but call collateral **does not** count toward "cash secured" — a covered call ties up shares, not cash, and those shares are already in their own tile. Counting them double-counts. Position sizing reads short puts only, same reason.

**`osiSymbol()` takes a required `right: 'P' | 'C'`, deliberately with no default.** It once defaulted to `'P'`, from when only puts existed. Adding short calls missed the one call site, so a sold call was priced off the *put* at the same strike — a contract the account does not even hold. Nothing failed: the symbol was well-formed, the quote came back, the arithmetic ran, and the row looked plausible. It was caught only by comparing against the Schwab app. A default that silently picks one of two contracts cannot be right; making it required turns the same mistake into a compile error.

### Vol surface on held positions (`src/lib/volwatch.ts`)

The same term-structure and skew checks the screener uses as gates, pointed at what is already open — the day-to-day question is whether the market is starting to price trouble into something you are already short. `BACKWARDATION_BELOW` and `SKEW_Z_ABOVE` are shared constants so gates and warnings cannot drift.

Cached on a **15-minute** clock rather than the panel's 60-second price refresh, because the two differ in cost by an order of magnitude: prices are one shared `/quotes` call for the whole account, the vol surface is one chain request *per symbol*. Reads are served from cache immediately even when stale and refresh in the background, so `/api/positions` keeps its response time. A failed refresh keeps the last good reading rather than blanking it.

### Position sizing (`src/lib/exposure.ts`)

Four limits against account value: 5%/symbol, 20%/sector, 50% total cash-secured, 30% cluster. The first three read off already-synced data. Cluster exposure is the real work — 60 sessions of daily bars per held symbol for pairwise correlation, reusing `lib/history.ts` (extracted from the scan route) so overlapping symbols cost nothing extra.

The spec's own cluster formula is underspecified — read literally it double-counts with no ceiling. The interpretation implemented here, and documented in the code: for every pair, `sqrt(collateral_a × collateral_b) × corr_ab`, summed over all pairs ÷ account value, so two fully-correlated equal positions contribute their combined size once. Correlation stays **signed**, so a hedge lowers the number instead of being ignored.

### Insider buying from SEC (`src/lib/sec.ts`, `form4.ts`, `insiders.ts`)

Form 4 is the filing an officer or director must submit within two business
days of trading their own company's stock. Only transaction code **P** counts
here — bought on the open market with their own money. Granted stock, exercised
options (code M) and shares handed back for tax are compensation, not
conviction. Purchases under a **10b5-1 plan** are excluded too: the flag is
`<aff10b5One>` at document level, and a filing can be all-code-P and still be a
plan adopted months earlier that says nothing about today.

Four traps, each confirmed against real filings pulled from SEC rather than read
off the docs — all four fail silently rather than loudly:

- `filings.recent` is a bundle of **parallel arrays**, not a list of filings.
  `form[3]` describes the filing whose number is `accessionNumber[3]`. Reading
  it as a list of objects yields empty, not an error.
- `primaryDocument` does **not** point at the XML. SEC gives
  `xslF345X06/form4.xml`, where the prefix is its own HTML-rendered copy. The
  raw file is the same name with the prefix stripped — and the name is not
  fixed (`form4.xml` for one filer, `tm2618008-1_4seq1.xml` for another), so
  strip the prefix, never hardcode the name.
- The `Archives` path wants the CIK with leading zeros **removed** and the
  accession number with dashes **removed** — both the opposite of what
  `data.sec.gov` wants, which needs the CIK zero-padded to ten digits. Hence
  `padCik()` as one named function, and a test that reproduces a known-good URL.
- SEC writes booleans **two ways**. The same `<aff10b5One>` is `0` in one filing
  and `true` in another; `<isDirector>` likewise. `=== 'true'` misreads half the
  filings in the dangerous direction — a pre-scheduled plan counted as
  conviction buying. Everything boolean goes through `secBool()`.

Three cache layers matched to how often each thing changes: the ticker directory
(a day), a company's filing list (a day), and an individual Form 4 — which
**never changes once filed**, so it is fetched once and kept forever. That last
one is why the cost falls over time. `INSIDER_PATH` is on `/var/data` for the
same reason.

**Schwab writes multi-class tickers with a slash (`BRK/B`, `BF/B`) and SEC does
not.** Six other modules already normalise it — Finviz and Yahoo to `-`, share
links to `.`, three cache layers to `_` — and `sec.ts` was the one that never
did, so `ciksFor` missed both symbols. The damage was not a blank: `syncInsiders`
files every `missing` symbol as `noFiler: true`, the *definitive* "no Form 4
filer exists" answer meant for ETFs. So the app stated something confidently
false about two real listed companies, silently, from the day Form 4 shipped.
It survived because every self-diagnosing check in this repo inspects the
*external* data; none inspects our own normalisation of the input.
`secTickerCandidates()` now tries `BRK-B` → `BRK.B` → `BRKB` → `BRK/B`, the same
"try the plausible spellings" posture as Schwab's index symbols and CBOE's file
names, and tests pin all three conventions so which one SEC actually uses (still
unmeasured — `www.sec.gov` is egress-blocked) no longer decides correctness.
`syncInsiders`'s 24-hour `maxAge` re-checks the bad records within a day of
deploy, so unlike #134 there is nothing to migrate.

Counts distinct **buyers**, not purchases (keyed on filer CIK, since names are
not written consistently): one person buying five times is one person, five
people buying once each is a much stronger signal.

The empty-table problem is the sharpest instance of the degradation idiom in
this repo. Four states must not look alike, because each needs a different fix:
never asked / no Form 4 filer exists at all (ETFs) / SEC was asked and refused /
SEC answered and nobody is buying. Only the last is good news. `unavailable`
returns a **code**, not a sentence — it was hardcoded Vietnamese at first and
went straight into the English UI, caught by rendering the page, not by a type.

Worth knowing when reading results: Apple's last 15 filings contained no code-P
purchase at all. For a mega-cap that is the normal state, not a gap.

The daily sync rides the alert loop's timer but deliberately sits **outside**
`runOnce()`: alerts stand down outside market hours and switch off with no
channel configured, while Form 4s are filed at any hour. Gating filings on
either condition would silently stop collecting them.

### Congress trading (`src/lib/unusualwhales.ts`, `congress.ts`)

Members of Congress and their families must disclose stock trades within 30-45
days under the STOCK Act. Amounts are only ever a **range** (`"$1,000,001 -
$5,000,000"`), never an exact figure — that's the law, kept as a string
verbatim rather than parsed into a number.

Sourced from Unusual Whales (`UW_API_KEY`, a paid feature that self-disables
without it, matching the Telegram/web-push pattern), not scraped from the
government's own disclosure sites — those exist but aren't structured data.
Two free alternatives (QuiverQuant, CapitolTrades) were checked first and
rejected: both show the data on their own website for free but gate the
*API* behind an Enterprise/contact-for-pricing tier with no self-serve key.

**The one trap, confirmed against a real API call:** `/api/congress/congress-trader`
defaults its `name` parameter to `"Nancy Pelosi"` when omitted — calling it
without a name to get "all of Congress" silently returns just one politician's
trades. The same shape of mistake as `osiSymbol()`'s old `right: 'P'` default.
The endpoint actually used, `/api/congress/recent-trades`, has no such
parameter at all.

Pulled as one **global** feed (not per-symbol): Congress trades are rare
enough that calling once per tracked symbol across ~500 names would cost
far more than paging back through the shared recent-trades stream and
filtering to tracked tickers in-app. Sync walks pages until it hits one
that's entirely trades already on disk (caught up) or a fixed page cap
(cost ceiling on a first cold run), assuming the feed sorts newest-first —
undocumented but the only sane reading of an endpoint named "recent".

Same tab as Insider Trade (Form 4), not a new one: both answer "who's
buying," just from different populations (Congress vs. corporate officers).
Same self-disabling posture as the rest of the paid/optional integrations —
and more so than usual, since the key on hand is a 7-day trial, not a
purchase, and can stop working at any moment regardless of what the code does.

#### The disclosure lag is the number the tab was missing

The panel's own text said trades are disclosed "within 30-45 days", which is
the **statutory ceiling**, not what actually happens. Measured on real
recently-disclosed records, the Senate median is around **116 days**, and in a
250-record sample **none** were trades from the last 7 days. A table headed
"who is buying" that is really "who bought four months ago" does not just omit
a fact — it invites a wrong decision.

So `disclosureLagDays()` (transaction date → filing date) and `medianLag()`
are computed, and the panel prints the median **above** the table, measured
from the records actually on screen, with 30-45 named as the ceiling it is.
Each symbol row carries its own median in a column. Two rules the arithmetic
follows and the screen depends on: a missing `filed_at_date` yields `null`,
never `0` (a `0` on screen reads as "disclosed the same day", i.e. turns *not
known* into a confident falsehood — the degradation idiom again); and a
**negative** lag, meaning the feed says the filing predates the trade, also
yields `null` rather than printing an impossible number that looks real. The
median, not the mean, because one record three years late drags a mean but not
a median.

#### `tradeSide()` is the same trap `flowSide()` was

`txnType === 'Sale' ? sell : buy` is a silent mis-count. While the panel only
printed the word, an unrecognised type rendering as "Purchase" was cosmetic.
Once buys and sells are **counted by side** to draw a bar, the same line turns
every unknown value into a wrong number that looks right. UW writes
"Purchase", "Sale", "Sale (Partial)", "Sale (Full)", "Exchange" — and adds
values without notice. `other` is a real side, the screen names its count when
non-zero, and a test pins `"Exchange"` and `"mystery-type"` landing there
rather than in buys.

#### Photos: the format check *is* the measurement

Portraits come from the public-domain `unitedstates/images` repository, which
is keyed by **Bioguide ID**. **Measured 2026-09-17** (`unitedstates.github.io`
is now on the allowlist): `P000197`, `S000148` and `M000355` all return **200
`image/jpeg`** at `/images/congress/225x275/<id>.jpg`, and a Bioguide-shaped
but non-existent id (`X999999`) returns **404** — so the URL template is right
and a wrong id fails cleanly rather than serving something else. What is still
unconfirmed is the half this app does not control: whether UW's
`politician_id` *is* a Bioguide ID. So `politicianPhoto()` does not guess: it
returns a URL only when the id matches `^[A-Z]\d{6}$`, and `null` otherwise,
and the panel draws an initials circle for every `null` **and** for every
image that fails to load. There is no path that renders a broken image, which
would read as "the app is broken" rather than "no portrait". Verified in a
real browser with egress blocked: every `<img>` failed and every one fell back
to initials, zero broken images.

The check lives in `/api/congress` rather than in the panel, because the panel
is a client component and `congress.ts` imports `node:fs`. Computing it in the
route keeps the regex in exactly one place; copying it into the component
would have created a second copy, and the copy is the one that drifts.

Buy/sell here **does** use `--credit`/`--risk`, unlike Options Flow's call/put.
Call vs put is classification; buy vs sell is direction of money, the same
thing the green/red rule in `ColorLegend.tsx` governs everywhere else. What
that colouring invites is wrong, though, so the legend says it outright: a
sale does **not** mean the member knows something bad — most are blind trusts,
rebalancing or selling to pay tax, and many accounts are run by a family
member. Same posture as `of.keyCaveat`.

Unknown `issuer` values print **UW's own word**, not `cg.issuer.xxx`, for the
same reason `ruleLabel()` exists in Options Flow: `t()` returns the key on a
miss, and UW adds values without notice.

#### Two views, because there are two questions

The owner's reference was `capitoltrades.com/politicians`: a grid of member
cards, each a large round portrait with a party-coloured ring, name,
chamber/party/state and a small stats block. A table sorted by *symbol*
answers "who touched this ticker" and cannot answer "what is this person
doing", however many columns it grows. So the panel has a `By symbol` /
`By member` toggle, and `byMember()` regroups **the payload already on
screen** rather than adding a second endpoint — a second computation path is
a second number that can disagree with the table beside it.

One column the reference has and this deliberately does not: **total volume**.
The STOCK Act only permits a range, so any dollar total is that site picking a
point inside each range. Trades are counted instead, because that can be
counted exactly, and the screen says why — otherwise the absence reads as
missing data rather than as a refusal to invent a number.

`party` and `state` are parsed **tolerantly and are unverified**: it is not
confirmed that `/api/congress/recent-trades` carries them (no network here).
Absent, `partyClass()` returns null and the portrait gets no coloured ring.

**`syncCongress()` overwrites stored records, and skipping them was a
90-day-invisible bug.** The loop used to write a trade only when its key was
absent. A record already on disk was parsed by an *older* build, so it is
missing exactly the fields most recently added — `party` and `state`. Adding
the code to read them therefore changed nothing on screen until every old
record aged out of the 90-day window, and the empty result was
indistinguishable from "Unusual Whales does not send a party". Records are now
rewritten on every sync; `saved` still counts only genuinely new keys and
`allSeenAlready` is still computed before the write, so paging and the
catch-up stop are unchanged. A test pins the backfill.

**"No photo" and "no party" now say which of four things happened**, because
on screen they were one initials circle and the fixes are completely
different: never synced since the app learned to read the field / synced and
the id is not Bioguide-shaped / synced and there is no party field / it works.
The panel names the real `politician_id` verbatim, taken from the records
already displayed rather than from `lastRun` (which lives in RAM and is empty
after a deploy — making the owner press Sync to read something already on
screen is pure waiting). `CongressRun` also carries `sampleKeys`, UW's real
field names measured at sync time: the `/api/uwprobe` idiom applied in place,
so the next change is written against a measurement instead of remembered
docs.
Party is never inferred from a name or a state — that would fabricate a
political fact about a real person, and a guessed ring looks exactly like a
correct one. The ring reuses `--gexput`/`--gexcall`, already defined in all
three theme blocks: party is classification, like call/put, so `--credit`/
`--risk` would read as "this party good, that party bad", and reusing existing
tokens keeps the change out of the three-block editing trap.

#### Three rendering bugs the owner saw that reading the CSS could not

All three were found by scrolling and screenshotting the real page, not by
reading the file — the same lesson as the `.hint.hint-warn` specificity trap,
and the reason this repo keeps a browser in the loop.

**A sticky column with `z-index: auto` does not stay on top.**
`.pftable th:first-child, td:first-child` is `position: sticky` with an opaque
background, and the comment above it says the background is what stops text
bleeding through. That is only half true: a sticky box at `z-index: auto`
creates no stacking context, so any *later* sibling cell that is itself
positioned paints **over** it. The buy/sell bar, the call/put bar and the
portrait circles are all positioned elements. Scroll the table left and the
ticker gets covered by a red bar and half the words "không rõ" — the pinned
column, whose entire job is to say which row you are reading, was being
overwritten by the row. `z-index: 1` on the column and `2` on the header
corner fixes it. **This is app-wide, so Options Flow had the identical bug**
and is fixed by the same two lines.

Also written out on that rule: `padding-left: 10px`. Without it the cell used
the browser's 1px default and the ticker sat flush against the card edge; the
`padding-right: 10px` sitting right beside it shows the original intent was
even padding, only half-written.

**Overlapping avatars is right for photos and wrong for initials.** The face
stack used `margin-left: -8px`, the usual "group of people" treatment. It is
safe for photographs — the outer edge of a portrait is hair and background —
but the fallback circle is *centred text*, so the next circle covered the
second letter: "NP" (Nancy Pelosi) rendered as "NF", "BS" as "B5". A control
whose whole purpose is to say *who* was printing the wrong name. Since most
circles are initials until portraits resolve, the stack now uses a 3px gap:
~33px wider for four faces, and never wrong.

**A nested `nowrap` table sets its parent table's width.** The 8-column detail
table lives in a `<td colSpan={7}>`, so expanding one row grew the outer table
from 640px to 832px on a phone — "kéo qua trái dài quá". A bare
`overflow-x: auto` on a wrapper does **not** help, because the parent cell
still sizes to its content. Six variants were measured; the two that work are
`max-width: 0` on the cell and `width: 0; min-width: 100%` on the wrapper.
Letting the cells wrap also holds the width but squeezes the detail table to
625px with columns touching, so the wrapper trick wins: the detail keeps its
full 817px and scrolls in its own box while the outer table stays at 640px.

**`loading="lazy"` turned the portrait fallback into the bug it was meant to
prevent.** The first version picked *either* an `<img>` *or* an initials
circle, switching on `onError`. A portrait below the fold is never fetched, so
`onError` never fires, so the fallback never runs — and the card renders an
**empty circle**, which is precisely the "the app is broken" reading the
fallback exists to avoid. Caught in a full-page screenshot, not by reasoning
about the code. The fix is structural rather than another state: the initials
are always drawn and the image is layered **over** them, so not-yet-loaded,
failed and no-URL all render identically. Measured with the page unscrolled
and two images still pending: zero empty circles.

### Options flow and dark pool (`src/lib/optionflow.ts`, `darkpool.ts`)

Two more Unusual Whales signals in the same Insider Trade tab, both answering
"what is smart money doing right now" rather than "who is behind this trade" —
Form 4 / Congress trading. Both are short-lived on purpose: 14 days, not the
90 used elsewhere, because a notable option sweep or a large dark-pool print
from last week says nothing about today.

**Different sync shape from each other, confirmed against real API calls
before either was built:**

- Options flow uses `ticker_symbol`, a real comma-separated filter parameter
  (`?ticker_symbol=AAPL,MSFT` returns only those two tickers — verified, not
  assumed) — so tracked symbols are sent in batches of ~50 per request rather
  than pulled as one global feed and filtered in-app the way Congress trading
  is. `flow-alerts` also carries a real `id` (a UUID) per record, unlike
  Congress trading where UW returns no transaction id at all and a composite
  key has to be built from several fields.
- Dark pool's `/recent` endpoint has **no** ticker filter at all (confirmed);
  only `/api/darkpool/{ticker}` does, so this one calls once per tracked
  symbol rather than batching. More requests, but the alternative — pulling
  the market-wide `/recent` feed and filtering client-side — risks a print
  scrolling out of the "recent" window between one 15-minute sync and the
  next, for a feed that has no shortage of volume. Records carry a real
  `tracking_id` for dedup, same as flow-alerts' `id`.

**Real incident, not a hypothetical:** per-symbol calling plus the alert
loop's 15-minute heartbeat, running 24/7 with no market-hours gate, meant
dark pool alone made ~503 tracked symbols × 96 cycles/day ≈ 48,000 requests
— blowing straight through UW's 30,000/day cap from this one endpoint,
confirmed on the account's own UW API dashboard (`/api/darkpool/:ticker` at
91.9% of 30-day usage, one day fully exhausted by 5pm ET). The original
code comment claiming dark pool/options flow signals "appear regardless of
hour" was simply wrong — both only occur while the exchange is open. Fixed
two ways, stacked: `syncDarkpool()`/`syncOptionFlow()` both take a `force`
parameter and skip entirely (recording `skipped: 'market-closed'` rather
than silently doing nothing — same idiom as `alerts.ts`'s `inMarketHours()`
skip) unless `force: true`, which only the "Sync now" button passes; and
`alert-runner.ts` additionally throttles the *automatic* dark pool call to
1 in every 4 ticks (~60 minutes) since it alone costs a full request per
symbol with no batching, unlike options flow which stays on the full
15-minute cadence because its 50-symbol batching keeps it cheap regardless.

Dark pool is additionally filtered to prints above `MIN_PREMIUM` ($1M) on
both sides — passed as a query param to UW *and* re-checked against the
response, since it was never confirmed the `/{ticker}` endpoint actually
honors that filter server-side the way `/recent` does. Without a floor, one
liquid stock alone would produce more prints per day than the feature is
worth.

Congress trading's `amounts` field stays a string because STOCK Act law only
allows disclosing a range. These two are the opposite case: `total_premium`
and `premium` are UW's own precise dollar figures, not a legally-mandated
range, so they're parsed to numbers rather than kept as strings — treating
them the same way as Congress data would be applying the wrong caution to
the wrong field.

### Options Flow, and why the old panel could not be read

The owner's ask was plain: *"quyền chọn trong mục insider có cách nào nhìn hay
hơn hay dễ biết hơn không?"* The panel had three columns — symbol, sweep count,
last date — and a bullet list behind each row. So the one question options flow
exists to answer, **where is the big money and on which side**, was invisible
without clicking every row, and barely legible after.

Four changes, each fixing a different failure:

- **Rows sort by total premium, not sweep count.** Sorting by sweeps put three
  small sweeps above one $5M trade. Money is the ranking key; sweeps stayed as
  a column.
- **A call/put bar per symbol.** Bar *width* is that symbol's premium against
  the largest row (one shared scale — per-row scaling would draw a $50K symbol
  the same length as a $5M one), and the split *inside* it is call vs put.
- **The detail is a real table** (time / contract / DTE / premium / vol-OI /
  flags), not `.pfskipped` bullets. The old list reused the "skipped positions"
  style and ran every field together as prose, so comparing two trades meant
  re-reading both from the start.
- **Vol/OI is computed and shown.** Above 1 means more traded today than every
  contract that existed at that strike — almost certainly a *new* position, and
  the single strongest read in a flow row. It was in the payload and never
  displayed.

**`flowSide()` exists because `type === 'put' ? 'put' : 'call'` is a silent
mis-total.** While the panel only printed a word, an unrecognised `type`
rendering as "call" was cosmetic. Once premium is *summed by side*, the same
line turns an unknown value into a wrong number that looks right — every
surprise value would pour into the call column and the bar would still render
perfectly. `other` is now a real side, and the screen names its premium when it
is non-zero. The test pins this with a `"mystery-side"` record.

**`hasMultileg` is displayed now; omitting it invited a wrong conclusion.** The
field was parsed and never shown, so a large multi-leg premium read as a
one-directional bet when it is a spread.

**The panel says what the data cannot tell you.** UW's `flow-alerts` records
carry no buy/sell side in what this app stores, so "money into calls" is not
"someone is bullish" — a large call trade can be someone *selling* calls. That
caveat sits in the legend, in `--warn`, next to the colour key. Leaving it out
would not have been a missing fact but a wrong one.

Colour reuses `--gexcall` / `--gexput`, the pair GEX already defines in all
three theme blocks. Call-vs-put is **classification**, so `--credit`/`--risk`
would read as "calls good, puts bad" — the exact confusion `ColorLegend.tsx`
exists to prevent. Reusing existing tokens also keeps this change out of the
three-block editing trap entirely.

Unknown `alert_rule` values print **UW's own name**, not the i18n key. `t()`
returns the key on a miss (deliberate, so gaps show while writing code), but UW
adds rules without notice, so the raw fallback in `ruleLabel()` is what stops
`of.rule.SomethingNew` appearing on screen.

### tastytrade (`src/lib/tastytrade.ts`, `/api/ttprobe`)

**Why a second broker's API when Schwab is already wired up:** Schwab's market
data has no earnings dates and no IV rank. That is not cosmetic — the
screener's hard gate *"no earnings in the contract window"* reads
`earnings[u.symbol] || []`, and `data/earnings.json` is built from
`data/watchlist.json` only. So on a full S&P 500 scan, every symbol not on
the watchlist **passes the earnings gate because there is no data**, not
because there is no earnings. "Not known" rendering as "safe" — the exact
failure this file names under the degradation idiom, and the shape of the
CRWD miss. tastytrade's `/market-metrics` carries an earnings date, IV rank,
IV percentile and per-expiry IV, free with an account. It is market data
only: this client never places an order and never reads a position.

**Nothing here has run against the live API yet.** The sandbox has no
network, and this repo has been burned by coding to remembered docs
(`congress-trader`'s silent `name` default, `gex-levels`' all-string
values). So the first and only thing built is `/api/ttprobe` — the
`/api/uwprobe` idiom: call once in production, print the real **keys and
types**, and only then write the feature against what was measured. The
questions it answers, in order: which auth method works and how the session
token goes in the header; whether `market-metrics` really has an earnings
date and what the field is called; whether IV rank / term structure exist;
and whether asking N symbols returns N — a symbol dropped silently is the
one thing a gate must know about before trusting the feed.

**The OAuth app must be created with the `read` scope only, never `trade`.**
That boundary is set once on tastytrade's own "New OAuth Client" screen and
no amount of code can enforce it afterwards. The token lives in Render's
environment table: leaking a `read` token leaks a few market numbers, while
leaking a `trade` token lets a stranger **place orders in the real brokerage
account**. Least privilege here changes the worst case from losing money to
exposing data. `DEPLOY.md` carries the same warning where the owner will
actually be standing when they choose.

Two auth paths, OAuth preferred. `TT_CLIENT_SECRET` + `TT_REFRESH_TOKEN`
(created in the tastytrade account's API section; revocable, not the login
password) exchange for a ~15-minute access token at `POST /oauth/token`.
`TT_CLIENT_ID` is sent **only when set** — standard OAuth2 requires it on a
`refresh_token` grant but some providers accept the secret alone, and the
sandbox cannot tell which tastytrade is. Sending a standard extra parameter
is harmless; omitting a required one fails, so the code errs toward sending.
A failed token exchange names whether `client_id` went with it, because
tastytrade's own body is likely to say `invalid_grant` for all three of
missing client_id / bad refresh token / missing `read` scope.
`TT_USERNAME` + `TT_PASSWORD` via `POST /sessions` is the fallback only —
that is the brokerage password sitting in an env var, which is why it is
documented as the thing to avoid. Tokens live in RAM, never on disk.

**SECOND production reading (2026-09-16), after the brokerage account cleared
KYC: everything works, and the endpoint carries what the gate needs.** This is
measured, not remembered — code against these names and types, not the docs.

Auth: `tokenVariant: "form+UA"` — the **first** of #130's four framings, i.e.
form-encoded with a real User-Agent, exactly the two differences found by
comparing against `schwab.ts` and `sec.ts`. The edge block is gone. Access
token lives 900s.

**`schemeAccepted: "bearer"` — the docs I remembered were WRONG.** They say a
tastytrade session token goes in `Authorization` *without* `Bearer`. The live
API accepted `bearer`. `ttGet()`'s try-then-remember is what found it; a
hardcoded "follow the docs" would have 401'd on every call.

`asked: 8, returned: 8, missing: []` — no silent drops at 8 symbols. **The
batch ceiling is still unmeasured** and matters: the screener universe is 503.

`/market-metrics` record, 40 keys. What matters:

- **`earnings` is an OBJECT, not an array**, keyed
  `{visible, expected-report-date, estimated, late-flag, quarter-end-date,
  actual-eps, consensus-estimate, updated-at}`. `expected-report-date`
  (`"2026-10-29"`) is the field that closes the gate hole from #131. It is the
  **next** expected report, one date — not the list `earnings.json` holds, so
  the gate's "does an earnings date fall inside the contract window" reads it
  as a single-date containment test, not a search.
- **`estimated` is a boolean sitting right next to it.** A guessed date and a
  confirmed one must not render alike — that is the same shape as #131's
  `unknown`, one level down.
- **THREE IV-rank fields that disagree, plus a field naming which one is
  live.** `implied-volatility-index-rank: "0.418645049"`,
  `tos-implied-volatility-index-rank: "0.418645049"`,
  `tw-implied-volatility-index-rank: "0.359264507"`, and
  `implied-volatility-index-rank-source: "tos"`. The generic field currently
  mirrors the `tos` one — *currently*. Reading the generic field is reading
  whichever source tastytrade happens to point at, and tos vs tw differ by
  ~6 points of rank on the same symbol at the same instant. Pick one source
  explicitly and record which, or print the `-source` value beside the number;
  do not silently follow a pointer that can move.
- **Scale trap: tastytrade's rank is a 0-1 fraction; this app's `ivRank()`
  returns 0-100** (`((iv - lo) / (hi - lo)) * 100`). Feeding one into the other
  is a 100× error that still looks like a plausible number — the exact failure
  mode of a wrong unit. Convert at the boundary, once.
- **Almost every value is a STRING**, including every volatility and rank
  number. Only `liquidity-rating`, `market-cap` and `late-flag` are numbers.
  Same trap as UW's `gex-levels`, and `num()` in `gex.ts` already exists for
  it — `Number.isFinite('0.41')` is `false`.
- `option-expiration-implied-volatilities` is a real 25-row term structure
  (`expiration-date`, `option-chain-type`, `settlement-type`,
  `implied-volatility`), so per-expiry IV is available without a chain fetch.
- Also present and currently scraped from elsewhere or missing entirely:
  `sector`, `industry` (Finviz today), `historical-volatility-30/60/90-day`,
  `iv-hv-30-day-difference`, `beta`, `corr-spy-3month`, `lendability`,
  `borrow-rate`, `market-cap`, dividend dates.

Still unmeasured, and both decide the design rather than the details: whether
an **ETF** (SPY/QQQ/IWM) carries an `earnings` object at all — "no earnings"
is *true* for an ETF and *unknown* for a stock, and #131 is precisely about
not collapsing those — and whether asking ~120 symbols returns ~120.

**First production reading (2026-09-16): a 401 that was never tastytrade's.**
The probe earned its keep immediately. The token exchange returned HTTP 401,
but the body was `<title>401 Authorization Required</title> … <hr><center>
nginx</center>` plus a `<script src="/Bwlu3He5C3/odH-YXpm/…">` — **HTML from
an edge proxy, not JSON from the API**, and that random script path is the
signature of a bot-protection layer. So the request never reached the API and
the credentials were never examined: chasing the client id, secret or refresh
token would have been hours spent re-issuing keys that were probably fine.

Two differences from the clients in this repo that **do** work against real
hosts, both found by comparison rather than guesswork:

- `schwab.ts` posts its token request as `application/x-www-form-urlencoded`
  (what RFC 6749 mandates for a token endpoint); tastytrade.ts was posting
  JSON, which is off-spec.
- `sec.ts` sends a real `User-Agent` and its own comment records that a
  missing one earns a 403; tastytrade.ts sent none, so Node's default went
  out — exactly what bot protection drops.

Either could be the cause, so **neither is guessed**. `TOKEN_VARIANTS` tries
all four combinations (form/json × with/without User-Agent) in
likelihood order and remembers the one that works, the same try-then-remember
shape the header scheme already uses. `classifyBody()` splits the two kinds
of 401 that matter: `json-api-error` means the API read the credentials and
refused them (fix on tastytrade's side), while `bot-wall`/`html-other` means
the edge refused the request (fix on ours). The error message names which,
and the probe reports it as `auth.bodyKind`.

The loop **stops on the first `json-api-error`**: once the API has answered,
changing how the request is framed cannot help, and three more attempts would
only burn requests carrying the same rejected credentials. Only an edge block
is worth retrying differently.

**The one place docs and reality most often disagree is the header scheme.**
The docs I remember say a session token goes in `Authorization` *without*
`Bearer`. `ttGet()` tries the documented way, and on a 401 tries the other
once and **remembers** which was accepted; the probe reports it as
`schemeAccepted`. Tested against a mock that demands the opposite of the
docs: one retry, then no further retries.

`/api/ttprobe` is in `OWNER_ONLY`. It returns shape only, but it triggers
calls on the owner's **brokerage** account, and a family member must not be
the one pressing that button. The response is built from booleans, key
names and status codes — a test asserts the token, password, remember-token
and email never appear in it.

#### The earnings gate is closed (`src/lib/ttearnings.ts`)

`visible` is the field that makes the three-way split possible, and it was
measured, not guessed:

| | AAPL (a stock) | SPY (an ETF) |
|---|---|---|
| `earnings.visible` | `true` | `false` |
| `expected-report-date` | `"2026-10-29"` | absent |

So tastytrade says "this instrument has no earnings" **out loud** rather than
by staying silent — which is exactly the boundary #131 turns on.
`parseEarnings()` therefore has three exits, and keeping them apart is the
whole point:

- `visible: false` → **checked, no earnings exists** (ETF) → `date: null`.
- `visible: true` + a date → **checked, here is the date**.
- `visible: true` + *no* date → tastytrade knows this instrument reports but
  has no date right now → **still unknown**, so the symbol is left out of the
  store entirely and the gate keeps flagging it. Folding this third case into
  "no earnings" would paint a confident ✓ on something nobody knows — #131's
  bug again, one level down.

**The integration is three lines because #131 already built the shape.** The
gate reads `!(symbol in earnings)` for "unknown", so a symbol with **an empty
array** reads as *known, and nothing due* — no gate change at all.
`loadTtEarnings()` emits `[]` for ETFs and `[date]` for stocks, and
`loadEarnings()` merges it in. That merge is the **one chokepoint all five
consumers share** (Screener gate, My Portfolio's "needs attention", Analyze,
the phone API), so one edit un-blinds all of them and none can drift.

It **unions**, never overwrites: `data/earnings.json` is hand-built and can
hold several dates while tastytrade returns only the next one, so overwriting
would silently drop next quarter's date. A test pins that.

**`estimated` is displayed, not just stored.** tastytrade flags a report date
as an estimate, and a contract rejected on a *guessed* date is rejected on
much weaker evidence than one rejected on a confirmed date. Storing the flag
and never showing it is precisely what `hasMultileg` was criticised for in
#125, so `Candidate.earningsEstimated` and a gate-row tag both carry it. The
flag deliberately **over-warns**: if a date appears in both the hand file and
tastytrade-as-estimate, it still shows as an estimate. Saying "check this"
wrongly is harmless; saying "certain" wrongly is not.

**No new env var and no Render step.** The store is `.cache/ttearnings.json`,
which this repo already documents as lossy and regenerable — a deploy wipes
it and the next sync refills ~500 symbols in about 6 requests. That avoids
the `USERS_PATH` trap entirely: nothing to add by hand, nothing to forget.

**The batch ceiling is still unmeasured, and is handled by design rather than
by guess.** `BATCH = 100` is a conservative pick (8/8 and 1/1 are the only
confirmed readings). Every lot compares what was asked against what came
back and pushes the difference into `missing`, so a lower real ceiling shows
up as a number rather than as a silent hole in the gate's coverage. A lot
that throws is skipped rather than fatal — losing one lot costs ~100 symbols
their update for that cycle (they correctly stay "unknown"), while throwing
would discard the lots already fetched.

The sync rides the alert loop **outside `runOnce()`**, same reasoning as the
Form 4 sync: alerts stand down outside market hours, but companies announce
earnings dates at any hour — mostly after the close, i.e. exactly when
`runOnce()` is resting. Each symbol is re-asked at most once per 24h.

Not built yet, deliberately: IV-rank-from-tastytrade (see the three
disagreeing rank fields and the 0-1 vs 0-100 scale trap above — both are
real traps, not details), and using tastytrade's `sector`/`industry` in
place of the Finviz scrape.

### X (Twitter) (`src/lib/xnews.ts`, `/api/xprobe`)

**Nothing reads X yet, and that is the state to preserve until the probe has
run.** The owner asked for X news in the alerts for held positions. That is
the one place X earns its price: its only advantage is being faster than the
press by tens of minutes, which is why #155 turned it down for the Long-term
tab (buy-and-hold money does not change its mind over thirty minutes) and why
it is right here (an open position does).

X is a **keyed host**, so the repo's rule applies — measure in production
first, code against the measurement — and the rule has teeth: `congress-trader`
silently defaulting `name`, `gex-levels` returning every value as a string, and
tastytrade's header scheme were all cases of remembered docs being wrong.
**Measured 2026-09-18: `api.x.com`, `api.twitter.com`, `developer.x.com` and
`docs.x.com` are all refused 403 at CONNECT**, so not one claim in `xnews.ts`
is verified.

#### The first probe question is the architecture, not a detail

Whether the owner's plan carries the **`$AAPL` cashtag operator** decides which
feature gets built. Available → search by symbol directly. Not available → follow
a curated **account list** (`from:`) and filter symbols in-app, the same "one
shared feed, filter in-app" shape as Congress trading and the 8-K alert — but a
different feature, because the owner has to choose the accounts. Both
`cashtagQuery()` and `authorQuery()` exist for that reason and the probe runs
both. **A 403 on the cashtag step is not a probe failure, it is the answer.**

The other three: whether **`since_id` is honoured**, which is the mechanism
that keeps the cost down (a re-poll with no new posts must return zero, or the
same posts are paid for again and again); the **query-length ceiling**, probed
by sending a deliberately oversized query and reading X's own refusal rather
than guessing the number; and what the usage endpoint says.

**The pricing model changed, and the owner's own screenshot is what caught
it** (`developer.x.com`, 2026-09-18). X now sells **pay-per-use credits with
no commitment**, plus an Enterprise tier — not the monthly-cap tiers this
file first described. That flips the decision: there is no longer a "is it
worth a monthly fee" question to answer *before* measuring anything; top up a
small amount of credit, run the probe, read the real cost. It also sharpens
the `since_id` question rather than softening it — a monthly cap at least
stops spending when it runs out, while pay-per-use re-reading the same posts
bleeds money with nothing to halt it.

One number on that page is dangerously easy to misread: the **$0.001 per
resource** headline is for **Owned Reads**, i.e. reading *your own* posts,
bookmarks, followers and likes, and the page itself calls that a reduced
price. This feature reads *other people's* posts, which is priced
differently. `/api/xprobe` still asks `/2/usage/tweets`, an endpoint of the
old monthly model; under credit pricing it may refuse, and the probe prints
the real status rather than pretending, so the refusal itself is the finding.

The general lesson is the one this file keeps relearning, now with a receipt:
a remembered price in a runbook looks exactly like a checked one, and X's had
already changed model entirely.

#### App-only token, never a user token

The app-only Bearer is read-only and **cannot post**; an OAuth 2.0 user-context
token also reads but **can post as the owner**, and the token lives in Render's
environment table. Leaking the first costs a few lines of already-public text;
leaking the second means a stranger posting under the owner's name. Same
least-privilege argument as tastytrade's `read` scope, and like that one it is
set outside the code — no amount of code can enforce it afterwards.
`/api/xprobe` is in `OWNER_ONLY` because each press spends the owner's paid
credit, and a test pins that the response never contains the token.

#### Three traps handled before the first live call

- **A 401 with a JSON body and a 401 with an HTML body are different
  failures.** JSON means X read the credentials and refused them; HTML means
  the edge blocked the request and the API never saw it. `classifyXBody()`
  splits them and the error names which — getting this wrong is what cost a
  whole session in #130.
- **A 200 can carry partial `errors`.** Reading `data` and ignoring them turns
  "half of this was refused" into "there is nothing", which is the degradation
  idiom again.
- **`symbolsIn()` never matches a bare ticker**, only `$CASHTAG` or the company
  name. `ALL`, `ON`, `IT`, `NOW` and `KEY` are ordinary English words, and X
  prose is conversational, so "it is all on now" would alert on three symbols.
  X's own `entities.cashtags` is preferred when present, for the same reason
  Yahoo's `relatedTickers` is gate 1 of the press tier: it is the source's own
  measurement rather than our inference.

Rate-limit headers read as `null` when absent, never `0` — "unknown" and
"exhausted" need opposite responses, same rule as `disclosureLagDays()`.

**No price is written into `DEPLOY.md`, deliberately.** X's pricing and its
operator availability change, and a misremembered number in a deploy runbook
looks exactly like a checked one. The runbook names the two lines to find on
X's own pricing page instead: whether `recent search` is in the plan, and
whether the cashtag operator is.

### Long-term Investment (`src/lib/support.ts`, `longterm.ts`, `pehistory.ts`, `ltwhy.ts`)

The sixth main tab, and the only one pointed at **buy-and-hold money** rather
than at selling puts. It answers: *which stocks are falling toward a support
zone while the company is still profitable and not expensively priced.*

**Support zones are self-computed, from nothing but daily bars** (3 years,
`historyCandles()`). Pivot lows confirmed by 5 bars each side, clustered by
price within 2.5%. Three rules carry the whole thing and all three are easy to
"tidy" away later:

- **A single low is never a support.** `MIN_TOUCHES = 2`. Support is where price
  has turned *repeatedly*; one low is one low.
- **The last 5 bars can never be pivots**, because nothing has confirmed them
  yet. This week's low is not yet a level. That is a real limit of the
  measurement, not an omission.
- **"Approaching support" and "already broken below" are separate fields**
  (`nearest` vs `broken`) and never collapse. On a chart both look like price
  sitting next to a line; the actions are opposite.

**`pivotLows()` compares asymmetrically on purpose, and that was a real bug the
tests caught.** With a symmetric loose comparison, a *flat* stretch makes every
bar in it a pivot — 21 flat bars produced 8 "lows", which then clustered into
one zone reading "touched 8 times" when price had gone sideways once and
defended nothing. `touches` is the number the entire tab leans on to say whether
a zone is trustworthy, so inflating it breaks precisely the load-bearing part.
Left side now demands strictly higher, right side merely not-lower, so each flat
run yields exactly one pivot while a genuine double bottom still counts twice.

**Three tiers, ordered by cost, and the order is the feature.** Finviz is one
HTML scrape *per symbol*, so 503 scrapes is not a slow version of this tab —
it is a tab that does not work. Tier 0 is six batched `/quotes` calls for the
whole basket, which already carry `52WeekHigh`/`52WeekLow`, so two of the six
gates cost nothing and kill most of the universe. Tier 1 is one (day-cached)
price-history call per survivor. Tier 2 is Finviz on what is left.

`historyCandles()` is deliberately **not** merged into `historyBars()`: `Bar`
keeps only closes (enough for correlation and SMA200/HV20) while support must
read `low` — a level is drawn where price *touched*, not where it closed — and
one year is enough for the screener while zones need several. Merging would make
every existing caller pay more for fields it never reads.

**Six hard gates, and the repo's standing rule survives: missing data PASSES but
carries `unknown: true`** and renders `?` rather than ✓, exactly as #131 settled
for the Screener's earnings gate. The trend gate asks only for a **rising SMA200
slope**, not for price above SMA200 — the owner chose this, and it is the right
call mechanically too: anything down far enough to be interesting has usually
lost SMA200 already, so the strict reading returns an empty table nearly always.
The falling-knife guard is the "still ≥5% above the 52-week low" gate instead.

**The analyst target is displayed but is deliberately not a gate.** It sits above
the current price almost by construction, so gating on it hands the filtering to
somebody else's professional optimism. It contributes to the score only.

**Valuation has two halves and the second one must bootstrap.** Finviz multiples
are available immediately; P/E *versus the stock's own history* cannot be, since
no source hands over a past P/E series. `pehistory.ts` records one reading per
symbol per scan, mirroring `iv-history.json`/`skew-history.json`, and returns
`null` until ~30 readings. It also returns `readings`/`needed` so the screen can
print **how many are still missing** rather than a mute dash — this half is one
of the two legs of the "it's cheap" claim, so a percentile computed on 4 samples
would be worse here than in IV rank. While warming up it scores **neutral**, not
low, so it moves nothing either way.

**Missing data scores 0.5, never 0** (`band()`). Scoring 0 builds a *hidden
filter*: every symbol Finviz failed to scrape sinks to the bottom of the table
and nobody ever learns why. The `unknown` flag on the gate is what does the
warning; the score stays neutral.

**Two rendering bugs found only by rendering**, both of the kind this repo keeps
relearning:

- `.pftable td` sets `white-space: nowrap` so numeric *columns* do not wrap. The
  detail drawer lived inside a `td` of that same table and therefore inherited
  it — every paragraph ran to a single 1462px line inside a 777px box and was
  cut off. What got cut was the honest half: that the analyst target is not a
  gate, which Finviz fields are missing, that the P/E store is not ready. Same
  lesson as #102 — where a string is truncated decides what can be read.
- Fixing that was not enough: at 400px the drawer was still half off-screen,
  because a `<td>`'s content sizes to the **table** (784px), not the viewport.
  Horizontal scrolling is right for a grid of numbers (that is why the Congress
  detail table does it) and wrong for prose. So the drawer was moved **out of
  the table's scroll container** entirely and renders below it. Measured:
  `detailW` 784 → 350 at a 400px viewport, and zero elements overflow the
  viewport across both themes at 1280 and 400.

**"Why did it fall?" is a button, not an automatic column.** A 20-row scan would
otherwise be 20 Claude calls and 20 news fetches. The client posts the row it is
already displaying (same shape as `/api/ai` and `/api/tradebrief`) so the route
cannot disagree with the table beside it; the route adds only the news. News
failing and news being empty are **different branches in the prompt** — an
absent section reads to a model as "no notable news", which converts a network
error into a claim about the business. And the prompt tells Claude to say
outright when the headlines do not explain the fall, because inventing a
plausible cause is far easier than admitting none is visible. Headlines are
third-party text, so the system prompt marks them as data and tells Claude to
report, not follow, any instruction-shaped text inside them.

No new env var and no Render step: the P/E store lives in `.cache/`, which this
repo already documents as lossy and regenerable. The cost of that is real and
stated — a deploy resets the P/E history to zero — and it is accepted to avoid
the `USERS_PATH` trap, since the Finviz half of valuation keeps working.

**Finished scans are saved (`src/lib/lt-store.ts`), and #137's reasoning for
not saving them was wrong about what it was measuring.** That reasoning: this
scan is bounded by tier 0 and everything expensive is day-cached, so a re-run
is nearly free — unlike the 4–8 minute put scan, which earns its job
machinery. Day caching makes the *network* cheap; it does nothing about the
person, who still has to press Scan and watch three tiers walk 503 symbols.
And the empty table on return looks exactly like "last run found nothing" —
the same "not loaded" rendering as "nothing is wrong" this repo keeps
outlawing. Reported by the owner: *"screener longterm rồi out vô lại bị mất
những con stock, phải screen lại"*.

Same shape as `scan-store.ts`, for the same three reasons: **server-side**
(the same account opens on a phone and then a desktop), **per user** (each
member has their own watchlist, so their results differ), **per universe** (a
30-second watchlist pass must not overwrite a several-minute basket run).

Three details that are load-bearing:

- **A separate file, but still no new env var.** The path is derived from
  `SCAN_PATH`'s *directory* (`last-longterm.json` beside `last-scan.json`), so
  it lands on `/var/data` with nothing to add by hand — the `USERS_PATH` trap
  again, where Render does not add a variable to an existing service and the
  data silently goes to the build directory. Separate file rather than a new
  key inside `last-scan.json` because the two row shapes are unrelated and two
  processes writing one file is a read-modify-write that can clobber.
- **The save happens *before* the first `candidate` event is sent**, next to
  the existing `flushPe()`, for the reason already written there: by that
  point every expensive thing is done, so a client that disconnects while
  reading the table must not cost the run. The scan still has no background
  job — closing the tab *mid-run* still loses it, which is the deliberate
  trade-off — but a *finished* run now survives.
- **Switching universe reloads that universe's saved scan, replacing the
  table** rather than leaving the previous universe's rows under the newly
  lit button. The Sell Put screener's restore keeps whatever is already on
  screen (`prev.length ? prev : …`); here that would silently show basket
  results while the toggle reads watchlist.

The restored table prints `lt.saved`, deliberately in `--warn` and deliberately
word-for-word the same sentence as the Screener's `res.saved`: a grid of
numbers looks identical whether it is live or four hours old, and saying it the
same way in both tabs means it only has to be learned once.

**The SMA200 gate is a tickbox, not a fixed gate, and that is the whole
design.** The owner asked for it directly (*"tôi muốn quét không được qua
sma200"*), meaning price must still be **above** its SMA200 — the strict
reading #137 deliberately did not build. The reason it did not is still true
and measured: this tab hunts stocks that are *falling*, and anything down far
enough to be interesting has usually lost its SMA200 already, so hard-wiring
it returns an empty table nearly all year. So it ships as
`requireAboveSma200` on `gatesFor(input, opts)`, default off server-side and
default **on** in the panel, mirroring the Sell Put screener's own
`requireAboveSma200` checkbox.

Three things about it are load-bearing:

- **The gate is absent from `gates` when the tickbox is off**, rather than
  present-and-always-passing. A ✓ that never filters anything is noise; a ✗
  that never filters anything is worse, because it teaches the reader to
  ignore ✗. Nothing is lost by omitting it: a stock below its SMA200 already
  says so in the Trend column.
- **It is evaluated in tier 1**, so it cuts before a single Finviz scrape or
  SEC file is spent. That is the same cost argument the three tiers exist
  for, and this gate is unusually good at it — it is cheap and it cuts hard.
- **`belowSma200` counts the symbols dropped by this gate and this gate
  alone** (exactly one failing tier-1 gate), and the panel prints it in
  `--warn`. Without it, "the tickbox emptied the table" and "no stock in the
  market qualifies" render identically, and they need opposite responses. The
  count is deliberately the *only-failure* count so it can honestly answer
  "would unticking bring these back into consideration"; the wording still
  says they must clear the remaining gates.

**The saved-scan key includes the tickbox** (`user:universe:sma200`), same
reasoning as including the universe: on and off are two different tables, so
sharing one slot would leave the other setting's rows sitting under the
control you just changed. The **off** state deliberately keeps the old
suffix-less key — every scan saved before this shipped ran with no such gate,
which *is* the off state — so there is nothing to migrate.

Scoring is untouched: `scoreComponents()` never reads `aboveSma200`. This is a
filter, not a re-scoring, and a test pins that the two produce identical
components.

#### Market-cap buttons (`src/lib/marketcap.ts`, `CapChips.tsx`)

Three toggle buttons — **Mega ≥$200B / Big $10–200B / Mid $2–10B** — on the
Sell Put Screener **and** the Long-term tab. Multi-select; **nothing selected
means no filter at all**, not "reject everything", because a filter nobody has
touched must be the widest state rather than a silent one.

**The market cap is Schwab's, and it is free at tier 0.** `quotes()` already
returns `fundamental.sharesOutstanding` in the very batched call both tabs
make first, so cap = price × shares costs **zero extra requests** — and that
is the whole reason this lands where it does. On the Screener it cuts before
the option chain is fetched; on the Long-term tab it cuts before the daily
bars, the Finviz scrape and the SEC file. The Heatmap has computed market cap
this way since it was written, so this is reuse, not a new source.

**One module and one component, deliberately.** `marketcap.ts` owns the
thresholds and the pass rule; `CapChips.tsx` owns the three buttons. Two tabs
asking the same question with two copies of the answer is how the copy nobody
looks at drifts — the same argument that put `ratelimit.ts` in one place.

Rules the maths follows, each pinned by a test:

- **Zero or missing shares yields `null`, never a cap of 0.** A 0 would be
  read by `capTier()` as "small cap" — turning *not known* into a confident
  claim about the size of a company. Same shape as the non-positive share
  counts in `secfacts.ts` (#142), different source.
- **Unknown cap PASSES, carrying `unknown: true`**, per the standing #131
  rule. Dropping it would let one missing Schwab field decide for the user.
- **Numeric strings are read.** `Number.isFinite('100')` is `false`, so a
  naive check would silently blank the whole basket if Schwab ever typed the
  field as a string — the `gex.ts` trap, pre-empted.
- **`parseCaps()` normalises order and drops unknown values**, and selecting
  *all four* tiers collapses to "no filter": that is what it means, and it
  keeps the saved-scan key from growing a suffix for a filter that rejects
  nobody.

**Each tab keeps its own convention, which is why it renders differently in
each.** On the Long-term tab every criterion is a gate row, so this is a gate
(present only while a selection is active, exactly like the SMA200 tickbox).
On the Screener, user-editable criteria are plain filters and the hard gates
are the fixed seven, so this is a filter beside `sectors` — which it most
resembles: both cut on a property of the *company* rather than the contract,
and both cut at tier 0. `Filters.caps` is optional (`?? []` everywhere) so a
saved filter set from before this shipped can never read as "something was
selected".

The Long-term saved-scan key gains `:cap=mega+big`, same reasoning as the
universe and the SMA200 tickbox; no selection adds no suffix, so old records
are still the no-filter records and nothing needs migrating. `capDropped`
counts what the filter removed at tier 0 and the panel prints it in `--warn`,
for the same reason `belowSma200` exists: "the buttons emptied the table" and
"nothing qualifies" need opposite responses.

Not changed, and worth knowing: **the Screener's saved scan is keyed by user
and universe only**, so it does not vary by filter — true of every Screener
filter since it was written, and covered by the `res.saved` snapshot warning
already on screen.

#### Sector money-flow filter (`src/lib/rrgsectors.ts`, `RrgChips.tsx`)

Four quadrant buttons — Lagging / Improving / Leading / Weakening — filtering
Long-term candidates by where **their sector** sits on the same RRG the Heatmap
tab draws. The owner's words for what they wanted: *"lọc ngành nào đang uptrend
mạnh"*, which is the **Leading** quadrant (stronger than the market and still
strengthening); the note under the buttons names that in those terms rather
than leaving the reader to decode "Dẫn đầu".

**It is the SECTOR's quadrant and can never be the stock's.** RRG coordinates
are a cross-sectional position — `crossZ()` in `rrg.ts` scores each sector
against the other ten *in the same week*, and `MIN_SECTORS = 5` enforces it.
Strip the peer group away and both axes lose their definition, so there is no
such thing as an RRG coordinate for one ticker. The gate label says "ngành",
the chip note says it twice, and the detail drawer prints the sector name
beside the quadrant — otherwise "Đang hồi" reads as a claim about the company.

**The computation moved into a lib so both callers share one number.**
`/api/rrg/route.ts` held it inline; it is now a thin HTTP wrapper over
`rrgSectors()`. Two parallel computations would drift, and the drift here is
especially bad: the chart says a sector is improving while the filter drops
that sector's stocks, with nothing on screen to say which is right. That is
#96/#99's lesson applied before it could happen. The one-hour cache moved with
it, so opening the Heatmap chart and then scanning costs **zero** extra
requests.

**`GICS_TO_KEY` is load-bearing and was measured, not remembered.** The basket
file writes sectors as GICS names ("Information Technology"), the RRG uses its
own keys (`tech`). All 11 names were read straight out of `data/sp500.json`
(503 rows, exactly 11 distinct values) and a test asserts every one resolves —
plus that a near-miss ("Tech", "Healthcare", "Real estate") returns
`undefined` rather than falling back to some default sector, because a wrong
quadrant badge looks exactly like a right one.

Three more details:

- **Watchlist symbols now get their sector from the basket file**, the same
  `bySymbol` lookup `scan-job.ts` has always done. They previously carried
  `sector: ''` until Finviz answered at tier 2, so there was nothing to look
  the rotation up by at tier 0. Symbols outside the S&P 500 list stay unknown
  and pass with `?`.
- **The rotation is computed on every scan, not only while filtering.** 12
  requests behind a one-hour shared cache is small against ~6 batched quotes
  plus hundreds of tier-1 histories, and the payoff is that the sector-flow
  column reads even when no button is lit. A failure is not fatal: every RRG
  gate becomes `?` and the panel prints the real reason, which is a different
  sentence from "this sector is not in the selected quadrants" because the
  fixes differ.
- **Selecting all four quadrants collapses to "no filter"**, exactly as
  `parseCaps()` does, so the gate disappears rather than becoming a ✓ that
  rejects nobody and the saved-scan key grows no suffix.

The saved-scan key gains `:rrg=improving`, joining the universe, the SMA200
tickbox and the cap buttons; no selection adds no suffix, so records saved
before this shipped are still the no-filter records and nothing needs
migrating. `rrgDropped` counts what tier 0 removed, printed in `--warn`, for
the reason `belowSma200` and `capDropped` exist.

`ChipRow.tsx` was extracted when this became the second multi-select chip row:
two rows of buttons that look alike but behave differently — one remembering
`aria-pressed`, one not; one disabled mid-scan, one not — is the kind of thing
users find before developers do. `CapChips` and `RrgChips` are both thin
wrappers over it, and `.capchips` became `.chiprow`.

#### "Why did it fall?" — the answer's language, and a second news source

**The Vietnamese instruction was one English line at the very end of an
English prompt.** The owner reported the answer coming back in English with
the UI in Vietnamese. The plumbing was never broken: the panel sends `lang`,
the route defaults to `vi`, and the prompt did say *"Answer entirely in
Vietnamese."* — but it said it **in English, once, at the bottom**, after
~20 lines of English instruction, and the user message that follows is a
wholly English fact table with English headlines. That is the exact setup
where a single language line loses to its context.

The fix is structural rather than louder: `LANG_LINE` is written **in the
target language**, placed **first and repeated last**. An instruction written
in Vietnamese is a far stronger anchor than an English sentence asking for
Vietnamese, and putting it at both ends leaves no stretch of prompt where it
is out of sight. `/api/ai` — the sibling that has always worked — already put
its language line near the top rather than the bottom, which is the clue that
position matters here. Tests pin the anchor at both ends and that choosing
English leaks no Vietnamese; **whether Claude now actually answers in
Vietnamese can only be confirmed in production**, since the sandbox cannot
call Anthropic.

**The "why did it fall?" prompt also reads a live technical/IV snapshot
(`src/lib/technical.ts`), the same numbers the Analyze tab shows.** Long-term's
own pipeline only computes SMA200 and support zones — no RSI, MACD, Bollinger,
ATR, realized or implied vol. `technicalSnapshot()` is the exact computation
`/api/analyze` runs, extracted so BOTH routes call one function instead of two
that would drift — the #96/#99/#147 lesson again, and here the drift is
unusually visible: a user opening both tabs for the same symbol would otherwise
see two different RSI readings answering the same question. `/api/analyze/route.ts`
is now a thin wrapper over it, adding only what it doesn't own (earnings, news,
Finviz, FMP profile) — behavior-preserving, same three Schwab requests, same
JSON shape, same 401/404/500 split.

The why route runs it in parallel with the news fetch via `Promise.allSettled`
and fails **independently** — an expired Schwab session must not take the news
section down with it, and vice versa. Missing technical data says why, never a
silent gap. Deliberately NOT re-fetched: Finviz and news, since Long-term
already has its own reading of both on the row (`row.fa`, and the three-source
`news.ts`) — calling again would cost more and risk a number that disagrees
with what is already on screen beside it.

The system prompt treats the technical section as supporting colour, not causal
evidence: RSI, MACD and IV describe what the market is pricing right now, not
why the stock fell — fundamentals and news stay the primary evidence for "why".
Without that instruction, "RSI 28, oversold" reads far too easily as a REASON
for the fall rather than a SYMPTOM of it.

**Google News RSS is the third source (`src/lib/gnews.ts`), and the reason to
add it is that Yahoo alone was a single point of failure.** It is free, keyless
and needs no registration, and it is not one outlet but an aggregator of
hundreds — which matters because Yahoo only returns articles *it* has tagged
with `relatedTickers`, so an article Yahoo does not tag is one this app can
never see.

**It cannot be measured from the sandbox, and that says nothing about
production.** Measured 2026-09-18: `news.google.com` is refused **403 at
CONNECT** by the proxy — and so is `query1.finance.yahoo.com`, the source that
has been running in production all along. So "unmeasurable from here" is
exactly the status of the source already shipped and working, not a new risk.
This follows the CBOE precedent (#109): parse tolerantly, and when parsing
comes up empty, print what was actually received.

**The real difference, and it shapes the whole change: Google News does not tag
articles with tickers at all.** So `NewsItem.tickerCount` is now `number |
null`, and `null` means NOT KNOWN. Writing `1` there would assert the article is
about this company when nothing verified that — the degradation idiom again,
one source further down. Sorting places unknown at **1.5**: below a confirmed
ticker-specific article, above a confirmed market-wide one, which is exactly
where an unmeasured thing belongs. The prompt gets a third label and tells
Claude to discard a headline plainly about a different company; the Analyze news
list prints "chưa rõ có riêng mã này không" rather than "riêng mã này".

**The search goes by company name, not by ticker.** `ALL`, `ON`, `IT`, `KEY`,
`CAR` and `NOW` are all both tickers and ordinary English words, so a bare
ticker query returns a page of junk that looks exactly like real news. The why
route passes the name already on the row it was sent; corporate suffixes are
stripped because a quoted `"Nike, Inc."` matches almost no real headline. A test
pins that `Incyte Corporation` → `Incyte` — the suffix regex must not eat a word
*inside* a name.

Two smaller rules, both pinned: the trailing " - Publisher" is cut only when it
matches the item's own `<source>`, never at the last hyphen (plenty of headlines
contain one); and an item with no parseable date is dropped rather than shown
undated, since a headline that cannot be placed in time cannot answer "why did
it fall this week".

**Articles arriving from two sources are merged by normalised title, after
sorting**, so the surviving copy is the higher-ranked one. Without it the 8-item
budget fills with duplicates, and Claude reads one story repeated as two sources
independently confirming it — evidence stronger than the truth.

**A non-RSS body throws, carrying the first 160 characters.** A consent page or
a block page must read as *failed*, not as "no bad news exists"; a real feed
with no items returns `[]`. Two branches because the fixes differ.

**Reddit is deliberately not built, for two different reasons.** It still has a
free tier, but it needs an app registration producing a client id and secret —
a keyed host, which this repo probes before coding. More importantly it is
**chatter, not reporting**: people guessing at a cause *after* the fall, often
wrong. Feeding that straight into the "why did it fall" prompt invites exactly
the fabrication that prompt exists to prevent. If it is ever built it belongs in
a separate tier, labelled as unverified public discussion in both the prompt and
the UI. X/Twitter still has no free or keyless route at all.

**SEC filings are the second news source (`src/lib/secnews.ts`), and they
are not the same kind of thing as press articles.** A news article is an
outsider *writing about* the company; an 8-K is the company itself being
*legally required* to disclose a material event. For "why did this fall", the
second is usually the cause rather than a report of it.

**Measured, not remembered (2026-09-18, `data.sec.gov` answers 200 here):**
`filings.recent` carries 16 parallel arrays, and one of them is **`items`** —
for 8-Ks it holds the real item codes (`"2.02,9.01"`, `"5.02"`). That is what
turns a useless `8-K` line into *"Item 2.02 results of operations (earnings
release)"*. `primaryDocDescription` exists too but reads just `"8-K"`, so it
is unusable. Run end to end against live SEC: AAPL, NKE and **BRK/B** all
produce readable, high-signal lines (the slash normalisation from #141 is
what makes BRK/B work), while SPY and a nonexistent ticker both return an
empty list silently — correct, since an ETF has no filer.

Decisions worth keeping:

- **Form 4 is deliberately excluded.** The Insider Trade tab already reads it
  far more carefully (code-P only, 10b5-1 excluded), and by volume it would
  drown everything else — measured on AAPL: **591 Form 4s out of 1001 rows**
  against 103 8-Ks. Including it turns a news list into an internal paperwork
  log. The kept set is 8-K, 10-Q/10-K, 424B*/S-1/S-3 (a priced offering is a
  real cause of a fall) and SC 13D (activist stake) — but see the 424B
  correction below: it is capped at one entry and no longer called dilution.
- **Item 9.01 is dropped when other items exist.** It is the boilerplate
  "financial statements and exhibits" that rides along with almost everything;
  keeping it beside 2.02 only dilutes the line. It still prints when it stands
  alone.
- **An unknown item code prints verbatim and says the app does not know it**,
  never a guess — SEC adds items, and a wrong label looks exactly like a right
  one. Same posture as `ruleLabel()` in Options Flow.
- **The two sources fail independently** (`symbolNewsAll` → `{items, ok,
  failed}`). Yahoo dying must not erase the SEC filings, and the prompt now
  names which sources answered and which failed, telling Claude it is *partly*
  blind rather than fully. Collapsing those was the thing to avoid: "no news
  exists" and "half the sources are down" lead to opposite conclusions about
  whether the fall has been explained. `symbolNews()` keeps its old signature
  and throws **only when every source failed**.
- **Sort order is unchanged and now carries the new source correctly.** SEC
  items are `tickerCount: 1`, so they land in the top "specific to this
  ticker" bucket and compete there **by date** — a two-month-old 8-K does not
  outrank today's headline, while a market-wide wrap still sits below both.

**The 424B label was wrong, and Claude in production is what caught it
(#153).** Answering the owner, it volunteered that the app's "dilution" tag
was an unverified inference and that 424B filings are often debt. It was
right. Measured against `data.sec.gov`:

| Issuer | filing rows | 424B* | share | primaryDocDescription |
|---|---|---|---|---|
| Bank of America | 11,416 | 10,626 | **93%** | PRICING / PRODUCT SUPPLEMENT |
| Morgan Stanley | 19,909 | 16,716 | **84%** | `PRICING SUPPLEMENT NO. 18,867` |
| NVIDIA | 1,001 | **4** | 0.4% | just `424B5` |

Morgan Stanley's run to **pricing supplement number 18,867** — a
medium-term note programme, i.e. debt. The old label called every one of
them shareholder dilution: a confident false claim about a real company's
capital structure, tens of thousands of filings deep. It now states that an
offering was priced and says outright that the filing index does not reveal
equity from debt.

The same measurement exposed a second bug of a shape this repo had already
avoided once. 424B is **84–93% of a bank's filing index**; Form 4 was
excluded from this feed for drowning everything at 591/1001 (59%), and 424B
is worse yet was let through — so for any bank all four slots filled with
pricing supplements and every real 8-K was pushed out. Capped at one entry.
A test reproduces BAC's ratio: 200 pricing supplements plus 3 real 8-Ks now
yields all 3 of those 8-Ks, where it previously yielded none.

`primaryDocDescription` earns its place here, and the contrast is worth
keeping: #148 measured it **useless for 8-K** (it merely echoes `"8-K"`),
but for 424B it carries `PRICING SUPPLEMENT` / `PRODUCT SUPPLEMENT`, the
debt-programme signature. One field, dead weight on one form and
load-bearing on another.

Item 9.01 also gained its real meaning in `EIGHT_K_ITEMS`. `BOILERPLATE`
already named it, so printing "meaning not in this app's table" when it
stood alone was the app lying about its own lookup table. It is still
dropped when other items are present.

**Google News returned 503 in production, and the error could not say
why.** `if (!r.ok) throw` ran *before* reading the body, so #149's
print-what-you-received logic never fired on that branch and the first
reading could only report `Google News 503`. A Google 503 means either a
transient outage (retry works) or a datacenter-IP block (retry never works)
— and only the body separates them, since Google's block page says
"unusual traffic from your computer network" in as many words. The body is
now read and clipped into the error, **status first** so a 200-character cut
cannot eat it (#102's field-order lesson). No retry was added: stacking a
guessed workaround on an unmeasured cause is the exact failure this repo
keeps relearning. One more production press settles it.

**X/Twitter is not built, and the reason is the reason.** Search on X needs a
paid X API plan; there is no free or keyless route left (Nitter is dead), so
it cannot be measured from here at all. The repo's own rule for keyed hosts
applies — build a probe first, then code against the measurement — so this
stays an offer rather than an untested integration. `news.google.com` was
checked and is **not** on the sandbox allowlist (neither is Yahoo, the source
already in use), so any additional press source would be coded blind; SEC was
chosen precisely because it is the one that can be measured.

One small correction to the note at the top of this file: **bare `fetch` to
`data.sec.gov` returned 200 from the sandbox today**, where #142 measured a
403. Measured for that one host, on that one day — not a general reversal, so
keep using `curl` when a measurement has to be trusted.

#### SEC 10-K financials (`src/lib/secfacts.ts`, `companyFacts()` in `sec.ts`, `/api/secprobe`)

Finviz is a **snapshot** (trailing twelve months). It cannot answer the two
questions that matter most for buy-and-hold money: has revenue / EPS / free
cash flow grown for several years, and is the share count inflating? SEC's
XBRL `companyfacts` API answers both — free, keyless, ten years deep — and
`sec.ts` already had a working client to `data.sec.gov` (User-Agent,
`padCik()`, rate limiter) from the Form 4 work, so this is an extension of code
that has run in production, not a new integration. The owner brought a
"professional long-term screener" document proposing SEC → Alpha Vantage →
Nasdaq Data Link → AI-scored moat/TAM/risk → three-scenario DCF; this is the
one piece of it that is free, already wired, and not available from Finviz.
The rest was declined on the record: paid APIs that re-serve SEC data, LLM-
produced scores (this repo lets Claude interpret numbers, never produce them),
and a DCF whose three fair values are three assumptions wearing a suit.

**The shape was measured in production (2026-09-17, AAPL via
`/api/secprobe`)**, since `data.sec.gov` is 403-on-CONNECT from the sandbox.
The documented structure held: top-level `cik,entityName,facts`, taxonomies
`dei` and `us-gaap`, and a fact carries exactly
`start|end|val|accn|fy|fp|form|filed|frame` — `fy` is a **number**, `frame` is
`"CY2018"` for a full year and `"CY2018Q3"` for a quarter. The probe stays (not
`OWNER_ONLY`: SEC data is public and keyless) to measure other issuers.

That one reading exposed **two real bugs the hand-built fixtures could not**,
which is the whole argument for the probe idiom:

- **The tag ladder took the first tag with data, not the most recent.**
  Apple's `Revenues` stops at FY2018 — when ASC 606 arrived it moved to
  `RevenueFromContractWithCustomerExcludingAssessedTax` and the old tag was
  never updated — so `latestFy` read 2018, the 3-year CAGR was `null` and FCF
  margin was `null`, with the current tag sitting right beside it.
  `pickSeries()` now takes the series with the latest `end` (tie → longer).
  It deliberately does **not** splice two tags into one series: at a bank,
  `Revenues` and `RevenuesNetOfInterestExpense` are different definitions,
  and stitching them draws a growth line across a definition change.
- **Stock splits break per-share series, and a filing only restates three
  years back.** Diluted shares read 5.25B for FY2017 and **20.0B** for FY2018.
  Apple did not issue 4× stock: FY2018 was last reported by the FY2020 10-K,
  filed *after* the August 2020 4:1 split and therefore split-adjusted, while
  FY2017 was last reported by the FY2019 10-K, *before* it. A 10-K carries
  three comparative years, so adjustment reaches back three years and no
  further; the same seam sits at 2011→2012 (the 2014 7:1 split) and in EPS
  (9.21 → 2.98). Unchecked, a company that split two years ago reads as
  "+300%/yr dilution" and **fails the dilution gate for splitting**, while
  its EPS reads as a 75% collapse. `splitBreaks()` flags a ≥1.8× year-on-year
  jump in the share count (high enough not to catch a genuine 70% issuance —
  that *is* the dilution the gate exists for), `cagrAcrossBreaks()` returns
  `null` for any EPS or share-count span crossing a break, and both the drawer
  and the prompt say why. Revenue and FCF are totals, not per-share, and are
  untouched. For Apple the 2022→2025 window does not cross 2018, so the
  buyback CAGR still computes.

**Coverage measured on a 33-symbol stratified sample across all 11 sectors
(2026-09-17, direct from `data.sec.gov`):** full-year revenue **100%**, EPS 97%,
FCF 91%, share count 97%, 3-year revenue CAGR 100%. Every rung of the revenue
ladder earns its place — `Revenues` 17, ASC 606 *Excluding* 12, ASC 606
*Including* 3, and `RevenuesNetOfInterestExpense` exactly once, at Morgan
Stanley: the rung added on a hunch about banks turned out to be real.

**Financials have no CapEx tag at all.** BAC, MS and JPM carry not a single
`Payments*` capital-expenditure concept, so their FCF series is empty and the
FCF gate shows `?`. That is correct rather than broken, and it is also the
honest answer: free cash flow for a bank is not the same quantity it is for an
operating company, since operating cash flow swings with trading assets. EOG
(oil and gas) lands in the same bucket.

**Two further bugs, both found the hour the host opened:**

- **A unit slip between two filings, at American Tower.** The same `end`
  (2015-12-31) carries two facts: the FY2015 10-K says 423,015,000 diluted
  shares, the FY2016 10-K says **423,000** — the same number in thousands.
  "Latest filed wins" faithfully picked the wrong one, the series read
  400M → 0.4M → 429M, and that produced two phantom split breaks which then
  silenced the dilution gate. The tell is scale: **a genuine restatement
  essentially never moves a figure by 100×** — it corrects a few percent. So a
  ratio of ≥100× (or ≤1/100) between an older and a newer filing of the same
  period is treated as a unit error and the **older** value is kept, filed as
  it was by the people who computed that period. Tests pin both directions: a
  3.5% and even a 90% restatement still takes the newer value. After the fix
  AMT reads 399M → 400M → 423M → 429M with no breaks, and the nine genuine
  split breaks elsewhere in the sample are untouched.
- **Non-positive share counts are dropped.** A listed company cannot have zero
  weighted-average shares. `splitBreaks()` already guarded `a > 0 && b > 0` so a
  zero never produced a phantom break; the damage was subtler — `cagr()`
  returns `null` when the first point is ≤ 0, so one junk zero inside the
  three-year window **silences** the dilution reading while the data could
  answer perfectly well. The filter applies to share counts only: an EPS of 0
  is a real break-even and a negative FCF is real cash burn, and the gates need
  to see both.

**Berkshire settles that the duration filter earns its keep.**
`EarningsPerShareBasic` carries 32 facts in 10-Ks with `fp: FY` — and every one
of them is a **quarter** (89–91 days). Not one annual fact exists. Trusting
`fp: FY` without checking the span would have summed quarterly EPS into an
annual figure.

**Confirmed after deploy** (second probe run, AAPL): revenue tag is the ASC
606 one, `latestFy` 2025-09-27, revenue CAGR 3y **1.81%** / 5y 8.67%, FCF
margin 23.7% (98.8B / 416.2B), shares −2.77%/yr, EPS +6.86%/yr,
`splitBreaks` exactly `[2012-09-29, 2018-09-29]`. The sample facts are now
2026 10-Qs, including a nine-month year-to-date figure — both correctly
excluded by the 10-K-only, ~one-year-duration filter. One small known gap:
the FCF series lacks FY2014 (the CapEx tag has no matching period that
year); it does not touch the 3-year CAGR.

**Three known traps in `companyfacts`, each handled and each pinned by a test:**

- **One period appears in several filings.** A 10-K carries the prior two years
  as comparatives, all tagged with the *filing's* `fy`. Grouping by `fy` counts
  one year three times. `annualSeries()` groups by `end` and keeps the latest
  `filed` — which is also how restated figures are absorbed without ever
  detecting a restatement.
- **`fp: "FY"` does not mean "full year".** Q4 figures inside a 10-K carry
  `fp: FY` too. What separates them is duration: `start → end` must be 340–380
  days. Drop that check and a quarter is silently summed as a year.
- **One concept, many tags.** Revenue is `Revenues` at one company,
  `RevenueFromContractWithCustomerExcludingAssessedTax` at another (post ASC
  606), `SalesRevenueNet` in older filings. Each metric has a tag **ladder**,
  tried in order, and `tagsUsed` records the winner — the `TOKEN_VARIANTS`
  try-then-remember shape from tastytrade, applied to XBRL.

`cagr()` takes the **two real points** roughly `k` years apart (±120 days) and
divides by the actual day gap, so a company missing one annual filing is not
miscomputed and a two-year series asked for a 5-year CAGR returns `null` rather
than borrowing two years. A first point ≤ 0 returns `null`: going from a loss
to a profit is not "−200% growth". The test caught its own assumption here —
2023-09-30 → 2024-09-30 is 366 days, so a 10% step reads 9.98%; the code was
right and the test tolerance was wrong.

FCF is `OCF − CapEx` matched by fiscal-year end. A company with OCF but no
CapEx tag yields an **empty** FCF series, never FCF = OCF; FCF margin is `null`
unless FCF and revenue share the same year-end.

**Three new gates** — revenue CAGR 3y ≥ 0, latest-FY FCF > 0, diluted share
count CAGR 3y ≤ 5%/yr — pass-with-`unknown` when SEC has nothing, per the
standing #131 rule. The dilution gate is the single best idea in the owner's
document: EPS growth alongside a rising share count is growth being handed to
new shareholders, and buybacks (negative CAGR) pass freely. The score gained a
`growth` component (15) and the other four gave ground (25/25/20/15/15). With
no SEC data all four growth sub-scores are neutral, so `growth` = 7.5 and the
ranking is undisturbed.

Three reasons for "no SEC data" render as three different sentences because
they need three different fixes: `no-cik` (ETF, or a ticker missing from SEC's
directory — nothing to do), `no-data` with the diagnosis string (the tag
ladder needs a new rung), and a network error (retry next scan). `companyFacts`
is cached **7 days**, not one: annual figures move only on a new 10-K, and a
large filer's file is tens of MB.

### The one background loop (`src/lib/alert-runner.ts`, `alerts.ts`, `notify.ts`)

Everything else in this app is passive — computed only when a browser asks. Alerts needed something that runs on its own, so this is the only timer in the codebase. It lives **in-process**, not in a Render Cron Job, because `/var/data` (holding the Schwab token) attaches to one service only; a cron service could not read the token and would have to call back over HTTP anyway. Its weakness is invisibility, so My Portfolio prints the last-run clock — a dead timer reads as a frozen number rather than as "nothing is wrong".

Alerts cover what you must act on: Schwab session at 2/1/0 days left (the 7-day cap is non-renewable and its expiry stops the whole app), puts gone ITM, earnings before expiry, backwardation or elevated skew, sizing limits breached. **Daily P/L is deliberately excluded** — a thing that pings constantly is a thing you learn to ignore, including on the day it is right.

#### Live position events (`src/lib/liveevents.ts`)

Every alert above is computed from **price, greeks and dates**. None of them
reads a corporate event, so the app could not say that a CEO had resigned or
that a company had declared its own past financials unreliable. The owner asked
for that after considering X/Twitter; it turned out not to need X at all, since
an **8-K is the company itself being legally required to disclose a material
event** — the cause, not a report of the cause — and it is free and keyless.

**Measured 2026-09-18 against `www.sec.gov`, not remembered.**
`browse-edgar?action=getcurrent&type=8-K&output=atom` returns the newest 8-Ks
for the **whole market** in one request — the Congress-trading "one global feed,
filter in-app" shape, and far cheaper than asking per symbol, since
`recentFilings` is **uncached** (a few dozen symbols × 96 ticks/day is thousands
of requests). `count=100` → 100 entries / 72 KB, stable; `count=400` → still
100, so **100 is the ceiling**; 100 entries span **17h30m** while the newest 20
span 1h09m; CIK parsed 100/100 and item codes present 100/100.

That feed carries **two things `filings.recent` does not, both load-bearing**:
**minute-level timestamps** (the other has only a date, and without minutes
there is no real-time alert *and* no way to stop the re-alert bug below), and
**SEC's own wording for each item code**, so no lookup table of ours can go
stale.

**Running the parser against the real feed found three bugs, one serious.** SEC
escapes `<summary>` as HTML and separates items with `&lt;br&gt;`; once entities
are decoded those become **real tags sitting between the values**, so the item
regex matched only the **last** item of each filing — measured, 100 entries
yielded exactly 100 item codes, i.e. every multi-item filing was truncated. A
`2.02, 9.01` earnings 8-K therefore parsed as `9.01` alone → not material → **no
alert**. The single most valuable alert was being dropped silently. Stripping
tags *after* decoding gives 225 items across the same 100 entries, 75 of them
multi-item, and material filings go **9 → 48**. The same bug hid the accession
number behind a `</b>` (0/100 → 100/100) and left the CIK glued inside the
company name.

**The 90-minute freshness window is not an optimisation — it prevents a real
re-alert bug.** Dedup keys on the *trading day* and `prune()` drops yesterday's
keys, so an 8-K filed on Friday evening would read as unsent again on Saturday
and fire twice. Only filings from the last 90 minutes can alert, which makes
that impossible. 90 rather than 15 so one missed tick does not lose an event,
and the measured 17.5-hour span leaves ample margin. `windowShort` reports the
case where the feed no longer covers the window, rather than missing silently.

**The market-hours gate changed from "skip the whole run" to "decide which
sources run".** Portfolio alerts keep their exact previous behaviour; 8-K checks
run at any hour, because **most 8-Ks are filed after the close** — gating them
on market hours would miss precisely what they exist to catch. Three other syncs
here already sit outside `runOnce()` for that reason. The two halves now fail
**independently** via `allSettled`: an expired Schwab session no longer swallows
the SEC alerts, where before one throw from `collectAlerts()` killed the run.

**Quiet by design**, per this file's own rule that a thing which pings
constantly is a thing you learn to ignore. `MATERIAL_ITEMS` is an **allow-list**,
not an exclude-list, with four urgent codes: 1.03 bankruptcy, **4.02
non-reliance on past financials**, 1.05 cyber incident, 3.01 delisting notice.
Routine items (5.07, 9.01, 7.01, 8.01 — the last two being the form's widest
catch-alls) are **counted, not sent**, and an unknown code never alerts on a
guess but is surfaced as a number on screen, so "quiet" can never look like
"broken". Price moves alert at ≥7% (≥12% urgent) with **separate keys per tier**,
so 7% followed by 14% both reach the phone.

**Press headlines are a third tier (`src/lib/pressalerts.ts`), labelled as
such.** Ordered by strength of evidence: an 8-K is the company itself, legally
required to disclose; a headline is a third party writing about it — faster,
because a reporter does not wait for a filing deadline, but far weaker. Every
alert carries `[Báo chí]` at the front and says in its body that this is not
the company speaking.

News defaults to noisy, so three gates do the real work. **Only single-ticker
articles** — Yahoo tags each article with its own ticker list, so this is
measured, not guessed, and a multi-ticker article is almost always a market
wrap. It is deliberately *not* relaxed for urgent items: if something is
genuinely serious the 8-K tier catches it, and the two tiers covering each
other is the reason there are two. **A keyword allow-list**, same shape as
`MATERIAL_ITEMS`, whose urgent set is *derived from* the four urgent 8-K items
rather than invented — the same events, reported earlier — plus a trading halt;
non-matching headlines are counted, not sent. **Five alerts per run, one per
symbol**, with the overflow counted.

Yahoo only, and each other source is excluded for its own reason: the SEC
filings are already read by the 8-K tier through one market-wide feed, while
`secFilingNews()` asks per symbol and is uncached; and Google News does not tag
articles with tickers at all, so the first gate cannot apply — a keyword match
nobody confirmed is about *this* company is a push notification that can name
the wrong one.

Runs at any hour (the headlines that matter most land after the close) but
throttled to **1 tick in 4 (~60 min)**, because Yahoo costs one request per
symbol — the shape that burned the UW quota. The 90-minute window makes that
cadence lossless. `pressRan` separates "this run did not ask" from "asked and
found nothing"; without it the zeros on screen lie.

**The keyword matcher is where the real bugs were, and all three were silent.**
`recall` did not match "recalls" (English headlines are almost always
inflected, so the gate was skipping most real titles); `probe` did not match
"probing" (silent-`e` drop); `cut dividend` did not match "cuts **its**
dividend". The filler-word rule is kept tight on purpose — at most two words of
≤4 letters — so `cut costs to fund dividend` and `new products ceo says` still
do not match. Where that tightness lost a real headline (`FDA delays approval`,
a 6-letter filler) the fix is an **explicit keyword, not a looser rule**:
widening the gap once for one headline turns a deliberate allow-list into a net
that catches anything, and a wrong alert looks exactly like a right one.

Scope is **held positions ∪ watchlist**, deliberately *not* `trackedSymbols()`,
which also folds in the whole S&P 500 — right for the shared Form 4 cache, wrong
for a phone notification, where 500 symbols is a feature muted in week one.

Two pieces of text that became false were fixed rather than left: `al.closed`
and the README both said no check runs outside market hours (#136's trap).

Anti-spam matters more than the rules: checking every 15 minutes with one put ITM would otherwise mean 96 notifications a day. Each alert key sends at most once per New York trading day, state on disk so a redeploy does not re-fire everything, and keys are marked sent only once a channel actually accepted them so an outage retries instead of being swallowed. Checks skip outside market hours.

Telegram and web push both self-disable when unconfigured, matching the middleware gates — no env vars means the machine behaves exactly as before rather than erroring. Failures surface the provider's own words (a bad bot token and a bad chat id are different problems).

### The self-diagnosing degradation idiom

Repeated deliberately across this codebase: when an external API's exact field names or shape can't be verified from this sandbox (no live Schwab network access), code captures and surfaces the *real* raw keys/values on a mismatch instead of guessing silently or crashing. Examples: ticker tape's `missing`, fear/greed's `topLevelKeys`, trader-check's status parsing, cash balances' `keys` (`mapCashBalances`), positions' `rawKeys`/`raw` (full raw Schwab object dumped when a guessed field fails to resolve), positions' `earningsUnknown`/`earningsDataGap`, volwatch's `volWarmingUp`/`volErrors`, and the alert panel's channel state. The rule extends past field names to *state*: "not computed yet" must never render the same as "nothing is wrong", because silence reads as all-clear — which is exactly how CRWD's earnings were missed. The alert panel originally returned `null` while its status was unknown and so vanished entirely; it now always renders and prints the real HTTP status. Follow this pattern for any new field read from an API whose response shape isn't pinned down by a type from Schwab's own docs.

### Screener (`src/lib/screener.ts`, `src/app/api/screen`)

Two-tier scan to stay under the rate limit: a cheap batched `/quotes` pass eliminates symbols where `spot × 100 > max capital` (no strike could fit the budget), then only survivors get the expensive `/pricehistory` (SMA200/HV20, cached daily) and `/chains` (DTE-windowed) calls. Results stream as NDJSON (`{type: 'phase'|'progress'|'candidate'|'skip'|'error'|'done'}`) so the UI fills in row by row instead of waiting for the whole scan. Scoring is a weighted sum documented in `README.md` (annualized ROC 45, cushion 25, IV/HV 15, liquidity 15) — don't recompute this from first principles, it's a product decision, not a derived formula. `scoreComponents()` returns the four pieces and `scoreOf()` only sums them, so `Candidate.scoreBreakdown` can show *why* two candidates tie on the same total.

The chain fetch is `fullChain` (contractType ALL), not puts only, because term structure and put skew need call IV from the same request. `windowFrom`/`windowTo` therefore always widen to bracket 20-65 DTE regardless of the user's DTE filter — free, since Schwab answers with one request either way.

**Hard gates** (`Filters.hardGates`, default on) are seven fixed pass/fail checks that drop a contract outright: VRP ≥ 1.0, no earnings in the contract window, OI ≥ 500 and volume ≥ 100, spread ≤ 5%, not down >20% over 20 sessions, term structure ≥ 0.95, put skew z ≤ 2. Unlike every other criterion these thresholds are *not* user-editable, and a high score never rescues a failure. `Candidate.gates` is computed for every candidate regardless of the toggle, so switching gates off turns the drawer's checklist into real ✓/✗ annotation with no separate code path. A null reading (missing HV20, missing history) **passes** — a data gap is not evidence of a problem.

**The earnings gate has three answers, not two — and collapsing them was the
app telling its worst lie.** `data/earnings.json` is built by
`scripts/earnings-sync.js` for **watchlist symbols only**, so on a full S&P
500 scan most symbols have no entry at all. The gate read
`passed: !earn`, and `earn` is undefined in two completely different
situations: *checked, and no earnings falls in the contract window* versus
*nothing is known about this symbol*. Both rendered as a green ✓ in the
drawer's checklist — a screen saying "verified clear" about a symbol nobody
had ever looked up. That is exactly the failure the degradation idiom names,
and the shape of the CRWD miss.

The fix is **not** to fail unknown symbols: that would drop ~450 of 503 on a
basket scan and hand back an empty table, and it would break the repo's own
standing rule that a data gap is not evidence of a problem (`ivHv`,
`chg20Pct` both pass on null). So `passed` is unchanged and the pass count is
identical — a test pins that. What changes is that the gate carries
`unknown: true`, the drawer draws `?` in `--warn` with a "chưa có dữ liệu"
tag instead of a ✓, and `Candidate.earningsUnknown` exposes it.

**The pattern was already in this codebase, on the other tab.** My Portfolio
has done this correctly since it was written — `portfolio.ts` computes
`earningsUnknown: !(p.symbol in earnings)` per row and `earningsDataGap` for
the summary. The Screener simply never got the same treatment. Worth
remembering as a search strategy: when a gap like this turns up, grep for
whether some other surface of the same app already solved it, before
inventing an approach.

**Put skew z-score has the same bootstrapping problem as IV Rank**: it needs a rolling mean/std that cannot exist on day one. `.cache/skew-history.json` accumulates one reading per symbol per day (mirroring `iv-history.json` exactly) and `skewZScore()` returns null until ~60 readings exist. Term structure needs no such warm-up — it is a same-day ratio, live from the first scan.

### The scan outlives the browser (`src/lib/scan-job.ts`, `src/lib/scan-store.ts`)

A full-basket scan takes 4-8 minutes. Originally the scan *was* the body of the NDJSON stream, so closing the tab cancelled the stream and killed the scan partway. The work now lives in a job in the server process; the route only follows it and forwards events. A closed tab stops the stream and nothing else.

Consequences worth knowing: pressing scan while one runs **joins** it rather than starting a second (two concurrent full scans would throttle each other against the shared 100/min limit); a stream attaching part-way replays from the first event so a reopened app shows what was already found; and `GET /api/screen` reports whether one is in flight, which the page checks *before* loading a saved scan so yesterday's results never bury a run in progress.

Finished scans are saved to `SCAN_PATH` **per universe** — a 30-second watchlist pass must not overwrite the 8-minute basket run. Restored results are a snapshot, so the UI prints the scan time and says prices are stale; a table of numbers looks identical whether it is live or four hours old.

### GEX (`src/lib/gex.ts`)

Self-computed from option-chain gamma × open interest, not a paid data feed — the point of `README.md`'s "no membership needed" framing. Formula and interpretation (put wall / call wall / zero gamma) are in the README; the code should stay a straightforward implementation of that documented model.

`GexExposurePanel.tsx` (tab Heatmap) is a second consumer of the same `GexChart.tsx` used by Analyze — a ticker-switchable "Market Maker Exposure" view (SPX default, plus QQQ/IWM/VIX presets and free-text search), modeled on tapchiphowall.com/options-gamma's default "Absolute Gamma" view but self-computed from the account owner's own Schwab chain rather than CBOE's 15-minute-delayed feed. `GexChart` grew two props for it: `refreshMs` (auto-refetch on an interval **without** clearing the currently shown chart first — a stale-but-present chart beats a "computing…" flash every 10 minutes, same principle as `TickerTape`) and `zoomPct` (how far past spot the strike axis extends, driven by a slider so the user can widen or narrow it). The reference site's own "GEX Heatmap for All US Tickers" turned out not to exist when checked directly — their heatmap is the ordinary price-change treemap, GEX is single-symbol only there too — so this app's version stayed single-symbol as well rather than inventing a market-wide scan the reference never had.

`$SPX`/`$VIX` as the index symbols passed to `/api/gex` follow the convention already used for quotes elsewhere (`TickerTape`, `/api/md/volatility`) — **unconfirmed against the `/chains` endpoint specifically**, since this sandbox has no outbound network to Schwab. If wrong, the existing error surfacing (`/api/gex`'s `REAUTH_REQUIRED`-vs-generic-failure split, rendered as-is by `GexChart`) will show the real failure rather than a wrong chart, so it's a one-line fix once verified against a live session rather than a silent wrong number.

**Chart layout follows the user's own reference screenshot** (tapchiphowall.com's GEX chart), redrawn in `GexChart.tsx`: a labelled value axis in $M with round ticks, red call bars up / blue put bars down **on one shared scale** (splitting the plot height in half would silently magnify the smaller side), a key-levels box and legend in the top-right corner, dashed lines for put wall / call wall / abs gamma plus the current price and the user's own strike, the ticker as a faint watermark, and a hover/tap tooltip per strike.

Two things about that chart that are easy to get wrong:

- **The strike axis is categorical, not a linear price scale.** Listed strikes thin out away from spot, so a linear axis leaves large gaps. Bars sit at evenly spaced slots and any *price* (spot, a wall, your strike) is interpolated between the two strikes bracketing it (`xOfStrike()`). A level outside the zoom window draws **nothing** rather than being clamped to the edge — a line pinned to the border looks exactly like a real reading.
- **Red/blue here is classification (call vs put), not the green/red sign rule** documented in `ColorLegend.tsx`. That rule governs the sign of a number; these are two categories. Hence separate `--gexcall` / `--gexput` / `--gexabs` custom properties rather than reusing `--risk`/`--credit` — and, per the theming rule below, they are defined in **all three** blocks of `globals.css`.

**The walls are computed on NET gamma per strike (call + put), not on a one-sided max.** This changed after comparing TSLA against tapchiphowall on real screens (2026-09-05): put wall (355), abs gamma (355) and spot matched exactly from two different data sources — but their call wall read 400 while the tallest call bar *on their own chart* was at 355. So their "wall" cannot be a one-sided max. Net gamma reproduces all three of their labels at once: most-negative net → put wall 355, most-positive net → call wall 400, largest |call|+|put| → abs gamma 355.

The old one-sided rule had a visible failure mode, not just a definitional one: the ATM strike is usually the biggest on *both* sides, so put wall, call wall and abs gamma all collapsed onto one strike sitting at spot — three lines drawn on top of each other, naming neither support below nor resistance above. A strike can only be net positive *or* net negative, so net gamma always separates the two sides.

A chain with no net-positive strike has **no call wall**: `callWall` is null and the screen prints `—` rather than picking the least-negative strike, which would draw a resistance line that does not exist.

`GexProfile.absGamma` is the strike carrying the most gamma of either sign combined. It is deliberately a third number next to the walls: each wall is one-sided and zero gamma is a crossing rather than a strike, so a strike can be the biggest overall while being neither wall.

**`Number.isFinite()` does not coerce strings, and that is a silent whole-chain killer.** `Number.isFinite('0.0012')` is `false` — it is true only for values already of type number. The contract filter used it directly on `c.gamma`, so if Schwab returns greeks as strings for a symbol, *every* contract is dropped and the screen says "chain has no gamma data" while Schwab in fact returned a complete chain. This is exactly what SPX showed once it got past the 502: top-level keys included `callExpDateMap` and `underlyingPrice`, and still nothing computed. Everything numeric read off a Schwab contract now goes through `num()`, which accepts a number or a numeric string and rejects empty strings (`Number('')` is `0`, so an empty field would otherwise become a real-looking zero).

**Schwab uses `-999.0` as "greek not available"**, inherited from TD Ameritrade — not null, not absent. That value is finite, so it passes every naive check and would be summed as if it were real gamma, producing a wildly wrong GEX that still looks like a number. `gammaOf()` drops it explicitly.

**A regression worth remembering: #96 fixed SPX's error and thereby broke SPX's display.** The owner reported "SPX used to work" — and it did, by falling through Schwab's 502 to the UW levels. #96 stopped Schwab throwing (it now returns a chain, just an unusable one), which moved SPX off the "Schwab threw" branch and onto the "Schwab succeeded" branch — where `!profile` returned a bare 404 and **discarded the UW levels already fetched in parallel**. Fixing the error made the screen worse.

The lesson is structural, not about SPX: "Schwab threw" and "Schwab returned something useless" are the same thing to a user, so they must share one degradation ladder. `schwabUnusable()` is that ladder — UW levels → the saved reading on disk → an error — and both branches now call it. Two parallel ladders is what let them drift apart in the first place.

**SPX's real cause, measured from production (2026-09-06):** Schwab returns `status=SUCCESS`, `numberOfContracts=3600`, **28 expirations and 3600 contracts** — a complete-looking chain — with `openInterest: 0` on **all 3600** (and gamma `0`, plus 38 at the `-999` sentinel). Not a parse failure: the fields are typed `number` and their value genuinely is zero. GEX is `gamma × OI`, so a chain with no open interest cannot produce one no matter what the app does.

That also exposed a gap in the index-symbol fallback: it only advanced to the next spelling on a **400**. Once `$SPX` started returning 200-with-hollow-data, the loop stopped there and **never tried `$SPX.X` or `SPX`** — the two spellings that exist for exactly this reason. A chain with zero usable contracts now advances to the next candidate just like a 400 does (`usableContractCount()`), and the attempted spellings are printed in the detail on both the UW-fallback and the error path.

Whether another spelling carries real open interest is still unproven — but "we never asked" is now off the table.

**SPX now gets its chain from CBOE (`src/lib/cboe.ts`, `src/lib/gexchain.ts`) — the source tapchiphowall.com reads.** The owner asked how that site draws an SPX chart when neither Schwab nor UW can. Answer: it does not use a broker at all. CBOE, the exchange that lists SPX, publishes a free, keyless, 15-minute-delayed JSON chain per symbol at `cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json` (indices carry a `_` prefix, equities do not: `AAPL.json`), with `open_interest`, `gamma`, `delta`, `iv`, bid/ask, volume and spot. Nearly every open-source SPX GEX tool reads exactly that file. So the ladder is now **Schwab → CBOE → UW → disk → error**, and SPX has the bar chart and AI briefing again.

Structure, because #96/#99 taught that two parallel ladders drift: `loadGexChain()` in `gexchain.ts` owns the Schwab→CBOE rungs (all three index spellings, then CBOE), returns `{source, chain, window, profile, schwabDetail?, cboeAsOf?}` or throws `GexChainError` carrying **both** sources' real reasons plus a `reauth` flag, and **both** `/api/gex` and `/api/tradebrief` call it — the earlier layout had the briefing route calling Schwab directly, so SPX would have shown a chart with a briefing button that still 404'd. `/api/gex` keeps UW→disk→error. Session expiry stops the ladder before CBOE (401, never papered over — #101).

`cboeToChain()` converts the CBOE payload into the exact Schwab shape (`callExpDateMap`/`putExpDateMap`, `"YYYY-MM-DD:dte"` keys, Schwab field names, IV as percent not decimal) so `computeGex()`, `flattenPuts()`/`flattenCalls()` and the briefing read it unchanged — one calculator, not two. It filters to 60 days to match the Schwab window. The conversion still reads every field tolerantly and, when it yields no contracts or no spot, throws with the **real top-level, `data`, and per-option keys**.

**MEASURED END TO END, 2026-09-17** (`cdn.cboe.com` is now on the allowlist), and the guess written in #109 was right in every particular:

- Payload is `{timestamp, data, symbol}`; `data` carries `options` plus
  `current_price`, `iv30`, `security_type: "index"`. Each option has
  `option` (an OSI symbol), `bid`, `ask`, `iv`, `open_interest`, `gamma`,
  `delta`, `vega`, `theta` — all **numbers**, not strings.
- 29,914 contracts in, **15,586 kept** over **32 expirations** after the
  60-day filter; spot 7637.76; total open interest 25.9M.
- `computeGex()` runs on the converted chain unchanged and returns sensible
  SPX levels: put wall 7500, call wall 7800, abs gamma 7600.
- **The ×100 on IV is correct**, and a first look suggested otherwise: the
  first nonzero `iv` values in file order are 7.99, 7.71 — which look like
  percentages already. They are junk contracts at absurd strikes (a
  200-strike call on a 7637 index). Near the money `iv` is `0.1362`, so
  ×100 gives 13.62%, matching CBOE's own published `iv30: 12.155`. Sample
  near spot, not from the head of the array.
- **`zeroGamma: null` for SPX is correct, not a gap.** Cumulative net gamma
  is negative at all 498 populated strikes and never crosses zero — dealers
  are net short gamma across the whole range in that snapshot. Individual
  strikes can still be net positive (hence a call wall at 7800) while the
  running total stays negative. The crossing scan is deliberately
  one-directional (negative → positive): that *is* the definition of the
  gamma flip, and reporting a positive → negative crossing under the same
  name would invert its meaning.
- Both `SPX` (10,040 contracts) and `SPXW` (19,874) roots are in the file
  and both are kept. That is right: they are the same index, and total
  dealer gamma is what the chart is about.

**The file-name ladder is load-bearing and its comment was wrong.** Measured:
`_SPX.json` → 200, `SPX.json` → **403**, `_VIX.json` → 200, `AAPL.json` → 200.
So indices take the underscore and equities do not, exactly as guessed — but
a wrong file name earns a **403, not a 404**. The code already advanced on any
non-OK status, so behaviour was correct; the comment beside it said 404 was the
name-is-wrong signal and that other codes were merely cheap to retry. A later
reader tidying that into "only advance on 404" would have killed the CBOE path
for every symbol whose first spelling misses — the #100 bug exactly. The
comment now carries the measurement.

What the screen says when CBOE is in use: source and CBOE timestamp under the chart, why Schwab was unusable, `App (CBOE)` as the comparison table's left column, and a warning above the AI briefing that bid/ask are 15 minutes stale. History records CBOE-derived levels in a separate `cboe` slot, never in `schwab` — the log exists to show which source died when.

**SPX is NOT an entitlement limit — that conclusion was wrong, disproven 2026-09-06 by the owner's own thinkorswim screen.** Read this before acting on anything below it.

thinkorswim, logged into **the same brokerage account, 26 minutes after** the API reading below (16:49 vs 17:15 ET, same day), shows **real open interest on the same contracts**:

| SPX 8 SEP 26 | thinkorswim OI | Trader API `openInterest` |
|---|---|---|
| 7800 Call | 5,671 | 0 |
| 7650 Put | 3,653 | 0 |
| 7675 Put | 2,841 | 0 |
| 7750 Call | 2,653 | 0 |
| 7750 Put | 2,146 | 0 |

Open interest is **exchange-reported data, not derived locally** by a platform — so if thinkorswim is serving it to this account, the account has the data and `/marketdata/v1/chains` is simply not returning it. That makes this a Schwab API defect for `assetMainType=INDEX`, not something the owner needs to buy.

Two lessons worth keeping, because both are the same shape of error:

- **"The account lacks the data" was inferred, never measured.** Every reading came from one surface (the API). The moment a *second* surface was checked, the inference collapsed. When an external system explains a gap, check whether another window onto the same system agrees before writing the explanation down as settled.
- **Greeks would have been the wrong evidence.** thinkorswim computes greeks client-side, so gamma appearing there proves nothing about the feed. Only open interest — which cannot be computed — could settle it. Picking the field that *can't* be derived is what made the test decisive.

Status: reported to `traderapi@schwab.com` as a defect (see the questions in that email: known defect / API-specific entitlement / silent-failure flag). Until Schwab answers, the UW fallback and the SPY×10 idea below both still stand as workarounds — but the door is open again, not closed.

---

The measurement below is still accurate and worth keeping; only its *interpretation* was wrong. With the detail line finally readable (#102), production shows all three spellings were tried and all three behave identically:

```
đã thử: $SPX, $SPX.X, SPX · 28 kỳ · 3600 hợp đồng ·
loại: gamma thiếu 0, gamma=-999 38, OI=0 3600, strike thiếu 0 ·
mẫu: {"gamma":0,"gammaType":"number","openInterest":0,"oiType":"number","strikePrice":7420}
```

Schwab returns a full contract skeleton — right strikes, right expirations, `status=SUCCESS`, `assetMainType=INDEX` — with **both `gamma` and `openInterest` at 0** on every contract. GEX is `gamma × OI`; two zeros cannot produce one, so nothing in this repo can compute SPX GEX *while the API answers this way*. What that does **not** mean — see the correction at the top of this block — is that the account lacks the data: it has it, and thinkorswim proves it.

So the symbol-spelling hunt of #86–#91 is now definitively closed — it was never the symbol. `usableContractCount()` (#100) is still worth keeping: it is what proved all three spellings behave the same, instead of leaving it a guess.

SPY and QQQ (ETF options) compute normally, so the split is exactly index-vs-ETF — but on the API surface only, and it is a defect boundary rather than an entitlement boundary. UW remains the source for SPX and the screen says so. **A cheap alternative nobody has built:** SPY tracks SPX at roughly 1/10, and SPY options are fully served by this account — a SPY chain with strikes ×10 would give a real bar chart and AI briefing at SPX-equivalent levels, which the UW levels can never provide. Not built; it is an approximation and would need to say so on screen. SPY and QQQ (ETF options) compute fine; SPX (an index option) does not, with the chain coming back present but yielding nothing. When the maps come back *empty*, every "dropped" counter reads 0 and the diagnosis says nothing — so it also reports Schwab's own top-level fields (`status`, `numberOfContracts`, `isIndex`, `isDelayed`, `isChainTruncated`, `assetMainType`), which are what actually separate an index from an ETF and an entitlement problem from a parsing one.

**Schwab can return HTTP 200 with `status: "FAILED"`** — a valid symbol it will not serve a chain for. From the app's side that is indistinguishable from a successful empty chain, but the fixes are opposite (data entitlement vs. how a field is read), so `chainStatusFailed()` splits them into two different messages instead of one.

**Where a diagnostic string is truncated decides what you can read, so field order is load-bearing.** The detail line is clipped for the screen, and #100's "which spellings were tried" list was appended at the *end*, after a ~120-character raw sample — so the 300-char cut landed mid-JSON (`"strikePrice":74` in the owner's screenshot) and the tried-spellings list **never appeared at all**, despite being the whole point of that change. Same mistake as #90. Fields are now ordered by information value — spellings tried, then counts and drop reasons, then Schwab's flags, then the raw sample last — the cap is one shared constant, and a clipped string ends in `…` so a cut never reads as "Schwab only sent this much".

**`gexDiagnosis()` exists because listing top-level keys was not enough.** It reports the expiration and contract counts, the number of contracts dropped **per reason** (missing gamma / `-999` gamma / zero OI / missing strike), and one real contract verbatim with the **type** of each field. The type is the whole point: it is the only thing that separates "Schwab did not send gamma" from "Schwab sent gamma as a string", and the first version of this error could not tell those apart.

**SPX needed a fourth rung below the narrowing ladder.** `fullChainAdaptive` tries 60d/all → 21d/120 → 7d/60, and for SPX all three could still come back `502 TooBigBody`. `fullChainSliced()` is the fallback: the smallest unit `/chains` still accepts is **one expiration**, so it discovers the expiration list with a cheap `strikeCount=1` probe and then requests expirations one at a time (nearest first, `strikeCount` capped), merging the `callExpDateMap`/`putExpDateMap` into one chain object that `computeGex()` reads unchanged. Each response is then bounded no matter how large the full chain is.

Two deliberate limits. There is a **request ceiling** (12 expirations): SPX expires almost every trading day, so 60 days is 40+ expirations and fetching all of them would leave the user waiting tens of seconds on a screen they just opened — gamma concentrates in the near expirations anyway. And a single expiration that fails is **skipped rather than fatal**; only an empty result throws. The count actually retrieved comes back in `window.expirations` and the screen says so (`gex.sliced`), because a wall computed over 12 expirations must not look like a wall over the whole chain.

Slicing only ever engages on `TooBigBody`. A 401, a bad symbol or a network error still throws straight out — asking for less data does not fix those, and retrying 13 more times would just multiply the failure. When slicing also fails for the same size reason, the **original** narrowest-rung error is what surfaces, since that one describes the actual problem.

**UW has no per-strike gamma and no price curve either — both measured 2026-09-06.** The probe's first production run settles it: `greek-exposure` is 251 rows keyed by **`date`** (a daily time series of chain-wide gamma/delta/charm/vanna, no strikes at all), `spot-exposures` is 564 rows keyed by **`time`/`start_time`** with a `price` column, and `gex-levels` is the four aggregate levels already in use. **Nothing UW sells on this plan can drive a per-strike bar chart**, so the SPX chart cannot come from UW any more than from Schwab.

Two things worth keeping from that reading. `spot-exposures` exposes gamma in three bases — `_oi`, `_vol`, `_dir` — and the `_oi` one is directly comparable to this app's own OI-based computation, while `gex-levels` runs on `source: "vol"`; that basis difference is a concrete, previously unexplained source of divergence in the comparison table. And UW quantifies as `gamma_per_one_percent_move_*` — **the same unit this app uses**, so UW numbers need no unit conversion (the ~3.5× gap seen against tapchiphowall is that site's own convention, not UW's). Every value arrives as a **string**, exactly as `uwgex.ts` already assumes.

**Second reading settles `spot-exposures`: it is a time series, not a curve.** `curveShape` came back `{groupedBy: "start_time", timestamps: 564, pricesPerTimestampMax: 1, pricesPerTimestampMin: 1, looksLikePriceCurve: false}` — 564 buckets holding exactly one price each. So the 11 distinct prices were simply spot moving through 11 levels over the session, not 11 price points sampled at one moment. Nothing here can be drawn against price, which closes the last route to an SPX chart: Schwab sends index contracts with gamma and OI both zero, and UW sells only aggregates. **SPX stays four numbers unless Schwab opens index-option market data.**

**What UW's two unused endpoints CAN draw is a time chart, and the app has nothing like it.** `greek-exposure` is 251 daily rows of chain-wide call/put gamma, delta, charm and vanna; `spot-exposures` is 564 intraday points of the same per 1% move. Neither is per-strike, but both answer a question the current GEX screen cannot: *is dealer gamma rising or falling*. It works for any ticker, not just SPX. Not built — recorded so the next session can offer it rather than rediscover the endpoints.

Worth noting from the sample: for SPX only the `_oi` basis carries a value; `_dir` and `_vol` are `"0"`. Do not read a zero there as "no exposure" without checking which basis is populated for that symbol.

**The probe's own heuristic misfired on the first run, and that is worth remembering.** It reported `looksPerStrike: true` for `spot-exposures` because `price` was in its strike-hint list — but at an endpoint literally named *spot*-exposures, `price` is the spot price, not a strike. A confident wrong label is worse than no label: it points the reader at a conclusion that is not there. `STRIKE_HINTS` is now `['strike']` only. The follow-up also groups rows by their **bucket** key (`start_time` preferred over the per-row `time` — grouping by `time` puts one row in each group and measures nothing) to separate a real gamma-vs-price curve from a plain time series of spot.

**`/api/uwprobe` is a diagnostic, kept deliberately.** It was written as throwaway scaffolding and the plan was to delete it after one reading — but it earned its place inside a single day: it answered the per-strike question, caught its own false positive, and then settled the curve-vs-series question, each time turning a guess into a measurement. This repo keeps meeting external APIs whose real shape differs from their docs, and UW is unreachable from the dev sandbox, so a gated route that costs nothing unless called is worth more than the tidiness of removing it. `api.unusualwhales.com` is not on this sandbox's egress allowlist, so UW cannot be called from development as things stand — and calling it would need the API key in-session anyway, which is its own reason not to. Reading the docs then coding to them has been wrong repeatedly here (`congress-trader`'s silent `name` default, `gex-levels`' all-string values). The route calls `greek-exposure`, `spot-exposures` and `gex-levels` once each and reports only the *shape*: top-level keys, whether the payload is an array, record keys, field **types**, and one capped sample — never the full payload (an option chain is thousands of rows) and never the API key. Its one real output is `looksPerStrike`: `gex-levels` gives four aggregate levels and so can never drive a bar chart, but if `greek-exposure` carries gamma per strike then SPX gets the chart and the AI briefing from a source already paid for. Run it once in production, code against what it measured, then it can go.

**`/api/gex` calls Schwab and UW in parallel on every request** (`Promise.allSettled`), rather than reaching for UW only after Schwab returns a 400/502. Two reasons, both from the owner: a permanent on-screen comparison (one manual comparison against tapchiphowall is what caught the call-wall definition bug in #94 — leaving it on screen means the next divergence surfaces itself), and UW covering *immediately* when Schwab fails for any reason, not just the two error codes previously matched. The UW quota cost is small and bounded — `/api/gex` only runs when a GEX screen is open, and the Heatmap panel refreshes every 10 minutes, so the worst case is ~144 requests/day against 30,000. That is nothing like dark pool, which blew the cap by calling per-symbol from the background loop.

Five response shapes, deliberately distinct so the UI cannot render a degraded state as a healthy one:

- Schwab OK → `GexProfile` + `uw` (levels, or null) + `uwDetail` (why UW failed). A failed UW call replaces the comparison table with its real error, rather than silently dropping the table.
- Schwab unusable, CBOE OK → the same `GexProfile` shape plus `source: 'cboe'`, `cboeAsOf`, `cboeSymbol` and `schwabDetail` — full chart and briefing, with the screen saying which chain it is.
- Schwab and CBOE fail, UW OK → `GexLevelsResponse` (`source: 'uw'`) with `schwabDetail` **and** `cboeDetail` — levels only, no bar chart, no AI briefing, both of which need a live chain.
- All three fail → `GexCacheResponse` (`source: 'cache'`) carrying the newest saved reading (Schwab or CBOE slot) and its timestamp, behind a red banner. **Session expiry is exempt**: `REAUTH_REQUIRED` always returns 401 and is never papered over by CBOE, UW or cache, because the user needs to reconnect, not to see a GEX table that looks fine.
- All three fail with no history → the error, with all three sources' real messages. (Before this, the hollow-chain branch put only Schwab's reason in `detail` and dropped UW's — so an expired UW trial key was invisible on screen.)

`src/lib/gexhistory.ts` keeps the readings: one file on `/var/data` (`GEX_HISTORY_PATH`), at most one record per symbol per **15 minutes** (the Heatmap panel's 10-minute refresh would otherwise write ~144 records/symbol/day for no new information), pruned to **30 days**. Failed reads *are* recorded with a null side — a run of nulls is the evidence that a source is down, not noise. Every function swallows its own errors: a broken history file must never take `/api/gex` down with it, since history is the extra, not the point.

The stale banner uses its own `.gexstale` class, **not `.cap.bad`**. `.bad` and `.cap` have equal specificity and `.cap` is defined later, so `.cap.bad` renders grey — the same specificity trap that swallowed the sign colour in #58, and worse here: a "do not trade off this" warning that looks like an ordinary caption is a warning nobody reads.

**This same trap caught a third victim in #117, this time app-wide.** `.hint-warn` alone has specificity (0,1,0), identical to `.hint`, and a `.hint { color: var(--muted) }` block defined *later* in the file wins — so every `className="hint hint-warn"` in the app (AiRead, FearGreed, FilterPanel×3, GexChart, TradeBriefingPanel×3, ten call sites total) was silently rendering the muted grey instead of `--warn`, undetected until it was measured. **The general lesson: never trust CSS cascade order by reading the file — render the real element and read `getComputedStyle(el).color` back out of a browser.** Reading source order by eye is exactly how this trap survives past review three times. `.hint-warn`'s selector is now the compound `.hint.hint-warn` (specificity (0,2,0)), which wins unconditionally regardless of future reordering — a structural fix, not a reordering that could silently break again.

### Ask Claude in Analyze (`src/lib/airead.ts`, `/api/ai`, `AiRead.tsx`)

One reading of **every** indicator on the Analyze page — technical, implied vol, fundamentals **and the GEX profile** — on a button, streamed. The owner's ask was "gom technical và gex tất cả chỉ số": before this the technical read and the GEX chart sat on the same page and Claude never saw the chart.

`lib/airead.ts` owns the prompt (`facts()`, `gexFacts()`, `system()`), outside the route because Next route files may only export handlers and the table needs a standalone test. `facts()` takes the analysis object the page is displaying plus the `/api/gex` payload the page's own `GexChart` already fetched — `GexChart` grew an `onData` prop, `AnalysisPanel` holds the value and hands it to `AiRead`, so no second chain request. If the chart has not answered when the button is pressed, `AiRead` fetches `/api/gex` once itself; if that fails too it sends `gexError`, and the prompt says **NOT AVAILABLE and why** rather than leaving a gap — to Claude an absent section reads as "no gamma structure worth mentioning", which is a wrong conclusion, not a missing one. `gexFacts()` handles all four `/api/gex` shapes (Schwab / CBOE profile, UW levels-only, disk cache) and labels stale or levels-only readings as such.

Two things fixed on the way, both silent before: the prompt read `macd.histogram` while the analyze route emits `macd.hist`, so the histogram was always `n/a`; and Bollinger %B, bid/ask/volume, sector/industry and dividend amount were computed but never sent. Keep the field list in `facts()` in step with the `Analysis` type in `AnalysisPanel.tsx` — there is no type linking them.

### Company profile translation (`src/lib/profiletranslate.ts`, `/api/ai/profile-translate`)

`sector`/`industry`/`country` come from Finviz's quote page, `description` from FMP — both English-only sources. Every other label on the page goes through `i18n.tsx`, so with the UI in Vietnamese these four fields were the one spot still reading English (reported by the owner: "phần thông tin công ty lúc tiếng việt phần thông tin vẫn là tiếng anh").

Translating is not the same cost shape as Ask Claude. Ask Claude reads live indicators that change every time the page opens, so it stays a button the owner presses on purpose. A company's sector or business description barely ever changes, so `translateProfile()` caches the Vietnamese result **on disk, keyed by symbol**, hashing the four source fields to know when a re-translation is actually owed (Finviz/FMP data changed) versus when the cache still applies. The practical effect: Claude is called once per symbol, ever — not once per page view — so `AnalysisPanel` can fire the request automatically whenever the UI is in Vietnamese and a profile is loaded, with no per-view spend after the first.

Cache is checked **before** the `ANTHROPIC_API_KEY` check, not after — a translation already on disk must keep working even if the key is later rotated or removed, since serving it needs no API call at all. Only an actual cache miss (new symbol, or source text that changed) needs a live key.

**A miss now says WHY, instead of silently showing English (fixed in #117, after the owner reported the exact same "chọn tiếng Việt mà vẫn tiếng Anh" symptom a second time).** The original version treated every failure — no key configured, a rejected key, a rate limit, a network error, unparseable JSON back from Claude — as the same `null`, on the stated reasoning that this is "a display nicety, not core data." That reasoning missed the actual cost: from the screen, "not translated yet" and "translated and permanently failing" look identical, so there was no way for the owner to tell the feature was broken versus just not run yet — and no way for *either* Claude account to diagnose it without new instrumentation, which is exactly what happened. `translateProfile()` now returns `{ vi, reason? }`, classifying real failures the same way `/api/ai/route.ts` already classifies Anthropic SDK errors (`AuthenticationError` → `bad-key`, `RateLimitError` → `rate-limited`, anything else → `failed`; no key configured → `no-key`). "Nothing to translate" (empty profile fields) still returns no reason — that path was never broken and doesn't need a caption. `AnalysisPanel` shows the reason as a real caption (`.hint.hint-warn`) naming the fix (add the env var / check the key / wait and reopen), the same idiom the rest of this repo already follows for exactly this shape of problem. It is still true that nothing else on the Analyze tab depends on the translation working — that part of the reasoning was fine. What was wrong was silence.

**The actual root cause, found on the third report: `max_tokens` was 3072 and adaptive thinking ate it.** #112 built the feature and #117 made its failures visible, but neither fixed anything — the owner reported the identical symptom a third time. The defect: `claude-opus-5` runs adaptive thinking **by default** when `thinking` is not passed (a behaviour change from Opus 4.8/4.7, where omitting it meant no thinking), and those thinking tokens are billed against the *same* `max_tokens` ceiling as the answer. `profiletranslate.ts` set that ceiling at 3072 on the stated reasoning that "effort thấp - dịch không cần suy luận sâu" — but `effort` only tunes how deeply the model thinks, it never turns thinking off. Add a paragraph-length FMP `description` translated into Vietnamese (diacritics tokenize far worse than English) and the response hits the cap: the JSON comes back cut mid-string, `JSON.parse` throws, and the old code filed that under `failed` — indistinguishable from a transient network blip, which is why two rounds of work never found it.

`/api/ai` — the sibling route that has always worked — documents this exact hazard at its own `MAX_TOKENS = 16_000` ("adaptive thinking counts against the same limit, and truncating mid-sentence is a worse failure than a generous cap"). `profiletranslate.ts` had diverged from that number with no reason recorded. It is now 16_000 too. A ceiling is not a spend: output is billed on what Claude actually writes, so a short translation costs exactly what it did before.

Two new reasons come with it, because collapsing them is what hid the bug. `truncated` (`stop_reason === 'max_tokens'`, checked **before** the parse so a missing text block and a cut-off one report the same real cause) is fixed by raising the cap, not by retrying. `bad-request` (`Anthropic.BadRequestError`) is a permanent code bug, not a service blip — added deliberately because `output_config: { effort: 'low' }` here is the only use of that parameter in the whole repo and the sandbox has no network, so it has never once run against the live API; if it is ever rejected, the screen now says so instead of inviting an endless retry. A complete-but-unparseable answer stays `failed`.

The general lesson, and it is not about translation: **a model-default that changed between versions can silently consume a budget you sized for the old default.** The `max_tokens` value was never wrong when written — it was wrong once thinking became opt-out rather than opt-in, and nothing in the type system or the build can see that.

`AnalysisPanel` merges the translated fields over the English `profile` object before handing it to `CompanyProfileCard`, so the card itself stays language-unaware (it renders whatever `p` it's given) and only gets a `translated` flag to show the disclaimer note, plus `translateReason` to show the failure caption when there is one. Switching back to English needs no reverse translation — the original fields are English already.

### AI Trade Briefing (`src/lib/tradebrief.ts`, `TradeBriefingPanel.tsx`)

A GEX-aware options trade briefing shown inside `GexChart`, so it appears everywhere GEX does (Analyze, DetailDrawer, the Heatmap SPX panel) with one wiring point. Modeled on a sample the user provided (a "TSLA MODEL 2 TRADE BRIEFING" — regime read, key levels, short/medium-term trade ideas with strikes, greeks, max gain/loss, breakeven), but split cleanly by responsibility: **every number is computed in code from real listed option prices, never written by Claude.** `/api/tradebrief` does the computation (regime, put/call wall, gamma flip, expected move, term structure/skew, curated trade ideas) and returns it as plain JSON, no LLM call. `/api/ai/trade-briefing` then receives that same object back from the client (same pattern as `/api/ai`: "post what you're already displaying") and streams *only* Claude's narrative interpretation — the system prompt explicitly forbids restating or inventing any of the numeric fields.

**Payoff math (`evaluateTrade()`) is generic, not per-strategy.** Rather than hand-deriving a separate max-gain/max-loss/breakeven formula for each of vertical/butterfly/BWB/naked/strangle (error-prone — sign conventions differ by debit vs. credit and by which leg is long), it evaluates the piecewise-linear payoff function at every listed strike plus a synthetic far point, taking the min/max and scanning each linear segment for zero-crossings. This one function handles every leg combination correctly. Verified against 7 entries transcribed by hand from the user's own sample (matched to the cent on 6 of 7) — the mismatch (a broken-wing butterfly's second breakeven) was traced to an actual arithmetic error in the *sample itself* (its lower tail is mathematically flat and positive — a credit — so it can never cross zero there); the code was not made to match it. Unlimited loss is reported **only** when a leg combination has genuine unbounded upside risk (a naked short call) — a naked short put's max loss is computed as the true finite value (strike − credit, since price can't go below 0), not the loose "Unlimited" label commonly used and present in the reference sample.

**Deliberately not built, not silently dropped:** the sample's Heston-style volatility model (spot vol → long-run vol with a half-life, forward curve at 7d/30d/90d) needs its own historical multi-tenor IV time series (the app currently only keeps one reference-tenor IV/skew history per symbol) and a mean-reversion calibration — real infrastructure work, scoped as a follow-up rather than approximated here. Vol is read instead from IV vs. HV20/HV60 and the term-structure ratio the app already computes (`realizedVol`, `termStructureAndSkew` — both reused directly, not reimplemented). Calendar spreads are also out of scope: unlike every other structure here, a calendar's max gain depends on the near leg's remaining time value when the far leg expires, which needs an option-pricing model rather than intrinsic-value arithmetic.

`ChainContract` (`screener.ts`) grew `theta`/`vega` fields, additive and unused by existing callers, so `tradebrief.ts` can build real multi-leg positions from `flattenPuts`/`flattenCalls` without a second, competing chain-flattener.

### i18n and theming

`src/lib/i18n.tsx`: every string keyed by a dotted path in one `DICT`, `{ vi, en }` per key, value is either a literal or a function for interpolation (`t('pf.days', n)`). Deliberately centralized rather than co-located with components, so a missing translation is visible while writing the key rather than at runtime (the lookup falls back to printing the raw key on a miss).

**The dark palette is sampled from the owner's own Schwab app screenshots (2026-09-08), not eyeballed.** Every pixel of both screenshots was classified by colour family and the modal value taken, so these are the real values rather than an impression: page `#111518`, card `#161a1d`, primary text `#f2f3f4`, gain `#4cb84c`, loss `#e5484d`, accent/link cyan `#009dda`, brand pill `#016e99`, orange `#ed7e12`. The one most characteristic value is `--muted: #8f99a3` — a **blue-tinted** grey, not a neutral one, and it repeated across thousands of pixels in both images. Both screenshots agreed on every background value, which is what makes them trustworthy rather than JPEG noise.

Every foreground/background pair was checked for contrast before shipping; the tightest is loss-red on card at 4.47:1 (above the 3.0 needed for the large bold numbers it is used on) and all ordinary text clears 4.5:1.

**Only the dark blocks changed** — the light palette is untouched, matching the owner's standing preference. Type sizes are theme-independent so they moved for both: `body` 14→15px and `.stats dd` 15→18px. That last one comes from measuring the reference: Schwab's muted-label to primary-number ratio is 0.72, and this app was already at 0.73 (11/15) — the proportions were right, the absolute scale was just small. `.stats dd` went further than a pure scale-up because the signature of that reference is *large numbers with small labels*, and 15/11 read as nearly the same size.

The font family was deliberately **not** changed. The reference uses Roboto; this app uses Be Vietnam Pro, chosen because it draws Vietnamese diacritics without collisions. Matching the reference's font would cost the thing the interface is actually read in.

`.run` (the primary action) became a blue pill instead of an inverted white button: on a near-black page a white block is the brightest thing on screen and pulls the eye harder than the numbers do, which is the opposite of the reference, where the blue pill sits calmly and the data leads.

`src/app/globals.css`: colors are CSS custom properties defined three times — bare `:root` (light default), `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }` (OS-driven dark), and `[data-theme='dark']` (explicit user toggle wins over OS). Editing a color always means updating all three blocks identically, or light/dark/OS-dark drift apart. Everything else in the file should reference these variables rather than hardcoding colors.

### Deployment (`render.yaml`, `DEPLOY.md`)

Render, persistent disk at `/var/data` for anything that must survive a redeploy — `TOKEN_PATH` (OAuth), `WATCHLIST_PATH`, `SCAN_PATH` (last scan per universe), `ALERT_STATE_PATH` (alert dedupe — off the disk it resets on every deploy and re-fires every alert already sent that day) and `PUSH_SUBS_PATH`, all declared in `render.yaml`. Telegram needs `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` and web push needs `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`, set by hand in the dashboard since they are secrets — the rest of the filesystem is rebuilt from scratch on every deploy, so anything written elsewhere (e.g. `.cache/*`) is expected to be lossy/regenerable. `DEPLOY.md` has the full runbook including the custom-domain migration history and Google Safe Browsing false-positive process — read it before touching deploy config, it documents *why* several non-obvious things are set the way they are (e.g. why `SCHWAB_CALLBACK_URL` doubles as the source of truth for the app's public origin).
