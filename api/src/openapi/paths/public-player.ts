import type { OpenAPIV3 } from "openapi-types";
import { stdErrorResponses } from "../components.js";

const playerSec: OpenAPIV3.SecurityRequirementObject[] = [{ playerBearer: [] }];
const roomSlugQuery: OpenAPIV3.ParameterObject = {
  name: "roomSlug",
  in: "query",
  required: true,
  schema: { type: "string", example: "general" },
  description: "Slug de la sala (ej. `general`).",
};

export const publicBingoPaths: OpenAPIV3.PathsObject = {
  "/public/bingos/rooms": {
    get: {
      tags: ["Bingo público"],
      summary: "Listar salas activas",
      description:
        "Devuelve las salas de bingo disponibles para el display y portales. No requiere autenticación. Usado al elegir sala en el visor público.",
      responses: { "200": { description: "Listado público de salas." }, ...stdErrorResponses },
    },
  },
  "/public/bingos/upcoming": {
    get: {
      tags: ["Bingo público"],
      summary: "Próximas partidas",
      description:
        "Partidas programadas con countdown, precio de cartón y premios. Alimenta la grilla de «próximos sorteos» en display y player portal. Sin autenticación.",
      responses: { "200": { description: "Partidas próximas y metadatos." }, ...stdErrorResponses },
    },
  },
  "/public/bingos/live/state": {
    get: {
      tags: ["Bingo público"],
      summary: "Estado del sorteo en vivo",
      description:
        "Snapshot JSON del juego en curso: fase, bolillas, cartones en juego, premios. Usado por el display para sincronizar UI (polling). Requiere `roomSlug`.",
      parameters: [roomSlugQuery],
      responses: { "200": { description: "Estado en vivo (JSON)." }, ...stdErrorResponses },
    },
  },
  "/public/bingos/current": {
    get: {
      tags: ["Bingo público"],
      summary: "Estado actual (alias)",
      description: "Equivalente a `/live/state`. Mantenido por compatibilidad con clientes legacy.",
      parameters: [roomSlugQuery],
      responses: { "200": { description: "Estado en vivo (JSON)." }, ...stdErrorResponses },
    },
  },
  "/public/bingos/live/events": {
    get: {
      tags: ["Bingo público"],
      summary: "Stream SSE del sorteo",
      description:
        "Conexión Server-Sent Events en tiempo real. Eventos: `state`, `round_start`, `ball`, `round_end`, `idle`. Usado por el bingo-display para animaciones sin polling constante.",
      parameters: [roomSlugQuery],
      responses: {
        "200": { description: "Flujo `text/event-stream`." },
        ...stdErrorResponses,
      },
    },
  },
};

export const playerPortalPaths: OpenAPIV3.PathsObject = {
  "/player/register": {
    post: {
      tags: ["Portal jugador"],
      summary: "Registrar jugador",
      description:
        "Alta de cuenta en el portal del jugador con email, username y contraseña. Crea wallet asociado. No requiere autenticación previa.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PlayerRegisterRequest" },
          },
        },
      },
      responses: { "201": { description: "Jugador registrado." }, ...stdErrorResponses },
    },
  },
  "/player/login": {
    post: {
      tags: ["Portal jugador"],
      summary: "Iniciar sesión (jugador)",
      description:
        "Autentica un jugador y devuelve JWT (`kind: player`) para wallet, compra de cartones y depósitos.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/LoginRequest" },
          },
        },
      },
      responses: { "200": { description: "JWT de jugador." }, ...stdErrorResponses },
    },
  },
  "/player/me": {
    get: {
      tags: ["Portal jugador"],
      summary: "Perfil del jugador",
      description: "Datos de la cuenta autenticada: email, username, saldo del wallet y moneda.",
      security: playerSec,
      responses: { "200": { description: "Perfil y wallet resumido." }, ...stdErrorResponses },
    },
  },
  "/player/wallet": {
    get: {
      tags: ["Portal jugador"],
      summary: "Saldo del wallet",
      description: "Consulta rápida del balance disponible para comprar cartones o depositar.",
      security: playerSec,
      responses: { "200": { description: "Balance y moneda." }, ...stdErrorResponses },
    },
  },
  "/player/wallet/transactions": {
    get: {
      tags: ["Portal jugador"],
      summary: "Historial de movimientos",
      description:
        "Transacciones del wallet del jugador con filtros por fecha, tipo, sala y partida. Usado en «Mi cuenta» / extracto.",
      security: playerSec,
      responses: { "200": { description: "Listado de transacciones." }, ...stdErrorResponses },
    },
  },
  "/player/my-cards": {
    get: {
      tags: ["Portal jugador"],
      summary: "Mis cartones",
      description:
        "Cartones comprados con la grilla 5×5 para marcar en el portal. Filtrable por partida, sala o rango de fechas.",
      security: playerSec,
      responses: { "200": { description: "Cartones con grillas." }, ...stdErrorResponses },
    },
  },
  "/player/bingo-rounds/{bingoRoundId}/carton-purchase": {
    post: {
      tags: ["Portal jugador"],
      summary: "Comprar cartones",
      description:
        "Compra uno o más cartones para una partida abierta. Debita el wallet, genera cartones únicos y valida saldo y ventana de compra.",
      security: playerSec,
      parameters: [
        {
          name: "bingoRoundId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
          description: "ID de la partida (round) a la que se compran cartones.",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CartonPurchaseRequest" },
          },
        },
      },
      responses: { "201": { description: "Compra realizada." }, ...stdErrorResponses },
    },
  },
};
