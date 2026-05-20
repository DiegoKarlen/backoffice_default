import type { BingoType } from "@prisma/client";
import { bingo75Engine } from "./bingo-75/index.js";
import { bingo90Engine } from "./bingo-90/index.js";
import type { BingoVariantEngine } from "./types.js";

export type { BingoVariantEngine, EvaluateAfterBallParams, PrizeAwardBroadcastPayload } from "./types.js";

const ENGINES: Record<BingoType, BingoVariantEngine> = {
  BINGO_75: bingo75Engine,
  BINGO_90: bingo90Engine,
};

export function getBingoEngine(bingoType: BingoType): BingoVariantEngine {
  return ENGINES[bingoType];
}

export function ballCountForType(bingoType: BingoType): number {
  return getBingoEngine(bingoType).ballCount;
}

export function createBallQueue(bingoType: BingoType): number[] {
  return getBingoEngine(bingoType).createBallQueue();
}
