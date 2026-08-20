import type { OpenAPIV3 } from "openapi-types";
import { stdErrorResponses } from "../components.js";

const backofficeSec: OpenAPIV3.SecurityRequirementObject[] = [{ backofficeBearer: [] }];
const uuidPath = (name: string, description: string): OpenAPIV3.ParameterObject => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
  description,
});
const roomSlugQuery: OpenAPIV3.ParameterObject = {
  name: "roomSlug",
  in: "query",
  required: true,
  schema: { type: "string", example: "general" },
  description: "Slug de la sala (ej. `general`).",
};

export const adminGamePaths: OpenAPIV3.PathsObject = {
  "/backoffice/rooms": {
    get: {
      tags: ["Salas"],
      summary: "Listar salas",
      description: "Lista todas las salas de bingo configuradas. Requiere `bo.room.manage`.",
      security: backofficeSec,
      responses: { "200": { description: "Listado de salas." }, ...stdErrorResponses },
    },
    post: {
      tags: ["Salas"],
      summary: "Crear sala",
      description: "Da de alta una nueva sala de bingo con nombre y slug. Requiere `bo.room.manage`.",
      security: backofficeSec,
      responses: { "201": { description: "Sala creada." }, ...stdErrorResponses },
    },
  },
  "/backoffice/rooms/{id}": {
    get: {
      tags: ["Salas"],
      summary: "Obtener sala",
      description: "Detalle de una sala por ID. Requiere `bo.room.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID de la sala.")],
      responses: { "200": { description: "Datos de la sala." }, ...stdErrorResponses },
    },
    put: {
      tags: ["Salas"],
      summary: "Reemplazar sala",
      description: "Actualización completa de los datos de una sala. Requiere `bo.room.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID de la sala.")],
      responses: { "200": { description: "Sala actualizada." }, ...stdErrorResponses },
    },
    patch: {
      tags: ["Salas"],
      summary: "Modificar sala parcialmente",
      description: "Actualiza campos puntuales de una sala (estado, nombre, etc.). Requiere `bo.room.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID de la sala.")],
      responses: { "200": { description: "Sala actualizada." }, ...stdErrorResponses },
    },
    delete: {
      tags: ["Salas"],
      summary: "Eliminar sala",
      description: "Elimina una sala si no tiene dependencias que lo impidan. Requiere `bo.room.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID de la sala.")],
      responses: { "204": { description: "Sala eliminada." }, ...stdErrorResponses },
    },
  },
  "/backoffice/bingos": {
    get: {
      tags: ["Bingos"],
      summary: "Listar bingos",
      description:
        "Listado de bingos con filtros opcionales (nombre, estado, tipo). Requiere `bo.bingo.manage`.",
      security: backofficeSec,
      responses: { "200": { description: "Listado de bingos." }, ...stdErrorResponses },
    },
    post: {
      tags: ["Bingos"],
      summary: "Crear bingo",
      description:
        "Crea un bingo con premios, horarios y configuración de partidas. Requiere `bo.bingo.manage`.",
      security: backofficeSec,
      responses: { "201": { description: "Bingo creado." }, ...stdErrorResponses },
    },
  },
  "/backoffice/bingos/upcoming": {
    get: {
      tags: ["Bingos"],
      summary: "Próximas partidas (backoffice)",
      description:
        "Partidas programadas y en curso para mostrar en el panel admin (misma lógica que el endpoint público, pero autenticado).",
      security: backofficeSec,
      responses: { "200": { description: "Payload de partidas próximas." }, ...stdErrorResponses },
    },
  },
  "/backoffice/bingos/{id}": {
    get: {
      tags: ["Bingos"],
      summary: "Obtener bingo",
      description: "Detalle completo de un bingo: premios, rounds, configuración. Requiere `bo.bingo.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID del bingo.")],
      responses: { "200": { description: "Detalle del bingo." }, ...stdErrorResponses },
    },
    put: {
      tags: ["Bingos"],
      summary: "Actualizar bingo",
      description: "Reemplaza la configuración de un bingo existente. Requiere `bo.bingo.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID del bingo.")],
      responses: { "200": { description: "Bingo actualizado." }, ...stdErrorResponses },
    },
    patch: {
      tags: ["Bingos"],
      summary: "Modificar estado o campos del bingo",
      description: "Cambios parciales (ej. activar/desactivar, ajustar campos). Requiere `bo.bingo.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID del bingo.")],
      responses: { "200": { description: "Bingo actualizado." }, ...stdErrorResponses },
    },
    delete: {
      tags: ["Bingos"],
      summary: "Eliminar bingo",
      description: "Elimina un bingo si las reglas de negocio lo permiten. Requiere `bo.bingo.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID del bingo.")],
      responses: { "204": { description: "Bingo eliminado." }, ...stdErrorResponses },
    },
  },
  "/backoffice/bingos/{id}/rounds": {
    get: {
      tags: ["Bingos"],
      summary: "Listar partidas de un bingo",
      description: "Todas las partidas (rounds) generadas para un bingo, con estado y horarios.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID del bingo.")],
      responses: { "200": { description: "Listado de partidas." }, ...stdErrorResponses },
    },
  },
  "/backoffice/bingos/{id}/rounds/{roundId}": {
    get: {
      tags: ["Bingos"],
      summary: "Detalle de una partida",
      description: "Información de una partida concreta: premios, bolillas, estado y desglose.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID del bingo."), uuidPath("roundId", "ID de la partida.")],
      responses: { "200": { description: "Detalle de la partida." }, ...stdErrorResponses },
    },
  },
  "/backoffice/bingos/{id}/rounds/{roundId}/purchased-cards": {
    get: {
      tags: ["Bingos"],
      summary: "Cartones comprados en una partida",
      description: "Lista de cartones vendidos para una partida, con jugador y fingerprint. Útil para auditoría y premios.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID del bingo."), uuidPath("roundId", "ID de la partida.")],
      responses: { "200": { description: "Listado de cartones." }, ...stdErrorResponses },
    },
  },
  "/backoffice/bingos/live/state": {
    get: {
      tags: ["Bingos"],
      summary: "Estado del sorteo en vivo (backoffice)",
      description:
        "Snapshot del juego en curso para una sala: fase (idle/countdown/drawing), bolillas salidas, premios, etc. Usado por el panel de control del operador.",
      security: backofficeSec,
      parameters: [roomSlugQuery],
      responses: { "200": { description: "Estado en vivo de la sala." }, ...stdErrorResponses },
    },
  },
  "/backoffice/bingos/live/draw-ball": {
    post: {
      tags: ["Bingos"],
      summary: "Registrar bolilla sorteada",
      description:
        "Marca manualmente una bolilla durante el sorteo en vivo (cherry-pick desde el backoffice). Dispara evaluación de premios y broadcast al display. Requiere `bo.bingo.manage`. Parámetro `roomSlug` obligatorio.",
      security: backofficeSec,
      parameters: [roomSlugQuery],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/DrawBallRequest" },
          },
        },
      },
      responses: { "200": { description: "Bolilla registrada." }, ...stdErrorResponses },
    },
  },
  "/backoffice/bingos/live/stop": {
    post: {
      tags: ["Bingos"],
      summary: "Detener sorteo en vivo",
      description:
        "Solicita la detención del sorteo en curso para la sala indicada. El motor finaliza la partida según las reglas configuradas.",
      security: backofficeSec,
      parameters: [roomSlugQuery],
      responses: { "200": { description: "Detención solicitada." }, ...stdErrorResponses },
    },
  },
  "/backoffice/players": {
    get: {
      tags: ["Jugadores"],
      summary: "Listar jugadores",
      description: "Listado paginado/filtrable de jugadores registrados. Requiere `bo.players.manage`.",
      security: backofficeSec,
      responses: { "200": { description: "Listado de jugadores." }, ...stdErrorResponses },
    },
  },
  "/backoffice/players/{playerId}": {
    get: {
      tags: ["Jugadores"],
      summary: "Detalle de jugador",
      description: "Perfil del jugador, wallet y datos de cuenta. Requiere `bo.players.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("playerId", "ID del jugador.")],
      responses: { "200": { description: "Datos del jugador." }, ...stdErrorResponses },
    },
  },
  "/backoffice/players/{playerId}/wallet/transactions": {
    get: {
      tags: ["Jugadores"],
      summary: "Movimientos del wallet (admin)",
      description:
        "Historial de transacciones del jugador (compras, premios, depósitos, créditos manuales) con filtros. Requiere `bo.players.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("playerId", "ID del jugador.")],
      responses: { "200": { description: "Listado de transacciones." }, ...stdErrorResponses },
    },
  },
  "/backoffice/players/{playerId}/wallet/manual-credits": {
    post: {
      tags: ["Jugadores"],
      summary: "Crédito manual al wallet",
      description:
        "Acredita saldo al jugador de forma manual (ajuste operativo, bonificación, etc.). Registra al admin en `AdminAuditLog` y respeta `MAX_MANUAL_CREDIT_CENTS`. Requiere `bo.players.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("playerId", "ID del jugador.")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ManualCreditRequest" },
          },
        },
      },
      responses: { "201": { description: "Saldo acreditado." }, ...stdErrorResponses },
    },
  },
  "/backoffice/players/{playerId}/prize-credits": {
    post: {
      tags: ["Jugadores"],
      summary: "Acreditar premio a ganador",
      description:
        "Acredita un premio al wallet del jugador. Requiere victoria registrada por el motor (`DeferredRoundPrizeWin`); sin fila → 404. Segundo intento mismo cartón/premio → 409. Requiere `bo.players.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("playerId", "ID del jugador.")],
      responses: { "201": { description: "Premio acreditado." }, ...stdErrorResponses },
    },
  },
  "/backoffice/payment-methods": {
    get: {
      tags: ["Métodos de pago"],
      summary: "Listar métodos de pago",
      description: "Métodos de depósito disponibles para configurar en el backoffice. Requiere `bo.payments.manage`.",
      security: backofficeSec,
      responses: { "200": { description: "Listado de métodos." }, ...stdErrorResponses },
    },
  },
  "/backoffice/payment-methods/{id}": {
    patch: {
      tags: ["Métodos de pago"],
      summary: "Actualizar método de pago",
      description: "Activa/desactiva o ajusta límites y orden de un método de depósito. Requiere `bo.payments.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID del método de pago.")],
      responses: { "200": { description: "Método actualizado." }, ...stdErrorResponses },
    },
  },
};
