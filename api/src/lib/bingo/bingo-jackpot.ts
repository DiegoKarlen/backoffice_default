import { BingoFigure, BingoType } from "@prisma/client";
import { toDecimalString } from "./bingo-serializer.js";
import type { PrizeBody } from "./bingo-schemas.js";

export const JACKPOT_PRIZE_FIGURE = BingoFigure.JACKPOT;

export function stripJackpotPrizeFromList(prizes: PrizeBody[]): PrizeBody[] {
  return prizes.filter((p) => p.figure !== JACKPOT_PRIZE_FIGURE);
}

export function validateJackpotConfig(input: {
  jackpotEnabled?: boolean;
  jackpotMaxBall?: number | null;
  jackpotAmount?: unknown;
  bingoType?: BingoType;
}): string | null {
  if (!input.jackpotEnabled) return null;

  const maxBall = input.jackpotMaxBall;
  const maxAllowed = input.bingoType === BingoType.BINGO_90 ? 90 : 75;
  if (!Number.isInteger(maxBall) || maxBall! < 2 || maxBall! > maxAllowed) {
    return `Jackpot max ball must be between 2 and ${maxAllowed}`;
  }

  const amount = Number(toDecimalString(input.jackpotAmount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Jackpot amount must be a positive number";
  }

  return null;
}

export function mergeJackpotPrize(
  prizes: PrizeBody[],
  jackpot: { enabled: boolean; amount?: unknown },
): PrizeBody[] {
  const base = stripJackpotPrizeFromList(prizes);
  if (!jackpot.enabled) return base;
  return [
    ...base,
    {
      figure: JACKPOT_PRIZE_FIGURE,
      amount: toDecimalString(jackpot.amount),
    },
  ];
}

export function jackpotDbFields(input: {
  jackpotEnabled?: boolean;
  jackpotMaxBall?: number | null;
  jackpotAmount?: unknown;
}): {
  jackpotEnabled: boolean;
  jackpotMaxBall: number | null;
  jackpotAmount: string | null;
} {
  const enabled = input.jackpotEnabled === true;
  return {
    jackpotEnabled: enabled,
    jackpotMaxBall: enabled && Number.isInteger(input.jackpotMaxBall) ? input.jackpotMaxBall! : null,
    jackpotAmount: enabled ? toDecimalString(input.jackpotAmount) : null,
  };
}
