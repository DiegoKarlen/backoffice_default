import type { BingoFigure } from "@prisma/client";
import {
  BINGO_FIGURE_EVAL_ORDER,
  buildMarkedGrid,
  figureCompletionDrawIndex,
  winsFullHouse,
  type Bingo75Cell,
} from "./figures.js";
import { sortCardsForTieBreak } from "./prize-winner-order.js";
import {
  cardPrizeKey,
  type BingoPrizeRow,
  type RoundAwardState,
  type RoundCardRow,
} from "./prize-evaluation.repo.js";

export type DeferredWinCandidate = {
  bingoPrizeId: string;
  figure: BingoFigure;
  playerId: string;
  playerUsername: string;
  playerRoundCardId: string;
};

type CardWithCells75 = RoundCardRow & { cells75: Bingo75Cell[] };

type EligibleCard = CardWithCells75 & { completionIndex: number };

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

function sortPrizesByEvalOrder(prizes: BingoPrizeRow[]): BingoPrizeRow[] {
  return [...prizes].sort(
    (a, b) =>
      BINGO_FIGURE_EVAL_ORDER.indexOf(a.figure) - BINGO_FIGURE_EVAL_ORDER.indexOf(b.figure),
  );
}

function prepareCards(cards: RoundCardRow[]): CardWithCells75[] {
  const sorted = sortCardsForTieBreak(cards) as RoundCardRow[];
  return sorted.map((card) => ({
    ...card,
    cells75: cellsTo75(card.cells),
  }));
}

function cloneAwardState(state: RoundAwardState): RoundAwardState {
  return {
    deferredByCardPrize: new Set(state.deferredByCardPrize),
    immediateByCardPrize: new Set(state.immediateByCardPrize),
    prizeIdsWithDeferredInRound: new Set(state.prizeIdsWithDeferredInRound),
    prizeIdsWithImmediateInRound: new Set(state.prizeIdsWithImmediateInRound),
  };
}

/**
 * Pure evaluation: which deferred wins to register and whether FULL_HOUSE ends the round.
 * Uses a local copy of award state (simulates in-memory updates after each win in eval order).
 */
export function computeDeferredWinsAfterBall(params: {
  prizes: BingoPrizeRow[];
  cards: RoundCardRow[];
  drawnNumbers: number[];
  awardState: RoundAwardState;
}): { newWins: DeferredWinCandidate[]; shouldEndRound: boolean } {
  const drawn = new Set(params.drawnNumbers);
  const drawnOrdered = params.drawnNumbers;
  const prizes = sortPrizesByEvalOrder(params.prizes);
  const cardsWithCells75 = prepareCards(params.cards);

  const {
    deferredByCardPrize,
    immediateByCardPrize,
    prizeIdsWithDeferredInRound,
    prizeIdsWithImmediateInRound,
  } = cloneAwardState(params.awardState);

  const newWins: DeferredWinCandidate[] = [];

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
      const key = cardPrizeKey(card.id, prize.id);
      deferredByCardPrize.add(key);
      prizeIdsWithDeferredInRound.add(prize.id);

      newWins.push({
        bingoPrizeId: prize.id,
        figure: prize.figure,
        playerId: card.playerId,
        playerUsername: card.player.username,
        playerRoundCardId: card.id,
      });
    }
  }

  for (const card of cardsWithCells75) {
    const marked = buildMarkedGrid(card.cells75, drawn);
    if (winsFullHouse(marked)) {
      return { newWins, shouldEndRound: true };
    }
  }

  return { newWins, shouldEndRound: false };
}
