import { emitGameRngAudit, shuffleInPlace } from "../../rng/index.js";

export const BALL_COUNT = 90;

export function createBallQueue(): number[] {
  const queue = Array.from({ length: BALL_COUNT }, (_, i) => i + 1);
  shuffleInPlace(queue);
  emitGameRngAudit({
    op: "ball_queue_ready",
    bingoType: "BINGO_90",
    ballCount: BALL_COUNT,
  });
  return queue;
}
