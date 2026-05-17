CREATE TABLE "FtTip" (
    "id"        SERIAL PRIMARY KEY,
    "date"      TEXT NOT NULL UNIQUE,
    "homeTeam"  TEXT NOT NULL,
    "awayTeam"  TEXT NOT NULL,
    "pick"      TEXT NOT NULL,
    "market"    TEXT NOT NULL,
    "kickoff"   TEXT NOT NULL DEFAULT '',
    "odd"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status"    TEXT NOT NULL DEFAULT 'PENDING',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
