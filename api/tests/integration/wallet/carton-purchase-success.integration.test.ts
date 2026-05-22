import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../../src/lib/prisma.js";
import { purchaseCartonsForRound } from "../../../src/services/carton-purchase.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import {
  cleanupPurchaseRoundFixture,
  createPurchaseRoundFixture,
} from "../../helpers/fixtures/purchase-round.js";

describe("[integration][wallet] carton purchase — happy path", () => {
  let db = false;

  before(async () => {
    db = await isDatabaseAvailable();
  });

  after(async () => {
    await disconnectDatabase();
  });

  it("debits wallet and creates unique cards", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `buy-${Date.now()}`;
    const fx = await createPurchaseRoundFixture(suffix);
    try {
      const quantity = 2;
      const expectedTotal = fx.unitPriceCents * quantity;

      const result = await purchaseCartonsForRound({
        playerId: fx.playerId,
        bingoRoundId: fx.roundId,
        quantity,
      });

      assert.equal(result.totalCents, expectedTotal);
      assert.equal(result.playerRoundCardIds.length, quantity);

      const wallet = await prisma.wallet.findUnique({ where: { playerId: fx.playerId } });
      assert.equal(wallet!.balanceCents, 50_000 - expectedTotal);

      const cards = await prisma.playerRoundCard.findMany({
        where: { bingoRoundId: fx.roundId, playerId: fx.playerId },
      });
      assert.equal(cards.length, quantity);
      const fps = new Set(cards.map((c) => c.cardFingerprint));
      assert.equal(fps.size, quantity);
    } finally {
      await cleanupPurchaseRoundFixture(fx);
    }
  });
});
