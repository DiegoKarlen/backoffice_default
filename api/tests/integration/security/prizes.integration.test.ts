import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { evaluateRoundPrizesAfterBall } from "../../../src/game-engine/bingo/bingo-75/prize-evaluator.js";
import { prisma } from "../../../src/lib/prisma.js";
import { settleDeferredSplitPrizesForRound } from "../../../src/services/settle-deferred-split-prizes.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { row0DrawnNumbers } from "../../helpers/fixtures/card-cells.js";
import { cleanupPrizeRoundFixture, createPrizeRoundFixture } from "../../helpers/fixtures/prize-round.js";
import { cleanupRbacFixture, createRbacFixture } from "../../helpers/fixtures/rbac-users.js";
import { apiFetch, startTestHttpServer, type TestHttpServer } from "../../helpers/http-test-server.js";

describe("[integration][security] prize credits", () => {
  let db = false;
  let http: TestHttpServer | null = null;

  before(async () => {
    db = await isDatabaseAvailable();
    if (db) {
      http = await startTestHttpServer();
    }
  });

  after(async () => {
    if (http) await http.close();
    await disconnectDatabase();
  });

  it("prize-credits without engine win returns 404", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx = await createRbacFixture(`prize-404-${Date.now()}`);
    const roundFx = await createPrizeRoundFixture({ suffix: `no-win-${Date.now()}` });
    try {
      const res = await apiFetch(
        http.baseUrl,
        `/backoffice/players/${roundFx.playerAId}/prize-credits`,
        {
          method: "POST",
          token: fx.adminToken,
          body: JSON.stringify({
            bingoPrizeId: roundFx.prizeLineId,
            playerRoundCardId: roundFx.cardAId,
          }),
        },
      );
      assert.equal(res.status, 404);
      const body = (await res.json()) as { error?: string };
      assert.match(body.error ?? "", /not registered by game engine/i);
    } finally {
      await cleanupPrizeRoundFixture(roundFx);
      await cleanupRbacFixture(fx);
    }
  });

  it("prize-credits with deferred win credits wallet and second call returns 409", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx = await createRbacFixture(`prize-409-${Date.now()}`);
    const roundFx = await createPrizeRoundFixture({
      suffix: `win-${Date.now()}`,
      prizeSettlementTiming: "AT_ROUND_END",
    });
    try {
      await evaluateRoundPrizesAfterBall({
        bingoRoundId: roundFx.roundId,
        bingoId: roundFx.bingoId,
        drawnNumbers: row0DrawnNumbers(roundFx.cellsA),
      });

      const deferred = await prisma.deferredRoundPrizeWin.findFirst({
        where: {
          bingoRoundId: roundFx.roundId,
          playerRoundCardId: roundFx.cardAId,
          bingoPrizeId: roundFx.prizeLineId,
        },
      });
      assert.ok(deferred);

      const first = await apiFetch(
        http.baseUrl,
        `/backoffice/players/${roundFx.playerAId}/prize-credits`,
        {
          method: "POST",
          token: fx.adminToken,
          body: JSON.stringify({
            bingoPrizeId: roundFx.prizeLineId,
            playerRoundCardId: roundFx.cardAId,
          }),
        },
      );
      assert.equal(first.status, 201);
      const firstBody = (await first.json()) as { payoutId?: string; balanceCents?: number };
      assert.ok(firstBody.payoutId);
      assert.equal(firstBody.balanceCents, 1_000);

      const walletTxCount = await prisma.walletTransaction.count({
        where: { prizePayoutId: firstBody.payoutId },
      });
      assert.equal(walletTxCount, 1);

      const second = await apiFetch(
        http.baseUrl,
        `/backoffice/players/${roundFx.playerAId}/prize-credits`,
        {
          method: "POST",
          token: fx.adminToken,
          body: JSON.stringify({
            bingoPrizeId: roundFx.prizeLineId,
            playerRoundCardId: roundFx.cardAId,
          }),
        },
      );
      assert.equal(second.status, 409);
    } finally {
      await cleanupPrizeRoundFixture(roundFx);
      await cleanupRbacFixture(fx);
    }
  });

  it("concurrent settlement produces a single payout per card", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const roundFx = await createPrizeRoundFixture({
      suffix: `conc-${Date.now()}`,
      prizePayoutMode: "DEFERRED_SPLIT_AT_ROUND_END",
      prizeSettlementTiming: "AT_ROUND_END",
    });
    try {
      await evaluateRoundPrizesAfterBall({
        bingoRoundId: roundFx.roundId,
        bingoId: roundFx.bingoId,
        drawnNumbers: row0DrawnNumbers(roundFx.cellsA),
      });

      const [a, b] = await Promise.all([
        settleDeferredSplitPrizesForRound({ bingoRoundId: roundFx.roundId }),
        settleDeferredSplitPrizesForRound({ bingoRoundId: roundFx.roundId }),
      ]);

      const payouts = await prisma.prizePayout.findMany({
        where: { bingoPrizeId: roundFx.prizeLineId },
      });
      assert.equal(payouts.length, 2);
      assert.equal(payouts.reduce((sum, p) => sum + p.amountCents, 0), 1_000);

      const allCredits = [...a, ...b];
      const uniquePayoutIds = new Set(allCredits.map((c) => c.payoutId));
      assert.equal(uniquePayoutIds.size, 2);
    } finally {
      await cleanupPrizeRoundFixture(roundFx);
    }
  });
});
