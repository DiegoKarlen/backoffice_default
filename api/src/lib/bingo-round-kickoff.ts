import { BingoRoundStatus, type Prisma } from "@prisma/client";
import { BingoRoundCancelReason, type BingoRoundCancelReasonCode } from "./bingo-round-cancellation.js";
import { prisma } from "./prisma.js";

/** Locks the round row (`FOR UPDATE`) so purchase and kickoff cannot race on status. */
export async function lockBingoRoundForPurchase(
  tx: Prisma.TransactionClient,
  bingoRoundId: string,
): Promise<
  Prisma.BingoRoundGetPayload<{
    include: { bingo: true };
  }>
> {
  await tx.$executeRawUnsafe(`SELECT id FROM "BingoRound" WHERE id = $1 FOR UPDATE`, bingoRoundId);
  const round = await tx.bingoRound.findUnique({
    where: { id: bingoRoundId },
    include: { bingo: true },
  });
  if (!round) throw new Error("Round not found");
  return round;
}

/** Venta abierta solo mientras la partida está programada y no llegó `startsAt`. */
export function isRoundOpenForPurchase(
  round: { status: BingoRoundStatus | string; startsAt: Date },
  now: Date = new Date(),
): boolean {
  return round.status === BingoRoundStatus.SCHEDULED && round.startsAt.getTime() > now.getTime();
}

export function isTerminalRoundStatus(status: BingoRoundStatus): boolean {
  return status === BingoRoundStatus.CANCELLED || status === BingoRoundStatus.COMPLETED;
}

export async function countSoldCartons(bingoRoundId: string): Promise<number> {
  return prisma.playerRoundCard.count({ where: { bingoRoundId } });
}

/** Jugadores distintos con al menos un cartón en la partida (`minPlayersToStart`). */
export async function countDistinctPlayersWithCartons(bingoRoundId: string): Promise<number> {
  const rows = await prisma.playerRoundCard.findMany({
    where: { bingoRoundId },
    distinct: ["playerId"],
    select: { playerId: true },
  });
  return rows.length;
}

/** Solo desde `SCHEDULED` → evita marcar `DRAWING` una partida que no sorteará. */
export async function cancelScheduledRound(
  bingoRoundId: string,
  cancellationReason: BingoRoundCancelReasonCode,
): Promise<boolean> {
  const result = await prisma.bingoRound.updateMany({
    where: { id: bingoRoundId, status: BingoRoundStatus.SCHEDULED },
    data: {
      status: BingoRoundStatus.CANCELLED,
      cancellationReason,
    },
  });
  return result.count > 0;
}

export async function cancelRoundForMinCartons(bingoRoundId: string): Promise<boolean> {
  return cancelRoundForMinPlayers(bingoRoundId);
}

export async function cancelRoundForMinPlayers(bingoRoundId: string): Promise<boolean> {
  return cancelScheduledRound(bingoRoundId, BingoRoundCancelReason.MIN_PLAYERS_NOT_MET);
}

/** Transición atómica `SCHEDULED` → `DRAWING` tras validar cupo mínimo de jugadores. */
export async function promoteRoundToDrawing(bingoRoundId: string): Promise<boolean> {
  const result = await prisma.bingoRound.updateMany({
    where: { id: bingoRoundId, status: BingoRoundStatus.SCHEDULED },
    data: { status: BingoRoundStatus.DRAWING },
  });
  return result.count > 0;
}
