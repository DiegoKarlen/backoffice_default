import type { Prisma } from "@prisma/client";

export type LockedWallet = {
  id: string;
  playerId: string;
  balanceCents: number;
  currencyCode: string;
};

/**
 * Ensures a wallet row exists and locks it for update (PostgreSQL FOR UPDATE).
 * Must be called inside an open transaction.
 */
export async function lockWalletForPlayer(
  tx: Prisma.TransactionClient,
  playerId: string,
): Promise<LockedWallet> {
  await tx.wallet.upsert({
    where: { playerId },
    create: { playerId, balanceCents: 0, currencyCode: "ARS" },
    update: {},
  });

  await tx.$executeRawUnsafe(`SELECT id FROM "Wallet" WHERE "playerId" = $1 FOR UPDATE`, playerId);

  return tx.wallet.findUniqueOrThrow({ where: { playerId } });
}

export type WalletDeltaResult = {
  walletId: string;
  previousBalanceCents: number;
  newBalanceCents: number;
};

/**
 * Applies a signed balance change and persists the new balance.
 * Throws `Insufficient balance` when the result would be negative.
 */
export async function applyWalletDelta(
  tx: Prisma.TransactionClient,
  wallet: LockedWallet,
  deltaCents: number,
): Promise<WalletDeltaResult> {
  if (!Number.isInteger(deltaCents) || deltaCents === 0) {
    throw new Error("deltaCents must be a non-zero integer");
  }

  const newBalance = wallet.balanceCents + deltaCents;
  if (newBalance < 0) {
    throw new Error("Insufficient balance");
  }

  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balanceCents: newBalance },
  });

  return {
    walletId: wallet.id,
    previousBalanceCents: wallet.balanceCents,
    newBalanceCents: newBalance,
  };
}
