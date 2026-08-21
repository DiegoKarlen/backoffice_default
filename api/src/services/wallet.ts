import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { logAdminAudit } from "../lib/admin-audit-log.js";
import {
  MANUAL_CREDIT_PROVIDER_ID,
  manualCreditExternalRef,
} from "../payments/manual-credit.constants.js";
import { applyWalletDelta, lockWalletForPlayer } from "./wallet-ledger.js";

export const IDEMPOTENCY_KEY_REUSED =
  "Idempotency key reused with different request parameters";

export type ManualCreditResult = {
  depositId: string;
  transactionId: string;
  walletId: string;
  balanceCents: number;
  alreadyProcessed?: boolean;
};

/**
 * Manual credit from backoffice: creates Deposit (COMPLETED), ledger line (DEPOSIT), updates balance.
 * Idempotent per `idempotencyKey` (unique with providerId `manual-bo`).
 */
export async function creditWalletManualDeposit(params: {
  playerId: string;
  amountCents: number;
  adminUserId: string;
  idempotencyKey: string;
  note?: string | null;
}): Promise<ManualCreditResult> {
  const { playerId, amountCents, adminUserId, idempotencyKey, note } = params;
  const externalRef = manualCreditExternalRef(idempotencyKey);

  if (!externalRef) {
    throw new Error("idempotencyKey is required");
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }
  if (amountCents > env.maxManualCreditCents) {
    throw new Error(`amountCents exceeds maximum manual credit (${env.maxManualCreditCents})`);
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
    const existing = await tx.deposit.findUnique({
      where: {
        providerId_externalRef: {
          providerId: MANUAL_CREDIT_PROVIDER_ID,
          externalRef,
        },
      },
      include: {
        walletTransaction: true,
        player: { include: { wallet: true } },
      },
    });

    if (existing) {
      if (existing.playerId !== playerId || existing.amountCents !== amountCents) {
        throw new Error(IDEMPOTENCY_KEY_REUSED);
      }
      const wallet = existing.player.wallet;
      if (!wallet || !existing.walletTransaction) {
        throw new Error("Existing manual credit is incomplete");
      }
      return {
        depositId: existing.id,
        transactionId: existing.walletTransaction.id,
        walletId: wallet.id,
        balanceCents: wallet.balanceCents,
        alreadyProcessed: true,
      };
    }

    const wallet = await lockWalletForPlayer(tx, playerId);
    const { newBalanceCents: newBalance } = await applyWalletDelta(tx, wallet, amountCents);

    const deposit = await tx.deposit.create({
      data: {
        playerId,
        amountCents,
        currencyCode: wallet.currencyCode,
        status: "COMPLETED",
        completedAt: new Date(),
        providerId: MANUAL_CREDIT_PROVIDER_ID,
        externalRef,
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

    await logAdminAudit(tx, {
      adminUserId,
      action: "MANUAL_WALLET_CREDIT",
      targetType: "player",
      targetId: playerId,
      amountCents,
      note,
      depositId: deposit.id,
      metadata: { transactionId: wt.id, walletId: wallet.id, idempotencyKey: externalRef },
    });

    return {
      depositId: deposit.id,
      transactionId: wt.id,
      walletId: wallet.id,
      balanceCents: newBalance,
    };
  });
}
