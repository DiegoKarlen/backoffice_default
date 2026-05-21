-- Modo fijo/porcentual a nivel bingo (no por premio)
CREATE TYPE "BingoPrizeMode" AS ENUM ('FIXED', 'PERCENTAGE');

ALTER TABLE "Bingo" ADD COLUMN "prizeMode" "BingoPrizeMode" NOT NULL DEFAULT 'FIXED';

UPDATE "Bingo" b
SET "prizeMode" = 'PERCENTAGE'
WHERE EXISTS (
  SELECT 1 FROM "BingoPrize" p
  WHERE p."bingoId" = b."id" AND p."amountType" = 'PERCENTAGE'
);

UPDATE "BingoPrize"
SET "amount" = "percent"
WHERE "amountType" = 'PERCENTAGE' AND "percent" IS NOT NULL;

ALTER TABLE "BingoPrize" DROP COLUMN "amountType";
ALTER TABLE "BingoPrize" DROP COLUMN "percent";

DROP TYPE "BingoPrizeAmountType";
