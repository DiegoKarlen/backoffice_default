import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../../src/lib/prisma.js";
import { hashPassword } from "../../../src/lib/password.js";
import { signAccessToken, signPlayerAccessToken } from "../../../src/lib/jwt.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { apiFetch, startTestHttpServer, type TestHttpServer } from "../../helpers/http-test-server.js";
import { cleanupRbacFixture, createRbacFixture } from "../../helpers/fixtures/rbac-users.js";

describe("[integration][security] auth boundaries", () => {
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

  it("deactivated backoffice user gets 401 on protected route", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx = await createRbacFixture(`auth-bo-${Date.now()}`);
    try {
      const ok = await apiFetch(http.baseUrl, "/auth/me", { token: fx.adminToken });
      assert.equal(ok.status, 200);

      await prisma.user.update({ where: { id: fx.adminUserId }, data: { active: false } });

      const blocked = await apiFetch(http.baseUrl, "/auth/me", { token: fx.adminToken });
      assert.equal(blocked.status, 401);
      const body = (await blocked.json()) as { error?: string };
      assert.match(body.error ?? "", /inactive or not found/i);

      const users = await apiFetch(http.baseUrl, "/users", { token: fx.adminToken });
      assert.equal(users.status, 401);
    } finally {
      await prisma.user.update({ where: { id: fx.adminUserId }, data: { active: true } }).catch(() => {});
      await cleanupRbacFixture(fx);
    }
  });

  it("deactivated player gets 401 on wallet and purchases", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const suffix = `auth-pl-${Date.now()}`;
    const passwordHash = await hashPassword("TestPass123!");
    const player = await prisma.player.create({
      data: {
        email: `auth-pl-${suffix}@test.local`,
        username: `auth_${suffix}`,
        passwordHash,
        wallet: { create: { balanceCents: 0, currencyCode: "ARS" } },
      },
    });
    const token = signPlayerAccessToken({ sub: player.id, email: player.email });

    try {
      const walletOk = await apiFetch(http.baseUrl, "/player/wallet", { token });
      assert.equal(walletOk.status, 200);

      await prisma.player.update({ where: { id: player.id }, data: { active: false } });

      const walletBlocked = await apiFetch(http.baseUrl, "/player/wallet", { token });
      assert.equal(walletBlocked.status, 401);

      const depositsBlocked = await apiFetch(http.baseUrl, "/player/deposits/payment-methods", { token });
      assert.equal(depositsBlocked.status, 401);

      const meBlocked = await apiFetch(http.baseUrl, "/player/me", { token });
      assert.equal(meBlocked.status, 401);
    } finally {
      await prisma.walletTransaction.deleteMany({ where: { wallet: { playerId: player.id } } });
      await prisma.wallet.deleteMany({ where: { playerId: player.id } });
      await prisma.player.delete({ where: { id: player.id } });
    }
  });

  it("backoffice token cannot access player routes", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx = await createRbacFixture(`auth-cross-${Date.now()}`);
    try {
      const res = await apiFetch(http.baseUrl, "/player/wallet", { token: fx.adminToken });
      assert.equal(res.status, 403);
    } finally {
      await cleanupRbacFixture(fx);
    }
  });

  it("player token cannot access backoffice routes", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const suffix = `auth-cross2-${Date.now()}`;
    const player = await prisma.player.create({
      data: {
        email: `cross-${suffix}@test.local`,
        username: `cross_${suffix}`,
        passwordHash: await hashPassword("TestPass123!"),
      },
    });
    const token = signPlayerAccessToken({ sub: player.id, email: player.email });
    try {
      const res = await apiFetch(http.baseUrl, "/users", { token });
      assert.equal(res.status, 403);
    } finally {
      await prisma.player.delete({ where: { id: player.id } });
    }
  });
});
