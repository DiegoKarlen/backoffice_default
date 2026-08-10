import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { evaluateRoundPrizesAfterBall } from "../../../src/game-engine/bingo/bingo-75/prize-evaluator.js";
import { settleDeferredSplitPrizesForRound } from "../../../src/services/settle-deferred-split-prizes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { row0DrawnNumbers } from "../../helpers/fixtures/card-cells.js";
import { cleanupPrizeRoundFixture, createPrizeRoundFixture } from "../../helpers/fixtures/prize-round.js";

describe("[integration][prizes] LINE — both cards win on same ball", () => {
  let db = false;

  before(async () => {
    db = await isDatabaseAvailable();
  });

  after(async () => {
    await disconnectDatabase();
  });

  it("credits both cards deferred then full LINE each at settlement", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `m-${Date.now()}`;
    const fx = await createPrizeRoundFixture({ suffix });
    try {
      const drawn = row0DrawnNumbers(fx.cellsA);
      const credited: string[] = [];
      await evaluateRoundPrizesAfterBall({
        bingoRoundId: fx.roundId,
        bingoId: fx.bingoId,
        drawnNumbers: drawn,
        onPrizeCredited: (p) => credited.push(p.playerRoundCardId),
      });

      assert.equal(credited.length, 2);
      const ids = new Set(credited);
      assert.ok(ids.has(fx.cardAId));
      assert.ok(ids.has(fx.cardBId));

      await settleDeferredSplitPrizesForRound({ bingoRoundId: fx.roundId });

      const payouts = await prisma.prizePayout.findMany({ where: { bingoPrizeId: fx.prizeLineId } });
      assert.equal(payouts.length, 2);
      assert.equal(payouts.every((p) => p.amountCents === 1000), true);
    } finally {
      await cleanupPrizeRoundFixture(fx);
    }
  });
});
