import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { evaluateRoundPrizesAfterBall } from "../../../src/game-engine/bingo/bingo-75/prize-evaluator.js";
import { settleDeferredSplitPrizesForRound } from "../../../src/services/settle-deferred-split-prizes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { row0DrawnNumbers } from "../../helpers/fixtures/card-cells.js";
import { cleanupPrizeRoundFixture, createPrizeRoundFixture } from "../../helpers/fixtures/prize-round.js";

describe("[integration][prizes] LINE — pago inmediato al salir la figura", () => {
  let db = false;

  before(async () => {
    db = await isDatabaseAvailable();
  });

  after(async () => {
    await disconnectDatabase();
  });

  it("acredita wallet al evaluar sin esperar al cierre de partida", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `imm-${Date.now()}`;
    const fx = await createPrizeRoundFixture({
      suffix,
      prizeSettlementTiming: "ON_FIGURE",
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
      assert.ok(payloads.every((x) => x.deferred === false && x.amount === 1000));
      assert.equal(await prisma.deferredRoundPrizeWin.count({ where: { bingoRoundId: fx.roundId } }), 0);
      assert.equal(await prisma.prizePayout.count({ where: { bingoPrizeId: fx.prizeLineId } }), 2);

      await settleDeferredSplitPrizesForRound({ bingoRoundId: fx.roundId });
      assert.equal(await prisma.prizePayout.count({ where: { bingoPrizeId: fx.prizeLineId } }), 2);
    } finally {
      await cleanupPrizeRoundFixture(fx);
    }
  });
});
