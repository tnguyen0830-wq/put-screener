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

## Architecture

This is a single-user Next.js 14 App Router tool with five tabs (`src/app/page.tsx`): **Sell Put Screener**, **Analyze**, **Heatmap**, **My Portfolio**, plus a login gate. Everything reads from Charles Schwab's API using the app owner's own OAuth session — there is no multi-tenant concept anywhere in the code.

### Schwab client (`src/lib/schwab.ts`)

One shared module wraps both of Schwab's APIs:
- **Market Data** (`get()`) — quotes, price history, option chains. No API key needed beyond OAuth.
- **Trader API** (`traderGet()`) — accounts, positions, transactions. Requires the app to have the "Accounts and Trading Production" product approved on developer.schwab.com (a manual, multi-day Schwab review), separate from Market Data approval.

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

### i18n and theming

`src/lib/i18n.tsx`: every string keyed by a dotted path in one `DICT`, `{ vi, en }` per key, value is either a literal or a function for interpolation (`t('pf.days', n)`). Deliberately centralized rather than co-located with components, so a missing translation is visible while writing the key rather than at runtime (the lookup falls back to printing the raw key on a miss).

`src/app/globals.css`: colors are CSS custom properties defined three times — bare `:root` (light default), `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }` (OS-driven dark), and `[data-theme='dark']` (explicit user toggle wins over OS). Editing a color always means updating all three blocks identically, or light/dark/OS-dark drift apart. Everything else in the file should reference these variables rather than hardcoding colors.

### Deployment (`render.yaml`, `DEPLOY.md`)

Render, persistent disk at `/var/data` for anything that must survive a redeploy — `TOKEN_PATH` (OAuth), `WATCHLIST_PATH`, `SCAN_PATH` (last scan per universe), `ALERT_STATE_PATH` (alert dedupe — off the disk it resets on every deploy and re-fires every alert already sent that day) and `PUSH_SUBS_PATH`, all declared in `render.yaml`. Telegram needs `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` and web push needs `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`, set by hand in the dashboard since they are secrets — the rest of the filesystem is rebuilt from scratch on every deploy, so anything written elsewhere (e.g. `.cache/*`) is expected to be lossy/regenerable. `DEPLOY.md` has the full runbook including the custom-domain migration history and Google Safe Browsing false-positive process — read it before touching deploy config, it documents *why* several non-obvious things are set the way they are (e.g. why `SCHWAB_CALLBACK_URL` doubles as the source of truth for the app's public origin).
