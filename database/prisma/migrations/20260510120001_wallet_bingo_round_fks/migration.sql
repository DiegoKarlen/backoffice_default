-- BingoRound is created in 20260510120000_bingo_rounds; wallet tables reference it from 20260507160751.
-- Add FKs here so fresh databases (CI) apply migrations in timestamp order without errors.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CartonPurchase_bingoRoundId_fkey'
  ) THEN
    ALTER TABLE "CartonPurchase"
      ADD CONSTRAINT "CartonPurchase_bingoRoundId_fkey"
      FOREIGN KEY ("bingoRoundId") REFERENCES "BingoRound"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlayerRoundCard_bingoRoundId_fkey'
  ) THEN
    ALTER TABLE "PlayerRoundCard"
      ADD CONSTRAINT "PlayerRoundCard_bingoRoundId_fkey"
      FOREIGN KEY ("bingoRoundId") REFERENCES "BingoRound"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
