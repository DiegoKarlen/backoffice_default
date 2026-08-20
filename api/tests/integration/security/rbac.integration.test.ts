import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { assertActorCanAssignRoles, assertActorCanModifyUser } from "../../../src/lib/user-role-guards.js";
import { loadBackofficeUserContext } from "../../../src/lib/user-permissions.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { apiFetch, startTestHttpServer, type TestHttpServer } from "../../helpers/http-test-server.js";
import { cleanupRbacFixture, createRbacFixture, type RbacFixture } from "../../helpers/fixtures/rbac-users.js";

describe("[integration][security] RBAC HTTP and anti-escalation", () => {
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

  it("limited user gets 403 on manual wallet credits", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx = await createRbacFixture(`credits-${Date.now()}`);
    try {
      const res = await apiFetch(http.baseUrl, "/backoffice/players/00000000-0000-4000-8000-000000000001/wallet/manual-credits", {
        method: "POST",
        token: fx.limitedToken,
        body: JSON.stringify({ amountCents: 100 }),
      });
      assert.equal(res.status, 403);
      const body = (await res.json()) as { error?: string };
      assert.equal(body.error, "Forbidden");
    } finally {
      await cleanupRbacFixture(fx);
    }
  });

  it("bingo-only user gets 403 on draw-ball; limited user too", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx = await createRbacFixture(`draw-${Date.now()}`);
    try {
      const limitedRes = await apiFetch(http.baseUrl, "/backoffice/bingos/live/draw-ball?roomSlug=general", {
        method: "POST",
        token: fx.limitedToken,
        body: JSON.stringify({ number: 1 }),
      });
      assert.equal(limitedRes.status, 403);

      const bingoRes = await apiFetch(http.baseUrl, "/backoffice/bingos/live/draw-ball?roomSlug=general", {
        method: "POST",
        token: fx.bingoOnlyToken,
        body: JSON.stringify({ number: 1 }),
      });
      assert.notEqual(bingoRes.status, 403);
    } finally {
      await cleanupRbacFixture(fx);
    }
  });

  it("limited user cannot assign admin role to self", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx = await createRbacFixture(`self-${Date.now()}`);
    try {
      const res = await apiFetch(http.baseUrl, `/users/${fx.limitedUserId}`, {
        method: "PATCH",
        token: fx.limitedToken,
        body: JSON.stringify({ roleIds: [fx.adminRoleId] }),
      });
      assert.equal(res.status, 403);
      const body = (await res.json()) as { error?: string };
      assert.match(body.error ?? "", /permissions you do not have/i);
    } finally {
      await cleanupRbacFixture(fx);
    }
  });

  it("limited user cannot patch a full admin account", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx = await createRbacFixture(`patch-admin-${Date.now()}`);
    try {
      const res = await apiFetch(http.baseUrl, `/users/${fx.adminUserId}`, {
        method: "PATCH",
        token: fx.limitedToken,
        body: JSON.stringify({ displayName: "Hacked" }),
      });
      assert.equal(res.status, 403);
    } finally {
      await cleanupRbacFixture(fx);
    }
  });

  it("admin can patch limited user", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;
    const fx = await createRbacFixture(`admin-ok-${Date.now()}`);
    try {
      const res = await apiFetch(http.baseUrl, `/users/${fx.limitedUserId}`, {
        method: "PATCH",
        token: fx.adminToken,
        body: JSON.stringify({ displayName: "Updated by admin" }),
      });
      assert.equal(res.status, 200);
    } finally {
      await cleanupRbacFixture(fx);
    }
  });

  it("guard blocks modifying higher-privilege user (service level)", async (t) => {
    if (skipIfNoDatabase(t, db)) return;
    const fx = await createRbacFixture(`guard-${Date.now()}`);
    try {
      const actor = await loadBackofficeUserContext(fx.limitedUserId);
      assert.ok(actor);
      await assert.rejects(
        async () => assertActorCanModifyUser(actor, fx.adminUserId),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /permissions you do not have/i);
          return true;
        },
      );
      await assert.rejects(
        async () => assertActorCanAssignRoles(actor, [fx.adminRoleId]),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /permissions you do not have/i);
          return true;
        },
      );
    } finally {
      await cleanupRbacFixture(fx);
    }
  });
});
