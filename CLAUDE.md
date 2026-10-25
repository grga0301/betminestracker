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
| Zulubet (picks @1.70–2.20) | `ExtTip` `ZULUBET` | `scraper/zulubet.ts` | bulk 1X2 site → rule picks top-3/day; history pages `tips-DD-MM-YYYY.html` |

`ExtTip` (one table for all newer sources): unique `(source,date,rank)`, `legs` = JSON array for multi-match tickets, `status` PENDING/WIN/LOSS. Always add a new source in: `ExtSourceKey` (`tiporacle.ts`), `ExtSource`/`EXT_SOURCES` (`extTipService.ts`), `scripts/scrape-ext.ts`, `src/app/page.tsx` (an `<ExtSection>`), and `dashboardService.ts`.

**Resolving** (`scripts/resolve-ext.ts`): local rules in `extTipEvaluator.ts` first (handles "Home Win", "No Goal", "Over 2.5 Goals", "BTTS - Yes", combined `A & B`, team-name prefixes like "Sweden Win"); Gemini only for unknown markets; a market that can't be settled **stays PENDING** (never VOID/LOSS from ignorance). Scores: Zulubet tips use Zulubet's own result pages first, everything else uses `fetchScoreFromSportsDB` (TheSportsDB → ESPN → SportAPI7 → SofaScore → API-Football → Gemini). Multi-leg tickets: LOSS as soon as one leg loses, WIN only when all legs win; legs are checked only 2.5 h after kickoff. Pending tips older than 7 days are given up on.

**Dashboard** (`dashboardService.ts`): profit = flat 1u per resolved tip (WIN → odd−1, LOSS → −1); VOID/PENDING ignored; a "lost day" = losses and no wins. **Streak alert:** `ALERT_STREAK = 3` in `src/lib/streak.ts` → red banner on `/` and `/dashboard`, highlighted rows/cards, marked tips + badge in `ExtSection`; `/api/streaks` feeds the banner.

**Telegram** (`streakAlertService.ts`): the ONLY notifications are losing-streak alerts, thresholds per source in `TELEGRAM_STREAK` (BetMines/FST/FT/FootyAcca BotD/FootballPark = 4, Zulubet = 5; TipOracle and the FootyAcca BTTS/Over 2.5 trebles never notify). Stateless: `withLossStreakAlert()` wraps each resolve script and compares streaks before/after the run. The user explicitly does NOT want new-tip, result, workflow-failure or "what was the score?" messages. Chat is a group (`TELEGRAM_CHAT_ID` is negative); don't make the bot admin / supergroup (the id would change). `telegram-setup.yml` finds the chat id (message the bot first).


#
#
 
R
e
s
u
l
t
 
r
e
s
o
l
u
t
i
o
n


C
a
s
c
a
d
e
 
i
n
 
`
f
e
t
c
h
S
c
o
r
e
F
r
o
m
S
p
o
r
t
s
D
B
`
 
(
`
f
s
t
R
e
s
u
l
t
F
e
t
c
h
e
r
.
t
s
`
)
:
 
T
h
e
S
p
o
r
t
s
D
B
 
→
 
Z
u
l
u
b
e
t
 
l
i
s
t
s
 
→
 
E
S
P
N
 
(
`
s
o
c
c
e
r
/
a
l
l
`
 
+
 
l
e
a
g
u
e
 
c
o
d
e
s
;
 
a
l
s
o
 
y
e
s
t
e
r
d
a
y
'
s
 
`
a
l
l
`
)
 
→
 
S
p
o
r
t
A
P
I
7
 
→
 
S
o
f
a
S
c
o
r
e
 
→
 
A
P
I
-
F
o
o
t
b
a
l
l
 
→
 
*
*
w
e
b
 
s
e
a
r
c
h
*
*
 
(
`
s
e
a
r
c
h
S
c
o
r
e
F
e
t
c
h
e
r
.
t
s
`
)
 
→
 
G
e
m
i
n
i
 
g
r
o
u
n
d
e
d
 
s
e
a
r
c
h
.


-
 
*
*
T
h
e
S
p
o
r
t
s
D
B
:
*
*
 
t
h
e
 
o
l
d
 
f
r
e
e
 
k
e
y
 
`
3
`
 
w
a
s
 
