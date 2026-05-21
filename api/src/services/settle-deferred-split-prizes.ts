import { PrizePayoutMode } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { computePrizePayoutCents, computeRoundPrizePoolCents } from "../lib/bingo-prize-pool.js";
import { compareCardsForTieBreak } from "../game-engine/bingo/bingo-75/prize-winner-order.js";
import { creditPrizeAmountWithTx } from "./prize-payout.js";

/**
 * Reparte en centavos `pool` entre `n` ganadores: base = floor(pool/n), los primeros `pool % n`
 * en orden de desempate reciben +1.
 */
function splitPoolCents(pool: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(pool / n);
  const rem = pool % n;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = base + (i < rem ? 1 : 0);
  }
  return out;
}

/**
 * Acredita wallets al cerrar la partida según filas `DeferredRoundPrizeWin`.
 * - `IMMEDIATE_FULL_PER_WINNER`: cada ganador cobra el monto completo del premio.
 * - `DEFERRED_SPLIT_AT_ROUND_END`: el monto del premio se reparte entre los ganadores de esa figura.
 * Idempotente si no quedan filas diferidas.
 */
export async function settleDeferredSplitPrizesForRound(params: { bingoRoundId: string }): Promise<void> {
  const round = await prisma.bingoRound.findUnique({
    where: { id: params.bingoRoundId },
    select: { bingo: { select: { prizePayoutMode: true, prizeMode: true } } },
  });
  const splitPool =
    round?.bingo.prizePayoutMode === PrizePayoutMode.DEFERRED_SPLIT_AT_ROUND_END;

  await prisma.$transaction(async (tx) => {
    const wins = await tx.deferredRoundPrizeWin.findMany({
      where: { bingoRoundId: params.bingoRoundId },
      include: {
        bingoPrize: true,
        playerRoundCard: { select: { id: true, createdAt: true, cardIndex: true } },
      },
    });

    if (!wins.length) return;

    const roundPoolCents = await computeRoundPrizePoolCents(params.bingoRoundId, tx);

    const byPrize = new Map<string, typeof wins>();
    for (const w of wins) {
      const list = byPrize.get(w.bingoPrizeId);
      if (list) list.push(w);
      else byPrize.set(w.bingoPrizeId, [w]);
    }

    for (const [, group] of byPrize) {
      const prize = group[0]!.bingoPrize;
      const pool = computePrizePayoutCents(round!.bingo.prizeMode, prize, roundPoolCents);
      const sorted = [...group].sort((a, b) =>
        compareCardsForTieBreak(a.playerRoundCard, b.playerRoundCard),
      );
      const amounts = splitPool
        ? splitPoolCents(pool, sorted.length)
        : sorted.map(() => pool);

      for (let i = 0; i < sorted.length; i++) {
        const w = sorted[i]!;
        const cents = amounts[i]!;
        if (cents <= 0) continue;
        await creditPrizeAmountWithTx(tx, {
          playerId: w.playerId,
          bingoPrizeId: prize.id,
          playerRoundCardId: w.playerRoundCardId,
          amountCents: cents,
          allowInactivePlayer: true,
        });
      }
    }

    await tx.deferredRoundPrizeWin.deleteMany({
      where: { bingoRoundId: params.bingoRoundId },
    });
  });
}
