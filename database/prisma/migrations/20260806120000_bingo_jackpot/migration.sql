-- Jackpot: cartón lleno antes de bola X (configurable por bingo).

ALTER TABLE "Bingo" ADD COLUMN "jackpotEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Bingo" ADD COLUMN "jackpotMaxBall" INTEGER;
ALTER TABLE "Bingo" ADD COLUMN "jackpotAmount" DECIMAL(14,4);

ALTER TYPE "BingoFigure" ADD VALUE 'JACKPOT';
