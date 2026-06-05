import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BingoFigure } from "@prisma/client";
import { computeDeferredWinsAfterBall } from "../../../src/game-engine/bingo/bingo-75/prize-evaluation.logic.js";
import { cardPrizeKey } from "../../../src/game-engine/bingo/bingo-75/prize-evaluation.repo.js";
import { row0DrawnNumbers, twoDistinctCardsSameRow0 } from "../../helpers/fixtures/card-cells.js";

describe("[unit] prize-evaluation.logic", () => {
  it("detects LINE winner and does not duplicate when already deferred", () => {
    const [cells] = twoDistinctCardsSameRow0();
    const cardId = "card-1";
    const prizeId = "prize-line";
    const drawn = row0DrawnNumbers(cells);

    const awardState = {
      deferredByCardPrize: new Set<string>(),
      immediateByCardPrize: new Set<string>(),
      prizeIdsWithDeferredInRound: new Set<string>(),
      prizeIdsWithImmediateInRound: new Set<string>(),
    };

    const base = {
      prizes: [{ id: prizeId, figure: BingoFigure.LINE, uniquePerRound: false }],
      cards: [
        {
          id: cardId,
          playerId: "p1",
          createdAt: new Date("2026-01-01T10:00:00Z"),
          cardIndex: 0,
          cells,
          player: { id: "p1", active: true, username: "alice" },
        },
      ],
      drawnNumbers: drawn,
      awardState,
    };

    const first = computeDeferredWinsAfterBall(base);
    assert.equal(first.newWins.length, 1);
    assert.equal(first.newWins[0]?.playerRoundCardId, cardId);
    assert.equal(first.shouldEndRound, false);

    const second = computeDeferredWinsAfterBall({
      ...base,
      awardState: {
        ...awardState,
        deferredByCardPrize: new Set([cardPrizeKey(cardId, prizeId)]),
        prizeIdsWithDeferredInRound: new Set([prizeId]),
      },
    });
    assert.equal(second.newWins.length, 0);
  });

  it("uniquePerRound includes all winners on the earliest completion ball", () => {
    const [cellsA, cellsB] = twoDistinctCardsSameRow0();
    const drawn = row0DrawnNumbers(cellsA);
    const prizeId = "prize-line-u";

    const { newWins } = computeDeferredWinsAfterBall({
      prizes: [{ id: prizeId, figure: BingoFigure.LINE, uniquePerRound: true }],
      cards: [
        {
          id: "c-a",
          playerId: "p1",
          createdAt: new Date("2026-01-01T10:00:00Z"),
          cardIndex: 0,
          cells: cellsA,
          player: { id: "p1", active: true, username: "a" },
        },
        {
          id: "c-b",
          playerId: "p2",
          createdAt: new Date("2026-01-01T10:01:00Z"),
          cardIndex: 0,
          cells: cellsB,
          player: { id: "p2", active: true, username: "b" },
        },
      ],
      drawnNumbers: drawn,
      awardState: {
        deferredByCardPrize: new Set(),
        immediateByCardPrize: new Set(),
        prizeIdsWithDeferredInRound: new Set(),
        prizeIdsWithImmediateInRound: new Set(),
      },
    });

    assert.equal(newWins.length, 2);
    assert.ok(newWins.every((w) => w.bingoPrizeId === prizeId));
  });
});
