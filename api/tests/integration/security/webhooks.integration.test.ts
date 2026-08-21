import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { paymentsEnv } from "../../../src/payments/config.js";
import {
  MIXER_WEBHOOK_SIGNATURE_HEADER,
  mixerWebhookSignatureFromBody,
} from "../../../src/payments/providers/mixer-gaming/webhook-signature.js";
import { prisma } from "../../../src/lib/prisma.js";
import { hashPassword } from "../../../src/lib/password.js";
import { disconnectDatabase, isDatabaseAvailable, skipIfNoDatabase } from "../../helpers/db.js";
import { apiFetch, startTestHttpServer, type TestHttpServer } from "../../helpers/http-test-server.js";

describe("[integration][security] payment webhooks", () => {
  let db = false;
  let http: TestHttpServer | null = null;
  const mixerSecret = paymentsEnv.webhookMixerSecret;

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

  it("POST unknown provider webhook returns 400", async (t) => {
    if (skipIfNoDatabase(t, db) || !http) return;

    const res = await apiFetch(http.baseUrl, "/webhooks/payments/stub", {
      method: "POST",
      body: JSON.stringify({ depositId: "00000000-0000-4000-8000-000000000001", success: true }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "Unknown payment provider");
  });

  it("POST mixer webhook without X-Signature returns 401", async (t) => {
    if (skipIfNoDatabase(t, db) || !http || !mixerSecret) return;

    const body = JSON.stringify({
      success: true,
      status: "approved",
      transaction: {
        id: 1,
        user_id: "1",
        currency: "ARS",
        transaction_type: 1,
        amount: "10",
        status: "approved",
      },
    });

    const res = await apiFetch(http.baseUrl, "/webhooks/payments/mixer-gaming", {
      method: "POST",
      body,
    });
    assert.equal(res.status, 401);
    const json = (await res.json()) as { error?: string };
    assert.equal(json.error, "Unauthorized webhook");
  });

  it("POST mixer webhook with valid X-Signature completes deposit and replay is idempotent", async (t) => {
    if (skipIfNoDatabase(t, db) || !http || !mixerSecret) return;

    const suffix = `mx-${Date.now()}`;
    const passwordHash = await hashPassword("TestPass123!");
    const player = await prisma.player.create({
      data: {
        email: `mx-${suffix}@test.local`,
        username: `mx_${suffix}`,
        passwordHash,
        wallet: { create: { balanceCents: 0, currencyCode: "ARS" } },
      },
    });

    const externalRef = `9${String(Date.now()).slice(-6)}`;
    const deposit = await prisma.deposit.create({
      data: {
        playerId: player.id,
        amountCents: 1_000,
        currencyCode: "ARS",
        status: "PENDING",
        providerId: "mixer-gaming",
        externalRef,
      },
    });

    const webhookBody = {
      success: true,
      status: "approved",
      transaction: {
        id: Number(externalRef),
        user_id: String(player.paymentsUserId),
        currency: "ARS",
        transaction_type: 1,
        amount: "10",
        status: "approved",
      },
    };

    const signature = mixerWebhookSignatureFromBody(webhookBody, mixerSecret);
    assert.ok(signature);

    try {
      const headers = {
        [MIXER_WEBHOOK_SIGNATURE_HEADER]: signature!,
        "Content-Type": "application/json",
      };
      const body = JSON.stringify(webhookBody);

      const first = await apiFetch(http.baseUrl, "/webhooks/payments/mixer-gaming", {
        method: "POST",
        headers,
        body,
      });
      assert.equal(first.status, 200);
      const firstJson = (await first.json()) as { ok: boolean; status?: string };
      assert.equal(firstJson.ok, true);
      assert.equal(firstJson.status, "COMPLETED");

      const wallet = await prisma.wallet.findUnique({ where: { playerId: player.id } });
      assert.equal(wallet!.balanceCents, 1_000);

      const second = await apiFetch(http.baseUrl, "/webhooks/payments/mixer-gaming", {
        method: "POST",
        headers,
        body,
      });
      assert.equal(second.status, 200);
      const secondJson = (await second.json()) as { ok: boolean; alreadyProcessed?: boolean };
      assert.equal(secondJson.ok, true);
      assert.equal(secondJson.alreadyProcessed, true);

      const txCount = await prisma.walletTransaction.count({ where: { depositId: deposit.id } });
      assert.equal(txCount, 1);
    } finally {
      await prisma.walletTransaction.deleteMany({ where: { depositId: deposit.id } });
      await prisma.deposit.delete({ where: { id: deposit.id } });
      await prisma.wallet.deleteMany({ where: { playerId: player.id } });
      await prisma.player.delete({ where: { id: player.id } });
    }
  });

  it("POST mixer webhook with signed amount zero fails deposit without crediting wallet", async (t) => {
    if (skipIfNoDatabase(t, db) || !http || !mixerSecret) return;

    const suffix = `mx0-${Date.now()}`;
    const passwordHash = await hashPassword("TestPass123!");
    const player = await prisma.player.create({
      data: {
        email: `mx0-${suffix}@test.local`,
        username: `mx0_${suffix}`,
        passwordHash,
        wallet: { create: { balanceCents: 0, currencyCode: "ARS" } },
      },
    });

    const externalRef = `8${String(Date.now()).slice(-6)}`;
    const deposit = await prisma.deposit.create({
      data: {
        playerId: player.id,
        amountCents: 2_000,
        currencyCode: "ARS",
        status: "PENDING",
        providerId: "mixer-gaming",
        externalRef,
      },
    });

    const webhookBody = {
      success: true,
      status: "approved",
      transaction: {
        id: Number(externalRef),
        user_id: String(player.paymentsUserId),
        currency: "ARS",
        transaction_type: 1,
        amount: "0",
        status: "approved",
      },
    };

    const signature = mixerWebhookSignatureFromBody(webhookBody, mixerSecret);
    assert.ok(signature);

    try {
      const res = await apiFetch(http.baseUrl, "/webhooks/payments/mixer-gaming", {
        method: "POST",
        headers: {
          [MIXER_WEBHOOK_SIGNATURE_HEADER]: signature!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(webhookBody),
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as { ok: boolean; status?: string; reason?: string };
      assert.equal(json.ok, true);
      assert.equal(json.status, "FAILED");
      assert.equal(json.reason, "invalid_webhook_amount");

      const updated = await prisma.deposit.findUnique({ where: { id: deposit.id } });
      assert.equal(updated!.status, "FAILED");

      const wallet = await prisma.wallet.findUnique({ where: { playerId: player.id } });
      assert.equal(wallet!.balanceCents, 0);

      const txCount = await prisma.walletTransaction.count({ where: { depositId: deposit.id } });
      assert.equal(txCount, 0);
    } finally {
      await prisma.deposit.delete({ where: { id: deposit.id } }).catch(() => {});
      await prisma.wallet.deleteMany({ where: { playerId: player.id } });
      await prisma.player.delete({ where: { id: player.id } });
    }
  });
});
