-- Premio fijo vs porcentaje del pozo (semilla + venta de cartones por partida)
CREATE TYPE "BingoPrizeAmountType" AS ENUM ('FIXED', 'PERCENTAGE');

ALTER TABLE "Bingo" ADD COLUMN "prizePoolSeed" DECIMAL(14,4) NOT NULL DEFAULT 0;

ALTER TABLE "BingoPrize" ADD COLUMN "amountType" "BingoPrizeAmountType" NOT NULL DEFAULT 'FIXED';
ALTER TABLE "BingoPrize" ADD COLUMN "percent" DECIMAL(7,4);
