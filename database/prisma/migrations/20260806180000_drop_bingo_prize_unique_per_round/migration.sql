-- Cada figura se paga una sola vez por partida (primera bolilla); ya no es configurable.
ALTER TABLE "BingoPrize" DROP COLUMN "uniquePerRound";
