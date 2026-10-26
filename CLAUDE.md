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
| BetMines double | `BetDouble` | `scraper/betmines.ts` (Playwright + **Scrape.do**) | Cloudflare blocks direct access (since 2026-10-04); fetched via Scrape.do (`SCRAPEDO_TOKEN`, 1000 requests/month) with a fallback chain: `render` without `super` first (works), then `super` variants, then Jina. `super=true` often returns 502 ROTATION_FAILED. Scheduled runs only call it 00–11 UTC (GitHub delays crons by up to ~6 h); runs exit at once when today's double exists. |
| FreeSuperTips | `FstTip` | `scraper/freesupertips.ts` | `scripts/*-fst.ts` |
| FreeTips.com | `FtTip` | `scraper/freetips.ts` | falls back to `r.jina.ai` when GitHub IPs get 403 |
| TipOracle (3 tips/day) | `ExtTip` `TIPORACLE` | `scraper/tiporacle.ts` | jina fallback on 403 |
| FootyAccumulators Bet of the Day | `ExtTip` `FOOTYACCA` | `scraper/footyaccumulators.ts` | reads `__NEXT_DATA__` JSON; single tip, may be combined market |
| FootyAccumulators BTTS / Over 2.5 trebles | `FOOTYACCA_BTTS`, `FOOTYACCA_OVER25` | same | 3-leg tickets, `legs` JSON column, odds ~4–5 |
| FootballPark Bet of the Day | `ExtTip` `FOOTBALLPARK` | `scraper/footballpark.ts` | jina fallback when GitHub IPs refused |
| BetMines Risk | `ExtTip` `BETMINES_RISK` | `scripts/scrape.ts` via `scrapeBetMinesDaily()` | The "Risk" card next to the "Double" on the same page: one Scrape.do fetch yields both (`extractSection`). Stored as a multi-leg ticket (3 legs, odds ~4); legs resolved by the ext resolver, BetMines wording mapped in `toExtMarket` (handicaps stay PENDING). Only stored if the first match hasn't started. BetMines keeps no history of Double/Risk (`/football-predictions-yesterday` is a different, general page). Telegram alert at 5 losses in a row (`TELEGRAM_STREAK['betmines-risk']`). Tracked from 2026-10-26. |
| FreeTips.com Daily Double | `ExtTip` `FREETIPS_DOUBLE` | `scraper/freetipsdouble.ts` | 2-leg ticket per day (odds ~3.5); direct fetch 403 on GitHub → r.jina.ai HTML; FreeTips wording mapped to evaluator vocabulary in `mapDoubleMarket`; stored only if the first match hasn't started; kickoff times are UK time read as UTC. Telegram alert at 5 losses in a row (`TELEGRAM_STREAK['ft-double']`). Tracked from 2026-10-26. |
| FootballSuper Tip of the Day | `ExtTip` `FOOTBALLSUPER` | `scraper/footballsuper.ts` | one pick/day with odds (~1.8), server-rendered HTML, direct fetch works; page has no date so it is stored under the fetch day, only if kickoff hasn't passed and the match wasn't stored in the last 2 days (`dropRecentRepeats`). Tracked from 2026-10-25, no history; no Telegram alert configured. |
| Zulubet (picks @1.70–2.20) | `ExtTip` `ZULUBET` | `scraper/zulubet.ts` | bulk 1X2 site → rule picks top-3/day; history pages `tips-DD-MM-YYYY.html` |

`ExtTip` (one table for all newer sources): unique `(source,date,rank)`, `legs` = JSON array for multi-match tickets, `status` PENDING/WIN/LOSS. Always add a new source in: `ExtSourceKey` (`tiporacle.ts`), `ExtSource`/`EXT_SOURCES` (`extTipService.ts`), `scripts/scrape-ext.ts`, `src/app/page.tsx` (an `<ExtSection>`), and `dashboardService.ts`.

