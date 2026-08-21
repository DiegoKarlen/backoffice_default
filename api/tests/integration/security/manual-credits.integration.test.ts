import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../../src/lib/prisma.js";
import { env } from "../../../src/config/env.js";
import { hashPassword } from "../../../src/lib/password.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { apiFetch, startTestHttpServer, type TestHttpServer } from "../../helpers/http-test-server.js";
import { cleanupRbacFixture, createRbacFixture, type RbacFixture } from "../../helpers/fixtures/rbac-users.js";

describe("[integration][security] manual wallet credits", () => {
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

  it("rejects amount above MAX_MANUAL_CREDIT_CENTS", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx = await createRbacFixture(`mc-max-${Date.now()}`);
    try {
      const res = await apiFetch(http.baseUrl, "/backoffice/players/00000000-0000-4000-8000-000000000001/wallet/manual-credits", {
        method: "POST",
        token: fx.adminToken,
        body: JSON.stringify({
          amountCents: env.maxManualCreditCents + 1,
          idempotencyKey: randomUUID(),
        }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error?: string };
      assert.match(body.error ?? "", /maximum manual credit/i);
    } finally {
      await cleanupRbacFixture(fx);
    }
  });

  it("creates AdminAuditLog on successful manual credit", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx: RbacFixture = await createRbacFixture(`mc-audit-${Date.now()}`);
    const suffix = fx.suffix;
    const passwordHash = await hashPassword("TestPass123!");

    const player = await prisma.player.create({
      data: {
        email: `mc-audit-${suffix}@test.local`,
        username: `mc_${suffix}`,
        passwordHash,
        wallet: { create: { balanceCents: 0, currencyCode: "ARS" } },
      },
    });

    try {
      const res = await apiFetch(http.baseUrl, `/backoffice/players/${player.id}/wallet/manual-credits`, {
        method: "POST",
        token: fx.adminToken,
        body: JSON.stringify({
          amountCents: 2_500,
          note: "QA manual credit",
          idempotencyKey: randomUUID(),
        }),
      });
      assert.equal(res.status, 201);
      const body = (await res.json()) as { depositId?: string; balanceCents?: number };
      assert.ok(body.depositId);
      assert.equal(body.balanceCents, 2_500);

      const audit = await prisma.adminAuditLog.findFirst({
        where: {
          adminUserId: fx.adminUserId,
          action: "MANUAL_WALLET_CREDIT",
          targetType: "player",
          targetId: player.id,
          depositId: body.depositId,
        },
      });
      assert.ok(audit);
      assert.equal(audit!.amountCents, 2_500);
      assert.equal(audit!.note, "QA manual credit");
    } finally {
      const deposits = await prisma.deposit.findMany({ where: { playerId: player.id } });
      for (const d of deposits) {
        await prisma.adminAuditLog.deleteMany({ where: { depositId: d.id } });
        await prisma.walletTransaction.deleteMany({ where: { depositId: d.id } });
        await prisma.deposit.delete({ where: { id: d.id } });
      }
      await prisma.wallet.deleteMany({ where: { playerId: player.id } });
      await prisma.player.delete({ where: { id: player.id } });
      await cleanupRbacFixture(fx);
    }
  });

  it("replay with same idempotencyKey is idempotent (single wallet credit)", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx = await createRbacFixture(`mc-idem-${Date.now()}`);
    const passwordHash = await hashPassword("TestPass123!");
    const idempotencyKey = randomUUID();

    const player = await prisma.player.create({
      data: {
        email: `mc-idem-${fx.suffix}@test.local`,
        username: `mc_idem_${fx.suffix}`,
        passwordHash,
        wallet: { create: { balanceCents: 0, currencyCode: "ARS" } },
      },
    });

    const bodyPayload = {
      amountCents: 3_000,
      note: "idem test",
      idempotencyKey,
    };

    try {
      const first = await apiFetch(http.baseUrl, `/backoffice/players/${player.id}/wallet/manual-credits`, {
        method: "POST",
        token: fx.adminToken,
        body: JSON.stringify(bodyPayload),
      });
      assert.equal(first.status, 201);
      const firstJson = (await first.json()) as { depositId?: string; balanceCents?: number };
      assert.equal(firstJson.balanceCents, 3_000);

      const second = await apiFetch(http.baseUrl, `/backoffice/players/${player.id}/wallet/manual-credits`, {
        method: "POST",
        token: fx.adminToken,
        body: JSON.stringify(bodyPayload),
      });
      assert.equal(second.status, 200);
      const secondJson = (await second.json()) as {
        depositId?: string;
        balanceCents?: number;
        alreadyProcessed?: boolean;
      };
      assert.equal(secondJson.depositId, firstJson.depositId);
      assert.equal(secondJson.alreadyProcessed, true);
      assert.equal(secondJson.balanceCents, 3_000);

      const wallet = await prisma.wallet.findUnique({ where: { playerId: player.id } });
      assert.equal(wallet!.balanceCents, 3_000);

      const txCount = await prisma.walletTransaction.count({ where: { deposit: { playerId: player.id } } });
      assert.equal(txCount, 1);
    } finally {
      const deposits = await prisma.deposit.findMany({ where: { playerId: player.id } });
      for (const d of deposits) {
        await prisma.adminAuditLog.deleteMany({ where: { depositId: d.id } });
        await prisma.walletTransaction.deleteMany({ where: { depositId: d.id } });
        await prisma.deposit.delete({ where: { id: d.id } });
      }
      await prisma.wallet.deleteMany({ where: { playerId: player.id } });
      await prisma.player.delete({ where: { id: player.id } });
      await cleanupRbacFixture(fx);
    }
  });
});
