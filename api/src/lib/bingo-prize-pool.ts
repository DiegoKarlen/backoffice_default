import { BingoPrizeMode, type BingoPrize, type Prisma } from "@prisma/client";
import { decimalPriceToCents } from "./money.js";
import { prisma } from "./prisma.js";

/** Pozo de la partida = semilla del bingo + total vendido en cartones de esa partida. */
export async function computeRoundPrizePoolCents(
  bingoRoundId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  const round = await tx.bingoRound.findUnique({
    where: { id: bingoRoundId },
    select: { bingo: { select: { prizePoolSeed: true } } },
  });
  if (!round) throw new Error("Round not found");

  const sales = await tx.cartonPurchase.aggregate({
    where: { bingoRoundId },
    _sum: { totalCents: true },
  });

  const seedCents = decimalPriceToCents(round.bingo.prizePoolSeed);
  return seedCents + (sales._sum.totalCents ?? 0);
}

export function computePrizePayoutCents(
  prizeMode: BingoPrizeMode,
  prize: Pick<BingoPrize, "amount">,
  roundPoolCents: number,
): number {
  if (prizeMode === BingoPrizeMode.PERCENTAGE) {
    const pct = Number(prize.amount.toString());
    if (!Number.isFinite(pct) || pct <= 0) return 0;
    return Math.floor((roundPoolCents * pct) / 100);
  }
  return decimalPriceToCents(prize.amount);
}