**Resolving** (`scripts/resolve-ext.ts`): local rules in `extTipEvaluator.ts` first (handles "Home Win", "No Goal", "Over 2.5 Goals", "BTTS - Yes", combined `A & B`, team-name prefixes like "Sweden Win"); Gemini only for unknown markets; a market that can't be settled **stays PENDING** (never VOID/LOSS from ignorance). Scores: Zulubet tips use Zulubet's own result pages first, everything else uses `fetchScoreFromSportsDB` (TheSportsDB → ESPN → **LiveFootballAPI** → SportAPI7 → SofaScore → API-Football → Gemini). Multi-leg tickets: LOSS as soon as one leg loses, WIN only when all legs win; legs are checked only 2.5 h after kickoff. Pending tips older than 7 days are given up on.

**Dashboard** (`dashboardService.ts`): profit = flat 1u per resolved tip (WIN → odd−1, LOSS → −1); VOID/PENDING ignored; a "lost day" = losses and no wins. **Streak alert:** `ALERT_STREAK = 3` in `src/lib/streak.ts` → red banner on `/` and `/dashboard`, highlighted rows/cards, marked tips + badge in `ExtSection`; `/api/streaks` feeds the banner.

**Telegram** (`streakAlertService.ts`): the ONLY notifications are losing-streak alerts, thresholds per source in `TELEGRAM_STREAK` (BetMines/FST/FT/FootyAcca BotD/FootballPark = 4, Zulubet/FreeTips Daily Double/BetMines Risk = 5; TipOracle and the FootyAcca BTTS/Over 2.5 trebles never notify). Stateless: `withLossStreakAlert()` wraps each resolve script and compares streaks before/after the run. The user explicitly does NOT want new-tip, result, workflow-failure or "what was the score?" messages. Chat is a group (`TELEGRAM_CHAT_ID` is negative); don't make the bot admin / supergroup (the id would change). `telegram-setup.yml` finds the chat id (message the bot first).


