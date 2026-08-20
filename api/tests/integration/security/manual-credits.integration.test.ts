import assert from "node:assert/strict";
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
        body: JSON.stringify({ amountCents: env.maxManualCreditCents + 1 }),
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
        body: JSON.stringify({ amountCents: 2_500, note: "QA manual credit" }),
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
});
