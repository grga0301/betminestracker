-- CreateTable
CREATE TABLE "FstTip" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "pick" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "kickoff" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FstTip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FstTip_date_key" ON "FstTip"("date");
