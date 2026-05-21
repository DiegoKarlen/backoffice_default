import { BingoPrizeMode, type BingoPrize, type Prisma } from "@prisma/client";

/** Texto para UI / display: monto fijo o «10% del pozo». */
export function bingoPrizeDisplayAmount(
  prizeMode: BingoPrizeMode,
  prize: Pick<BingoPrize, "amount">,
): string {
  if (prizeMode === BingoPrizeMode.PERCENTAGE) {
    return `${prize.amount.toString()}%`;
  }
  return prize.amount.toString();
}
