import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request } from "express";
import { paymentsEnv } from "../../../src/payments/config.js";
import {
  assertStubWebhookAuthorized,
  WEBHOOK_SECRET_HEADER,
} from "../../../src/payments/middleware/verify-webhook.js";

function mockReq(secret?: string): Request {
  return {
    ip: "127.0.0.1",
    originalUrl: "/webhooks/payments/stub",
    headers: secret ? { [WEBHOOK_SECRET_HEADER]: secret } : {},
  } as Request;
}

describe("[unit] verify-webhook", () => {
  it("rejects stub webhook without secret", () => {
    if (!paymentsEnv.webhookStubEnabled) return;
    assert.throws(
      () => assertStubWebhookAuthorized(mockReq()),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { status?: number }).status, 401);
        return true;
      },
    );
  });

  it("accepts stub webhook with valid secret", () => {
    if (!paymentsEnv.webhookStubEnabled || !paymentsEnv.webhookStubSecret) return;
    assert.doesNotThrow(() =>
      assertStubWebhookAuthorized(mockReq(paymentsEnv.webhookStubSecret)),
    );
  });

  it("rejects stub webhook with wrong secret", () => {
    if (!paymentsEnv.webhookStubEnabled) return;
    assert.throws(() => assertStubWebhookAuthorized(mockReq("wrong-secret")));
  });
});
