import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { evaluateRoundPrizesAfterBall } from "../../../src/game-engine/bingo/bingo-75/prize-evaluator.js";
import { settleDeferredSplitPrizesForRound } from "../../../src/services/settle-deferred-split-prizes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { row0DrawnNumbers } from "../../helpers/fixtures/card-cells.js";
import { cleanupPrizeRoundFixture, createPrizeRoundFixture } from "../../helpers/fixtures/prize-round.js";

describe("[integration][prizes] inactive player omitted from payout", () => {
  let db = false;

  before(async () => {
    db = await isDatabaseAvailable();
  });

  after(async () => {
    await disconnectDatabase();
  });

  it("only active player receives deferred win and payout", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `i-${Date.now()}`;
    const fx = await createPrizeRoundFixture({ suffix });
    try {
      await prisma.player.update({ where: { id: fx.playerAId }, data: { active: false } });

      const drawn = row0DrawnNumbers(fx.cellsA);
      const credited: string[] = [];
      await evaluateRoundPrizesAfterBall({
        bingoRoundId: fx.roundId,
        bingoId: fx.bingoId,
        drawnNumbers: drawn,
        onPrizeCredited: (p) => credited.push(p.playerRoundCardId),
      });

      assert.deepEqual(credited, [fx.cardBId]);
      assert.equal(
        await prisma.deferredRoundPrizeWin.count({ where: { bingoRoundId: fx.roundId } }),
        1,
      );

      await settleDeferredSplitPrizesForRound({ bingoRoundId: fx.roundId });

      const payouts = await prisma.prizePayout.findMany({ where: { bingoPrizeId: fx.prizeLineId } });
      assert.equal(payouts.length, 1);
      assert.equal(payouts[0]!.playerRoundCardId, fx.cardBId);
    } finally {
      await cleanupPrizeRoundFixture(fx);
    }
  });
});
