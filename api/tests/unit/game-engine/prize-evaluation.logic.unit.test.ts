import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { BingoFigure } from "@prisma/client";

import { figureCompletionDrawIndex } from "../../../src/game-engine/bingo/bingo-75/figures.js";

import { computeDeferredWinsAfterBall } from "../../../src/game-engine/bingo/bingo-75/prize-evaluation.logic.js";

import { cardPrizeKey } from "../../../src/game-engine/bingo/bingo-75/prize-evaluation.repo.js";

import {

  generateBingo75Cells,

  type CardCellInput,

} from "../../../src/game-engine/bingo/bingo-75/player-card.js";

import { row0DrawnNumbers, twoDistinctCardsSameRow0 } from "../../helpers/fixtures/card-cells.js";



function cardDrawNumbers(cells: CardCellInput[]): number[] {

  return cells

    .filter((c) => !c.isFree && c.number != null)

    .map((c) => c.number as number);

}



/** Build draw order where full house completes on the given 1-based ball number. */

function drawnThroughFullHouseOnBall(cells: CardCellInput[], completionBall: number): number[] {

  const onCard = cardDrawNumbers(cells);

  assert.ok(completionBall >= onCard.length, "completion ball must fit all marked cells");



  const filler: number[] = [];

  for (let n = 1; n <= 75 && filler.length < completionBall + 10; n++) {

    if (!onCard.includes(n)) filler.push(n);

  }



  const last = onCard[onCard.length - 1]!;

  const rest = onCard.slice(0, -1);

  const prefixLen = completionBall - 1;

  const prefix: number[] = [];

  let ri = 0;

  let fi = 0;

  while (prefix.length < prefixLen) {

    if (ri < rest.length) {

      prefix.push(rest[ri++]!);

    } else {

      prefix.push(filler[fi++]!);

    }

  }

  const drawn = [...prefix, last];

  assert.equal(

    figureCompletionDrawIndex("FULL_HOUSE", cells, drawn) + 1,

    completionBall,

    "fixture must complete full house on expected ball",

  );

  return drawn;

}



const emptyAwardState = {

  deferredByCardPrize: new Set<string>(),

  immediateByCardPrize: new Set<string>(),

  prizeIdsWithDeferredInRound: new Set<string>(),

  prizeIdsWithImmediateInRound: new Set<string>(),

};



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

      prizes: [{ id: prizeId, figure: BingoFigure.LINE }],

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



  it("includes all winners on the earliest completion ball", () => {

    const [cellsA, cellsB] = twoDistinctCardsSameRow0();

    const drawn = row0DrawnNumbers(cellsA);

    const prizeId = "prize-line-u";



    const { newWins } = computeDeferredWinsAfterBall({

      prizes: [{ id: prizeId, figure: BingoFigure.LINE }],

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



  it("does not award a figure again after it was already won in the round", () => {

    const [cellsA, cellsB] = twoDistinctCardsSameRow0();

    const drawn = row0DrawnNumbers(cellsA);

    const prizeId = "prize-line-closed";

    const cards = [

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

    ];



    const first = computeDeferredWinsAfterBall({

      prizes: [{ id: prizeId, figure: BingoFigure.LINE }],

      cards,

      drawnNumbers: drawn,

      awardState: emptyAwardState,

    });

    assert.equal(first.newWins.length, 2);



    const stateAfterFirst = {

      deferredByCardPrize: new Set(

        first.newWins.map((w) => cardPrizeKey(w.playerRoundCardId, w.bingoPrizeId)),

      ),

      immediateByCardPrize: new Set<string>(),

      prizeIdsWithDeferredInRound: new Set([prizeId]),

      prizeIdsWithImmediateInRound: new Set<string>(),

    };



    const laterDraw = [...drawn, 72, 73, 74, 75];

    const second = computeDeferredWinsAfterBall({

      prizes: [{ id: prizeId, figure: BingoFigure.LINE }],

      cards,

      drawnNumbers: laterDraw,

      awardState: stateAfterFirst,

    });

    assert.equal(second.newWins.length, 0);

  });



  it("awards JACKPOT when full house completes before jackpotMaxBall", () => {

    const cells = generateBingo75Cells();

    const drawn = drawnThroughFullHouseOnBall(cells, 35);

    const jackpotPrizeId = "prize-jackpot";



    const { newWins } = computeDeferredWinsAfterBall({

      prizes: [{ id: jackpotPrizeId, figure: BingoFigure.JACKPOT }],

      cards: [

        {

          id: "card-j",

          playerId: "p1",

          createdAt: new Date("2026-01-01T10:00:00Z"),

          cardIndex: 0,

          cells,

          player: { id: "p1", active: true, username: "jack" },

        },

      ],

      drawnNumbers: drawn,

      awardState: emptyAwardState,

      jackpotMaxBall: 40,

    });



    assert.equal(newWins.length, 1);

    assert.equal(newWins[0]?.figure, BingoFigure.JACKPOT);

    assert.equal(newWins[0]?.bingoPrizeId, jackpotPrizeId);

  });



  it("does not award JACKPOT when full house completes on or after jackpotMaxBall", () => {

    const cells = generateBingo75Cells();

    const drawn = drawnThroughFullHouseOnBall(cells, 40);

    const jackpotPrizeId = "prize-jackpot";



    const { newWins } = computeDeferredWinsAfterBall({

      prizes: [{ id: jackpotPrizeId, figure: BingoFigure.JACKPOT }],

      cards: [

        {

          id: "card-j",

          playerId: "p1",

          createdAt: new Date("2026-01-01T10:00:00Z"),

          cardIndex: 0,

          cells,

          player: { id: "p1", active: true, username: "jack" },

        },

      ],

      drawnNumbers: drawn,

      awardState: emptyAwardState,

      jackpotMaxBall: 40,

    });



    assert.equal(newWins.length, 0);

  });

});

