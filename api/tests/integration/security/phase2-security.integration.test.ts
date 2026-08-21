import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  BingoDrawMode,
  BingoRoundStatus,
  BingoStatus,
  BingoType,
  Prisma,
} from "@prisma/client";
import { finalizeBingoRoundAfterDraw } from "../../../src/lib/finalize-bingo-round.js";
import { getRoundPurchasedCardsForBo } from "../../../src/lib/bingo-round-bo-detail.js";
import { BO } from "../../../src/lib/functionality-codes.js";
import { hashPassword } from "../../../src/lib/password.js";
import { signAccessToken, signPlayerAccessToken } from "../../../src/lib/jwt.js";
import { prisma } from "../../../src/lib/prisma.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { apiFetch, startTestHttpServer, type TestHttpServer } from "../../helpers/http-test-server.js";
import { createRbacFixture, cleanupRbacFixture } from "../../helpers/fixtures/rbac-users.js";

describe("[integration][security] phase 2 remediation", () => {
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

  it("finalizeBingoRoundAfterDraw marks round COMPLETED on success", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `fin-${Date.now()}`;
    const room = await prisma.room.create({
      data: { name: `fin-room-${suffix}`, slug: `fin-room-${suffix}`, status: "ACTIVE" },
    });
    const bingo = await prisma.bingo.create({
      data: {
        roomId: room.id,
        name: `fin-bingo-${suffix}`,
        status: BingoStatus.ACTIVE,
        bingoType: BingoType.BINGO_75,
        drawMode: BingoDrawMode.VIRTUAL,
        startDateTime: new Date(Date.now() - 60_000),
        endDateTime: new Date(Date.now() + 86_400_000),
        repeatEveryMinutes: 60,
        cardPrice: new Prisma.Decimal("10"),
        minPlayersToStart: 1,
      },
    });
    const round = await prisma.bingoRound.create({
      data: {
        bingoId: bingo.id,
        sequence: 1,
        startsAt: new Date(Date.now() - 1000),
        status: BingoRoundStatus.DRAWING,
      },
    });
    try {
      await finalizeBingoRoundAfterDraw(round.id);
      const updated = await prisma.bingoRound.findUnique({ where: { id: round.id } });
      assert.equal(updated!.status, BingoRoundStatus.COMPLETED);
    } finally {
      await prisma.bingoRound.delete({ where: { id: round.id } }).catch(() => {});
      await prisma.bingo.delete({ where: { id: bingo.id } }).catch(() => {});
      await prisma.room.delete({ where: { id: room.id } }).catch(() => {});
    }
  });

  it("player password change invalidates existing JWT (tokenVersion)", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const suffix = `ptv-${Date.now()}`;
    const passwordHash = await hashPassword("OldPass123!");
    const player = await prisma.player.create({
      data: {
        email: `ptv-${suffix}@test.local`,
        username: `ptv_${suffix}`,
        passwordHash,
        wallet: { create: { balanceCents: 0, currencyCode: "ARS" } },
      },
    });
    const token = signPlayerAccessToken({ sub: player.id, email: player.email, tv: 0 });
    try {
      const ok = await apiFetch(http.baseUrl, "/player/wallet", { token });
      assert.equal(ok.status, 200);

      const change = await apiFetch(http.baseUrl, "/player/change-password", {
        method: "POST",
        token,
        body: JSON.stringify({ currentPassword: "OldPass123!", newPassword: "NewPass123!" }),
      });
      assert.equal(change.status, 200);

      const stale = await apiFetch(http.baseUrl, "/player/wallet", { token });
      assert.equal(stale.status, 401);
    } finally {
      await prisma.walletTransaction.deleteMany({ where: { wallet: { playerId: player.id } } });
      await prisma.wallet.deleteMany({ where: { playerId: player.id } });
      await prisma.player.delete({ where: { id: player.id } });
    }
  });

  it("hides card numbers during LIVE DRAWING in backoffice purchased-cards", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const suffix = `hide-${Date.now()}`;
    const pwd = await hashPassword("TestPass123!");
    const room = await prisma.room.create({
      data: { name: `hide-room-${suffix}`, slug: `hide-room-${suffix}`, status: "ACTIVE" },
    });
    const bingo = await prisma.bingo.create({
      data: {
        roomId: room.id,
        name: `hide-bingo-${suffix}`,
        status: BingoStatus.ACTIVE,
        bingoType: BingoType.BINGO_75,
        drawMode: BingoDrawMode.LIVE,
        startDateTime: new Date(Date.now() - 60_000),
        endDateTime: new Date(Date.now() + 86_400_000),
        repeatEveryMinutes: 60,
        cardPrice: new Prisma.Decimal("10"),
        minPlayersToStart: 1,
      },
    });
    const round = await prisma.bingoRound.create({
      data: {
        bingoId: bingo.id,
        sequence: 1,
        startsAt: new Date(Date.now() - 1000),
        status: BingoRoundStatus.DRAWING,
      },
    });
    const player = await prisma.player.create({
      data: {
        email: `hide-${suffix}@test.local`,
        username: `hide_${suffix}`,
        passwordHash: pwd,
      },
    });
    const purchase = await prisma.cartonPurchase.create({
      data: {
        playerId: player.id,
        bingoRoundId: round.id,
        quantity: 1,
        unitPriceCents: 1000,
        totalCents: 1000,
      },
    });
    await prisma.playerRoundCard.create({
      data: {
        playerId: player.id,
        bingoRoundId: round.id,
        cartonPurchaseId: purchase.id,
        cardIndex: 0,
        cardFingerprint: `fp_${suffix}`,
        cells: {
          create: [
            { row: 0, col: 0, number: 7, isFree: false },
            { row: 2, col: 2, number: null, isFree: true },
          ],
        },
      },
    });
    try {
      const result = await getRoundPurchasedCardsForBo({ bingoId: bingo.id, roundId: round.id });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.cardsHiddenDuringLiveDraw, true);
      assert.equal(result.cards.length, 1);
      const cell07 = result.cards[0]!.grid[0]![0]!;
      assert.equal(cell07.number, null);
      const free = result.cards[0]!.grid[2]![2]!;
      assert.equal(free.isFree, true);
    } finally {
      await prisma.playerRoundCard.deleteMany({ where: { bingoRoundId: round.id } });
      await prisma.cartonPurchase.deleteMany({ where: { bingoRoundId: round.id } });
      await prisma.player.delete({ where: { id: player.id } });
      await prisma.bingoRound.delete({ where: { id: round.id } });
      await prisma.bingo.delete({ where: { id: bingo.id } });
      await prisma.room.delete({ where: { id: room.id } });
    }
  });

  it("manual credits require bo.wallet.manual-credit (not players.manage alone)", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const suffix = `mc-rbac-${Date.now()}`;
    const fx = await createRbacFixture(suffix);
    const passwordHash = await hashPassword("TestPass123!");
    const playersOnlyRole = await prisma.role.create({
      data: {
        code: `players-only-${suffix}`,
        name: `Players only ${suffix}`,
        functionalities: {
          create: [
            {
              functionality: {
                connect: { code: BO.PLAYERS_MANAGE },
              },
            },
          ],
        },
      },
    });
    const playersOnlyUser = await prisma.user.create({
      data: {
        email: `players-only-${suffix}@test.local`,
        passwordHash,
        roles: { create: [{ roleId: playersOnlyRole.id }] },
      },
    });
    const playersOnlyToken = signAccessToken({
      sub: playersOnlyUser.id,
      email: playersOnlyUser.email,
      tv: playersOnlyUser.tokenVersion,
    });
    const targetPlayer = await prisma.player.create({
      data: {
        email: `target-${suffix}@test.local`,
        username: `target_${suffix}`,
        passwordHash,
        wallet: { create: { balanceCents: 0 } },
      },
    });
    try {
      const res = await apiFetch(
        http.baseUrl,
        `/backoffice/players/${targetPlayer.id}/wallet/manual-credits`,
        {
          method: "POST",
          token: playersOnlyToken,
          body: JSON.stringify({
            amountCents: 500,
            idempotencyKey: randomUUID(),
          }),
        },
      );
      assert.equal(res.status, 403);
      const body = (await res.json()) as { missing?: string[] };
      assert.ok(body.missing?.includes(BO.WALLET_MANUAL_CREDIT));

      const adminRes = await apiFetch(
        http.baseUrl,
        `/backoffice/players/${targetPlayer.id}/wallet/manual-credits`,
        {
          method: "POST",
          token: fx.adminToken,
          body: JSON.stringify({
            amountCents: 500,
            idempotencyKey: randomUUID(),
          }),
        },
      );
      assert.equal(adminRes.status, 201);
    } finally {
      await prisma.adminAuditLog.deleteMany({ where: { adminUserId: fx.adminUserId } });
      await prisma.walletTransaction.deleteMany({ where: { wallet: { playerId: targetPlayer.id } } });
      await prisma.deposit.deleteMany({ where: { playerId: targetPlayer.id } });
      await prisma.wallet.deleteMany({ where: { playerId: targetPlayer.id } });
      await prisma.player.delete({ where: { id: targetPlayer.id } });
      await prisma.userRole.deleteMany({ where: { userId: playersOnlyUser.id } });
      await prisma.user.delete({ where: { id: playersOnlyUser.id } });
      await prisma.roleFunctionality.deleteMany({ where: { roleId: playersOnlyRole.id } });
      await prisma.role.delete({ where: { id: playersOnlyRole.id } });
      await cleanupRbacFixture(fx);
    }
  });
});
