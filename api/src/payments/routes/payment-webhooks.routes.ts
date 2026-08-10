import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { httpError } from "../../lib/route-helpers.js";
import { logError } from "../../lib/logger.js";
import type { PaymentsProviderId } from "../config.js";
import { isPaymentsEnabled } from "../config.js";
import { handlePaymentProviderWebhook } from "../deposit.service.js";
import { listWebhookProviderIds } from "../providers/registry.js";

function normalizeProviderId(raw: string): PaymentsProviderId | null {
  if (raw === "stub" || raw === "mixer-gaming") return raw;
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
        hint: "MixerGaming sends POST with JSON body (success, transaction).",
      });
    }),
  );

  router.post(
    "/:providerId",
    asyncHandler(async (req, res) => {
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
        const result = await handlePaymentProviderWebhook(providerId, {
          rawBody: req.body,
          headers: headerRecord(req),
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
