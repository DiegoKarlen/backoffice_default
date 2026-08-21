import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { httpError } from "../../lib/route-helpers.js";
import { logError, logInfo } from "../../lib/logger.js";
import type { TrafficLoggedRequest } from "../../lib/http-traffic-log.js";
import type { PaymentsProviderId } from "../config.js";
import { isPaymentsEnabled } from "../config.js";
import {
  paymentWebhookRateLimiter,
  verifyPaymentWebhookPost,
} from "../middleware/verify-webhook.js";
import { paymentWebhookTrafficLogger } from "../middleware/payment-traffic-log.js";
import { handlePaymentProviderWebhook } from "../deposit.service.js";
import { listWebhookProviderIds } from "../providers/registry.js";

function normalizeProviderId(raw: string): PaymentsProviderId | null {
  if (raw === "mixer-gaming") return raw;
  return null;
}

function headerRecord(req: { headers: Record<string, string | string[] | undefined> }): Record<string, string | string[] | undefined> {
  return req.headers;
}

export function createPaymentWebhooksRouter(): Router {
  const router = Router();

  /** Ping en navegador o validación de URL; Mixer envía POST con el payload real. */
  router.get(
    "/:providerId",
    asyncHandler(async (req, res) => {
      const providerId = normalizeProviderId(String(req.params.providerId ?? "").trim());
      if (!providerId || !listWebhookProviderIds().includes(providerId)) {
        throw httpError(404, "Unknown payment provider webhook");
      }
      res.status(200).json({
        ok: true,
        providerId,
        method: "POST",
        hint: "Send POST with JSON body. Mixer requires header X-Signature (HMAC-SHA256).",
      });
    }),
  );

  router.post(
    "/:providerId",
    paymentWebhookRateLimiter,
    paymentWebhookTrafficLogger,
    verifyPaymentWebhookPost,
    asyncHandler(async (req, res) => {
      const trafficReq = req as TrafficLoggedRequest;
      if (!isPaymentsEnabled()) {
        throw httpError(503, "Payments module is disabled");
      }

      const providerId = normalizeProviderId(String(req.params.providerId ?? "").trim());
      if (!providerId) {
        throw httpError(400, "Unknown payment provider");
      }

      if (!listWebhookProviderIds().includes(providerId)) {
        throw httpError(404, "Unknown payment provider webhook");
      }

      try {
        logInfo("payments-webhook", "processing started", {
          providerId,
          requestId: trafficReq.trafficLogId,
        });

        const result = await handlePaymentProviderWebhook(providerId, {
          rawBody: req.body,
          headers: headerRecord(req),
          requestId: trafficReq.trafficLogId,
        });

        logInfo("payments-webhook", "processing finished", {
          providerId,
          requestId: trafficReq.trafficLogId,
          result,
        });

        if (!result.ok && result.reason === "deposit_not_found") {
          res.status(404).json({ ok: false, reason: result.reason });
          return;
        }

        res.status(200).json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("Invalid webhook") || msg.startsWith("Unsupported transaction")) {
          throw httpError(400, msg);
        }
        logError("payments-webhook", `provider=${providerId}`, err);
        throw httpError(500, "Webhook processing failed");
      }
    }),
  );

  return router;
}
