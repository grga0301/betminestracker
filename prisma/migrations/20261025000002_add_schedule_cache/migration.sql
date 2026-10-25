CREATE TABLE "ScheduleCache" (
    "date"      TEXT PRIMARY KEY,
    "matches"   TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
