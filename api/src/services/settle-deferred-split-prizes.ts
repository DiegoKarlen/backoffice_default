import { prisma } from "../lib/prisma.js";
import { decimalPriceToCents } from "../lib/money.js";
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
 * Acredita wallets según filas `DeferredRoundPrizeWin` de la partida: el monto configurado de cada
 * `BingoPrize` se divide en partes iguales entre todos los ganadores de esa figura en la ronda.
 * Idempotente si no quedan filas diferidas.
 */
export async function settleDeferredSplitPrizesForRound(params: { bingoRoundId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const wins = await tx.deferredRoundPrizeWin.findMany({
      where: { bingoRoundId: params.bingoRoundId },
      include: {
        bingoPrize: true,
        playerRoundCard: { select: { id: true, createdAt: true, cardIndex: true } },
      },
    });

    if (!wins.length) return;

    const byPrize = new Map<string, typeof wins>();
    for (const w of wins) {
      const list = byPrize.get(w.bingoPrizeId);
      if (list) list.push(w);
      else byPrize.set(w.bingoPrizeId, [w]);
    }

    for (const [, group] of byPrize) {
      const prize = group[0]!.bingoPrize;
      const pool = decimalPriceToCents(prize.amount);
      const sorted = [...group].sort((a, b) =>
        compareCardsForTieBreak(a.playerRoundCard, b.playerRoundCard),
      );
      const amounts = splitPoolCents(pool, sorted.length);

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