p
e
r
m
a
n
e
n
t
l
y
 
d
i
s
a
b
l
e
d
 
(
4
0
3
)
;
 
u
s
e
 
`
1
2
3
`
.
 
R
a
t
e
 
l
i
m
i
t
e
d
 
(
4
2
9
 
f
r
o
m
 
G
i
t
H
u
b
 
I
P
s
)
,
 
s
o
 
c
a
l
l
s
 
a
r
e
 
t
h
r
o
t
t
l
e
d
.


-
 
*
*
E
S
P
N
:
*
*
 
v
a
l
i
d
 
c
o
d
e
s
 
a
r
e
 
l
o
w
e
r
c
a
s
e
 
(
`
u
e
f
a
.
c
h
a
m
p
i
o
n
s
`
,
 
`
u
e
f
a
.
e
u
r
o
p
a
`
,
 
`
u
e
f
a
.
e
u
r
o
p
a
.
c
o
n
f
`
)
;
 
`
h
r
v
.
1
`
 
i
s
 
i
n
v
a
l
i
d
.
 
`
s
o
c
c
e
r
/
a
l
l
?
l
i
m
i
t
=
5
0
0
`
 
c
o
v
e
r
s
 
m
o
s
t
 
l
e
a
g
u
e
s
.


-
 
*
*
A
P
I
-
F
o
o
t
b
a
l
l
:
*
*
 
a
c
c
o
u
n
t
 
*
*
s
u
s
p
e
n
d
e
d
*
*
 
(
c
h
e
c
k
 
d
a
s
h
b
o
a
r
d
.
a
p
i
-
f
o
o
t
b
a
l
l
.
c
o
m
)
;
 
S
p
o
r
t
A
P
I
7
 
4
0
4
,
 
S
o
f
a
S
c
o
r
e
 
4
0
3
.


-
 
*
*
G
e
m
i
n
i
 
g
r
o
u
n
d
e
d
 
s
e
a
r
c
h
 
(
`
g
o
o
g
l
e
S
e
a
r
c
h
`
 
t
o
o
l
)
 
h
a
s
 
n
o
 
f
r
e
e
 
q
u
o
t
a
 
o
n
 
o
u
r
 
k
e
y
*
*
 
(
4
2
9
 
o
n
 
e
v
e
r
y
 
m
o
d
e
l
;
 
c
a
l
l
s
 
w
i
t
h
o
u
t
 
t
o
o
l
s
 
w
o
r
k
)
.
 
S
o
 
i
t
 
i
s
 
p
r
a
c
t
i
c
a
l
l
y
 
d
e
a
d
.


-
 
*
*
W
e
b
 
s
e
a
r
c
h
 
f
a
l
l
b
a
c
k
:
*
*
 
J
i
n
a
 
`
s
.
j
i
n
a
.
a
i
`
 
(
n
e
e
d
s
 
`
J
I
N
A
_
A
P
I
_
K
E
Y
`
 
i
n
 
t
h
e
 
w
o
r
k
f
l
o
w
 
e
n
v
)
 
→
 
a
 
s
c
o
r
e
 
i
s
 
a
c
c
e
p
t
e
d
 
o
n
l
y
 
w
h
e
n
 
≥
2
 
d
i
f
f
e
r
e
n
t
 
s
i
t
e
s
 
s
t
a
t
e
 
i
t
 
f
o
r
 
t
h
e
 
r
i
g
h
t
 
d
a
t
e
 
(
r
e
g
e
x
 
t
i
e
r
,
 
o
r
 
n
o
n
-
g
r
o
u
n
d
e
d
 
G
e
m
i
n
i
 
r
e
a
d
i
n
g
 
t
h
e
 
s
n
i
p
p
e
t
s
,
 
v
e
r
i
f
i
e
d
 
l
i
t
e
r
a
l
l
y
 
a
g
a
i
n
s
t
 
t
h
e
 
t
e
x
t
)
.
 
S
a
m
e
-
d
a
y
 
m
a
t
c
h
e
s
 
a
l
l
o
w
e
d
 
3
 
h
 
a
f
t
e
r
 
k
i
c
k
o
f
f
 
(
`
k
i
c
k
o
f
f
M
s
F
r
o
m
`
 
r
e
a
d
s
 
t
h
e
 
c
l
o
c
k
 
a
s
 
U
T
C
 
o
n
 
p
u
r
p
o
s
e
)
.
 
