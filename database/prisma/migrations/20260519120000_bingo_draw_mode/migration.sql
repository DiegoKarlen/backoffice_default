-- CreateEnum
CREATE TYPE "BingoDrawMode" AS ENUM ('VIRTUAL', 'LIVE');

-- AlterTable
ALTER TABLE "Bingo" ADD COLUMN "drawMode" "BingoDrawMode" NOT NULL DEFAULT 'VIRTUAL';
