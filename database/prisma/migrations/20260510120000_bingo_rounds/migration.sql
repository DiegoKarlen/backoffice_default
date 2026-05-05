-- CreateEnum
CREATE TYPE "BingoRoundStatus" AS ENUM ('SCHEDULED', 'DRAWING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BingoRound" (
    "id" TEXT NOT NULL,
    "bingoId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "BingoRoundStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BingoRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BingoRoundBall" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "drawOrder" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "BingoRoundBall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BingoRound_bingoId_startsAt_key" ON "BingoRound"("bingoId", "startsAt");

-- CreateIndex
CREATE INDEX "BingoRound_bingoId_status_idx" ON "BingoRound"("bingoId", "status");

-- CreateIndex
CREATE INDEX "BingoRound_bingoId_sequence_idx" ON "BingoRound"("bingoId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "BingoRoundBall_roundId_drawOrder_key" ON "BingoRoundBall"("roundId", "drawOrder");

-- CreateIndex
CREATE INDEX "BingoRoundBall_roundId_idx" ON "BingoRoundBall"("roundId");

-- AddForeignKey
ALTER TABLE "BingoRound" ADD CONSTRAINT "BingoRound_bingoId_fkey" FOREIGN KEY ("bingoId") REFERENCES "Bingo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoRoundBall" ADD CONSTRAINT "BingoRoundBall_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "BingoRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
