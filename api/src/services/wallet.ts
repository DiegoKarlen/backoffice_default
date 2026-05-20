import { prisma } from "../lib/prisma.js";

function buildManualDepositRef(adminUserId: string, note?: string | null): string {
  const safeNote = note?.trim() ? encodeURIComponent(note.trim().slice(0, 400)) : "";
  return `manual-bo|admin=${adminUserId}|note=${safeNote}|ts=${Date.now()}`;
}

export type ManualCreditResult = {
  depositId: string;
  transactionId: string;
  walletId: string;
  balanceCents: number;
};

/**
 * Manual credit from backoffice: creates Deposit (COMPLETED), ledger line (DEPOSIT), updates balance.
 * Uses row lock on Wallet (FOR UPDATE) to avoid lost updates under concurrency.
 */
export async function creditWalletManualDeposit(params: {
  playerId: string;
  amountCents: number;
  adminUserId: string;
  note?: string | null;
}): Promise<ManualCreditResult> {
  const { playerId, amountCents, adminUserId, note } = params;

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }
  if (amountCents > 1_000_000_000) {
    throw new Error("amountCents exceeds maximum allowed");
  }

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) {
    throw new Error("Player not found");
  }
  if (!player.active) {
    throw new Error("Player is inactive");
  }

  return prisma.$transaction(async (tx) => {
    await tx.wallet.upsert({
      where: { playerId },
      create: { playerId, balanceCents: 0, currencyCode: "ARS" },
      update: {},
    });

    await tx.$executeRawUnsafe(`SELECT id FROM "Wallet" WHERE "playerId" = $1 FOR UPDATE`, playerId);

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { playerId } });
    const newBalance = wallet.balanceCents + amountCents;

    const deposit = await tx.deposit.create({
      data: {
        playerId,
        amountCents,
        currencyCode: wallet.currencyCode,
        status: "COMPLETED",
        completedAt: new Date(),
        externalRef: buildManualDepositRef(adminUserId, note),
      },
    });

    const wt = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "DEPOSIT",
        amountCents,
        balanceAfterCents: newBalance,
        depositId: deposit.id,
      },
    });

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceCents: newBalance },
    });

    return {
      depositId: deposit.id,
      transactionId: wt.id,
      walletId: wallet.id,
      balanceCents: newBalance,
    };
  });
}
