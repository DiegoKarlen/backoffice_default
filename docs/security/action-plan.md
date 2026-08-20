# Plan de acción — Seguridad (Bingo / Backoffice / Portal)

Documento vivo para planificar, implementar y verificar el hardening del sistema antes y después de exposición pública.

**Auditoría base:** revisión estática del código (ago 2026).  
**Última actualización:** 2026-08-12

---

## Cómo usar este documento

1. Marcar tareas completadas cambiando `- [ ]` → `- [x]`.
2. Actualizar la tabla **Progreso global** al cerrar cada fase.
3. Cada fase tiene **criterios de aceptación** — no dar por terminada la fase hasta cumplirlos.
4. Los PRs sugeridos van en branches `feature/security-*` mergeados a `main`.

### Leyenda de prioridad

| Etiqueta | Significado |
|----------|-------------|
| **P0** | Bloqueante para producción pública |
| **P1** | Muy recomendable antes de escala / dinero real |
| **P2** | Endurecimiento adicional |

### Leyenda de estado

| Estado | Significado |
|--------|-------------|
| ⬜ Pendiente | No iniciado |
| 🟨 En progreso | Implementación en curso |
| ✅ Hecho | Implementado + criterios cumplidos |
| ⏸️ Diferido | Consciente, pospuesto (documentar motivo) |

---

## Progreso global

| Fase | Prioridad | Estado | PR / branch |
|------|-----------|--------|-------------|
| 0 — Inventario y baseline | — | ✅ Hecho | — |
| 1 — RBAC server-side | P0 | 🟨 En progreso | `feature/security-hardening` |
| 2 — Webhooks y pagos | P0 | ⬜ Pendiente | `feature/security-webhooks` |
| 3 — Premios e idempotencia | P0 | ⬜ Pendiente | `feature/security-prizes` |
| 4 — Tokens y sesiones | P1 | ⬜ Pendiente | `feature/security-auth-hardening` |
| 5 — Integridad del sorteo | P1 | ⬜ Pendiente | `feature/security-bingo-integrity` |
| 6 — Perímetro y abuse | P2 | ⬜ Pendiente | `feature/security-perimeter` |
| 7 — Tests, CI y docs | — | ⬜ Pendiente | (varios PRs) |

---

## Resumen de vulnerabilidades (referencia)

| ID | Severidad | Problema | Fase que lo cierra |
|----|-----------|----------|-------------------|
| C1 | Crítica | RBAC solo en frontend; API acepta cualquier JWT BO | 1 |
| C2 | Crítica | Escalación de privilegios vía `/users` y `/roles` | 1 |
| C3 | Crítica | Webhooks de pago sin autenticación/firma | 2 |
| C4 | Crítica | `prize-credits` sin validar ganador; payouts repetibles | 3 |
| H1 | Alta | JWT no revalida `active` / roles en DB | 4 |
| H2 | Alta | `JWT_SECRET` débil en dev; riesgo si filtra a prod | 4 |
| H3 | Alta | Modo LIVE: operador puede elegir bolas viendo cartones | 5 |
| H4 | Alta | `draw-ball` concurrente sin serialización | 5 |
| H5 | Alta | Sesión live en memoria (multi-instancia) | 5 |
| H6 | Alta | Jugador inactivo sigue usando API con JWT viejo | 4 |
| M1–M6 | Media | Registro abierto, redirect, CORS, enumeración, etc. | 6 |

### Lo que ya funciona bien (no romper)

- Separación JWT `kind: "player"` vs backoffice
- Jugador A no accede a datos de jugador B (`auth.sub`)
- Rutas `/public/bingos/*` solo lectura (sin `draw-ball`)
- Cartones generados en servidor; evaluación de premios en motor
- Wallet con lock de fila y balance no negativo
- bcrypt, rate limit en login, TOTP opcional en BO

---

## Fase 0 — Inventario y baseline

**Objetivo:** definir exactamente qué proteger y tener tests que fallen hoy y pasen al final.

| **Branch activa** | `feature/security-hardening` |

### Tareas

- [x] Crear `docs/security/route-permissions.md` (matriz ruta → auth → funcionalidad)
- [x] Crear carpeta `api/tests/security/` con esqueleto de tests → `api/tests/unit/middleware/rbac.unit.test.ts`
- [x] Documentar variables de entorno obligatorias para producción en `docs/security/production-checklist.md`
- [ ] Listar funcionalidades existentes en seed (referencia):

| Código | Uso previsto |
|--------|----------------|
| `bo.users.manage` | CRUD usuarios BO |
| `bo.roles.manage` | CRUD roles |
| `bo.functionalities.manage` | Catálogo funcionalidades |
| `bo.bingo.manage` | Bingos, sorteo live, draw-ball |
| `bo.room.manage` | Salas |
| `bo.players.manage` | Jugadores, wallet manual, premios |
| `bo.payments.manage` | Métodos de pago |

### Criterios de aceptación

