import type { OpenAPIV3 } from "openapi-types";
import { components, tags } from "./components.js";
import { adminGamePaths } from "./paths/admin-game.js";
import { adminUsersRolesPaths } from "./paths/admin-users-roles.js";
import { healthAuthPaths } from "./paths/health-auth.js";
import { paymentsPaths } from "./paths/payments.js";
import { playerPortalPaths, publicBingoPaths } from "./paths/public-player.js";

function mergePaths(...parts: OpenAPIV3.PathsObject[]): OpenAPIV3.PathsObject {
  return Object.assign({}, ...parts);
}

export function buildOpenApiDocument(options?: { serverUrl?: string }): OpenAPIV3.Document {
  const serverUrl = options?.serverUrl ?? `http://localhost:${process.env.PORT ?? 4001}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "API Backoffice Bingo",
      version: "0.1.0",
      description: [
        "API REST para administración del backoffice, portal del jugador, display público de bingo y pagos.",
        "",
        "**Autenticación**",
        "- **Backoffice:** `POST /auth/login` → JWT Bearer (`kind: user`). Permisos RBAC por códigos `bo.*`.",
        "- **Jugador:** `POST /player/login` → JWT Bearer (`kind: player`).",
        "",
        "En Swagger UI, usá **Authorize** y pegá el token JWT (sin la palabra `Bearer`).",
        "",
        "Cada operación incluye una descripción de para qué sirve y qué permisos requiere cuando aplica.",
      ].join("\n"),
    },
    servers: [{ url: serverUrl, description: "Entorno actual" }],
    tags,
    paths: mergePaths(
      healthAuthPaths,
      adminUsersRolesPaths,
      adminGamePaths,
      publicBingoPaths,
      playerPortalPaths,
      paymentsPaths,
    ),
    components,
  };
}
