CREATE TABLE "LlmScore" (
    "id"        SERIAL PRIMARY KEY,
    "homeTeam"  TEXT NOT NULL,
    "awayTeam"  TEXT NOT NULL,
    "date"      TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "sources"   TEXT NOT NULL,
    "models"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "LlmScore_date_idx" ON "LlmScore"("date");
