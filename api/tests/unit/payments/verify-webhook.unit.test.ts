import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request } from "express";
import { paymentsEnv } from "../../../src/payments/config.js";
import { assertMixerWebhookAuthorized } from "../../../src/payments/middleware/verify-webhook.js";
import {
  MIXER_WEBHOOK_SIGNATURE_HEADER,
  mixerWebhookSignatureFromBody,
} from "../../../src/payments/providers/mixer-gaming/webhook-signature.js";

function mockReq(body: unknown, signature?: string): Request {
  return {
    ip: "127.0.0.1",
    originalUrl: "/webhooks/payments/mixer-gaming",
    body,
    headers: signature ? { [MIXER_WEBHOOK_SIGNATURE_HEADER]: signature } : {},
  } as Request;
}

const sampleBody = {
  success: true,
  status: "approved",
  transaction: {
    id: 12345,
    user_id: "1",
    currency: "ARS",
    transaction_type: 1,
    amount: "100.00",
    status: "approved",
  },
};

describe("[unit] verify-webhook", () => {
  it("rejects mixer webhook without X-Signature", () => {
    if (!paymentsEnv.webhookMixerSecret) return;
    assert.throws(
      () => assertMixerWebhookAuthorized(mockReq(sampleBody)),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error & { status?: number }).status, 401);
        return true;
      },
    );
  });

  it("accepts mixer webhook with valid X-Signature", () => {
    const secret = paymentsEnv.webhookMixerSecret;
    if (!secret) return;
    const signature = mixerWebhookSignatureFromBody(sampleBody, secret);
    assert.ok(signature);
    assert.doesNotThrow(() => assertMixerWebhookAuthorized(mockReq(sampleBody, signature!)));
  });

  it("rejects mixer webhook with wrong X-Signature", () => {
    if (!paymentsEnv.webhookMixerSecret) return;
    assert.throws(() => assertMixerWebhookAuthorized(mockReq(sampleBody, "deadbeef".repeat(8))));
  });
});
