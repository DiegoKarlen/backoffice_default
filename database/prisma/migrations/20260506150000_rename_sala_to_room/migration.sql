-- Rename Sala -> Room (English naming)

ALTER TYPE "SalaStatus" RENAME TO "RoomStatus";

ALTER TABLE "Sala" RENAME TO "Room";

ALTER INDEX "Sala_status_idx" RENAME TO "Room_status_idx";

ALTER TABLE "Room" RENAME CONSTRAINT "Sala_pkey" TO "Room_pkey";

ALTER TABLE "Bingo" DROP CONSTRAINT "Bingo_salaId_fkey";

ALTER TABLE "Bingo" RENAME COLUMN "salaId" TO "roomId";

ALTER INDEX "Bingo_salaId_idx" RENAME TO "Bingo_roomId_idx";

ALTER TABLE "Bingo" ADD CONSTRAINT "Bingo_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RBAC: functionality code in English
UPDATE "Functionality"
SET code = 'bo.room.manage',
    name = 'Manage rooms'
WHERE code = 'bo.sala.manage';
