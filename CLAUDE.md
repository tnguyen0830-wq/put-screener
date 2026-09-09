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

There is no test runner configured. Note that this sandbox has **no outbound network**: Schwab, sec.gov, api.telegram.org and most other hosts are blocked by egress policy, so anything touching a live API can only be verified in production. That is why the self-diagnosing idiom below matters so much, and why real numbers from the user's Schwab app have repeatedly been the thing that caught bugs the tests missed. Verification in this repo has historically meant: `npx tsc --noEmit`, `npm run build`, small standalone Node scripts (compile a single `src/lib/*.ts` with `npx tsc <file> --outDir <tmp> --module commonjs --target es2020 --skipLibCheck --esModuleInterop`, then `require()` it from a plain `.js` test script) for pure logic, and Playwright (`playwright-core`, launched with `executablePath: '/opt/pw-browsers/chromium-*/chrome-linux/chrome'` in the sandbox) against `next start` for UI changes — check both themes (`colorScheme: 'light'|'dark'`) and both languages where relevant.

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

Nothing in progress as of 2026-09-08.

**SPX: the "entitlement" conclusion was WRONG and has been corrected (#108).** The owner's thinkorswim screen, same account, 26 minutes after the API reading, shows **real open interest** on the same contracts (7800C = 5,671 while the API said 0). Open interest is exchange data, not computed locally — so the account has the data and `/marketdata/v1/chains` is not returning it. This is a Schwab **API defect** for `assetMainType=INDEX`, reported to `traderapi@schwab.com`, not something to buy. Do not restart the symbol-spelling hunt; the measurement was never the problem, the interpretation was. Full correction at the top of the GEX section.

**Known gaps nobody has claimed** (not in-progress work - listed here so the
next session can pick one up rather than rediscovering it):

- README has an Insider Trade row in the tab table but **no section of its
  own**, unlike every other tab. So code-P-only filtering, the 10b5-1
  exclusion, and "UW is paid and self-disables without a key" are documented
  in this file for Claude but nowhere for the person using the app.
- Congress disclosure lag is described here and in the UI as the legal
  **"30-45 days"**. That is the statutory ceiling, not observed reality:
  sampling 250 recently-disclosed records gives a Senate **median of 116
  days**, and **0 of 250** were trades from the last 7 days. Worth showing the
  real lag on screen, or the tab reads as a live signal when it is a
  historical record.
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

- 2026-09-08 — #112 Analyze tab's company-profile card (sector/industry/country from Finviz, description from FMP - all English-only sources) now auto-translates to Vietnamese via Claude, cached on disk per symbol (`lib/profiletranslate.ts`) so it costs one API call ever per symbol, not per page view. Cache checked before the API-key check so an existing translation survives a key rotation. Falls back to English on any failure. Owner report: "phần thông tin công ty lúc tiếng việt phần thông tin vẫn là tiếng anh".
- 2026-09-08 — #111 Analyze tab's "Ask Claude" now reads EVERY indicator in one pass: technical + implied vol + fundamentals + the GEX profile from the page's own chart (`GexChart.onData` → `AnalysisPanel` → `AiRead`; falls back to one `/api/gex` fetch, and the prompt says NOT AVAILABLE and why when there is none). Prompt lives in new `lib/airead.ts` (standalone-testable). Fixed on the way: `macd.histogram` vs `macd.hist` (histogram was always n/a), and %B/bid/ask/volume/sector never sent. Owner's ask: "gom technical và gex tất cả chỉ số".
- 2026-09-08 — #110 UI now remembers the open tab, both sub-tabs, the GEX ticker and zoom in localStorage (new `lib/remember.ts`, validated allow-lists, read after hydration), and `GexChart` keeps the last good reading per symbol in memory so coming back to the tab shows the chart at once (a failed refresh keeps it and warns). SPY added to the Heatmap GEX presets. Owner's ask: "SPX bị mất mỗi lần thoát ra".
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

No PR is currently open and unmerged as of #116. If you're reading this and a
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

`/api/md/*` is a separate surface for a companion phone app, gated by a bearer/header token (`MD_API_TOKEN`) that must match the phone app's own config — no cookies involved. Everything else (pages + all other `/api/*`, including the Schwab OAuth callback itself) is gated by `APP_PASSWORD` via an HMAC-signed session cookie (`src/lib/session.ts`, Web Crypto so it works in Edge middleware — not `node:crypto`). The signing key defaults to the password itself, so changing the password invalidates every existing session at once. Both gates are opt-in: an unset env var means that gate is open, which is correct for local dev but means a deploy that forgets to set `APP_PASSWORD` is silently public — `/api/auth/status` reports lock state and the UI shows a red warning.

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

### The one background loop (`src/lib/alert-runner.ts`, `alerts.ts`, `notify.ts`)

Everything else in this app is passive — computed only when a browser asks. Alerts needed something that runs on its own, so this is the only timer in the codebase. It lives **in-process**, not in a Render Cron Job, because `/var/data` (holding the Schwab token) attaches to one service only; a cron service could not read the token and would have to call back over HTTP anyway. Its weakness is invisibility, so My Portfolio prints the last-run clock — a dead timer reads as a frozen number rather than as "nothing is wrong".

Alerts cover what you must act on: Schwab session at 2/1/0 days left (the 7-day cap is non-renewable and its expiry stops the whole app), puts gone ITM, earnings before expiry, backwardation or elevated skew, sizing limits breached. **Daily P/L is deliberately excluded** — a thing that pings constantly is a thing you learn to ignore, including on the day it is right.

Anti-spam matters more than the rules: checking every 15 minutes with one put ITM would otherwise mean 96 notifications a day. Each alert key sends at most once per New York trading day, state on disk so a redeploy does not re-fire everything, and keys are marked sent only once a channel actually accepted them so an outage retries instead of being swallowed. Checks skip outside market hours.

Telegram and web push both self-disable when unconfigured, matching the middleware gates — no env vars means the machine behaves exactly as before rather than erroring. Failures surface the provider's own words (a bad bot token and a bad chat id are different problems).

### The self-diagnosing degradation idiom

Repeated deliberately across this codebase: when an external API's exact field names or shape can't be verified from this sandbox (no live Schwab network access), code captures and surfaces the *real* raw keys/values on a mismatch instead of guessing silently or crashing. Examples: ticker tape's `missing`, fear/greed's `topLevelKeys`, trader-check's status parsing, cash balances' `keys` (`mapCashBalances`), positions' `rawKeys`/`raw` (full raw Schwab object dumped when a guessed field fails to resolve), positions' `earningsUnknown`/`earningsDataGap`, volwatch's `volWarmingUp`/`volErrors`, and the alert panel's channel state. The rule extends past field names to *state*: "not computed yet" must never render the same as "nothing is wrong", because silence reads as all-clear — which is exactly how CRWD's earnings were missed. The alert panel originally returned `null` while its status was unknown and so vanished entirely; it now always renders and prints the real HTTP status. Follow this pattern for any new field read from an API whose response shape isn't pinned down by a type from Schwab's own docs.

### Screener (`src/lib/screener.ts`, `src/app/api/screen`)

Two-tier scan to stay under the rate limit: a cheap batched `/quotes` pass eliminates symbols where `spot × 100 > max capital` (no strike could fit the budget), then only survivors get the expensive `/pricehistory` (SMA200/HV20, cached daily) and `/chains` (DTE-windowed) calls. Results stream as NDJSON (`{type: 'phase'|'progress'|'candidate'|'skip'|'error'|'done'}`) so the UI fills in row by row instead of waiting for the whole scan. Scoring is a weighted sum documented in `README.md` (annualized ROC 45, cushion 25, IV/HV 15, liquidity 15) — don't recompute this from first principles, it's a product decision, not a derived formula. `scoreComponents()` returns the four pieces and `scoreOf()` only sums them, so `Candidate.scoreBreakdown` can show *why* two candidates tie on the same total.

The chain fetch is `fullChain` (contractType ALL), not puts only, because term structure and put skew need call IV from the same request. `windowFrom`/`windowTo` therefore always widen to bracket 20-65 DTE regardless of the user's DTE filter — free, since Schwab answers with one request either way.

**Hard gates** (`Filters.hardGates`, default on) are seven fixed pass/fail checks that drop a contract outright: VRP ≥ 1.0, no earnings in the contract window, OI ≥ 500 and volume ≥ 100, spread ≤ 5%, not down >20% over 20 sessions, term structure ≥ 0.95, put skew z ≤ 2. Unlike every other criterion these thresholds are *not* user-editable, and a high score never rescues a failure. `Candidate.gates` is computed for every candidate regardless of the toggle, so switching gates off turns the drawer's checklist into real ✓/✗ annotation with no separate code path. A null reading (missing HV20, missing history) **passes** — a data gap is not evidence of a problem.

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

`cboeToChain()` converts the CBOE payload into the exact Schwab shape (`callExpDateMap`/`putExpDateMap`, `"YYYY-MM-DD:dte"` keys, Schwab field names, IV as percent not decimal) so `computeGex()`, `flattenPuts()`/`flattenCalls()` and the briefing read it unchanged — one calculator, not two. It filters to 60 days to match the Schwab window. **The CBOE shape is unverified from this sandbox** (`cdn.cboe.com` is egress-blocked like everything else), so the conversion reads every field tolerantly and, when it yields no contracts or no spot, throws with the **real top-level, `data`, and per-option keys** — the first production run will print where the guess is wrong instead of four dashes. Two file names are tried (`_SPX`, then `SPX`) on 404, same "try the plausible spellings" posture as Schwab.

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

**`/api/uwprobe` is a diagnostic, kept deliberately.** It was written as throwaway scaffolding and the plan was to delete it after one reading — but it earned its place inside a single day: it answered the per-strike question, caught its own false positive, and then settled the curve-vs-series question, each time turning a guess into a measurement. This repo keeps meeting external APIs whose real shape differs from their docs, and UW is unreachable from the dev sandbox, so a gated route that costs nothing unless called is worth more than the tidiness of removing it. This sandbox has no outbound network, so UW can never be called from development — and reading the docs then coding to them has been wrong repeatedly here (`congress-trader`'s silent `name` default, `gex-levels`' all-string values). The route calls `greek-exposure`, `spot-exposures` and `gex-levels` once each and reports only the *shape*: top-level keys, whether the payload is an array, record keys, field **types**, and one capped sample — never the full payload (an option chain is thousands of rows) and never the API key. Its one real output is `looksPerStrike`: `gex-levels` gives four aggregate levels and so can never drive a bar chart, but if `greek-exposure` carries gamma per strike then SPX gets the chart and the AI briefing from a source already paid for. Run it once in production, code against what it measured, then it can go.

**`/api/gex` calls Schwab and UW in parallel on every request** (`Promise.allSettled`), rather than reaching for UW only after Schwab returns a 400/502. Two reasons, both from the owner: a permanent on-screen comparison (one manual comparison against tapchiphowall is what caught the call-wall definition bug in #94 — leaving it on screen means the next divergence surfaces itself), and UW covering *immediately* when Schwab fails for any reason, not just the two error codes previously matched. The UW quota cost is small and bounded — `/api/gex` only runs when a GEX screen is open, and the Heatmap panel refreshes every 10 minutes, so the worst case is ~144 requests/day against 30,000. That is nothing like dark pool, which blew the cap by calling per-symbol from the background loop.

Five response shapes, deliberately distinct so the UI cannot render a degraded state as a healthy one:

- Schwab OK → `GexProfile` + `uw` (levels, or null) + `uwDetail` (why UW failed). A failed UW call replaces the comparison table with its real error, rather than silently dropping the table.
- Schwab unusable, CBOE OK → the same `GexProfile` shape plus `source: 'cboe'`, `cboeAsOf`, `cboeSymbol` and `schwabDetail` — full chart and briefing, with the screen saying which chain it is.
- Schwab and CBOE fail, UW OK → `GexLevelsResponse` (`source: 'uw'`) with `schwabDetail` **and** `cboeDetail` — levels only, no bar chart, no AI briefing, both of which need a live chain.
- All three fail → `GexCacheResponse` (`source: 'cache'`) carrying the newest saved reading (Schwab or CBOE slot) and its timestamp, behind a red banner. **Session expiry is exempt**: `REAUTH_REQUIRED` always returns 401 and is never papered over by CBOE, UW or cache, because the user needs to reconnect, not to see a GEX table that looks fine.
- All three fail with no history → the error, with all three sources' real messages. (Before this, the hollow-chain branch put only Schwab's reason in `detail` and dropped UW's — so an expired UW trial key was invisible on screen.)

`src/lib/gexhistory.ts` keeps the readings: one file on `/var/data` (`GEX_HISTORY_PATH`), at most one record per symbol per **15 minutes** (the Heatmap panel's 10-minute refresh would otherwise write ~144 records/symbol/day for no new information), pruned to **30 days**. Failed reads *are* recorded with a null side — a run of nulls is the evidence that a source is down, not noise. Every function swallows its own errors: a broken history file must never take `/api/gex` down with it, since history is the extra, not the point.

The stale banner uses its own `.gexstale` class, **not `.cap.bad`**. `.bad` and `.cap` have equal specificity and `.cap` is defined later, so `.cap.bad` renders grey — the same specificity trap that swallowed the sign colour in #58, and worse here: a "do not trade off this" warning that looks like an ordinary caption is a warning nobody reads.

### Ask Claude in Analyze (`src/lib/airead.ts`, `/api/ai`, `AiRead.tsx`)

One reading of **every** indicator on the Analyze page — technical, implied vol, fundamentals **and the GEX profile** — on a button, streamed. The owner's ask was "gom technical và gex tất cả chỉ số": before this the technical read and the GEX chart sat on the same page and Claude never saw the chart.

`lib/airead.ts` owns the prompt (`facts()`, `gexFacts()`, `system()`), outside the route because Next route files may only export handlers and the table needs a standalone test. `facts()` takes the analysis object the page is displaying plus the `/api/gex` payload the page's own `GexChart` already fetched — `GexChart` grew an `onData` prop, `AnalysisPanel` holds the value and hands it to `AiRead`, so no second chain request. If the chart has not answered when the button is pressed, `AiRead` fetches `/api/gex` once itself; if that fails too it sends `gexError`, and the prompt says **NOT AVAILABLE and why** rather than leaving a gap — to Claude an absent section reads as "no gamma structure worth mentioning", which is a wrong conclusion, not a missing one. `gexFacts()` handles all four `/api/gex` shapes (Schwab / CBOE profile, UW levels-only, disk cache) and labels stale or levels-only readings as such.

Two things fixed on the way, both silent before: the prompt read `macd.histogram` while the analyze route emits `macd.hist`, so the histogram was always `n/a`; and Bollinger %B, bid/ask/volume, sector/industry and dividend amount were computed but never sent. Keep the field list in `facts()` in step with the `Analysis` type in `AnalysisPanel.tsx` — there is no type linking them.

### Company profile translation (`src/lib/profiletranslate.ts`, `/api/ai/profile-translate`)

`sector`/`industry`/`country` come from Finviz's quote page, `description` from FMP — both English-only sources. Every other label on the page goes through `i18n.tsx`, so with the UI in Vietnamese these four fields were the one spot still reading English (reported by the owner: "phần thông tin công ty lúc tiếng việt phần thông tin vẫn là tiếng anh").

Translating is not the same cost shape as Ask Claude. Ask Claude reads live indicators that change every time the page opens, so it stays a button the owner presses on purpose. A company's sector or business description barely ever changes, so `translateProfile()` caches the Vietnamese result **on disk, keyed by symbol**, hashing the four source fields to know when a re-translation is actually owed (Finviz/FMP data changed) versus when the cache still applies. The practical effect: Claude is called once per symbol, ever — not once per page view — so `AnalysisPanel` can fire the request automatically whenever the UI is in Vietnamese and a profile is loaded, with no per-view spend after the first.

Cache is checked **before** the `ANTHROPIC_API_KEY` check, not after — a translation already on disk must keep working even if the key is later rotated or removed, since serving it needs no API call at all. Only an actual cache miss (new symbol, or source text that changed) needs a live key; missing one there just means the card falls back to showing the original English, the same as any other failure path here (bad JSON back from Claude, a network error) — this is a display nicety, not core data, so nothing about the rest of the Analyze tab depends on it working.

`AnalysisPanel` merges the translated fields over the English `profile` object before handing it to `CompanyProfileCard`, so the card itself stays language-unaware (it renders whatever `p` it's given) and only gets a `translated` flag to show the disclaimer note. Switching back to English needs no reverse translation — the original fields are English already.

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
