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

There is no test runner configured. Verification in this repo has historically meant: `npx tsc --noEmit`, `npm run build`, small standalone Node scripts (compile a single `src/lib/*.ts` with `npx tsc <file> --outDir <tmp> --module commonjs --target es2020 --skipLibCheck --esModuleInterop`, then `require()` it from a plain `.js` test script) for pure logic, and Playwright (`playwright-core`, launched with `executablePath: '/opt/pw-browsers/chromium-*/chrome-linux/chrome'` in the sandbox) against `next start` for UI changes — check both themes (`colorScheme: 'light'|'dark'`) and both languages where relevant.

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

### The self-diagnosing degradation idiom

Repeated deliberately across this codebase: when an external API's exact field names or shape can't be verified from this sandbox (no live Schwab network access), code captures and surfaces the *real* raw keys/values on a mismatch instead of guessing silently or crashing. Examples: ticker tape's `missing`, fear/greed's `topLevelKeys`, trader-check's status parsing, cash balances' `keys` (`mapCashBalances`), positions' `rawKeys`/`raw` (full raw Schwab object dumped when a guessed field fails to resolve). Follow this pattern for any new field read from an API whose response shape isn't pinned down by a type from Schwab's own docs.

### Screener (`src/lib/screener.ts`, `src/app/api/screen`)

Two-tier scan to stay under the rate limit: a cheap batched `/quotes` pass eliminates symbols where `spot × 100 > max capital` (no strike could fit the budget), then only survivors get the expensive `/pricehistory` (SMA200/HV20, cached daily) and `/chains` (DTE-windowed) calls. Results stream as NDJSON (`{type: 'phase'|'progress'|'candidate'|'skip'|'error'|'done'}`) so the UI fills in row by row instead of waiting for the whole scan. Scoring is a weighted sum documented in `README.md` (annualized ROC 45, cushion 25, IV/HV 15, liquidity 15) — don't recompute this from first principles, it's a product decision, not a derived formula.

### GEX (`src/lib/gex.ts`)

Self-computed from option-chain gamma × open interest, not a paid data feed — the point of `README.md`'s "no membership needed" framing. Formula and interpretation (put wall / call wall / zero gamma) are in the README; the code should stay a straightforward implementation of that documented model.

### i18n and theming

`src/lib/i18n.tsx`: every string keyed by a dotted path in one `DICT`, `{ vi, en }` per key, value is either a literal or a function for interpolation (`t('pf.days', n)`). Deliberately centralized rather than co-located with components, so a missing translation is visible while writing the key rather than at runtime (the lookup falls back to printing the raw key on a miss).

`src/app/globals.css`: colors are CSS custom properties defined three times — bare `:root` (light default), `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }` (OS-driven dark), and `[data-theme='dark']` (explicit user toggle wins over OS). Editing a color always means updating all three blocks identically, or light/dark/OS-dark drift apart. Everything else in the file should reference these variables rather than hardcoding colors.

### Deployment (`render.yaml`, `DEPLOY.md`)

Render, persistent disk at `/var/data` for anything that must survive a redeploy (OAuth tokens, watchlist) — the rest of the filesystem is rebuilt from scratch on every deploy, so anything written elsewhere (e.g. `.cache/*`) is expected to be lossy/regenerable. `DEPLOY.md` has the full runbook including the custom-domain migration history and Google Safe Browsing false-positive process — read it before touching deploy config, it documents *why* several non-obvious things are set the way they are (e.g. why `SCHWAB_CALLBACK_URL` doubles as the source of truth for the app's public origin).
