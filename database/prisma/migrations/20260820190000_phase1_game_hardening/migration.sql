-- Unique ball number per round (prevents duplicate draws under concurrency).
CREATE UNIQUE INDEX "BingoRoundBall_roundId_number_key" ON "BingoRoundBall"("roundId", "number");

-- Admin audit actions for live game operations.
ALTER TYPE "AdminAuditAction" ADD VALUE 'BALL_DRAWN';
ALTER TYPE "AdminAuditAction" ADD VALUE 'ROUND_STOPPED';
