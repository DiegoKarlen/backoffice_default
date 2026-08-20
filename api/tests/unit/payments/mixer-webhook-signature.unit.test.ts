import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMixerWebhookSignaturePayload,
  computeMixerWebhookSignatureHex,
  mixerWebhookSignatureFromBody,
  mixerWebhookSignaturesMatch,
} from "../../../src/payments/providers/mixer-gaming/webhook-signature.js";

describe("[unit] mixer webhook X-Signature", () => {
  it("builds payload from Mixer wiki example fields", () => {
    const payload = buildMixerWebhookSignaturePayload({
      id: 2447,
      amount: "10",
      currency: "ARS",
      user_id: "2001",
    });
    assert.equal(payload, "2447_10_ARS_2001");
  });

  it("computes deterministic HMAC-SHA256 hex (lowercase)", () => {
    const hex = computeMixerWebhookSignatureHex("2447_10_ARS_2001", "test-webhook-secret");
    assert.match(hex, /^[0-9a-f]{64}$/);
    assert.equal(
      hex,
      computeMixerWebhookSignatureHex("2447_10_ARS_2001", "test-webhook-secret"),
    );
  });

  it("mixerWebhookSignatureFromBody matches manual computation", () => {
    const body = {
      success: true,
      status: "approved",
      transaction: {
        id: 2447,
        user_id: "2001",
        currency: "ARS",
        transaction_type: 1,
        amount: "10",
        status: "approved",
      },
    };
    const secret = "test-webhook-secret";
    const expected = computeMixerWebhookSignatureHex("2447_10_ARS_2001", secret);
    assert.equal(mixerWebhookSignatureFromBody(body, secret), expected);
  });

  it("mixerWebhookSignaturesMatch is case-insensitive on hex", () => {
    const hex = computeMixerWebhookSignatureHex("2447_10_ARS_2001", "test-webhook-secret");
    assert.equal(mixerWebhookSignaturesMatch(hex.toUpperCase(), hex), true);
    assert.equal(mixerWebhookSignaturesMatch("deadbeef", hex), false);
  });

  it("optional: matches Mixer sandbox example when env secret is set", () => {
    const secret = process.env.PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET?.trim();
    const expectedHash = process.env.MIXER_WEBHOOK_EXAMPLE_HASH?.trim();
    if (!secret || !expectedHash) return;

    const hex = computeMixerWebhookSignatureHex("2447_10_ARS_2001", secret);
    assert.equal(hex, expectedHash.toLowerCase());
  });
});
