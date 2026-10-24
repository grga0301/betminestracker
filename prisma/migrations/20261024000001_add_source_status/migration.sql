CREATE TABLE "SourceStatus" (
    "source"     TEXT PRIMARY KEY,
    "failures"   INTEGER NOT NULL DEFAULT 0,
    "lastOkAt"   TIMESTAMP(3),
    "lastFailAt" TIMESTAMP(3),
    "lastError"  TEXT,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
