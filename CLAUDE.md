# CLAUDE.md — betmines-tracker

Notes for future Claude sessions. README.md is **stale** (still describes a local SQLite app); trust this file and the code.

## What this is
Football tip tracker: scrapes daily tips from several public tipster sites, resolves them to WIN/LOSS from final scores, and shows history, win rate, ROI and losing streaks. User wants to see *whether each tip passed* and compare sources by hit rate / streaks.

- **Repo:** `grga0301/betminestracker` (public), branch `main`. Project root is the *inner* folder `Desktop\betmines-tracker\betmines-tracker` (an outer `betmines-tracker` folder holds only a lockfile and `.claude/`).
- **Live:** https://betminestracker.vercel.app (Vercel auto-deploys every push to `main`). Pages: `/` (history + one section per source) and `/dashboard` (per-source stats).
- **Stack:** Next.js 16 (App Router), React 18, Tailwind 3, Prisma 5 on **Neon Postgres**, TypeScript, `tsx` for scripts, `node-html-parser`, Playwright (BetMines/FST scrapers only).
- **No `DATABASE_URL` locally** (`.env` only has `GEMINI_API_KEY`). The DB is only reachable from GitHub Actions / Vercel. Locally you can typecheck, build, and test scrapers/parsers that don't touch the DB; to read data use the public API (`/api/ext/tips?source=…`, `/api/streaks`, `/api/doubles`).

