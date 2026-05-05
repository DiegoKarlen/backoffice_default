import type { BingoType } from "@prisma/client";
import { emitGameRngAudit, shuffleInPlace } from "./rng.js";

export function ballCountForType(bingoType: BingoType): number {
  return bingoType === "BINGO_75" ? 75 : 90;
}

/**
 * Cola de bolas para una ronda: orden aleatorio sin repetición (bolsa barajada).
 */
export function createBallQueue(bingoType: BingoType): number[] {
  const n = ballCountForType(bingoType);
  const queue = Array.from({ length: n }, (_, i) => i + 1);
  shuffleInPlace(queue);
  emitGameRngAudit({
    op: "ball_queue_ready",
    bingoType,
    ballCount: n,
  });
  return queue;
}