- [x] Matriz cubre todas las rutas en `api/src/index.ts`
- [x] Al menos un test de seguridad ejecutable con `npm test` (aunque falle inicialmente)
- [x] Checklist de producción revisado

---

## Fase 1 — RBAC server-side (P0)

**Cierra:** C1, C2, parte de H5

**Problema:** cualquier usuario con JWT de backoffice puede llamar APIs de admin, créditos, sorteo y usuarios.

### Tareas

#### 1.1 Middleware y carga de permisos

- [x] Crear `api/src/lib/user-permissions.ts` — resolver functionalities del user desde DB
- [x] Crear `api/src/middleware/require-functionality.ts`
  - [x] Rechazar si `!user.active` → 401
  - [x] Rechazar si falta funcionalidad → 403
- [ ] (Opcional) Rol `admin` / super-admin documentado si bypass controlado — sin bypass; rol `admin` vía seed con todas las funcionalidades

#### 1.2 Aplicar en routers

- [x] `api/src/routes/users.ts` — `bo.users.manage` en mutaciones
- [x] `api/src/routes/roles.ts` — `bo.roles.manage`
- [x] `api/src/routes/functionalities.ts` — lectura restringida
- [x] `api/src/routes/rooms.ts` — `bo.room.manage`
- [x] `api/src/routes/bingos.ts` — `bo.bingo.manage`
- [x] `api/src/routes/bingo-live-backoffice.ts` — vía router bingos
- [x] `api/src/routes/players.ts` — `bo.players.manage` en credits/premios; read en GETs sensibles
- [x] `api/src/routes/payment-methods.ts` — `bo.payments.manage`

#### 1.3 Anti-escalación en `/users`

- [x] Usuario no puede asignarse roles que no tenía (salvo super-admin)
- [x] Usuario no puede editar cuentas con privilegio superior al propio
- [x] No desactivar al último admin activo

#### 1.4 Frontend (defensa en profundidad)

- [x] `backoffice/.../bo-api.js` — manejar 403 globalmente (mensaje claro)

### Criterios de aceptación

- [x] User BO **sin** `bo.players.manage` → 403 en `POST .../wallet/manual-credits`
- [x] User BO **sin** `bo.bingo.manage` → 403 en `POST .../live/draw-ball`
- [x] User BO normal **no puede** `PATCH /users/self` con `roleIds` de admin
- [x] Tests `api/tests/integration/security/rbac.integration.test.ts` en verde

---

## Fase 2 — Webhooks y pagos (P0)

**Cierra:** C3

**Problema:** `POST /webhooks/payments/*` acredita wallet sin firma ni secret.

### Tareas

#### 2.1 Autenticación de webhooks

- [x] Crear `api/src/payments/middleware/verify-webhook.ts`
- [x] **Stub:** solo si `WEBHOOK_STUB_ENABLED=1` y `NODE_ENV !== production`
- [x] **Stub:** header `X-Webhook-Secret` (env `PAYMENTS_WEBHOOK_STUB_SECRET`, solo dev)
- [x] **Mixer Gaming:** header `X-Signature` HMAC-SHA256 (env `PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET`, wiki §3.5)
- [x] Rate limit en `/webhooks/payments/*`

#### 2.2 Idempotencia

- [x] Depósito `COMPLETED` + `alreadyProcessed` evita doble crédito (existente)
- [x] Log de intentos fallidos (IP, provider, motivo) vía `logWarn`

#### 2.3 Créditos manuales (refuerzo)

- [x] Tras Fase 1, exigir `bo.players.manage` — ya aplicado en Fase 1
- [x] Límite configurable `MAX_MANUAL_CREDIT_CENTS`
- [x] Tabla o log `AdminAuditLog` para créditos manuales

#### 2.4 Configuración producción

- [x] `WEBHOOK_STUB_ENABLED=0` en prod (fail-fast al arrancar si =1)
- [x] Documentar secrets en `docs/security/production-checklist.md`

### Criterios de aceptación

- [x] Webhook stub sin secret → 401
- [x] Stub deshabilitado en prod → no acredita (404 provider)
- [x] Replay del mismo webhook → no doble crédito
- [x] Tests `api/tests/integration/security/webhooks.integration.test.ts` en verde

---

## Fase 3 — Premios e idempotencia (P0)

**Cierra:** C4

**Problema:** `prize-credits` acredita sin ganar; settlement concurrente puede duplicar pago.

### Tareas

#### 3.1 Endpoint `prize-credits`

- [x] **Opción B:** exigir fila en `DeferredRoundPrizeWin` antes de acreditar
- [x] Rechazar si el motor no registró la victoria → 404

#### 3.2 Schema

- [x] Unique constraint en `PrizePayout`: `(bingoPrizeId, playerRoundCardId)`
- [x] Migración Prisma

#### 3.3 Settlement diferido

- [x] `SELECT ... FOR UPDATE` en `DeferredRoundPrizeWin` en `settle-deferred-split-prizes.ts`
- [x] Marcar filas settled (delete) en la misma transacción que el crédito

### Criterios de aceptación

