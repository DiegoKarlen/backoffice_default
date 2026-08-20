import type { Express, RequestHandler } from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "../config/env.js";
import { buildOpenApiDocument } from "./spec.js";

const SWAGGER_PATH = "/api/swagger";

export function registerOpenApiDocs(app: Express): void {
  if (!env.openapiEnabled) return;

  const spec = buildOpenApiDocument({ serverUrl: env.openapiServerUrl });

  app.get(`${SWAGGER_PATH}/openapi.json`, (_req, res) => {
    res.json(spec);
  });

  const uiSetup = swaggerUi.setup(spec, {
    customSiteTitle: "API Backoffice Bingo",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  }) as RequestHandler;

  app.use(SWAGGER_PATH, swaggerUi.serve, uiSetup);
}
