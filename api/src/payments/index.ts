import type { Router } from "express";
import type { Express } from "express";
import { createPlayerDepositsRouter } from "./routes/player-deposits.routes.js";
import { createPaymentWebhooksRouter } from "./routes/payment-webhooks.routes.js";

/** Monta rutas bajo `/player/deposits`. */
export function registerPlayerDepositRoutes(playerRouter: Router): void {
  playerRouter.use("/deposits", createPlayerDepositsRouter());
}

/** Monta rutas bajo `/webhooks/payments`. */
export function registerPaymentWebhookRoutes(app: Express): void {
  app.use("/webhooks/payments", createPaymentWebhooksRouter());
}

export { isPaymentsEnabled, paymentsEnv } from "./config.js";
export { completeDeposit, failDeposit, handlePaymentProviderWebhook } from "./deposit.service.js";
