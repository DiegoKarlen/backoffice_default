import { prisma } from "../lib/prisma.js";
import { applyWalletDelta, lockWalletForPlayer } from "./wallet-ledger.js";

export type RoundCancellationRefundSummary = {
  refundedPurchases: number;
  totalCentsRefunded: number;
  skippedAlreadyRefunded: number;
};

/**
 * Reembolsa las compras de cartones de una partida cancelada (ej. no se alcanzó `minPlayersToStart`).
 * Idempotente: no duplica créditos si se vuelve a llamar.
 * Una sola transacción DB para todas las compras de la partida.
 */
export async function refundCartonPurchasesForCancelledRound(
  bingoRoundId: string,
): Promise<RoundCancellationRefundSummary> {
  const purchases = await prisma.cartonPurchase.findMany({
    where: { bingoRoundId },
    orderBy: { id: "asc" },
    select: { id: true, playerId: true, totalCents: true },
  });

  if (purchases.length === 0) {
    return { refundedPurchases: 0, totalCentsRefunded: 0, skippedAlreadyRefunded: 0 };
  }

  return prisma.$transaction(async (tx) => {
    let refundedPurchases = 0;
    let totalCentsRefunded = 0;
    let skippedAlreadyRefunded = 0;

    for (const p of purchases) {
      const existing = await tx.walletTransaction.findFirst({
        where: { refundForCartonPurchaseId: p.id },
        select: { id: true },
      });
      if (existing) {
        skippedAlreadyRefunded++;
        continue;
      }

      if (p.totalCents <= 0) {
        continue;
      }

      const wallet = await lockWalletForPlayer(tx, p.playerId);
      const { newBalanceCents: newBalance } = await applyWalletDelta(tx, wallet, p.totalCents);

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "REFUND",
          amountCents: p.totalCents,
          balanceAfterCents: newBalance,
          refundForCartonPurchaseId: p.id,
        },
      });

      refundedPurchases++;
      totalCentsRefunded += p.totalCents;
    }

    return { refundedPurchases, totalCentsRefunded, skippedAlreadyRefunded };
  });
}

/** Removes deferred wins for a cancelled round that were never settled to wallet. */
export async function deleteUnsettledDeferredWinsForRound(bingoRoundId: string): Promise<number> {
  const result = await prisma.$executeRaw`
    DELETE FROM "DeferredRoundPrizeWin" d
    WHERE d."bingoRoundId" = ${bingoRoundId}
    AND NOT EXISTS (
      SELECT 1 FROM "PrizePayout" p
      WHERE p."playerRoundCardId" = d."playerRoundCardId"
        AND p."bingoPrizeId" = d."bingoPrizeId"
    )
  `;
  return typeof result === "number" ? result : 0;
}
