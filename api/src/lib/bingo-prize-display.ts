import { BingoPrizeMode, type BingoPrize } from "@prisma/client";

/** Texto para UI / display: monto fijo o «10% del pozo». Jackpot siempre es monto fijo. */
export function bingoPrizeDisplayAmount(
  prizeMode: BingoPrizeMode,
  prize: Pick<BingoPrize, "amount" | "figure">,
): string {
  if (prize.figure === "JACKPOT") {
    return prize.amount.toString();
  }
  if (prizeMode === BingoPrizeMode.PERCENTAGE) {
    return `${prize.amount.toString()}%`;
  }
  return prize.amount.toString();
}
