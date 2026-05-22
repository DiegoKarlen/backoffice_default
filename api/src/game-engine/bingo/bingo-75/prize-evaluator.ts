import { prisma } from "../../../lib/prisma.js";
import {
  BINGO_FIGURE_EVAL_ORDER,
  buildMarkedGrid,
  figureCompletionDrawIndex,
  winsFullHouse,
  type Bingo75Cell,
} from "./figures.js";
import { sortCardsForTieBreak } from "./prize-winner-order.js";
import type { EvaluateAfterBallParams, PrizeAwardBroadcastPayload } from "../types.js";

export type { PrizeAwardBroadcastPayload };

type RoundCard = Awaited<
  ReturnType<typeof prisma.playerRoundCard.findMany>
>[number] & {
  cells: Array<{
    row: number;
    col: number;
    number: number | null;
    isFree: boolean;
  }>;
  player: { id: string; active: boolean; username: string };
};

type CardWithCells75 = RoundCard & { cells75: Bingo75Cell[] };

type EligibleCard = CardWithCells75 & { completionIndex: number };

function cardPrizeKey(cardId: string, prizeId: string): string {
  return `${cardId}:${prizeId}`;
}

function cellsTo75(
  cells: Array<{ row: number; col: number; number: number | null; isFree: boolean }>,
): Bingo75Cell[] {
  return cells.map((c) => ({
    row: c.row,
    col: c.col,
    number: c.number,
    isFree: c.isFree,
  }));
}

/** Cartones que completaron la figura en la primera bolilla de la partida (misma bolilla = todos). */
function uniquePerRoundWinners(eligible: EligibleCard[]): EligibleCard[] {
  if (eligible.length === 0) return [];
  const firstBallIndex = Math.min(...eligible.map((e) => e.completionIndex));
  return eligible.filter((e) => e.completionIndex === firstBallIndex);
}

type RoundAwardState = {
  deferredByCardPrize: Set<string>;
  immediateByCardPrize: Set<string>;
  prizeIdsWithDeferredInRound: Set<string>;
  prizeIdsWithImmediateInRound: Set<string>;
};

async function loadRoundAwardState(bingoRoundId: string): Promise<RoundAwardState> {
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

/**
 * Tras cada bolilla: revisa cartones 75 y registra ganadores (sin acreditar wallet).
 *
 * Reglas (§3.2):
 * - Figuras en `BINGO_FIGURE_EVAL_ORDER` (línea, doble línea, letras B-I-N-G-O, perímetro, cartón lleno).
 * - La wallet se acredita siempre al cerrar la partida (`settleDeferredSplitPrizesForRound`).
 * - `prizePayoutMode` solo define cómo liquidar al cierre: monto completo por ganador vs reparto del pozo.
 * - Por premio: si `uniquePerRound`, la figura se paga una sola vez por partida (primera bolilla en que alguien la cumple).
 * - Un mismo cartón puede ganar varias figuras a medida que avanza el sorteo.
 * - La partida termina cuando cualquier cartón completa cartón lleno (FULL_HOUSE).
 *
 * @returns `true` si algún cartón tiene cartón lleno (corta el sorteo).
 */
export async function evaluateRoundPrizesAfterBall(
  params: EvaluateAfterBallParams,
): Promise<boolean> {
  const { bingoRoundId, bingoId, drawnNumbers } = params;
  const drawn = new Set(drawnNumbers);
  const drawnOrdered = drawnNumbers;

  const [prizesRaw, cardsRaw, awardState] = await Promise.all([
    prisma.bingoPrize.findMany({
      where: { bingoId },
      orderBy: { figure: "asc" },
    }),
    prisma.playerRoundCard.findMany({
      where: { bingoRoundId },
      include: {
        cells: { orderBy: [{ row: "asc" }, { col: "asc" }] },
        player: { select: { id: true, active: true, username: true } },
      },
    }),
    loadRoundAwardState(bingoRoundId),
  ]);

  const prizes = [...prizesRaw].sort(
    (a, b) =>
      BINGO_FIGURE_EVAL_ORDER.indexOf(a.figure) - BINGO_FIGURE_EVAL_ORDER.indexOf(b.figure),
  );

  const cards = sortCardsForTieBreak(cardsRaw) as RoundCard[];
  const cardsWithCells75: CardWithCells75[] = cards.map((card) => ({
    ...card,
    cells75: cellsTo75(card.cells),
  }));

  const {
    deferredByCardPrize,
    immediateByCardPrize,
    prizeIdsWithDeferredInRound,
    prizeIdsWithImmediateInRound,
  } = awardState;

  for (const prize of prizes) {
    if (prize.uniquePerRound) {
      if (
        prizeIdsWithDeferredInRound.has(prize.id) ||
        prizeIdsWithImmediateInRound.has(prize.id)
      ) {
        continue;
      }
    }

    const eligible: EligibleCard[] = [];

    for (const card of cardsWithCells75) {
      if (!card.player.active) continue;

      const key = cardPrizeKey(card.id, prize.id);
      if (immediateByCardPrize.has(key) || deferredByCardPrize.has(key)) continue;

      const completionIndex = figureCompletionDrawIndex(prize.figure, card.cells75, drawnOrdered);
      if (completionIndex < 0) continue;

      eligible.push({ ...card, completionIndex });
    }

    const toAward = prize.uniquePerRound ? uniquePerRoundWinners(eligible) : eligible;

    for (const card of toAward) {
      try {
        const row = await prisma.deferredRoundPrizeWin.create({
          data: {
            bingoRoundId,
            bingoPrizeId: prize.id,
            playerId: card.playerId,
            playerRoundCardId: card.id,
          },
        });

        const key = cardPrizeKey(card.id, prize.id);
        deferredByCardPrize.add(key);
        prizeIdsWithDeferredInRound.add(prize.id);

        params.onPrizeCredited?.({
          bingoRoundId,
          bingoId,
          playerId: card.playerId,
          playerUsername: card.player.username,
          playerRoundCardId: card.id,
          bingoPrizeId: prize.id,
          figure: prize.figure,
          deferredSettlement: true,
          payoutId: row.id,
        });
      } catch (e) {
        // Unique constraint race — treat as already awarded
        // eslint-disable-next-line no-console
        console.error("[bingo-75/prize-evaluator] deferredRoundPrizeWin create failed", e);
      }
    }
  }

  for (const card of cardsWithCells75) {
    const marked = buildMarkedGrid(card.cells75, drawn);
    if (winsFullHouse(marked)) return true;
  }

  return false;
}
