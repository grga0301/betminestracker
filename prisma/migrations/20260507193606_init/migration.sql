-- CreateTable
CREATE TABLE "BetDouble" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "totalOdds" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BetSelection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "doubleId" INTEGER NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "line" REAL,
    "odd" REAL NOT NULL,
    "league" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "kickoff" TEXT NOT NULL,
    "resultStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BetSelection_doubleId_fkey" FOREIGN KEY ("doubleId") REFERENCES "BetDouble" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BetDouble_date_key" ON "BetDouble"("date");
