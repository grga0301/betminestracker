# ⚽ BetMines Double Tracker

A fully local MVP app that scrapes today's football double from BetMines, tracks results, and displays historical performance in a modern dark-theme UI.

**No cloud. No subscriptions. Runs entirely on your PC.**

---

## 📸 Features

- **Daily scraper** — Fetches today's double from `betmines.com/daily-bets-football`
- **Result resolver** — Checks scores and determines WIN / LOSS / PENDING
- **Modern UI** — Dark football-pitch aesthetic, responsive cards, stats dashboard
- **SQLite database** — All data stored locally, no external dependencies
- **Duplicate protection** — Never saves the same date twice
- **Windows-friendly** — `.bat` files for one-click operation

---

## 🖥️ Requirements

- **Node.js** v18+ ([nodejs.org](https://nodejs.org))
- **Windows 10/11** (also works on Mac/Linux)

---

## ⚡ Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Install Playwright browser

```bash
npx playwright install chromium
```

### 3. Initialize the database

```bash
npm run db:migrate
```

This creates `prisma/betmines.db` — your local SQLite database.

### 4. Generate Prisma client

```bash
npm run db:generate
```

### 5. Start the UI server

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## 📋 Daily Workflow

### Morning (scrape today's double)

**Option A — Double-click:** `SCRAPE.bat`

**Option B — Terminal:**
```bash
npm run scrape
```

### Next morning (check results)

**Option A — Double-click:** `RESOLVE.bat`

**Option B — Terminal:**
```bash
npm run resolve
```

### View results

Open **http://localhost:3000** or refresh the browser.

You can also click the **↓ Scrape Today** and **⟳ Resolve Results** buttons directly in the UI.

---

## 📂 Project Structure

```
betmines-tracker/
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── betmines.db          # SQLite database (auto-created)
├── scripts/
│   ├── scrape.ts            # npm run scrape
│   └── resolve.ts           # npm run resolve
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── doubles/     # GET /api/doubles
│   │   │   ├── scrape/      # POST /api/scrape
│   │   │   ├── resolve/     # POST /api/resolve
│   │   │   └── stats/       # GET /api/stats
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx         # Main UI
│   ├── components/
│   │   ├── DoubleCard.tsx   # Per-double card
│   │   ├── Header.tsx       # Top bar with action buttons
│   │   ├── StatsBar.tsx     # Win rate / streak stats
│   │   └── StatusBadge.tsx  # WIN / LOSS / PENDING pill
│   └── lib/
│       ├── db/
│       │   └── prisma.ts    # Prisma singleton
│       ├── scraper/
│       │   └── betmines.ts  # Playwright scraper
│       ├── services/
│       │   ├── doubleService.ts     # DB operations
│       │   ├── resolveService.ts    # Result resolution
│       │   └── resultEvaluator.ts  # WIN/LOSS logic
│       └── types.ts         # TypeScript types
├── SCRAPE.bat               # Windows one-click scrape
├── RESOLVE.bat              # Windows one-click resolve
├── .env                     # Environment variables
└── README.md
```

---

## 🎯 Market Evaluation Logic

| Market | WIN condition |
|--------|--------------|
| Over 2.5 | Total goals ≥ 3 |
| Over 1.5 | Total goals ≥ 2 |
| Under 2.5 | Total goals ≤ 2 |
| BTTS Yes | Both teams score |
| BTTS No | At least one team scores 0 |
| Home (1) | Home team wins |
| Draw (X) | Draw |
| Away (2) | Away team wins |
| Double Chance 1X | Home win or draw |
| Double Chance 12 | Home win or away win |
| Double Chance X2 | Draw or away win |

For a **double** to WIN, **both selections must WIN**.

---

## 🔧 Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start UI at localhost:3000 |
| `npm run scrape` | Scrape today's double |
| `npm run resolve` | Check results for pending doubles |
| `npm run db:migrate` | Initialize / migrate database |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:studio` | Open Prisma Studio (DB browser) |
| `npm run db:reset` | ⚠️ Wipe all data |

---

## 🌐 Scraper Notes

The scraper targets `betmines.com/daily-bets-football` using Playwright with Chromium in headless mode. It uses multiple CSS selector strategies for robustness.

**If BetMines changes their layout**, the scraper falls back to demo data (labelled in the terminal). In that case:

1. Open `src/lib/scraper/betmines.ts`
2. Inspect the page structure in your browser DevTools
3. Update the selectors in `parseSelectionsFromPage()`

You can also manually add entries via Prisma Studio:
```bash
npm run db:studio
```

---

## 📅 Windows Task Scheduler (Automation)

To run automatically every day without opening a terminal:

1. Open **Task Scheduler** (`Win+R` → `taskschd.msc`)
2. **Create Basic Task** → Name: "BetMines Scrape"
3. Trigger: Daily at e.g. **10:00 AM**
4. Action: Start program → `cmd.exe`
5. Arguments: `/c "cd /d C:\path\to\betmines-tracker && npm run scrape"`

Repeat for Resolve at **10:00 AM next day** (or offset by hours).

---

## 🏗️ Database Schema

```prisma
model BetDouble {
  id         Int            @id @default(autoincrement())
  date       String         @unique  // YYYY-MM-DD
  totalOdds  Float
  status     DoubleStatus   @default(PENDING)
  createdAt  DateTime       @default(now())
  selections BetSelection[]
}

model BetSelection {
  id           Int              @id @default(autoincrement())
  homeTeam     String
  awayTeam     String
  market       String
  line         Float?
  odd          Float
  league       String
  country      String
  kickoff      String
  resultStatus SelectionStatus  @default(PENDING)
  homeScore    Int?
  awayScore    Int?
}
```

---

## 🐛 Troubleshooting

**"Cannot find module @prisma/client"**
```bash
npm run db:generate
```

**"Database file not found"**
```bash
npm run db:migrate
```

**"Playwright browser not installed"**
```bash
npx playwright install chromium
```

**Scraper finds no data**
- BetMines may have changed their layout. Check the browser DevTools and update selectors in `src/lib/scraper/betmines.ts`
- The app falls back to demo data automatically

---

*Built for local use only. No data leaves your machine.*
