import rateLimit from "express-rate-limit";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePlayer, type AuthedRequest } from "../../middleware/auth.js";
import { httpError, zodFlattenError } from "../../lib/route-helpers.js";
import { playerDepositTrafficLogger } from "../middleware/payment-traffic-log.js";
import { paymentsEnv, isPaymentsEnabled } from "../config.js";
import {
  DepositProfileIncompleteError,
  getPlayerDeposit,
  initiatePlayerDeposit,
  listDepositPaymentMethods,
} from "../deposit.service.js";
import type { PaymentsProviderId } from "../config.js";

const profileSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  dni: z.string().min(4).max(32).optional(),
  phone: z.string().min(6).max(32).optional(),
  phoneCode: z.string().min(1).max(8).optional(),
  countryCode: z.string().length(2).optional(),
});

const initiateSchema = z.object({
  amountCents: z.number().int().positive(),
  paymentMethodId: z.string().uuid(),
  providerId: z.enum(["stub", "mixer-gaming"]).optional(),
  profile: profileSchema.optional(),
});

function requirePlayerId(req: AuthedRequest): string {
  const sub = req.auth?.sub;
  if (!sub) throw httpError(401, "Unauthorized");
  return sub;
}

function ensurePaymentsEnabled(): void {
  if (!isPaymentsEnabled()) {
    throw httpError(503, "Payments module is disabled");
  }
}

const depositRateLimiter = rateLimit({
  windowMs: paymentsEnv.depositRateLimitWindowMs,
  max: paymentsEnv.depositRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many deposit attempts. Try again later." },
});

export function createPlayerDepositsRouter(): Router {
  const router = Router();

  router.get(
    "/payment-methods",
    requirePlayer,
    asyncHandler(async (req, res) => {
      ensurePaymentsEnabled();
      const playerId = requirePlayerId(req as AuthedRequest);
      const methods = await listDepositPaymentMethods(playerId);
      res.json({ paymentMethods: methods });
    }),
  );

  router.post(
    "/",
    requirePlayer,
    depositRateLimiter,
    playerDepositTrafficLogger,
    asyncHandler(async (req, res) => {
      ensurePaymentsEnabled();
      const parsed = initiateSchema.safeParse(req.body);
      if (!parsed.success) throw zodFlattenError(parsed.error);

      const playerId = requirePlayerId(req as AuthedRequest);
      try {
        const result = await initiatePlayerDeposit({
          playerId,
          amountCents: parsed.data.amountCents,
          paymentMethodId: parsed.data.paymentMethodId,
          providerId: parsed.data.providerId as PaymentsProviderId | undefined,
          profile: parsed.data.profile,
        });
        res.status(201).json(result);
      } catch (err) {
        if (err instanceof DepositProfileIncompleteError) {
          throw httpError(422, "Deposit profile incomplete", {
            code: "DEPOSIT_PROFILE_INCOMPLETE",
            jsonBody: { error: err.message, missingFields: err.missingFields },
          });
        }
        const msg = err instanceof Error ? err.message : "Deposit failed";
        if (msg === "Player not found") throw httpError(404, msg);
        if (msg === "Player is inactive") throw httpError(409, msg);
        if (msg === "Payment method not found") throw httpError(400, msg);
        if (msg.includes("Amount below") || msg.includes("Amount above") || msg.includes("amountCents")) {
          throw httpError(400, msg);
        }
        throw httpError(502, msg);
      }
    }),
  );

  router.get(
    "/:depositId",
    requirePlayer,
    asyncHandler(async (req, res) => {
      ensurePaymentsEnabled();
      const playerId = requirePlayerId(req as AuthedRequest);
      const depositId = String(req.params.depositId ?? "").trim();
      if (!depositId) throw httpError(400, "depositId required");
      try {
        const deposit = await getPlayerDeposit(playerId, depositId);
        res.json({ deposit });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Not found";
        if (msg === "Deposit not found") throw httpError(404, msg);
        throw err;
      }
    }),
  );

  return router;
}
