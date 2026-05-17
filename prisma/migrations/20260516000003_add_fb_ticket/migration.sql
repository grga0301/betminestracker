-- CreateTable
CREATE TABLE "FbTicket" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "postId" TEXT,
    "totalOdds" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FbTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FbSelection" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "kickoff" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "odd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FbSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FbTicket_date_key" ON "FbTicket"("date");

-- AddForeignKey
ALTER TABLE "FbSelection" ADD CONSTRAINT "FbSelection_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "FbTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
