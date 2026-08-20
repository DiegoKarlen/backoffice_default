import type { OpenAPIV3 } from "openapi-types";
import { stdErrorResponses } from "../components.js";

const playerSec: OpenAPIV3.SecurityRequirementObject[] = [{ playerBearer: [] }];
const providerPath: OpenAPIV3.ParameterObject = {
  name: "providerId",
  in: "path",
  required: true,
  schema: { type: "string", enum: ["stub", "mixer-gaming"] },
  description: "Identificador del proveedor de pagos (`stub` para pruebas, `mixer-gaming` en sandbox).",
};

export const paymentsPaths: OpenAPIV3.PathsObject = {
  "/player/deposits/payment-methods": {
    get: {
      tags: ["Pagos"],
      summary: "Métodos de depósito disponibles",
      description:
        "Lista métodos de pago activos que el jugador puede usar para cargar saldo, con montos mín/máx según su perfil.",
      security: playerSec,
      responses: { "200": { description: "Métodos disponibles." }, ...stdErrorResponses },
    },
  },
  "/player/deposits": {
    post: {
      tags: ["Pagos"],
      summary: "Iniciar depósito",
      description:
        "Crea una intención de depósito y redirige al proveedor (MixerGaming, etc.). Puede requerir completar perfil (DNI, teléfono) si falta data.",
      security: playerSec,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/DepositInitRequest" },
          },
        },
      },
      responses: { "201": { description: "Depósito iniciado; URL o datos del PSP." }, ...stdErrorResponses },
    },
  },
  "/player/deposits/{depositId}": {
    get: {
      tags: ["Pagos"],
      summary: "Estado de un depósito",
      description: "Consulta el estado de un depósito iniciado por el jugador (pendiente, acreditado, fallido).",
      security: playerSec,
      parameters: [
        {
          name: "depositId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "ID del depósito.",
        },
      ],
      responses: { "200": { description: "Detalle del depósito." }, ...stdErrorResponses },
    },
  },
  "/webhooks/payments/{providerId}": {
    get: {
      tags: ["Pagos"],
      summary: "Ping del webhook",
      description:
        "Validación de URL del webhook (navegador o PSP). Indica que el endpoint acepta POST con el payload del proveedor.",
      parameters: [providerPath],
      responses: { "200": { description: "Información del webhook." }, ...stdErrorResponses },
    },
    post: {
      tags: ["Pagos"],
      summary: "Webhook del proveedor de pagos",
      description:
        "Callback del PSP cuando un depósito se confirma o falla.\n\n" +
        "**Mixer (`providerId=mixer-gaming`):** header obligatorio `X-Signature` — HMAC-SHA256 hex (minúsculas) sobre " +
        "`{transaction.id}_{transaction.amount}_{transaction.currency}_{transaction.user_id}`" +
        " (wiki Mixer §3.5). Secret en servidor: `PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET`.\n\n" +
        "Calcular firma para pruebas: `npx tsx scripts/sign-mixer-webhook.ts`.\n\n" +
        "_Proveedor `stub` (solo dev/local): usa `X-Webhook-Secret` — no documentado aquí; deshabilitado en producción._",
      parameters: [
        providerPath,
        {
          name: "X-Signature",
          in: "header",
          required: true,
          schema: { type: "string" },
          description:
            "Mixer Gaming: HMAC-SHA256 hex (minúsculas) sobre `{transaction.id}_{transaction.amount}_{transaction.currency}_{transaction.user_id}`.",
          example: "383b8f6a943459ca75e24bca6219cc3bbea1740cff64ef4ad09f113151337abb",
        },
      ],
      requestBody: {
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { "200": { description: "Webhook procesado." }, ...stdErrorResponses },
    },
  },
};
