import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BingoRoundStatus } from "@prisma/client";
import { prisma } from "../../../src/lib/prisma.js";
import { purchaseCartonsForRound } from "../../../src/services/carton-purchase.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import {
  cleanupPurchaseRoundFixture,
  createPurchaseRoundFixture,
} from "../../helpers/fixtures/purchase-round.js";

describe("[integration][wallet] carton purchase — kickoff race", () => {
  let db = false;

  before(async () => {
    db = await isDatabaseAvailable();
  });

  after(async () => {
    await disconnectDatabase();
  });

  it("rejects purchase when round is DRAWING (revalidated under row lock)", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `race-${Date.now()}`;
    const fx = await createPurchaseRoundFixture(suffix);

    try {
      await prisma.bingoRound.update({
        where: { id: fx.roundId },
        data: { status: BingoRoundStatus.DRAWING },
      });

      await assert.rejects(
        () =>
          purchaseCartonsForRound({
            playerId: fx.playerId,
            bingoRoundId: fx.roundId,
            quantity: 1,
          }),
        /not open for purchases/,
      );

      const wallet = await prisma.wallet.findUnique({ where: { playerId: fx.playerId } });
      assert.equal(wallet!.balanceCents, 50_000);
    } finally {
      await cleanupPurchaseRoundFixture(fx);
    }
  });
});
