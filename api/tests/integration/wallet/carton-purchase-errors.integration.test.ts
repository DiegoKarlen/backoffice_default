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

describe("[integration][wallet] carton purchase — validation errors", () => {
  let db = false;

  before(async () => {
    db = await isDatabaseAvailable();
  });

  after(async () => {
    await disconnectDatabase();
  });

  it("rejects purchase when balance is insufficient", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `poor-${Date.now()}`;
    const fx = await createPurchaseRoundFixture(suffix);
    try {
      await prisma.wallet.update({
        where: { playerId: fx.playerId },
        data: { balanceCents: 50 },
      });

      await assert.rejects(
        () =>
          purchaseCartonsForRound({
            playerId: fx.playerId,
            bingoRoundId: fx.roundId,
            quantity: 2,
          }),
        /Insufficient balance/,
      );
    } finally {
      await cleanupPurchaseRoundFixture(fx);
    }
  });

  it("rejects purchase when round already started", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `late-${Date.now()}`;
    const fx = await createPurchaseRoundFixture(suffix);
    try {
      await prisma.bingoRound.update({
        where: { id: fx.roundId },
        data: { startsAt: new Date(Date.now() - 1000), status: BingoRoundStatus.SCHEDULED },
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
    } finally {
      await cleanupPurchaseRoundFixture(fx);
    }
  });
});
