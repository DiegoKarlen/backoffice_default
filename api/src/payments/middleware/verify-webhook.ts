import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { timingSafeEqual } from "node:crypto";
import { logInfo, logWarn } from "../../lib/logger.js";
import type { TrafficLoggedRequest } from "../../lib/http-traffic-log.js";
import {
  MIXER_WEBHOOK_SIGNATURE_HEADER,
  mixerWebhookSignatureFromBody,
  mixerWebhookSignaturesMatch,
} from "../providers/mixer-gaming/webhook-signature.js";
import { paymentsEnv, type PaymentsProviderId } from "../config.js";

export const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

function normalizeProviderId(raw: string): PaymentsProviderId | null {
  if (raw === "stub" || raw === "mixer-gaming") return raw;
  return null;
}

function headerValue(req: Request, name: string): string | undefined {
  const raw = req.headers[name];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].trim()) return raw[0].trim();
  return undefined;
}

function headerSecret(req: Request): string | undefined {
  return headerValue(req, WEBHOOK_SECRET_HEADER);
}

function headerMixerSignature(req: Request): string | undefined {
  return headerValue(req, MIXER_WEBHOOK_SIGNATURE_HEADER);
}

function secretsMatch(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function logWebhookAuthFailure(
  req: Request,
  providerId: string,
  reason: string,
): void {
  logWarn("payments-webhook-auth", "webhook rejected", {
    providerId,
    reason,
    ip: req.ip,
    path: req.originalUrl,
  });
}

function logWebhookAuthSuccess(req: Request, providerId: PaymentsProviderId): void {
  const requestId = (req as TrafficLoggedRequest).trafficLogId;
  logInfo("payments-webhook-auth", "webhook authorized", {
    ...(requestId ? { requestId } : {}),
    providerId,
    ip: req.ip,
    path: req.originalUrl,
    auth:
      providerId === "stub"
        ? { type: "shared-secret", header: WEBHOOK_SECRET_HEADER }
        : {
            type: "hmac",
            header: MIXER_WEBHOOK_SIGNATURE_HEADER,
            signatureLen: headerMixerSignature(req)?.length ?? 0,
          },
  });
}

/** Validates shared-secret header for stub webhooks (dev/test only). */
export function assertStubWebhookAuthorized(req: Request): void {
  if (paymentsEnv.isProduction || !paymentsEnv.webhookStubEnabled) {
    logWebhookAuthFailure(req, "stub", "stub_webhooks_disabled");
    const err = new Error("stub_webhooks_disabled");
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  const provided = headerSecret(req);
  if (!secretsMatch(provided, paymentsEnv.webhookStubSecret)) {
    logWebhookAuthFailure(req, "stub", "invalid_or_missing_secret");
    const err = new Error("Unauthorized webhook");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
}

/**
 * Mixer Gaming wiki §3.5: HMAC-SHA256 over
 * `{transaction.id}_{transaction.amount}_{transaction.currency}_{transaction.user_id}`
 * in header `X-Signature` (hex lowercase, no prefix).
 * Secret: `PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET` (`webhook_secret` from Mixer).
 */
export function assertMixerWebhookAuthorized(req: Request): void {
  const secret = paymentsEnv.webhookMixerSecret;

  if (paymentsEnv.isProduction && !secret) {
    logWebhookAuthFailure(req, "mixer-gaming", "mixer_webhook_secret_not_configured");
    const err = new Error("Webhook not configured");
    (err as Error & { status: number }).status = 503;
    throw err;
  }

  if (!secret) {
    logWebhookAuthFailure(req, "mixer-gaming", "mixer_webhook_secret_not_configured");
    const err = new Error("Unauthorized webhook");
    (err as Error & { status: number }).status = 401;
    throw err;
  }

  const provided = headerMixerSignature(req);
  if (!provided) {
    logWebhookAuthFailure(req, "mixer-gaming", "missing_signature");
    const err = new Error("Unauthorized webhook");
    (err as Error & { status: number }).status = 401;
    throw err;
  }

  const expected = mixerWebhookSignatureFromBody(req.body, secret);
  if (!expected) {
    logWebhookAuthFailure(req, "mixer-gaming", "invalid_signature_payload");
    const err = new Error("Unauthorized webhook");
    (err as Error & { status: number }).status = 401;
    throw err;
  }

  if (!mixerWebhookSignaturesMatch(provided, expected)) {
    logWebhookAuthFailure(req, "mixer-gaming", "invalid_signature");
    const err = new Error("Unauthorized webhook");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
}

export function assertPaymentWebhookAuthorized(req: Request, providerId: PaymentsProviderId): void {
  if (providerId === "stub") {
    assertStubWebhookAuthorized(req);
    return;
  }
  assertMixerWebhookAuthorized(req);
}

/** Rate limit abusive webhook traffic (per IP). */
export const paymentWebhookRateLimiter = rateLimit({
  windowMs: paymentsEnv.webhookRateLimitWindowMs,
  max: paymentsEnv.webhookRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many webhook requests" },
});

/** POST /webhooks/payments/:providerId — authenticate before parsing body. */
export function verifyPaymentWebhookPost(req: Request, res: Response, next: NextFunction): void {
  const providerId = normalizeProviderId(String(req.params.providerId ?? "").trim());
  if (!providerId) {
    res.status(400).json({ error: "Unknown payment provider" });
    return;
  }

  try {
    assertPaymentWebhookAuthorized(req, providerId);
    logWebhookAuthSuccess(req, providerId);
    next();
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 401;
    const message = err instanceof Error ? err.message : "Unauthorized webhook";
    if (status === 404) {
      res.status(404).json({ error: "Unknown payment provider webhook" });
      return;
    }
    res.status(status).json({ error: message });
  }
}
