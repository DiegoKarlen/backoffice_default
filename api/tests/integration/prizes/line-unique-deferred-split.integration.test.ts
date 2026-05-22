import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { evaluateRoundPrizesAfterBall } from "../../../src/game-engine/bingo/bingo-75/prize-evaluator.js";
import { settleDeferredSplitPrizesForRound } from "../../../src/services/settle-deferred-split-prizes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { row0DrawnNumbers } from "../../helpers/fixtures/card-cells.js";
import { cleanupPrizeRoundFixture, createPrizeRoundFixture } from "../../helpers/fixtures/prize-round.js";

describe("[integration][prizes] LINE uniquePerRound — deferred split pool at settlement", () => {
  let db = false;

  before(async () => {
    db = await isDatabaseAvailable();
  });

  after(async () => {
    await disconnectDatabase();
  });

  it("splits LINE pool 50/50 between same-draw winners", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `ud-${Date.now()}`;
    const fx = await createPrizeRoundFixture({
      uniquePerRound: true,
      suffix,
      prizePayoutMode: "DEFERRED_SPLIT_AT_ROUND_END",
    });
    try {
      const drawn = row0DrawnNumbers(fx.cellsA);
      await evaluateRoundPrizesAfterBall({
        bingoRoundId: fx.roundId,
        bingoId: fx.bingoId,
        drawnNumbers: drawn,
      });

      assert.equal(
        await prisma.deferredRoundPrizeWin.count({ where: { bingoRoundId: fx.roundId } }),
        2,
      );

      await settleDeferredSplitPrizesForRound({ bingoRoundId: fx.roundId });

      const payouts = await prisma.prizePayout.findMany({ where: { bingoPrizeId: fx.prizeLineId } });
      assert.equal(payouts.length, 2);
      assert.equal(payouts.reduce((a, p) => a + p.amountCents, 0), 1000);
      assert.equal(payouts.every((p) => p.amountCents === 500), true);
    } finally {
      await cleanupPrizeRoundFixture(fx);
    }
  });
});
