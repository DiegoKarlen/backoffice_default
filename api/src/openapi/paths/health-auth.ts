import type { OpenAPIV3 } from "openapi-types";
import { stdErrorResponses } from "../components.js";

const backofficeSec: OpenAPIV3.SecurityRequirementObject[] = [{ backofficeBearer: [] }];

export const healthAuthPaths: OpenAPIV3.PathsObject = {
  "/health": {
    get: {
      tags: ["Salud"],
      summary: "Estado de la API",
      description:
        "Verifica que el servicio esté en ejecución. Útil para monitoreo, balanceadores de carga y comprobaciones rápidas sin autenticación.",
      responses: {
        "200": {
          description: "La API responde correctamente.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/HealthResponse" },
            },
          },
        },
      },
    },
  },
  "/auth/login": {
    post: {
      tags: ["Autenticación"],
      summary: "Iniciar sesión (backoffice)",
      description:
        "Autentica un usuario del backoffice con email y contraseña. Devuelve un JWT para usar en el resto de endpoints de administración. Si el usuario tiene TOTP activo, responde con un token temporal para completar el login en `/auth/login/totp`.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/LoginRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "JWT emitido (o token pendiente de 2FA si TOTP está habilitado).",
          content: { "application/json": { schema: { type: "object" } } },
        },
        ...stdErrorResponses,
      },
    },
  },
  "/auth/login/totp": {
    post: {
      tags: ["Autenticación"],
      summary: "Completar login con TOTP",
      description:
        "Segundo paso del login cuando el usuario tiene autenticación en dos factores. Envía el token temporal de `/auth/login` y el código de la app autenticadora para obtener el JWT definitivo.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                twoFactorToken: { type: "string", description: "Token recibido en el login con 2FA pendiente." },
                code: { type: "string", minLength: 6, maxLength: 12, description: "Código TOTP de 6 dígitos." },
              },
              required: ["twoFactorToken", "code"],
            },
          },
        },
      },
      responses: { "200": { description: "JWT de backoffice emitido." }, ...stdErrorResponses },
    },
  },
  "/auth/me": {
    get: {
      tags: ["Autenticación"],
      summary: "Perfil del usuario actual",
      description:
        "Devuelve los datos del usuario backoffice autenticado: email, roles asignados y funcionalidades (permisos RBAC) efectivas. Sirve para armar menús y validar permisos en el frontend.",
      security: backofficeSec,
      responses: { "200": { description: "Perfil con roles y funcionalidades." }, ...stdErrorResponses },
    },
  },
  "/auth/totp/setup": {
    post: {
      tags: ["Autenticación"],
      summary: "Iniciar configuración TOTP",
      description:
        "Genera un secreto TOTP y la URL otpauth para escanear con Google Authenticator (u otra app). El 2FA no queda activo hasta confirmar con `/auth/totp/enable`.",
      security: backofficeSec,
      responses: { "200": { description: "Secreto y URL otpauth para la app autenticadora." }, ...stdErrorResponses },
    },
  },
  "/auth/totp/enable": {
    post: {
      tags: ["Autenticación"],
      summary: "Activar TOTP",
      description:
        "Confirma la configuración de autenticación en dos factores verificando un código válido generado con el secreto obtenido en `/auth/totp/setup`.",
      security: backofficeSec,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { code: { type: "string", description: "Código TOTP de verificación." } },
              required: ["code"],
            },
          },
        },
      },
      responses: { "200": { description: "TOTP activado en la cuenta." }, ...stdErrorResponses },
    },
  },
  "/auth/totp/disable": {
    post: {
      tags: ["Autenticación"],
      summary: "Desactivar TOTP",
      description:
        "Desactiva la autenticación en dos factores del usuario actual. Requiere confirmar la contraseña por seguridad.",
      security: backofficeSec,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { password: { type: "string", description: "Contraseña actual del usuario." } },
              required: ["password"],
            },
          },
        },
      },
      responses: { "200": { description: "TOTP desactivado." }, ...stdErrorResponses },
    },
  },
};
