-- Simplified Bingo (drop legacy BingoRoom schema)

-- Drop legacy tables first (if they exist)
DROP TABLE IF EXISTS "BingoRoomPrize";
DROP TABLE IF EXISTS "BingoRoom";

-- Drop legacy enums
DROP TYPE IF EXISTS "BingoRoomStatus";
DROP TYPE IF EXISTS "BingoScheduleMode";
DROP TYPE IF EXISTS "BingoPrizeAmountType";

-- Keep BingoType enum name (re-used) if it already exists. If it doesn't, create it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BingoType') THEN
    CREATE TYPE "BingoType" AS ENUM ('BINGO_75', 'BINGO_90');
  END IF;
END
$$;

-- New enums
CREATE TYPE "BingoStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "BingoFigure" AS ENUM ('LINE', 'PERIMETER', 'FULL_HOUSE');

-- New tables
CREATE TABLE "Bingo" (
  "id" TEXT NOT NULL,
  "roomName" TEXT NOT NULL,
  "status" "BingoStatus" NOT NULL DEFAULT 'INACTIVE',
  "bingoType" "BingoType" NOT NULL,
  "startDateTime" TIMESTAMP(3) NOT NULL,
  "repeatEveryMinutes" INTEGER,
  "cardPrice" DECIMAL(14,4) NOT NULL,
  "minPlayersToStart" INTEGER NOT NULL DEFAULT 2,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,

  CONSTRAINT "Bingo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BingoPrize" (
  "id" TEXT NOT NULL,
  "bingoId" TEXT NOT NULL,
  "figure" "BingoFigure" NOT NULL,
  "amount" DECIMAL(14,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BingoPrize_pkey" PRIMARY KEY ("id")
);

-- Indexes / constraints
CREATE INDEX "Bingo_status_idx" ON "Bingo"("status");
CREATE INDEX "Bingo_startDateTime_idx" ON "Bingo"("startDateTime");
CREATE INDEX "Bingo_bingoType_idx" ON "Bingo"("bingoType");
CREATE INDEX "BingoPrize_bingoId_idx" ON "BingoPrize"("bingoId");

CREATE UNIQUE INDEX "BingoPrize_bingoId_figure_key" ON "BingoPrize"("bingoId", "figure");

-- Foreign keys
ALTER TABLE "Bingo" ADD CONSTRAINT "Bingo_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Bingo" ADD CONSTRAINT "Bingo_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BingoPrize" ADD CONSTRAINT "BingoPrize_bingoId_fkey"
  FOREIGN KEY ("bingoId") REFERENCES "Bingo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

