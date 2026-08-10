-- Backfill for databases that created BingoRound before cancellationReason was inlined.
ALTER TABLE "BingoRound" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
