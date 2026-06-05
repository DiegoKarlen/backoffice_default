import type { BingoVariantEngine } from "../types.js";
import { BALL_COUNT, createBallQueue } from "./engine.js";
import { evaluateRoundPrizesAfterBall } from "./prize-evaluator.js";

export const bingo75Engine: BingoVariantEngine = {
  bingoType: "BINGO_75",
  ballCount: BALL_COUNT,
  createBallQueue,
  evaluateAfterBall: evaluateRoundPrizesAfterBall,
};

export * from "./engine.js";
export * from "./figures.js";
export * from "./player-card.js";
export * from "./prize-evaluator.js";
export * from "./prize-evaluation.logic.js";
export * from "./prize-evaluation.repo.js";
