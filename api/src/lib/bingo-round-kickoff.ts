import { BingoRoundStatus } from "@prisma/client";
import { BingoRoundCancelReason } from "./bingo-round-cancellation.js";
import { prisma } from "./prisma.js";

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

/** Solo desde `SCHEDULED` → evita marcar `DRAWING` una partida que no sorteará. */
export async function cancelRoundForMinCartons(bingoRoundId: string): Promise<boolean> {
  const result = await prisma.bingoRound.updateMany({
    where: { id: bingoRoundId, status: BingoRoundStatus.SCHEDULED },
    data: {
      status: BingoRoundStatus.CANCELLED,
      cancellationReason: BingoRoundCancelReason.MIN_CARTONS_NOT_MET,
    },
  });
  return result.count > 0;
}

/** Transición atómica `SCHEDULED` → `DRAWING` tras validar cupo mínimo. */
export async function promoteRoundToDrawing(bingoRoundId: string): Promise<boolean> {
  const result = await prisma.bingoRound.updateMany({
    where: { id: bingoRoundId, status: BingoRoundStatus.SCHEDULED },
    data: { status: BingoRoundStatus.DRAWING },
  });
  return result.count > 0;
}
