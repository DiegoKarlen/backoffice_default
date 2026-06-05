import { BingoPrizeMode, type BingoFigure, type BingoPrize, type Prisma } from "@prisma/client";
import { bingoPrizeDisplayAmount } from "./bingo-prize-display.js";
import { computePrizePayoutCents } from "./bingo-prize-pool.js";
import { decimalPriceToCents } from "./money.js";

export type RoundPrizePayoutLine = {
  figure: BingoFigure;
  amount: string;
  displayAmount: string;
  payoutCents: number;
};

export type RoundPrizeBreakdown = {
  prizeMode: BingoPrizeMode;
  /** Pozo total (semilla + ventas de cartones); null si el bingo no usa pozo visible. */
  prizePoolCents: number | null;
  prizeLines: RoundPrizePayoutLine[];
};

/** Pozo de partida + importe a pagar por cada figura configurada en el bingo. */
export function buildRoundPrizeBreakdown(
  prizeMode: BingoPrizeMode,
  prizePoolSeed: Prisma.Decimal,
  prizes: Pick<BingoPrize, "figure" | "amount">[],
  roundPoolCents: number,
): RoundPrizeBreakdown {
  const seedCents = decimalPriceToCents(prizePoolSeed);
  const prizePoolCents =
    prizeMode === BingoPrizeMode.PERCENTAGE || seedCents > 0 ? roundPoolCents : null;

  const prizeLines = prizes.map((p) => ({
    figure: p.figure,
    amount: p.amount.toString(),
    displayAmount: bingoPrizeDisplayAmount(prizeMode, p),
    payoutCents: computePrizePayoutCents(prizeMode, p, roundPoolCents),
  }));

  return { prizeMode, prizePoolCents, prizeLines };
}
