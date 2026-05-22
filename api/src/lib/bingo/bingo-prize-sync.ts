import { BingoPrizeMode, Prisma } from "@prisma/client";
import { toDecimalString } from "./bingo-serializer.js";
import type { PrizeBody } from "./bingo-schemas.js";

export type { PrizeBody };

export function prizeRowDbData(p: PrizeBody): { amount: string; uniquePerRound: boolean } {
  return {
    amount: toDecimalString(p.amount),
    uniquePerRound: p.uniquePerRound ?? true,
  };
}

export function validatePrizes(
  prizes: PrizeBody[],
  prizeMode: BingoPrizeMode,
  prizePoolSeed?: unknown,
): string | null {
  if (!prizes.length) return "At least one prize is required";
  const seen = new Set<string>();
  for (const p of prizes) {
    const key = String(p.figure);
    if (seen.has(key)) return `Duplicate prize figure: ${key}`;
    seen.add(key);
    const n = Number(toDecimalString(p.amount));
    if (!Number.isFinite(n) || n <= 0) {
      return prizeMode === BingoPrizeMode.PERCENTAGE
        ? `Prize percent must be a positive number (${key})`
        : `Prize amount must be a positive number (${key})`;
    }
    if (prizeMode === BingoPrizeMode.PERCENTAGE && n > 100) {
      return `Prize percent must be at most 100 (${key})`;
    }
  }
  if (prizeMode === BingoPrizeMode.PERCENTAGE) {
    const seed = Number(toDecimalString(prizePoolSeed ?? 0));
    if (!Number.isFinite(seed) || seed < 0) {
      return "prizePoolSeed must be a non-negative number when prize mode is PERCENTAGE";
    }
  }
  return null;
}

function prizeAmountDiffers(existing: { amount: Prisma.Decimal }, incomingAmount: string): boolean {
  return !existing.amount.equals(new Prisma.Decimal(incomingAmount));
}

/**
 * Sincroniza premios sin borrar filas con historial (`PrizePayout` / `DeferredRoundPrizeWin`).
 */
export async function syncBingoPrizesInUpdateTx(
  tx: Prisma.TransactionClient,
  bingoId: string,
  prizes: PrizeBody[],
): Promise<void> {
  const incomingFigures = prizes.map((p) => p.figure);
  const orphans = await tx.bingoPrize.findMany({
    where: { bingoId, figure: { notIn: incomingFigures } },
    select: {
      id: true,
      figure: true,
      _count: { select: { payouts: true, deferredWins: true } },
    },
  });
  for (const r of orphans) {
    if (r._count.payouts > 0 || r._count.deferredWins > 0) {
      const err = new Error(
        `Cannot remove prize figure ${r.figure}: payouts or pending deferred wins are linked to this prize.`,
      );
      err.name = "PrizeRemoveBlocked";
      throw err;
    }
  }
  for (const r of orphans) {
    await tx.bingoPrize.delete({ where: { id: r.id } });
  }

  for (const p of prizes) {
    const existing = await tx.bingoPrize.findUnique({
      where: { bingoId_figure: { bingoId, figure: p.figure } },
      include: { _count: { select: { payouts: true, deferredWins: true } } },
    });
    const row = prizeRowDbData(p);
    if (existing) {
      const hasPaidPayouts = existing._count.payouts > 0;
      if (hasPaidPayouts && prizeAmountDiffers(existing, row.amount)) {
        const err = new Error(
          `Cannot change the prize amount for figure ${p.figure}: there are already recorded prize payouts (credited amounts) for this prize. Those credits are immutable; you can still update "unique per round" or leave the amount unchanged.`,
        );
        err.name = "PrizeAmountLocked";
        throw err;
      }
      await tx.bingoPrize.update({
        where: { id: existing.id },
        data: row,
      });
    } else {
      await tx.bingoPrize.create({
        data: {
          bingoId,
          figure: p.figure,
          ...row,
        },
      });
    }
  }
}
