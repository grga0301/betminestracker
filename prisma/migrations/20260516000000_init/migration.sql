-- CreateTable
CREATE TABLE "BetDouble" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "totalOdds" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetDouble_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BetSelection" (
    "id" SERIAL NOT NULL,
    "doubleId" INTEGER NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "line" DOUBLE PRECISION,
    "odd" DOUBLE PRECISION NOT NULL,
    "league" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "kickoff" TEXT NOT NULL,
    "resultStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BetDouble_date_key" ON "BetDouble"("date");

-- AddForeignKey
ALTER TABLE "BetSelection" ADD CONSTRAINT "BetSelection_doubleId_fkey" FOREIGN KEY ("doubleId") REFERENCES "BetDouble"("id") ON DELETE CASCADE ON UPDATE CASCADE;
