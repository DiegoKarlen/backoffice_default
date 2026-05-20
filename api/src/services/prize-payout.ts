import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { decimalPriceToCents } from "../lib/money.js";

export type PrizeCreditResult = {
  payoutId: string;
  transactionId: string;
  balanceCents: number;
};

export async function creditPrizeAmountWithTx(
  tx: Prisma.TransactionClient,
  params: {
    playerId: string;
    bingoPrizeId: string;
    playerRoundCardId: string;
    amountCents: number;
    allowInactivePlayer?: boolean;
  },
): Promise<PrizeCreditResult> {
  const prize = await tx.bingoPrize.findUnique({
    where: { id: params.bingoPrizeId },
  });
  if (!prize) throw new Error("Prize not found");

  const card = await tx.playerRoundCard.findUnique({
    where: { id: params.playerRoundCardId },
    include: { bingoRound: true },
  });
  if (!card) throw new Error("Player round card not found");
  if (card.playerId !== params.playerId) throw new Error("Card does not belong to player");
  if (card.bingoRound.bingoId !== prize.bingoId) {
    throw new Error("Prize does not match the bingo for this card");
  }

  const player = await tx.player.findUnique({ where: { id: params.playerId } });
  if (!player) throw new Error("Player not found");
  if (!params.allowInactivePlayer && !player.active) throw new Error("Player is inactive");

  const amountCents = params.amountCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }

  await tx.wallet.upsert({
    where: { playerId: params.playerId },
    create: { playerId: params.playerId, balanceCents: 0, currencyCode: "ARS" },
    update: {},
  });

  await tx.$executeRawUnsafe(`SELECT id FROM "Wallet" WHERE "playerId" = $1 FOR UPDATE`, params.playerId);

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { playerId: params.playerId } });
  const newBalance = wallet.balanceCents + amountCents;

  const payout = await tx.prizePayout.create({
    data: {
      playerId: params.playerId,
      bingoPrizeId: prize.id,
      playerRoundCardId: card.id,
      amountCents,
    },
  });

  const wt = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "PRIZE_CREDIT",
      amountCents,
      balanceAfterCents: newBalance,
      prizePayoutId: payout.id,
    },
  });

  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balanceCents: newBalance },
  });

  return { payoutId: payout.id, transactionId: wt.id, balanceCents: newBalance };
}

/**
 * Credit wallet for a configured bingo prize linked to the winning card (same bingo as the round).
 * Intended to be called when the game engine confirms a win (or from admin tooling).
 */
export async function creditPrizeToWinner(params: {
  playerId: string;
  bingoPrizeId: string;
  playerRoundCardId: string;
  /** Override cents (e.g. admin tooling); default = configured prize amount. */
  amountCentsOverride?: number;
}): Promise<PrizeCreditResult> {
  const prize = await prisma.bingoPrize.findUnique({
    where: { id: params.bingoPrizeId },
  });
  if (!prize) throw new Error("Prize not found");

  const amountCents =
    params.amountCentsOverride ?? decimalPriceToCents(prize.amount);

  return prisma.$transaction((tx) =>
    creditPrizeAmountWithTx(tx, {
      playerId: params.playerId,
      bingoPrizeId: params.bingoPrizeId,
      playerRoundCardId: params.playerRoundCardId,
      amountCents,
      allowInactivePlayer: false,
    }),
  );
}
