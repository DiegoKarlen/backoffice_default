import { prisma } from "../lib/prisma.js";

export type RoundCancellationRefundSummary = {
  /** Compras (`CartonPurchase`) que recibieron crédito en esta ejecución. */
  refundedPurchases: number;
  /** Suma de centavos acreditados en esta ejecución. */
  totalCentsRefunded: number;
  /** Compras que ya tenían línea REFUND (idempotencia). */
  skippedAlreadyRefunded: number;
};

/**
 * Reembolsa las compras de cartones de una partida cancelada (ej. no se alcanzó `minPlayersToStart`).
 * Idempotente: no duplica créditos si se vuelve a llamar.
 */
export async function refundCartonPurchasesForCancelledRound(
  bingoRoundId: string,
): Promise<RoundCancellationRefundSummary> {
  const purchases = await prisma.cartonPurchase.findMany({
    where: { bingoRoundId },
    orderBy: { id: "asc" },
    select: { id: true, playerId: true, totalCents: true },
  });

  let refundedPurchases = 0;
  let totalCentsRefunded = 0;
  let skippedAlreadyRefunded = 0;

  for (const p of purchases) {
    const inner = await prisma.$transaction(async (tx) => {
      const existing = await tx.walletTransaction.findFirst({
        where: { refundForCartonPurchaseId: p.id },
        select: { id: true },
      });
      if (existing) {
        return { kind: "already_refunded" as const };
      }

      if (p.totalCents <= 0) {
        return { kind: "skipped" as const };
      }

      await tx.wallet.upsert({
        where: { playerId: p.playerId },
        create: { playerId: p.playerId, balanceCents: 0, currencyCode: "ARS" },
        update: {},
      });

      await tx.$executeRawUnsafe(`SELECT id FROM "Wallet" WHERE "playerId" = $1 FOR UPDATE`, p.playerId);

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { playerId: p.playerId } });
      const newBalance = wallet.balanceCents + p.totalCents;

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "REFUND",
          amountCents: p.totalCents,
          balanceAfterCents: newBalance,
          refundForCartonPurchaseId: p.id,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceCents: newBalance },
      });

      return { kind: "refunded" as const, cents: p.totalCents };
    });

    if (inner.kind === "already_refunded") {
      skippedAlreadyRefunded++;
      continue;
    }
    if (inner.kind === "refunded") {
      refundedPurchases++;
      totalCentsRefunded += inner.cents;
    }
  }

  return { refundedPurchases, totalCentsRefunded, skippedAlreadyRefunded };
}
