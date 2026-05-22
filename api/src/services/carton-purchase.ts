import { Prisma } from "@prisma/client";
import { allocateWithUniqueFingerprint } from "../lib/allocate-unique-fingerprint.js";
import { isRoundOpenForPurchase } from "../lib/bingo-round-kickoff.js";
import { prisma } from "../lib/prisma.js";
import { applyWalletDelta, lockWalletForPlayer } from "./wallet-ledger.js";
import { decimalPriceToCents } from "../lib/money.js";
import { fingerprintCells, generateBingo75Cells } from "../game-engine/bingo/bingo-75/player-card.js";

export const MAX_FP_RETRIES = 40;

export type PurchaseCartonsResult = {
  cartonPurchaseId: string;
  playerRoundCardIds: string[];
  balanceCents: number;
  totalCents: number;
  unitPriceCents: number;
};

export async function purchaseCartonsForRound(params: {
  playerId: string;
  bingoRoundId: string;
  quantity: number;
}): Promise<PurchaseCartonsResult> {
  const { playerId, bingoRoundId, quantity } = params;

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Error("quantity must be between 1 and 99");
  }

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) throw new Error("Player not found");
  if (!player.active) throw new Error("Player is inactive");

  const round = await prisma.bingoRound.findUnique({
    where: { id: bingoRoundId },
    include: {
      bingo: true,
    },
  });

  if (!round) throw new Error("Round not found");

  if (round.bingo.status !== "ACTIVE") {
    throw new Error("Bingo is not active");
  }

  if (!isRoundOpenForPurchase(round)) {
    throw new Error("Round is not open for purchases");
  }

  if (round.bingo.bingoType !== "BINGO_75") {
    throw new Error("Only BINGO_75 carton purchase is implemented");
  }

  const unitPriceCents = decimalPriceToCents(round.bingo.cardPrice);
  const totalCents = unitPriceCents * quantity;

  return prisma.$transaction(async (tx) => {
    const wallet = await lockWalletForPlayer(tx, playerId);

    if (wallet.balanceCents < totalCents) {
      throw new Error("Insufficient balance");
    }

    const purchase = await tx.cartonPurchase.create({
      data: {
        playerId,
        bingoRoundId,
        quantity,
        unitPriceCents,
        totalCents,
      },
    });

    const playerRoundCardIds: string[] = [];
    const takenFingerprints = new Set(
      (
        await tx.playerRoundCard.findMany({
          where: { bingoRoundId },
          select: { cardFingerprint: true },
        })
      ).map((r) => r.cardFingerprint),
    );

    for (let cardIndex = 0; cardIndex < quantity; cardIndex++) {
      const allocated = await allocateWithUniqueFingerprint({
        maxAttempts: MAX_FP_RETRIES,
        generate: () => generateBingo75Cells(),
        getFingerprint: fingerprintCells,
        isTaken: async (fingerprint) => {
          if (takenFingerprints.has(fingerprint)) return true;
          const clash = await tx.playerRoundCard.findFirst({
            where: { bingoRoundId, cardFingerprint: fingerprint },
            select: { id: true },
          });
          if (clash) takenFingerprints.add(fingerprint);
          return clash != null;
        },
        persist: async (cells, fingerprint) => {
          try {
            const card = await tx.playerRoundCard.create({
              data: {
                playerId,
                bingoRoundId,
                cartonPurchaseId: purchase.id,
                cardIndex,
                cardFingerprint: fingerprint,
                cells: {
                  create: cells.map((c) => ({
                    row: c.row,
                    col: c.col,
                    number: c.number,
                    isFree: c.isFree,
                  })),
                },
              },
            });
            playerRoundCardIds.push(card.id);
            takenFingerprints.add(fingerprint);
          } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
              throw { duplicate: true as const };
            }
            throw e;
          }
        },
      });

      if (!allocated.ok) {
        throw new Error("Could not allocate a unique card — please retry");
      }
    }

    const { newBalanceCents: newBalance } = await applyWalletDelta(tx, wallet, -totalCents);

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "CARTON_PURCHASE",
        amountCents: -totalCents,
        balanceAfterCents: newBalance,
        cartonPurchaseId: purchase.id,
      },
    });

    return {
      cartonPurchaseId: purchase.id,
      playerRoundCardIds,
      balanceCents: newBalance,
      totalCents,
      unitPriceCents,
    };
  });
}
