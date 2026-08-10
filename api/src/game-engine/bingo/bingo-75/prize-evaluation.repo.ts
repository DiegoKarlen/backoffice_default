import type { BingoFigure } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

export type BingoPrizeRow = {
  id: string;
  figure: BingoFigure;
};

export type RoundCardRow = {
  id: string;
  playerId: string;
  createdAt: Date;
  cardIndex: number;
  cells: Array<{
    row: number;
    col: number;
    number: number | null;
    isFree: boolean;
  }>;
  player: { id: string; active: boolean; username: string };
};

export type RoundAwardState = {
  deferredByCardPrize: Set<string>;
  immediateByCardPrize: Set<string>;
  prizeIdsWithDeferredInRound: Set<string>;
  prizeIdsWithImmediateInRound: Set<string>;
};

export function cardPrizeKey(cardId: string, prizeId: string): string {
  return `${cardId}:${prizeId}`;
}

export async function loadBingoJackpotMaxBall(bingoId: string): Promise<number | null> {
  const row = await prisma.bingo.findUnique({
    where: { id: bingoId },
    select: { jackpotEnabled: true, jackpotMaxBall: true },
  });
  if (!row?.jackpotEnabled || !row.jackpotMaxBall) return null;
  return row.jackpotMaxBall;
}

export async function loadBingoPrizes(bingoId: string): Promise<BingoPrizeRow[]> {
  return prisma.bingoPrize.findMany({
    where: { bingoId },
    orderBy: { figure: "asc" },
    select: { id: true, figure: true },
  });
}

export async function loadRoundCards(bingoRoundId: string): Promise<RoundCardRow[]> {
  return prisma.playerRoundCard.findMany({
    where: { bingoRoundId },
    select: {
      id: true,
      playerId: true,
      createdAt: true,
      cardIndex: true,
      cells: { orderBy: [{ row: "asc" }, { col: "asc" }] },
      player: { select: { id: true, active: true, username: true } },
    },
  });
}

export async function loadRoundAwardState(bingoRoundId: string): Promise<RoundAwardState> {
  const [deferredRows, immediateRows] = await Promise.all([
    prisma.deferredRoundPrizeWin.findMany({
      where: { bingoRoundId },
      select: { bingoPrizeId: true, playerRoundCardId: true },
    }),
    prisma.prizePayout.findMany({
      where: { playerRoundCard: { bingoRoundId } },
      select: { bingoPrizeId: true, playerRoundCardId: true },
    }),
  ]);

  const deferredByCardPrize = new Set<string>();
  const prizeIdsWithDeferredInRound = new Set<string>();
  for (const row of deferredRows) {
    deferredByCardPrize.add(cardPrizeKey(row.playerRoundCardId, row.bingoPrizeId));
    prizeIdsWithDeferredInRound.add(row.bingoPrizeId);
  }

  const immediateByCardPrize = new Set<string>();
  const prizeIdsWithImmediateInRound = new Set<string>();
  for (const row of immediateRows) {
    immediateByCardPrize.add(cardPrizeKey(row.playerRoundCardId, row.bingoPrizeId));
    prizeIdsWithImmediateInRound.add(row.bingoPrizeId);
  }

  return {
    deferredByCardPrize,
    immediateByCardPrize,
    prizeIdsWithDeferredInRound,
    prizeIdsWithImmediateInRound,
  };
}

export async function insertDeferredRoundPrizeWin(data: {
  bingoRoundId: string;
  bingoPrizeId: string;
  playerId: string;
  playerRoundCardId: string;
}): Promise<{ id: string } | null> {
  try {
    const row = await prisma.deferredRoundPrizeWin.create({ data });
    return { id: row.id };
  } catch {
    return null;
  }
}
