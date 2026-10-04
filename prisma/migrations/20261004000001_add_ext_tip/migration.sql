CREATE TABLE "ExtTip" (
    "id"         SERIAL PRIMARY KEY,
    "source"     TEXT NOT NULL,
    "date"       TEXT NOT NULL,
    "rank"       INTEGER NOT NULL,
    "homeTeam"   TEXT NOT NULL,
    "awayTeam"   TEXT NOT NULL,
    "league"     TEXT NOT NULL DEFAULT '',
    "market"     TEXT NOT NULL,
    "pick"       TEXT NOT NULL,
    "kickoff"    TEXT NOT NULL DEFAULT '',
    "odd"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" INTEGER,
    "sourceUrl"  TEXT,
    "status"     TEXT NOT NULL DEFAULT 'PENDING',
    "homeScore"  INTEGER,
    "awayScore"  INTEGER,
    "scrapedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ExtTip_source_date_rank_key" ON "ExtTip"("source", "date", "rank");
CREATE INDEX "ExtTip_source_status_idx" ON "ExtTip"("source", "status");
