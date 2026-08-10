-- CreateEnum
CREATE TYPE "PrizeSettlementTiming" AS ENUM ('ON_FIGURE', 'AT_ROUND_END');

-- AlterTable
ALTER TABLE "Bingo" ADD COLUMN "prizeSettlementTiming" "PrizeSettlementTiming" NOT NULL DEFAULT 'AT_ROUND_END';