## Result resolution
Cascade in `fetchScoreFromSportsDB` (`fstResultFetcher.ts`): TheSportsDB → Zulubet lists → ESPN (`soccer/all` + league codes; also yesterday's `all`) → **SportsAPIPro** → SportAPI7 → SofaScore → API-Football → **web search** (`searchScoreFetcher.ts`) → Gemini grounded search.
- **TheSportsDB:** the old free key `3` was permanently disabled (403); use `123`. Rate limited (429 from GitHub IPs), so calls are throttled.
- **ESPN:** valid codes are lowercase (`uefa.champions`, `uefa.europa`, `uefa.europa.conf`); `hrv.1` is invalid. `soccer/all?limit=500` covers most leagues.
- **SportsAPIPro** (`sportsApiProFetcher.ts`, secret `SPORTSAPIPRO_KEY`, free plan 100 calls/day): `GET v2.football.sportsapipro.com/api/schedule/{UTC date}` returns the whole day (~350 matches incl. small leagues, `status.type` = finished). Day schedules are cached in table `ScheduleCache` (today's refreshed every 90 min, finished past days kept), max 3 calls per run; waits until kickoff+2h. Best source we have for lower leagues.
- **LiveFootballAPI** (`liveFootballApiFetcher.ts`, secret `LIVEFOOTBALLAPI_KEY`): `GET live-football-api.com/api/v1/matches?api_key=&date=` returns ~1400 matches/day in ~300 leagues (found the small leagues SportsAPIPro misses, e.g. Bolivia, Venezuela, El Salvador). **Only 500 credits in total** (1 per call, no renewal): day schedules cached in `ScheduleCache` (key `lfa:<date>`), max 2 calls/run, stops below 60 credits left. Only `status = finished` counts (its `live` status can be stale). ~496 credits left on 2026-10-25.
- **API-Football:** account **suspended** (check dashboard.api-football.com); SportAPI7 404, SofaScore 403.
- **Gemini grounded search (`googleSearch` tool) has no free quota on our key** (429 on every model; calls without tools work). So it is practically dead.
- **Web search fallback:** Jina `s.jina.ai` (needs `JINA_API_KEY` in the workflow env) → a score is accepted only when ≥2 different sites state it for the right date (regex tier, or non-grounded Gemini reading the snippets, verified literally against the text). Same-day matches allowed 3 h after kickoff (`kickoffMsFrom` reads the clock as UTC on purpose). Accepted scores are logged with URLs in table `LlmScore` (`/api/llm-scores`).
- **Team names:** `teamsMatch` strips diacritics and filler words, has an alias table (PSG, Hearts, PSV II, Bayern…) and a token matcher that accepts initials ("O. Petrolero"), prefixes ("Uni de Vinto") and 1–2 letter spelling differences ("Akhdoud"). Keep it covered by positive AND negative cases (Inter/AC Milan, Man Utd/City…) when changing it. Add aliases there when a result exists on ESPN but isn't matched.
- **UNRESOLVED:** after 7 days without a result `giveUpOldPending()` (end of every resolve script) marks the tip `UNRESOLVED`: excluded from stats/streaks, never a LOSS. Never store VOID because something failed; `evaluateStrict` returns null → tip stays PENDING.
- **Manual result:** BetMines selections via the `Fix Result (manual)` workflow (`scripts/fix-result.ts`); anything else needs a small one-off script (see git history `apply-manual-results`).

## GitHub Actions (all in `.github/workflows/`)
Resolve workflows (`daily-resolve`, `-fst`, `-ft`, `daily-ext-tips`) run every 30 min 09–23 UTC and hourly overnight, staggered by minute, with `concurrency` so runs never overlap (before, twice a day made results wait up to 12 h). Scrape workflows: `daily-scrape-fst/-ft` twice a day, `daily-scrape` (BetMines) at 01:17/02:47/05:23/08:41 UTC, `daily-ext-tips` also scrapes. `keepalive.yml` makes a monthly empty commit so GitHub doesn't disable the schedules. `backfill-zulu` is a manual one-off (idempotent).

**Gotchas that already bit us**
- **Scheduled workflows get auto-disabled after 60 days without repo activity** (`disabled_inactivity`). That is why nothing was fetched for months. Check with `gh workflow list --all`; re-enable with `gh workflow enable <id>`. A keepalive workflow (monthly empty commit) was suggested but not added.
- **GitHub runner IPs are blocked by some sites** (FreeTips, FootballPark, sometimes TipOracle → 403/tiny reply). Workaround: retry through `https://r.jina.ai/<url>` with header `X-Return-Format: html` (free, no key). **Forebet is blocked by Cloudflare from every GitHub path** (curl, Chromium, Jina browser engine, Cloudflare Worker all failed) and was **dropped by the user** — don't re-add it.
- Node `fetch` is blocked by some Cloudflare sites where `curl` passes; reproducing locally ≠ working in Actions. After changing a scraper, push and run the workflow (`gh workflow run daily-ext-tips.yml`, then `gh run view <id> --log`) to verify from a GitHub IP.
- Zulubet rate-limits: ~100 rapid requests got the local IP blocked for a while. `fetchZulubetDay` caches per process; keep pauses in loops.
- Past Zulubet date pages show the match name as plain text (the "upcoming" page links it) — parser reads cell text, not `span.m1 a`.
- The Vercel build runs `tsc`; a type error breaks the deploy. Chaining `npx tsc … | head && git push` does **not** stop on errors — check `tsc` exit code explicitly before pushing (this once pushed a TS error).
- DB changes ship as hand-written SQL in `prisma/migrations/` and are applied by `prisma migrate deploy` in the workflows. Vercel deploys immediately on push, so after adding a column run `gh workflow run daily-ext-tips.yml` right away or the API errors until the migration applies.
- When editing files with Python heredocs, `'\n'` inside a normal Python string becomes a real newline in TS source → syntax error. Use the Edit tool or raw strings.

**Secrets present:** `DATABASE_URL`, `GEMINI_API_KEY`, `RAPIDAPI_KEY`, `API_FOOTBALL_KEY` (account suspended), `SCRAPEDO_TOKEN`, `JINA_API_KEY`, `SPORTSAPIPRO_KEY`, `LIVEFOOTBALLAPI_KEY`, `TELEGRAM_BOT_TOKEN` (@BetaraTracker_bot), `TELEGRAM_CHAT_ID` (group), `FOREBET_PROXY_*` (unused), `FB_*` (unused). Pass `JINA_API_KEY`/Telegram vars in the workflow-level `env:` block, otherwise a step silently skips features.

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

- UI lists show the latest 10 rows with a "View more" button (`ViewMoreButton`, BetMines in `page.tsx`). The user wants to know quickly whether a tip lost, not week-old data.