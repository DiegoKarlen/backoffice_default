-- BingoRound is created in 20260507160750_bingo_rounds (before this migration).
ALTER TABLE "BingoRound" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
