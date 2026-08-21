import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  BingoDrawMode,
  BingoRoundStatus,
  BingoStatus,
  BingoType,
  Prisma,
} from "@prisma/client";
import { BingoLiveSession } from "../../../src/game-engine/bingo/live-session.js";
import { hashPassword } from "../../../src/lib/password.js";
import { prisma } from "../../../src/lib/prisma.js";
import { purchaseCartonsForRound } from "../../../src/services/carton-purchase.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";

describe("[integration][security] game phase 1 hardening", () => {
  let db = false;

  before(async () => {
    db = await isDatabaseAvailable();
  });

  after(async () => {
    await disconnectDatabase();
  });

  async function createLiveRoundFixture(suffix: string) {
    const pwd = await hashPassword("TestPass123!");
    const cardPrice = new Prisma.Decimal("10.0000");

    const room = await prisma.room.create({
      data: { name: `gp1-room-${suffix}`, slug: `gp1-room-${suffix}`, status: "ACTIVE" },
    });

    const now = Date.now();
    const bingo = await prisma.bingo.create({
      data: {
        roomId: room.id,
        name: `gp1-bingo-${suffix}`,
        status: BingoStatus.ACTIVE,
        bingoType: BingoType.BINGO_75,
        drawMode: BingoDrawMode.LIVE,
        startDateTime: new Date(now - 60_000),
        endDateTime: new Date(now + 86_400_000),
        repeatEveryMinutes: 60,
        cardPrice,
        minPlayersToStart: 1,
      },
    });

    const round = await prisma.bingoRound.create({
      data: {
        bingoId: bingo.id,
        sequence: 1,
        startsAt: new Date(now - 1000),
        status: BingoRoundStatus.DRAWING,
      },
    });

    const player = await prisma.player.create({
      data: {
        email: `gp1-${suffix}@test.local`,
        username: `gp1_${suffix}`,
        passwordHash: pwd,
        active: true,
        wallet: { create: { balanceCents: 50_000 } },
      },
    });

    const admin = await prisma.user.create({
      data: {
        email: `gp1-admin-${suffix}@test.local`,
        passwordHash: pwd,
        active: true,
      },
    });

    return { room, bingo, round, player, admin, suffix };
  }

  async function cleanupLiveRoundFixture(fx: Awaited<ReturnType<typeof createLiveRoundFixture>>) {
    const steps = [
      () => prisma.adminAuditLog.deleteMany({ where: { adminUserId: fx.admin.id } }),
      () => prisma.bingoRoundBall.deleteMany({ where: { roundId: fx.round.id } }),
      () => prisma.walletTransaction.deleteMany({ where: { wallet: { playerId: fx.player.id } } }),
      () => prisma.playerRoundCard.deleteMany({ where: { bingoRoundId: fx.round.id } }),
      () => prisma.cartonPurchase.deleteMany({ where: { bingoRoundId: fx.round.id } }),
      () => prisma.wallet.deleteMany({ where: { playerId: fx.player.id } }),
      () => prisma.player.delete({ where: { id: fx.player.id } }),
      () => prisma.user.delete({ where: { id: fx.admin.id } }),
      () => prisma.bingoRound.delete({ where: { id: fx.round.id } }),
      () => prisma.bingo.delete({ where: { id: fx.bingo.id } }),
      () => prisma.room.delete({ where: { id: fx.room.id } }),
    ];
    for (const step of steps) {
      try {
        await step();
      } catch {
        /* best-effort */
      }
    }
  }

  it("serializes duplicate live ball marks — only one succeeds", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `dup-${Date.now()}`;
    const fx = await createLiveRoundFixture(suffix);
    const session = new BingoLiveSession(fx.room.id, fx.room.slug, fx.room.name);
    try {
      await session.startDrawingRound({
        occ: { startsAt: new Date().toISOString(), startsAtMs: Date.now() },
        round: { id: fx.round.id, sequence: fx.round.sequence },
        bingo: {
          id: fx.bingo.id,
          name: fx.bingo.name,
          bingoType: BingoType.BINGO_75,
          drawMode: BingoDrawMode.LIVE,
          prizeMode: "FIXED",
          jackpotEnabled: false,
          jackpotMaxBall: null,
          prizes: [],
        },
        ballQueue: [],
      });

      const [a, b] = await Promise.all([
        session.registerDrawnBall(12, fx.admin.id),
        session.registerDrawnBall(12, fx.admin.id),
      ]);

      const okCount = [a, b].filter((r) => r.ok).length;
      const dupCount = [a, b].filter((r) => !r.ok && r.error === "Ball already drawn").length;
      assert.equal(okCount, 1);
      assert.equal(dupCount, 1);

      const balls = await prisma.bingoRoundBall.findMany({ where: { roundId: fx.round.id } });
      assert.equal(balls.length, 1);
      assert.equal(balls[0]!.number, 12);
    } finally {
      await session.requestStop().catch(() => {});
      await cleanupLiveRoundFixture(fx);
    }
  });

  it("manual stop refunds cartons and writes ROUND_STOPPED audit", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `stop-${Date.now()}`;
    const fx = await createLiveRoundFixture(suffix);
    const session = new BingoLiveSession(fx.room.id, fx.room.slug, fx.room.name);
    try {
      await prisma.bingoRound.update({
        where: { id: fx.round.id },
        data: { status: BingoRoundStatus.SCHEDULED, startsAt: new Date(Date.now() + 60_000) },
      });

      const purchase = await purchaseCartonsForRound({
        playerId: fx.player.id,
        bingoRoundId: fx.round.id,
        quantity: 1,
      });
      assert.ok(purchase.cartonPurchaseId);

      await prisma.bingoRound.update({
        where: { id: fx.round.id },
        data: { status: BingoRoundStatus.DRAWING },
      });

      await session.startDrawingRound({
        occ: { startsAt: new Date().toISOString(), startsAtMs: Date.now() },
        round: { id: fx.round.id, sequence: fx.round.sequence },
        bingo: {
          id: fx.bingo.id,
          name: fx.bingo.name,
          bingoType: BingoType.BINGO_75,
          drawMode: BingoDrawMode.LIVE,
          prizeMode: "FIXED",
          jackpotEnabled: false,
          jackpotMaxBall: null,
          prizes: [],
        },
        ballQueue: [],
      });

      await session.requestStop(fx.admin.id);

      const round = await prisma.bingoRound.findUnique({ where: { id: fx.round.id } });
      assert.equal(round!.status, BingoRoundStatus.CANCELLED);
      assert.equal(round!.cancellationReason, "MANUAL_STOP");

      const wallet = await prisma.wallet.findUnique({ where: { playerId: fx.player.id } });
      assert.equal(wallet!.balanceCents, 50_000);

      const audit = await prisma.adminAuditLog.findFirst({
        where: { adminUserId: fx.admin.id, action: "ROUND_STOPPED", targetId: fx.round.id },
      });
      assert.ok(audit);
    } finally {
      await session.requestStop().catch(() => {});
      await cleanupLiveRoundFixture(fx);
    }
  });
});
