import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { evaluateRoundPrizesAfterBall } from "../../../src/game-engine/bingo/bingo-75/prize-evaluator.js";
import { settleDeferredSplitPrizesForRound } from "../../../src/services/settle-deferred-split-prizes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { row0DrawnNumbers } from "../../helpers/fixtures/card-cells.js";
import { cleanupPrizeRoundFixture, createPrizeRoundFixture } from "../../helpers/fixtures/prize-round.js";

describe("[integration][prizes] deferred split — settlement clears deferred rows", () => {
  let db = false;

  before(async () => {
    db = await isDatabaseAvailable();
  });

  after(async () => {
    await disconnectDatabase();
  });

  it("records deferred winners then pays and removes deferred rows", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `d-${Date.now()}`;
    const fx = await createPrizeRoundFixture({
      uniquePerRound: false,
      suffix,
      prizePayoutMode: "DEFERRED_SPLIT_AT_ROUND_END",
    });
    try {
      const drawn = row0DrawnNumbers(fx.cellsA);
      const payloads: Array<{ deferred?: boolean; amount?: number }> = [];
      await evaluateRoundPrizesAfterBall({
        bingoRoundId: fx.roundId,
        bingoId: fx.bingoId,
        drawnNumbers: drawn,
        onPrizeCredited: (p) =>
          payloads.push({
            deferred: p.deferredSettlement === true,
            amount: p.amountCents ?? undefined,
          }),
      });

      assert.equal(payloads.length, 2);
      assert.ok(payloads.every((x) => x.deferred === true && x.amount === undefined));
      assert.equal(
        await prisma.deferredRoundPrizeWin.count({ where: { bingoRoundId: fx.roundId } }),
        2,
      );
      assert.equal(await prisma.prizePayout.count({ where: { bingoPrizeId: fx.prizeLineId } }), 0);

      await settleDeferredSplitPrizesForRound({ bingoRoundId: fx.roundId });

      const payouts = await prisma.prizePayout.findMany({ where: { bingoPrizeId: fx.prizeLineId } });
      assert.equal(payouts.length, 2);
      assert.equal(payouts.reduce((a, p) => a + p.amountCents, 0), 1000);
      assert.equal(
        await prisma.deferredRoundPrizeWin.count({ where: { bingoRoundId: fx.roundId } }),
        0,
      );
    } finally {
      await cleanupPrizeRoundFixture(fx);
    }
  });
});
