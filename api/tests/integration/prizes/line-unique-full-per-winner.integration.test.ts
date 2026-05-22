import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { evaluateRoundPrizesAfterBall } from "../../../src/game-engine/bingo/bingo-75/prize-evaluator.js";
import { settleDeferredSplitPrizesForRound } from "../../../src/services/settle-deferred-split-prizes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { row0DrawnNumbers } from "../../helpers/fixtures/card-cells.js";
import { cleanupPrizeRoundFixture, createPrizeRoundFixture } from "../../helpers/fixtures/prize-round.js";

describe("[integration][prizes] LINE uniquePerRound — full amount per winner at settlement", () => {
  let db = false;

  before(async () => {
    db = await isDatabaseAvailable();
  });

  after(async () => {
    await disconnectDatabase();
  });

  it("defers both winners then pays full LINE to each on settlement", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `u-${Date.now()}`;
    const fx = await createPrizeRoundFixture({ uniquePerRound: true, suffix });
    try {
      const drawn = row0DrawnNumbers(fx.cellsA);
      const credited: string[] = [];
      const shouldEnd = await evaluateRoundPrizesAfterBall({
        bingoRoundId: fx.roundId,
        bingoId: fx.bingoId,
        drawnNumbers: drawn,
        onPrizeCredited: (p) => credited.push(p.playerRoundCardId),
      });

      assert.equal(shouldEnd, false);
      assert.equal(credited.length, 2);
      assert.equal(await prisma.prizePayout.count({ where: { bingoPrizeId: fx.prizeLineId } }), 0);
      assert.equal(
        await prisma.deferredRoundPrizeWin.count({ where: { bingoRoundId: fx.roundId } }),
        2,
      );

      await settleDeferredSplitPrizesForRound({ bingoRoundId: fx.roundId });

      const payouts = await prisma.prizePayout.findMany({ where: { bingoPrizeId: fx.prizeLineId } });
      assert.equal(payouts.length, 2);
      assert.equal(payouts.every((p) => p.amountCents === 1000), true);
    } finally {
      await cleanupPrizeRoundFixture(fx);
    }
  });
});
