import type { WebhookDepositEvent } from "../../types.js";

type StubWebhookBody = {
  success?: boolean;
  depositId?: string;
  externalRef?: string;
};

/** Webhook demo: `{ "depositId": "<uuid>", "success": true }` o `{ "externalRef": "stub-...", "success": false }`. */
export function parseStubWebhook(rawBody: unknown): WebhookDepositEvent {
  if (!rawBody || typeof rawBody !== "object") {
    throw new Error("Invalid webhook body");
  }

  const body = rawBody as StubWebhookBody;
  if (typeof body.success !== "boolean") {
    throw new Error("Invalid webhook: success (boolean) is required");
  }

  const externalRef =
    body.externalRef?.trim() ||
    (body.depositId?.trim() ? `stub-${body.depositId.trim()}` : "");

  if (!externalRef) {
    throw new Error("Invalid webhook: depositId or externalRef is required");
  }

  return {
    externalRef,
    success: body.success,
    failedReason: body.success ? undefined : "Stub webhook simulated failure",
    providerPayload: rawBody,
  };
}
