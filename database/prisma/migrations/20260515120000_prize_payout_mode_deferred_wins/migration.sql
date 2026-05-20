-- CreateEnum
CREATE TYPE "PrizePayoutMode" AS ENUM ('IMMEDIATE_FULL_PER_WINNER', 'DEFERRED_SPLIT_AT_ROUND_END');

-- AlterTable
ALTER TABLE "Bingo" ADD COLUMN "prizePayoutMode" "PrizePayoutMode" NOT NULL DEFAULT 'IMMEDIATE_FULL_PER_WINNER';

-- CreateTable
CREATE TABLE "DeferredRoundPrizeWin" (
    "id" TEXT NOT NULL,
    "bingoRoundId" TEXT NOT NULL,
    "bingoPrizeId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerRoundCardId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeferredRoundPrizeWin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeferredRoundPrizeWin_bingoRoundId_bingoPrizeId_playerRoundCardId_key" ON "DeferredRoundPrizeWin"("bingoRoundId", "bingoPrizeId", "playerRoundCardId");

CREATE INDEX "DeferredRoundPrizeWin_bingoRoundId_idx" ON "DeferredRoundPrizeWin"("bingoRoundId");

-- AddForeignKey
ALTER TABLE "DeferredRoundPrizeWin" ADD CONSTRAINT "DeferredRoundPrizeWin_bingoRoundId_fkey" FOREIGN KEY ("bingoRoundId") REFERENCES "BingoRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeferredRoundPrizeWin" ADD CONSTRAINT "DeferredRoundPrizeWin_bingoPrizeId_fkey" FOREIGN KEY ("bingoPrizeId") REFERENCES "BingoPrize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeferredRoundPrizeWin" ADD CONSTRAINT "DeferredRoundPrizeWin_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeferredRoundPrizeWin" ADD CONSTRAINT "DeferredRoundPrizeWin_playerRoundCardId_fkey" FOREIGN KEY ("playerRoundCardId") REFERENCES "PlayerRoundCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
