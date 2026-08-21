import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { logInfo, logWarn } from "../../lib/logger.js";
import type { TrafficLoggedRequest } from "../../lib/http-traffic-log.js";
import {
  MIXER_WEBHOOK_SIGNATURE_HEADER,
  mixerWebhookSignatureFromBody,
  mixerWebhookSignaturesMatch,
} from "../providers/mixer-gaming/webhook-signature.js";
import { paymentsEnv, type PaymentsProviderId } from "../config.js";

function normalizeProviderId(raw: string): PaymentsProviderId | null {
  if (raw === "mixer-gaming") return raw;
  return null;
}

function headerValue(req: Request, name: string): string | undefined {
  const raw = req.headers[name];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].trim()) return raw[0].trim();
  return undefined;
}

function headerMixerSignature(req: Request): string | undefined {
  return headerValue(req, MIXER_WEBHOOK_SIGNATURE_HEADER);
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
    auth: {
      type: "hmac",
      header: MIXER_WEBHOOK_SIGNATURE_HEADER,
      signatureLen: headerMixerSignature(req)?.length ?? 0,
    },
  });
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
  if (providerId !== "mixer-gaming") {
    logWebhookAuthFailure(req, providerId, "unknown_provider");
    const err = new Error("Unknown payment provider webhook");
    (err as Error & { status: number }).status = 404;
    throw err;
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
