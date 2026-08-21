import { createHttpTrafficLogger } from "../../lib/http-traffic-log.js";
import { MIXER_WEBHOOK_SIGNATURE_HEADER } from "../providers/mixer-gaming/webhook-signature.js";

const SENSITIVE_HEADERS = new Set([
  MIXER_WEBHOOK_SIGNATURE_HEADER,
  "authorization",
  "cookie",
]);

function redactHeaderValue(name: string, value: string): string {
  const lower = name.toLowerCase();
  if (lower === MIXER_WEBHOOK_SIGNATURE_HEADER) {
    const v = value.trim();
    if (v.length <= 16) return `[len=${v.length}]`;
    return `${v.slice(0, 8)}…${v.slice(-8)} [len=${v.length}]`;
  }
  if (lower === "authorization") return "[redacted]";
  return value;
}

function sanitizeWebhookHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (!SENSITIVE_HEADERS.has(lower)) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.trim()) {
      out[lower] = redactHeaderValue(lower, value);
    }
  }
  out["content-type"] = headers["content-type"] ?? headers["Content-Type"];
  return out;
}

function summarizeWebhookBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = body as Record<string, unknown>;
  const transaction = record.transaction;
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
    return {
      success: record.success,
      status: record.status,
      transaction: transaction ?? null,
    };
  }
  const tx = transaction as Record<string, unknown>;
  return {
    success: record.success,
    status: record.status,
    transaction: {
      id: tx.id,
      amount: tx.amount,
      currency: tx.currency,
      user_id: tx.user_id,
      status: tx.status,
      payment_method: tx.payment_method,
      transaction_type: tx.transaction_type,
    },
  };
}

function summarizeDepositRequestBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = body as Record<string, unknown>;
  const profile =
    record.profile && typeof record.profile === "object" && !Array.isArray(record.profile)
      ? (record.profile as Record<string, unknown>)
      : undefined;

  return {
    amountCents: record.amountCents,
    paymentMethodId: record.paymentMethodId,
    providerId: record.providerId,
    profile: profile
      ? {
          firstName: profile.firstName,
          lastName: profile.lastName,
          dni: profile.dni ? "[present]" : undefined,
          phone: profile.phone ? "[present]" : undefined,
          phoneCode: profile.phoneCode,
          countryCode: profile.countryCode,
        }
      : undefined,
  };
}

export const paymentWebhookTrafficLogger = createHttpTrafficLogger({
  scope: "payments-webhook",
  sanitizeHeaders: sanitizeWebhookHeaders,
  summarizeRequestBody: summarizeWebhookBody,
});

export const playerDepositTrafficLogger = createHttpTrafficLogger({
  scope: "payments-deposit",
  summarizeRequestBody: summarizeDepositRequestBody,
});
