# Matriz ruta → permisos (backoffice API)

Referencia para RBAC server-side. Códigos en `api/src/lib/functionality-codes.ts` y seed `api/scripts/seed.ts`.

## Rutas públicas (sin JWT backoffice)

| Método | Path | Auth |
|--------|------|------|
| GET | `/health` | — |
| POST | `/auth/login`, `/auth/login/totp` | Rate limit |
| POST | `/player/register`, `/player/login` | Rate limit |
| GET/POST | `/webhooks/payments/:providerId` | Mixer: `X-Signature` HMAC; stub (dev): `X-Webhook-Secret`. Ver Fase 2 ✅ |
| GET | `/public/bingos/*` | Solo lectura |

## Auth (JWT backoffice, sin funcionalidad extra)

| Método | Path | Notas |
|--------|------|-------|
| GET | `/auth/me` | Usuario activo |
| POST | `/auth/totp/*` | Propio usuario |

## Admin — funcionalidad requerida

| Prefijo | Funcionalidad | Notas |
|---------|---------------|-------|
| `/users/*` | `bo.users.manage` | Anti-escalación en POST/PATCH roles |
| `/roles` GET | `bo.roles.manage` **OR** `bo.users.manage` | Listado para pantallas admin |
| `/roles` POST/PATCH | `bo.roles.manage` | Subset de funcionalidades del actor |
| `/functionalities` GET | `bo.functionalities.manage` **OR** `bo.roles.manage` **OR** `bo.users.manage` |
| `/functionalities` POST/PATCH | `bo.functionalities.manage` |
| `/backoffice/rooms/*` | `bo.room.manage` |
| `/backoffice/bingos/*` | `bo.bingo.manage` | Incluye live draw, rounds |
| `/backoffice/players/*` | `bo.players.manage` | Wallet manual, prize-credits |
| `/backoffice/payment-methods/*` | `bo.payments.manage` |

## Player portal (`kind: player`)

| Prefijo | Auth |
|---------|------|
| `/player/*` (protegido) | `requirePlayer` → `auth.sub` |

## Implementación

- Middleware: `api/src/middleware/require-functionality.ts`
- Guards usuarios/roles: `api/src/lib/user-role-guards.ts`
