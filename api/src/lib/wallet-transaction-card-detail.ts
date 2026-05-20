import type { BingoFigure, BingoType } from "@prisma/client";
import {
  buildMarkedGrid,
  figureHighlightSlots,
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

export type WalletCardDetailPurchase = {
  bingoType: BingoType;
  kind: "purchase";
  cards: Array<{ cardIndex: number; grid: CardGridCell[][] }>;
};

export type WalletCardDetailPrize = {
  bingoType: BingoType;
  kind: "prize";
  figure: BingoFigure;
  grid: CardGridCell[][];
  highlight: { row: number; col: number }[];
  drawnNumbers: number[];
};

export type WalletCardDetailResult =
  | { ok: true; data: WalletCardDetailPurchase | WalletCardDetailPrize }
  | { ok: false; status: 400 | 404 | 422; error: string };

/**
 * Cartón(es) asociados a un movimiento de wallet (compra o premio bingo 75).
 */
export async function getWalletTransactionCardDetail(params: {
  playerId: string;
  walletTransactionId: string;
}): Promise<WalletCardDetailResult> {
  const { playerId, walletTransactionId } = params;

  const wt = await prisma.walletTransaction.findFirst({
    where: {
      id: walletTransactionId,
      wallet: { playerId },
    },
    select: {
      id: true,
      cartonPurchaseId: true,
      prizePayoutId: true,
    },
  });

  if (!wt) {
    return { ok: false, status: 404, error: "Wallet transaction not found" };
  }

  if (wt.cartonPurchaseId) {
    const purchase = await prisma.cartonPurchase.findFirst({
      where: { id: wt.cartonPurchaseId, playerId },
      include: {
        playerRoundCards: {
          orderBy: { cardIndex: "asc" },
          include: {
            cells: { orderBy: [{ row: "asc" }, { col: "asc" }] },
          },
        },
        bingoRound: {
          select: {
            bingo: { select: { bingoType: true } },
          },
        },
      },
    });
    if (!purchase) {
      return { ok: false, status: 404, error: "Purchase not found" };
    }

    const bingoType = purchase.bingoRound.bingo.bingoType;
    if (bingoType !== "BINGO_75") {
      return {
        ok: false,
        status: 422,
        error: "Card preview is only available for BINGO_75",
      };
    }

    const cards = purchase.playerRoundCards.map((prc) => ({
      cardIndex: prc.cardIndex,
      grid: cellsToGrid5(prc.cells),
    }));

    return {
      ok: true,
      data: {
        bingoType,
        kind: "purchase",
        cards,
      },
    };
  }

  if (wt.prizePayoutId) {
    const payout = await prisma.prizePayout.findFirst({
      where: { id: wt.prizePayoutId, playerId },
      include: {
        bingoPrize: { select: { figure: true } },
        playerRoundCard: {
          include: {
            cells: { orderBy: [{ row: "asc" }, { col: "asc" }] },
          },
        },
      },
    });
    if (!payout) {
      return { ok: false, status: 404, error: "Prize payout not found" };
    }

    const roundId = payout.playerRoundCard.bingoRoundId;
    const bingoType = (
      await prisma.bingoRound.findUnique({
        where: { id: roundId },
        select: { bingo: { select: { bingoType: true } } },
      })
    )?.bingo.bingoType;
    if (!bingoType) {
      return { ok: false, status: 404, error: "Round not found" };
    }
    if (bingoType !== "BINGO_75") {
      return {
        ok: false,
        status: 422,
        error: "Card preview is only available for BINGO_75",
      };
    }

    const balls = await prisma.bingoRoundBall.findMany({
      where: { roundId },
      orderBy: { drawOrder: "asc" },
      select: { number: true },
    });
    const drawnNumbers = balls.map((b) => b.number);
    const drawn = new Set(drawnNumbers);

    const cells: Bingo75Cell[] = payout.playerRoundCard.cells.map((c) => ({
      row: c.row,
      col: c.col,
      number: c.number,
      isFree: c.isFree,
    }));
    const marked = buildMarkedGrid(cells, drawn);
    const figure = payout.bingoPrize.figure;
    const highlight = figureHighlightSlots(figure, marked);

    return {
      ok: true,
      data: {
        bingoType,
        kind: "prize",
        figure,
        grid: cellsToGrid5(payout.playerRoundCard.cells),
        highlight,
        drawnNumbers,
      },
    };
  }

  return {
    ok: false,
    status: 400,
    error: "This transaction has no carton or prize detail",
  };
}
