import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { evaluateRoundPrizesAfterBall } from "../../../src/game-engine/bingo/bingo-75/prize-evaluator.js";
import { prisma } from "../../../src/lib/prisma.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { row0DrawnNumbers } from "../../helpers/fixtures/card-cells.js";
import { cleanupPrizeRoundFixture, createPrizeRoundFixture } from "../../helpers/fixtures/prize-round.js";

describe("[integration][prizes] idempotent evaluation on repeated draw", () => {
  let db = false;

  before(async () => {
    db = await isDatabaseAvailable();
  });

  after(async () => {
    await disconnectDatabase();
  });

  it("second evaluateRoundPrizesAfterBall does not duplicate deferred rows", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `idem-${Date.now()}`;
    const fx = await createPrizeRoundFixture({ uniquePerRound: false, suffix });
    try {
      const drawn = row0DrawnNumbers(fx.cellsA);
      const params = {
        bingoRoundId: fx.roundId,
        bingoId: fx.bingoId,
        drawnNumbers: drawn,
      };

      await evaluateRoundPrizesAfterBall(params);
      assert.equal(
        await prisma.deferredRoundPrizeWin.count({ where: { bingoRoundId: fx.roundId } }),
        2,
      );

      await evaluateRoundPrizesAfterBall(params);
      assert.equal(
        await prisma.deferredRoundPrizeWin.count({ where: { bingoRoundId: fx.roundId } }),
        2,
      );
    } finally {
      await cleanupPrizeRoundFixture(fx);
    }
  });
});