A
c
c
e
p
t
e
d
 
s
c
o
r
e
s
 
a
r
e
 
l
o
g
g
e
d
 
w
i
t
h
 
U
R
L
s
 
i
n
 
t
a
b
l
e
 
`
L
l
m
S
c
o
r
e
`
 
(
`
/
a
p
i
/
l
l
m
-
s
c
o
r
e
s
`
)
.


-
 
*
*
T
e
a
m
 
n
a
m
e
s
:
*
*
 
`
t
e
a
m
s
M
a
t
c
h
`
 
s
t
r
i
p
s
 
d
i
a
c
r
i
t
i
c
s
 
a
n
d
 
f
i
l
l
e
r
 
w
o
r
d
s
 
a
n
d
 
h
a
s
 
a
n
 
a
l
i
a
s
 
t
a
b
l
e
 
(
P
S
G
,
 
H
e
a
r
t
s
,
 
P
S
V
 
I
I
,
 
B
a
y
e
r
n
…
)
.
 
A
d
d
 
a
l
i
a
s
e
s
 
t
h
e
r
e
 
w
h
e
n
 
a
 
r
e
s
u
l
t
 
e
x
i
s
t
s
 
o
n
 
E
S
P
N
 
b
u
t
 
i
s
n
'
t
 
m
a
t
c
h
e
d
.


-
 
*
*
U
N
R
E
S
O
L
V
E
D
:
*
*
 
a
f
t
e
r
 
7
 
d
a
y
s
 
w
i
t
h
o
u
t
 
a
 
r
e
s
u
l
t
 
`
g
i
v
e
U
p
O
l
d
P
e
n
d
i
n
g
(
)
`
 
(
e
n
d
 
o
f
 
e
v
e
r
y
 
r
e
s
o
l
v
e
 
s
c
r
i
p
t
)
 
m
a
r
k
s
 
t
h
e
 
t
i
p
 
`
U
N
R
E
S
O
L
V
E
D
`
:
 
e
x
c
l
u
d
e
d
 
f
r
o
m
 
s
t
a
t
s
/
s
t
r
e
a
k
s
,
 
n
e
v
e
r
 
a
 
L
O
S
S
.
 
N
e
v
e
r
 
s
t
o
r
e
 
V
O
I
D
 
b
e
c
a
u
s
e
 
s
o
m
e
t
h
i
n
g
 
f
a
i
l
e
d
;
 
`
e
v
a
l
u
a
t
e
S
t
r
i
c
t
`
 
r
e
t
u
r
n
s
 
n
u
l
l
 
→
 
t
i
p
 
s
t
a
y
s
 
P
E
N
D
I
N
G
.


-
 
*
*
M
a
n
u
a
l
 
r
e
s
u
l
t
:
*
*
 
B
e
t
M
i
n
e
s
 
s
e
l
e
c
t
i
o
n
s
 
v
i
a
 
t
h
e
 
`
F
i
x
 
R
e
s
u
l
t
 
(
m
a
n
u
a
l
)
`
 
w
o
r
k
f
l
o
w
 
(
`
s
c
r
i
p
t
s
/
f
i
x
-
r
e
s
u
l
t
.
t
s
`
)
;
 
a
n
y
t
h
i
n
g
 
e
l
s
e
 
n
e
e
d
s
 
a
 
s
m
a
l
l
 
o
n
e
-
o
f
f
 
s
c
r
i
p
t
 
(
s
e
e
 
g
i
t
 
h
i
s
t
o
r
y
 
`
a
p
p
l
y
-
m
a
n
u
a
l
-
r
e
s
u
l
t
s
`
)
.


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

**Secrets present:** `DATABASE_URL`, `GEMINI_API_KEY`, `RAPIDAPI_KEY`, `API_FOOTBALL_KEY` (account suspended), `SCRAPEDO_TOKEN`, `JINA_API_KEY`, `TELEGRAM_BOT_TOKEN` (@BetaraTracker_bot), `TELEGRAM_CHAT_ID` (group), `FOREBET_PROXY_*` (unused), `FB_*` (unused). Pass `JINA_API_KEY`/Telegram vars in the workflow-level `env:` block, otherwise a step silently skips features.

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