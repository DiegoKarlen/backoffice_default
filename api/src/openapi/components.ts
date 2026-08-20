import type { OpenAPIV3 } from "openapi-types";

export const errorResponse: OpenAPIV3.ResponseObject = {
  description: "Error en la solicitud",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorBody" },
    },
  },
};

export const components: OpenAPIV3.ComponentsObject = {
  securitySchemes: {
    backofficeBearer: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description:
        "Token JWT de usuario backoffice obtenido con `POST /auth/login` (tipo `user`). Requerido en endpoints de administración.",
    },
    playerBearer: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description:
        "Token JWT de jugador obtenido con `POST /player/login` (tipo `player`). Requerido en el portal del jugador.",
    },
  },
  schemas: {
    ErrorBody: {
      type: "object",
      description: "Cuerpo estándar de error de la API.",
      properties: {
        error: { type: "string", description: "Mensaje de error legible." },
        code: { type: "string", description: "Código de error opcional (ej. DEPOSIT_PROFILE_INCOMPLETE)." },
        missing: {
          type: "array",
          items: { type: "string" },
          description: "Funcionalidades RBAC faltantes cuando la respuesta es 403.",
        },
      },
      required: ["error"],
    },
    HealthResponse: {
      type: "object",
      properties: { ok: { type: "boolean", example: true, description: "Indica que la API responde." } },
      required: ["ok"],
    },
    LoginRequest: {
      type: "object",
      description: "Credenciales de acceso (backoffice o jugador según el endpoint).",
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 1 },
      },
      required: ["email", "password"],
    },
    TokenResponse: {
      type: "object",
      properties: {
        accessToken: { type: "string", description: "JWT para usar en Authorization Bearer." },
        tokenType: { type: "string", example: "Bearer" },
        expiresIn: { type: "string", example: "8h" },
      },
      required: ["accessToken", "tokenType", "expiresIn"],
    },
    ManualCreditRequest: {
      type: "object",
      description: "Crédito manual al wallet de un jugador desde el backoffice.",
      properties: {
        amountCents: { type: "integer", minimum: 1, description: "Monto en centavos." },
        note: { type: "string", maxLength: 500, description: "Nota interna opcional." },
      },
      required: ["amountCents"],
    },
    DrawBallRequest: {
      type: "object",
      description: "Número de bolilla a registrar en el sorteo en vivo.",
      properties: {
        number: { type: "integer", minimum: 1, maximum: 90 },
      },
      required: ["number"],
    },
    CartonPurchaseRequest: {
      type: "object",
      description: "Compra de cartones para una partida.",
      properties: {
        quantity: { type: "integer", minimum: 1, maximum: 99, description: "Cantidad de cartones." },
      },
      required: ["quantity"],
    },
    PlayerRegisterRequest: {
      type: "object",
      description: "Alta de un nuevo jugador en el portal.",
      properties: {
        email: { type: "string", format: "email" },
        username: { type: "string", minLength: 3, maxLength: 32 },
        password: { type: "string", minLength: 8 },
      },
      required: ["email", "username", "password"],
    },
    DepositInitRequest: {
      type: "object",
      description: "Inicio de un depósito al wallet del jugador vía proveedor de pagos.",
      properties: {
        amountCents: { type: "integer", minimum: 1 },
        paymentMethodId: { type: "string", format: "uuid" },
        providerId: { type: "string", enum: ["stub", "mixer-gaming"] },
        profile: {
          type: "object",
          description: "Datos de perfil requeridos por el PSP si aún no están completos.",
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            dni: { type: "string" },
            phone: { type: "string" },
            phoneCode: { type: "string" },
            countryCode: { type: "string", minLength: 2, maxLength: 2 },
          },
        },
      },
      required: ["amountCents", "paymentMethodId"],
    },
  },
  parameters: {
    RoomSlugQuery: {
      name: "roomSlug",
      in: "query",
      required: true,
      schema: { type: "string", example: "general" },
      description: "Identificador slug de la sala de bingo (ej. `general`).",
    },
  },
};

export const tags: OpenAPIV3.TagObject[] = [
  { name: "Salud", description: "Comprobación de que la API está en línea." },
  { name: "Autenticación", description: "Login del backoffice y autenticación en dos pasos (TOTP)." },
  { name: "Usuarios", description: "Administración de usuarios del backoffice. Requiere `bo.users.manage`." },
  { name: "Roles", description: "Roles y permisos RBAC. Creación/edición requiere `bo.roles.manage`." },
  { name: "Funcionalidades", description: "Catálogo de permisos del sistema (`bo.*`)." },
  { name: "Salas", description: "ABM de salas de bingo. Requiere `bo.room.manage`." },
  { name: "Bingos", description: "Configuración de bingos, partidas y sorteo en vivo. Requiere `bo.bingo.manage`." },
  { name: "Jugadores", description: "Consulta y operaciones sobre jugadores y wallet. Requiere `bo.players.manage`." },
  { name: "Métodos de pago", description: "Configuración de métodos de depósito. Requiere `bo.payments.manage`." },
  { name: "Bingo público", description: "Endpoints de solo lectura para el display y clientes públicos (sin autenticación)." },
  { name: "Portal jugador", description: "Registro, login, wallet, cartones y compras del jugador autenticado." },
  { name: "Pagos", description: "Depósitos del jugador y webhooks de proveedores de pago." },
];

export const stdErrorResponses: OpenAPIV3.ResponsesObject = {
  "400": errorResponse,
  "401": errorResponse,
  "403": errorResponse,
  "404": errorResponse,
  "409": errorResponse,
  "500": errorResponse,
};