## Architecture
Vercel only serves the UI and read APIs. **All scraping/resolving runs in GitHub Actions** (Playwright doesn't run on Vercel). UI buttons trigger `workflow_dispatch` through `GITHUB_PAT`.

| Source | Source key / table | Scraper | Notes |
|---|---|---|---|
| BetMines double | `BetDouble` | `scraper/betmines.ts` (Playwright) | **Blocked by Cloudflare since 2026-10-04** ("You are unable to access betmines.com", even locally and via Jina). Scraper now returns null instead of saving demo data. Needs a new approach or is dead. |
| FreeSuperTips | `FstTip` | `scraper/freesupertips.ts` | `scripts/*-fst.ts` |
| FreeTips.com | `FtTip` | `scraper/freetips.ts` | falls back to `r.jina.ai` when GitHub IPs get 403 |
| TipOracle (3 tips/day) | `ExtTip` `TIPORACLE` | `scraper/tiporacle.ts` | jina fallback on 403 |
| FootyAccumulators Bet of the Day | `ExtTip` `FOOTYACCA` | `scraper/footyaccumulators.ts` | reads `__NEXT_DATA__` JSON; single tip, may be combined market |
| FootyAccumulators BTTS / Over 2.5 trebles | `FOOTYACCA_BTTS`, `FOOTYACCA_OVER25` | same | 3-leg tickets, `legs` JSON column, odds ~4–5 |
| FootballPark Bet of the Day | `ExtTip` `FOOTBALLPARK` | `scraper/footballpark.ts` | jina fallback when GitHub IPs refused |
| Zulubet (picks @1.70–2.20) | `ExtTip` `ZULUBET` | `scraper/zulubet.ts` | bulk 1X2 site → rule picks top-3/day; history pages `tips-DD-MM-YYYY.html` |

`ExtTip` (one table for all newer sources): unique `(source,date,rank)`, `legs` = JSON array for multi-match tickets, `status` PENDING/WIN/LOSS. Always add a new source in: `ExtSourceKey` (`tiporacle.ts`), `ExtSource`/`EXT_SOURCES` (`extTipService.ts`), `scripts/scrape-ext.ts`, `src/app/page.tsx` (an `<ExtSection>`), and `dashboardService.ts`.

**Resolving** (`scripts/resolve-ext.ts`): local rules in `extTipEvaluator.ts` first (handles "Home Win", "No Goal", "Over 2.5 Goals", "BTTS - Yes", combined `A & B`, team-name prefixes like "Sweden Win"); Gemini only for unknown markets; a market that can't be settled **stays PENDING** (never VOID/LOSS from ignorance). Scores: Zulubet tips use Zulubet's own result pages first, everything else uses `fetchScoreFromSportsDB` (TheSportsDB → ESPN → SportAPI7 → SofaScore → API-Football → Gemini). Multi-leg tickets: LOSS as soon as one leg loses, WIN only when all legs win; legs are checked only 2.5 h after kickoff. Pending tips older than 7 days are given up on.

**Dashboard** (`dashboardService.ts`): profit = flat 1u per resolved tip (WIN → odd−1, LOSS → −1); VOID/PENDING ignored; a "lost day" = losses and no wins. **Streak alert:** `ALERT_STREAK = 3` in `src/lib/streak.ts` → red banner on `/` and `/dashboard`, highlighted rows/cards, marked tips + badge in `ExtSection`; `/api/streaks` feeds the banner. No Telegram for this (user explicitly dropped it).


## Result resolution (important, broke in Oct 2026)
- `fetchScoreFromSportsDB` (name is historical) cascade: TheSportsDB → **Zulubet daily lists (`findZulubetScore`, best coverage, fuzzy team names)** → ESPN → SportAPI7 → SofaScore → API-Football → Gemini search. TheSportsDB free key, ESPN (some league codes 400), SofaScore (403) and SportAPI7 (404) mostly return nothing now; Zulubet does the heavy lifting.
- **Gemini:** `gemini-2.0-flash` was retired (404). Code now uses alias `gemini-flash-latest` (override with `GEMINI_MODEL`) but the free-tier quota is exhausted (429), so don't rely on it.
- **Never store VOID because something failed.** `evaluateStrict` (geminiEvaluator.ts) returns WIN/LOSS or `null`; FST/FT/BetMines resolvers keep the tip PENDING on `null`. It understands handicaps ("France -1"; a push stays pending), "X to win to nil", "Home Win" under market "Full Time Result", and team-name variants ("Rep. Ireland"). `evaluateWithFallback` (old, returns VOID) is kept only for compatibility.
- Old wrong VOIDs were repaired by the one-off workflow `repair-void.yml` (kept; safe to re-run). Messi anytime-scorer tip stays VOID (not decidable from a score).
- Hard-coded demo doubles (Freiburg–Braga / Sleipner–Syrianska) used to be saved when scraping failed; five were deleted from the DB on 2026-10-06.

## GitHub Actions (all in `.github/workflows/`)
Hourly crons: `daily-scrape(.yml)`, `daily-resolve`, `daily-scrape-fst`, `daily-resolve-fst`, `daily-scrape-ft`, `daily-resolve-ft`, `daily-ext-tips` (scrape + resolve all `ExtTip` sources; runs `prisma migrate deploy`, no Playwright). `backfill-zulu` is a manual one-off (idempotent).

**Gotchas that already bit us**
- **Scheduled workflows get auto-disabled after 60 days without repo activity** (`disabled_inactivity`). That is why nothing was fetched for months. Check with `gh workflow list --all`; re-enable with `gh workflow enable <id>`. A keepalive workflow (monthly empty commit) was suggested but not added.
- **GitHub runner IPs are blocked by some sites** (FreeTips, FootballPark, sometimes TipOracle → 403/tiny reply). Workaround: retry through `https://r.jina.ai/<url>` with header `X-Return-Format: html` (free, no key). **Forebet is blocked by Cloudflare from every GitHub path** (curl, Chromium, Jina browser engine, Cloudflare Worker all failed) and was **dropped by the user** — don't re-add it.
- Node `fetch` is blocked by some Cloudflare sites where `curl` passes; reproducing locally ≠ working in Actions. After changing a scraper, push and run the workflow (`gh workflow run daily-ext-tips.yml`, then `gh run view <id> --log`) to verify from a GitHub IP.
- Zulubet rate-limits: ~100 rapid requests got the local IP blocked for a while. `fetchZulubetDay` caches per process; keep pauses in loops.
- Past Zulubet date pages show the match name as plain text (the "upcoming" page links it) — parser reads cell text, not `span.m1 a`.
- The Vercel build runs `tsc`; a type error breaks the deploy. Chaining `npx tsc … | head && git push` does **not** stop on errors — check `tsc` exit code explicitly before pushing (this once pushed a TS error).
- DB changes ship as hand-written SQL in `prisma/migrations/` and are applied by `prisma migrate deploy` in the workflows. Vercel deploys immediately on push, so after adding a column run `gh workflow run daily-ext-tips.yml` right away or the API errors until the migration applies.
- When editing files with Python heredocs, `'\n'` inside a normal Python string becomes a real newline in TS source → syntax error. Use the Edit tool or raw strings.

**Secrets present:** `DATABASE_URL`, `GEMINI_API_KEY`, `RAPIDAPI_KEY`, `API_FOOTBALL_KEY`, `TELEGRAM_BOT_TOKEN`, `JINA_API_KEY` (unused now), `FOREBET_PROXY_*` (unused), `FB_*` (unused). **`TELEGRAM_CHAT_ID` is missing**, so the old Telegram loss-streak messages in `resolve.ts`/`resolve-fst.ts`/`resolve-ft.ts` never send.

## Decisions already made (don't redo)
- **Removed:** Facebook "Tipoznalac" tickets (code gone; `FbTicket`/`FbSelection` tables intentionally kept so data isn't lost; schema comment says so). **Dropped:** Forebet.
- **No Windows Task Scheduler**, and **no self-hosted runner on this PC** — it is the user's *employer's* laptop; the user's work/IT exposure is a concern. Don't suggest installing persistent agents/services here.
- Wanted odds range for new sources: roughly **1.7–2.2**. Sources that fit: Zulubet (rule-based). FootyAccumulators/FootballPark are ~2.5–5; TipOracle ~1.6.
- Betting-system questions (waiting for N losses, Martingale): data (Zulubet, 105 tips, longest losing run 3) shows no edge from waiting; Martingale simulated 55 % ruin at 100u bankroll. Be honest that 105 tips can't prove an edge (ROI +5.3 % ± ~9 %).

## Data caveats
- Zulubet history (35 days, 105 picks, 58.1 % win, avg odd 1.82, +5.56u) was **backfilled** by applying the pick rule to finished days. Live picks only see not-yet-started matches and are "first seen sticks". Zulubet odds are market averages, not one bookmaker's price.
- A few early FootyAccumulators rows were saved after kickoff (Gillingham–Newport 2026-10-03, Rep. Ireland–Israel 2026-10-04); the scraper now only stores tickets whose first match hasn't started. Treat those rows as unreliable.
- Tip times are shown in Europe/Zagreb except FootballPark (as published).

## Commands
```
npx tsc --noEmit -p .            # typecheck (must be exit 0 before pushing)
npx next build                   # production build (delete .next first if stale type errors appear)
npm run scrape:ext / resolve:ext # need DATABASE_URL (Actions only in practice)
npx tsx scripts/backtest-zulu.ts [days]   # read-only backtest of the Zulubet rule; be gentle with the site
gh workflow run daily-ext-tips.yml        # trigger on GitHub
gh run list --workflow daily-ext-tips.yml --limit 3
```

## User preferences
- Writes Croatian; reply in Croatian, concise, with plain honest numbers (state small samples and failures; never hide that something is untested).
- Commit/push only when asked ("deployaj" = commit + push to `main`). Commit messages end with the Co-Authored-By line given by the harness.
