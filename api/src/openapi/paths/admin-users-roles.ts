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

export const adminUsersRolesPaths: OpenAPIV3.PathsObject = {
  "/users": {
    get: {
      tags: ["Usuarios"],
      summary: "Listar usuarios del backoffice",
      description:
        "Obtiene todos los usuarios administrativos con sus roles. Requiere permiso `bo.users.manage`. Usado en la pantalla de administración de usuarios.",
      security: backofficeSec,
      responses: { "200": { description: "Lista de usuarios con roles." }, ...stdErrorResponses },
    },
    post: {
      tags: ["Usuarios"],
      summary: "Crear usuario del backoffice",
      description:
        "Da de alta un nuevo usuario administrativo. Solo se pueden asignar roles cuyos permisos ya tenga el usuario que crea (anti-escalación). Requiere `bo.users.manage`.",
      security: backofficeSec,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                email: { type: "string", format: "email" },
                password: { type: "string", minLength: 8 },
                displayName: { type: "string" },
                active: { type: "boolean" },
                roleIds: { type: "array", items: { type: "string", format: "uuid" } },
              },
              required: ["email", "password"],
            },
          },
        },
      },
      responses: { "201": { description: "Usuario creado." }, ...stdErrorResponses },
    },
  },
  "/users/{id}": {
    patch: {
      tags: ["Usuarios"],
      summary: "Actualizar usuario del backoffice",
      description:
        "Modifica nombre, estado activo, contraseña o roles de un usuario. No permite asignar roles con permisos superiores a los del operador ni editar usuarios con más privilegios que el propio (anti-escalación). No se puede desactivar al último administrador activo.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID del usuario a modificar.")],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                displayName: { type: "string", nullable: true },
                active: { type: "boolean" },
                password: { type: "string", minLength: 8 },
                roleIds: { type: "array", items: { type: "string", format: "uuid" } },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Usuario actualizado." }, ...stdErrorResponses },
    },
  },
  "/roles": {
    get: {
      tags: ["Roles"],
      summary: "Listar roles",
      description:
        "Devuelve los roles del sistema con sus funcionalidades asociadas. Accesible con permiso de lectura de roles o gestión de usuarios.",
      security: backofficeSec,
      responses: { "200": { description: "Lista de roles." }, ...stdErrorResponses },
    },
    post: {
      tags: ["Roles"],
      summary: "Crear rol",
      description:
        "Crea un rol RBAC nuevo con un conjunto de funcionalidades. Solo se pueden otorgar permisos que el operador ya posea. Requiere `bo.roles.manage`.",
      security: backofficeSec,
      responses: { "201": { description: "Rol creado." }, ...stdErrorResponses },
    },
  },
  "/roles/{id}": {
    patch: {
      tags: ["Roles"],
      summary: "Actualizar rol",
      description:
        "Modifica nombre, descripción o funcionalidades de un rol existente. Aplica las mismas reglas anti-escalación que la creación. Requiere `bo.roles.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID del rol.")],
      responses: { "200": { description: "Rol actualizado." }, ...stdErrorResponses },
    },
  },
  "/functionalities": {
    get: {
      tags: ["Funcionalidades"],
      summary: "Listar funcionalidades",
      description:
        "Catálogo de permisos disponibles (`bo.users.manage`, `bo.bingo.manage`, etc.). Usado al configurar roles y validar RBAC.",
      security: backofficeSec,
      responses: { "200": { description: "Catálogo de funcionalidades." }, ...stdErrorResponses },
    },
    post: {
      tags: ["Funcionalidades"],
      summary: "Crear funcionalidad",
      description:
        "Agrega una nueva entrada al catálogo de permisos. Uso avanzado; la mayoría vienen del seed. Requiere `bo.functionalities.manage`.",
      security: backofficeSec,
      responses: { "201": { description: "Funcionalidad creada." }, ...stdErrorResponses },
    },
  },
  "/functionalities/{id}": {
    patch: {
      tags: ["Funcionalidades"],
      summary: "Actualizar funcionalidad",
      description: "Modifica nombre o módulo de una funcionalidad del catálogo. Requiere `bo.functionalities.manage`.",
      security: backofficeSec,
      parameters: [uuidPath("id", "ID de la funcionalidad.")],
      responses: { "200": { description: "Funcionalidad actualizada." }, ...stdErrorResponses },
    },
  },
};
