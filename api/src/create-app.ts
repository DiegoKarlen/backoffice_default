import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { rolesRouter } from "./routes/roles.js";
import { functionalitiesRouter } from "./routes/functionalities.js";
import { roomsRouter } from "./routes/rooms.js";
import { bingosRouter } from "./routes/bingos.js";
import { publicBingosRouter } from "./routes/public-bingos.js";
import { playersRouter } from "./routes/players.js";
import { playerPortalRouter } from "./routes/player-portal.js";
import { paymentMethodsRouter } from "./routes/payment-methods.js";
import { registerPlayerDepositRoutes, registerPaymentWebhookRoutes } from "./payments/index.js";
import { registerOpenApiDocs } from "./openapi/register-swagger.js";

/** Express app factory (used by server start and HTTP integration tests). */
export function createApp(): express.Application {
  const app = express();
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        const normalized = origin.replace(/\/$/, "");
        if (env.corsOrigins.includes(normalized)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  registerOpenApiDocs(app);

  app.use("/auth", authRouter);
  app.use("/users", usersRouter);
  app.use("/roles", rolesRouter);
  app.use("/functionalities", functionalitiesRouter);
  app.use("/backoffice/rooms", roomsRouter);
  app.use("/backoffice/bingos", bingosRouter);
  app.use("/backoffice/players", playersRouter);
  app.use("/backoffice/payment-methods", paymentMethodsRouter);
  registerPlayerDepositRoutes(playerPortalRouter);
  registerPaymentWebhookRoutes(app);
  app.use("/player", playerPortalRouter);
  app.use("/public/bingos", publicBingosRouter);

  app.use(errorHandler);
  return app;
}
