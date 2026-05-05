-- CreateEnum
CREATE TYPE "SalaStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Sala" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SalaStatus" NOT NULL DEFAULT 'INACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sala_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Sala_status_idx" ON "Sala"("status");

-- Default sala for existing bingos (deterministic id for FK migration)
INSERT INTO "Sala" ("id", "name", "status", "createdAt", "updatedAt")
VALUES ('a0000000-0000-4000-8000-000000000001', 'General', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "Bingo" ADD COLUMN "salaId" TEXT;

UPDATE "Bingo" SET "salaId" = 'a0000000-0000-4000-8000-000000000001';

ALTER TABLE "Bingo" ALTER COLUMN "salaId" SET NOT NULL;

ALTER TABLE "Bingo" ADD CONSTRAINT "Bingo_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Bingo_salaId_idx" ON "Bingo"("salaId");
