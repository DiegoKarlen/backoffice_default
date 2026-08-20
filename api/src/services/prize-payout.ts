import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { settleDeferredSplitPrizesForRound } from "./settle-deferred-split-prizes.js";
import { applyWalletDelta, lockWalletForPlayer } from "./wallet-ledger.js";

export type PrizeCreditResult = {
  payoutId: string;
  transactionId: string;
  balanceCents: number;
};

export const PRIZE_ALREADY_CREDITED = "Prize already credited for this card";
export const PRIZE_WIN_NOT_REGISTERED = "Prize win not registered by game engine";

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

  const existingPayout = await tx.prizePayout.findFirst({
    where: {
      bingoPrizeId: params.bingoPrizeId,
      playerRoundCardId: params.playerRoundCardId,
    },
    select: { id: true },
  });
  if (existingPayout) {
    throw new Error(PRIZE_ALREADY_CREDITED);
  }

  const player = await tx.player.findUnique({ where: { id: params.playerId } });
  if (!player) throw new Error("Player not found");
  if (!params.allowInactivePlayer && !player.active) throw new Error("Player is inactive");

  const amountCents = params.amountCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }

  const wallet = await lockWalletForPlayer(tx, params.playerId);
  const { newBalanceCents: newBalance } = await applyWalletDelta(tx, wallet, amountCents);

  let payout;
  try {
    payout = await tx.prizePayout.create({
      data: {
        playerId: params.playerId,
        bingoPrizeId: prize.id,
        playerRoundCardId: card.id,
        amountCents,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error(PRIZE_ALREADY_CREDITED);
    }
    throw err;
  }

  const wt = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "PRIZE_CREDIT",
      amountCents,
      balanceAfterCents: newBalance,
      prizePayoutId: payout.id,
    },
  });

  return { payoutId: payout.id, transactionId: wt.id, balanceCents: newBalance };
}

/**
 * Admin/backoffice: acredita un premio solo si el motor registró la victoria en `DeferredRoundPrizeWin`.
 * Liquida el premio (incluye reparto diferido si aplica) y elimina las filas deferred en la misma transacción.
 */
export async function creditPrizeToWinner(params: {
  playerId: string;
  bingoPrizeId: string;
  playerRoundCardId: string;
}): Promise<PrizeCreditResult> {
  const card = await prisma.playerRoundCard.findUnique({
    where: { id: params.playerRoundCardId },
    select: { playerId: true, bingoRoundId: true },
  });
  if (!card) throw new Error("Player round card not found");
  if (card.playerId !== params.playerId) throw new Error("Card does not belong to player");

  const existingPayout = await prisma.prizePayout.findFirst({
    where: {
      bingoPrizeId: params.bingoPrizeId,
      playerRoundCardId: params.playerRoundCardId,
    },
    select: { id: true },
  });
  if (existingPayout) {
    throw new Error(PRIZE_ALREADY_CREDITED);
  }

  const deferredWin = await prisma.deferredRoundPrizeWin.findFirst({
    where: {
      bingoRoundId: card.bingoRoundId,
      bingoPrizeId: params.bingoPrizeId,
      playerRoundCardId: params.playerRoundCardId,
      playerId: params.playerId,
    },
    select: { id: true },
  });
  if (!deferredWin) {
    throw new Error(PRIZE_WIN_NOT_REGISTERED);
  }

  const settled = await settleDeferredSplitPrizesForRound({
    bingoRoundId: card.bingoRoundId,
    bingoPrizeIds: [params.bingoPrizeId],
  });

  const match = settled.find(
    (c) =>
      c.playerRoundCardId === params.playerRoundCardId &&
      c.bingoPrizeId === params.bingoPrizeId &&
      c.playerId === params.playerId,
  );
  if (!match) {
    throw new Error(PRIZE_ALREADY_CREDITED);
  }

  const wt = await prisma.walletTransaction.findFirst({
    where: { prizePayoutId: match.payoutId },
    select: { id: true },
  });
  const wallet = await prisma.wallet.findUnique({
    where: { playerId: params.playerId },
    select: { balanceCents: true },
  });

  return {
    payoutId: match.payoutId,
    transactionId: wt?.id ?? "",
    balanceCents: wallet?.balanceCents ?? 0,
  };
}