- [x] `prize-credits` sin win en motor → 403 o 404
- [x] Segundo crédito mismo cartón/premio → 409
- [x] Test de concurrencia settlement → un solo pago
- [x] Tests `api/tests/integration/security/prizes.integration.test.ts` en verde

---

## Fase 4 — Tokens y sesiones (P1)

**Cierra:** H1, H2, H6

### Tareas

#### 4.1 Revalidación en cada request

- [x] Tras JWT válido, cargar user/player y verificar `active`
- [ ] (Opcional) `tokenVersion` en JWT vs DB; bump al cambiar password / desactivar / TOTP — **postergado**

#### 4.2 Arranque en producción

- [x] Fail-fast si `JWT_SECRET` es valor de dev conocido
- [x] Fail-fast si `WEBHOOK_STUB_ENABLED=1` en production (Fase 2)
- [x] Documentar rotación de secrets

#### 4.3 Portal jugador

- [x] Middleware: jugador inactivo → 401 en **todos** los routes `/player/*` protegidos

#### 4.4 (Opcional) TTL / refresh

- [ ] Evaluar acortar JWT o refresh tokens con revocación — **postergado**

### Criterios de aceptación

- [x] User BO desactivado → 401 en siguiente request
- [x] Player desactivado → 401 en wallet y compras
- [x] API no arranca en prod con config insegura
- [x] Tests `api/tests/integration/security/auth-boundaries.integration.test.ts` en verde

---

## Fase 5 — Integridad del sorteo (P1)

**Cierra:** H3, H4, H5

### Tareas

#### 5.1 Concurrencia

- [ ] Mutex/cola serializada por sala en `draw-ball`
- [ ] Unique DB: `(roundId, number)` en bolas sorteadas

#### 5.2 Persistencia fail-closed

- [ ] Si falla insert de `bingoRoundBall` → revertir estado in-memory; no evaluar premios

#### 5.3 Modo LIVE (insider threat)

- [ ] Auditoría: tabla `BingoRoundBallAudit` (userId, ball, timestamp, ip)
- [ ] Evaluar ocultar cartones de jugadores durante `DRAWING` en BO (solo rol auditor)
- [ ] (Opcional) Dual control para marcar bola en LIVE

#### 5.4 Multi-instancia

- [ ] Documentar: single-instance hasta Redis store
- [ ] (Futuro) `live-session-store-redis.ts` + lock distribuido

### Criterios de aceptación

- [ ] Requests paralelos a `draw-ball` → orden consistente, sin duplicados
- [ ] Fallo DB en bola → sorteo no avanza en memoria
- [ ] Tests `api/tests/security/draw-concurrency.test.ts` en verde

---

## Fase 6 — Perímetro y abuse (P2)

### Tareas

- [ ] Rate limit más estricto en `POST /player/register`
- [ ] Mensaje genérico en 409 registro (no revelar email vs username)
- [ ] CAPTCHA en registro/login tras N fallos
- [ ] Validar `next` en signin BO (solo paths relativos allowlist)
- [ ] Headers de seguridad (CSP, X-Frame-Options, etc.) en BO / portal / display
- [ ] Revisar CORS `origin` vacío en producción
- [ ] Logging estructurado: auth fail, webhooks, credits, draw-ball

### Criterios de aceptación

- [ ] Open redirect en signin BO cerrado
- [ ] Registro spam mitigado (rate + captcha si aplica)

---

## Fase 7 — Tests, CI y documentación

### Tareas

- [ ] Suite `api/tests/security/*` en CI en cada PR
- [ ] Crear `docs/security/threat-model.md`
- [ ] Corregir docs obsoletos (`draw-ball` público sin auth) en `docs/game-engine.md`, `docs/architecture.md`
- [ ] Runbook de incidentes (token leak, webhook abuse)
- [ ] Checklist post-deploy (curls de verificación)

### Criterios de aceptación

- [ ] CI falla si regresión de auth/RBAC
- [ ] Documentación alineada con código

---

## Mínimo viable para producción pública

Antes de exponer el sistema con dinero real, deben estar **✅ Hecho**:

- [x] **Fase 1** — RBAC server-side
- [x] **Fase 2** — Webhooks autenticados; stub off en prod
- [x] **Fase 3** — Premios atados al motor; idempotencia
- [x] **Fase 4.1 + 4.2** — Revalidar `active`; fail-fast prod

Las fases 5–7 pueden seguir en paralelo según prioridad de negocio.

---

## Verificación manual rápida (post-hardening)

Copiar y adaptar tras cada deploy a staging:

```bash
# 1) Sin token → 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:4001/backoffice/players

# 2) Player token en BO → 403
# 3) BO sin permiso en manual-credits → 403
# 4) Webhook stub sin secret → 401
# 5) prize-credits sin win → 403/404
```

*(Completar con tokens reales en entorno de prueba; no commitear secrets.)*

---

## Historial de cambios

| Fecha | Cambio |
|-------|--------|
| 2026-08-12 | Documento inicial tras auditoría de seguridad |
