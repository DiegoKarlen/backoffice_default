import type { BingoFigure, BingoRoundStatus, BingoType } from "@prisma/client";
import {
  figureHighlightSlotsByDrawOrder,
  type Bingo75Cell,
} from "../game-engine/bingo/bingo-75/figures.js";
import { prisma } from "./prisma.js";

export type CardGridCell = { number: number | null; isFree: boolean };

function cellsToGrid5(
  cells: { row: number; col: number; number: number | null; isFree: boolean }[],
): CardGridCell[][] {
  const grid: CardGridCell[][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => ({ number: null as number | null, isFree: false })),
  );
  for (const c of cells) {
    if (c.row >= 0 && c.row < 5 && c.col >= 0 && c.col < 5) {
      grid[c.row]![c.col] = { number: c.number, isFree: c.isFree };
    }
  }
  return grid;
}

async function assertRoundBelongsToBingo(bingoId: string, roundId: string) {
  const round = await prisma.bingoRound.findFirst({
    where: { id: roundId, bingoId },
    select: {
      id: true,
      sequence: true,
      status: true,
      bingo: { select: { bingoType: true, name: true } },
    },
  });
  return round;
}

export type RoundCardPrizeBo = {
  figure: BingoFigure;
  amountCents: number;
  highlight: { row: number; col: number }[];
};

export async function getRoundPurchasedCardsForBo(params: {
  bingoId: string;
  roundId: string;
}): Promise<
  | {
      ok: true;
      bingoType: BingoType;
      roundSequence: number;
      roundStatus: BingoRoundStatus;
      cards: Array<{
        playerUsername: string;
        cardIndex: number;
        grid: CardGridCell[][];
        prizes: RoundCardPrizeBo[];
      }>;
    }
  | { ok: false; status: 404; error: string }
> {
  const round = await assertRoundBelongsToBingo(params.bingoId, params.roundId);
  if (!round) {
    return { ok: false, status: 404, error: "Round not found" };
  }
  if (round.bingo.bingoType !== "BINGO_75") {
    return { ok: false, status: 422, error: "Card preview is only available for BINGO_75" };
  }

  const cards = await prisma.playerRoundCard.findMany({
    where: { bingoRoundId: round.id },
    orderBy: [{ player: { username: "asc" } }, { cardIndex: "asc" }],
    include: {
      player: { select: { username: true } },
      cells: { orderBy: [{ row: "asc" }, { col: "asc" }] },
    },
  });

  /** @type {Map<string, RoundCardPrizeBo[]>} */
  const prizesByCardId = new Map();

  if (round.status === "COMPLETED") {
    const balls = await prisma.bingoRoundBall.findMany({
      where: { roundId: round.id },
      orderBy: { drawOrder: "asc" },
      select: { number: true },
    });
    const drawnNumbers = balls.map((b) => b.number);

    const payouts = await prisma.prizePayout.findMany({
      where: { playerRoundCard: { bingoRoundId: round.id } },
      orderBy: [{ createdAt: "asc" }],
      include: {
        bingoPrize: { select: { figure: true } },
        playerRoundCard: {
          select: {
            id: true,
            cells: { orderBy: [{ row: "asc" }, { col: "asc" }] },
          },
        },
      },
    });

    for (const p of payouts) {
      const cardId = p.playerRoundCard.id;
      const cells: Bingo75Cell[] = p.playerRoundCard.cells.map((c) => ({
        row: c.row,
        col: c.col,
        number: c.number,
        isFree: c.isFree,
      }));
      const figure = p.bingoPrize.figure;
      const highlight = figureHighlightSlotsByDrawOrder(figure, cells, drawnNumbers);
      const list = prizesByCardId.get(cardId) ?? [];
      list.push({ figure, amountCents: p.amountCents, highlight });
      prizesByCardId.set(cardId, list);
    }
  }

  return {
    ok: true,
    bingoType: round.bingo.bingoType,
    roundSequence: round.sequence,
    roundStatus: round.status,
    cards: cards.map((c) => ({
      playerUsername: c.player.username,
      cardIndex: c.cardIndex,
      grid: cellsToGrid5(c.cells),
      prizes: prizesByCardId.get(c.id) ?? [],
    })),
  };
}

export async function getRoundPrizesForBo(params: {
  bingoId: string;
  roundId: string;
}): Promise<
  | {
      ok: true;
      roundSequence: number;
      prizes: Array<{
        playerUsername: string;
        figure: BingoFigure;
        amountCents: number;
        cardIndex: number;
      }>;
    }
  | { ok: false; status: 404; error: string }
> {
  const round = await assertRoundBelongsToBingo(params.bingoId, params.roundId);
  if (!round) {
    return { ok: false, status: 404, error: "Round not found" };
  }

  const payouts = await prisma.prizePayout.findMany({
    where: { playerRoundCard: { bingoRoundId: round.id } },
    orderBy: [{ createdAt: "asc" }],
    include: {
      player: { select: { username: true } },
      bingoPrize: { select: { figure: true } },
      playerRoundCard: { select: { cardIndex: true } },
    },
  });

  return {
    ok: true,
    roundSequence: round.sequence,
    prizes: payouts.map((p) => ({
      playerUsername: p.player.username,
      figure: p.bingoPrize.figure,
      amountCents: p.amountCents,
      cardIndex: p.playerRoundCard.cardIndex,
    })),
  };
}
