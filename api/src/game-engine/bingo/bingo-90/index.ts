import type { BingoVariantEngine } from "../types.js";
import { BALL_COUNT, createBallQueue } from "./engine.js";

/** Bingo 90: sorteo de bolas; reglas de cartón y premios pendientes de definición. */
export const bingo90Engine: BingoVariantEngine = {
  bingoType: "BINGO_90",
  ballCount: BALL_COUNT,
  createBallQueue,
  evaluateAfterBall: async () => false,
};

export * from "./engine.js";
