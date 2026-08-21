# Checklist QA manual — Seguridad (Fases 2, 3 y 4)

> **Suite completa (Fase 1 game + Fase 2 remediación + este checklist):** ver [`manual-qa-full-suite.md`](./manual-qa-full-suite.md)

Marcá cada ítem con `[x]` cuando lo completes. Anotá request/response si algo falla.

**Proveedor de pagos en QA:** `mixer-gaming` únicamente.

**Swagger:** http://localhost:4001/api/swagger

| Servicio | URL |
|----------|-----|
| API | http://localhost:4001 |
| Backoffice | http://localhost:4000 |
| Player portal | http://localhost:5175 |
| Bingo display | http://localhost:5174 |
| PostgreSQL | localhost:5433 |

---

## Credenciales

| Rol | Email | Password |
|-----|-------|----------|
| Admin BO | `admin@example.com` | `ChangeMe123!` |
| Webhook Mixer | header `X-Signature` | `PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET` en `api/.env` |
| Usuario limitado | _(crear con solo `bo.users.manage`)_ | _(tu password)_ |

---

## Variables de sesión (completar mientras testeás)

| Variable | Valor |
|----------|-------|
| `ADMIN_TOKEN` | |
| `LIMITED_TOKEN` | |
| `PLAYER_TOKEN` | |
| `PLAYER_ID` | |
| `DEPOSIT_ID` | _(UUID del depósito en nuestra DB)_ |
| `EXTERNAL_REF` | _(id numérico Mixer → columna `externalRef` del depósito)_ |
| `DEPOSIT_AMOUNT_CENTS` | _(ej. 1000 = $10 ARS)_ |
| `BALANCE_BEFORE` | |
| `BALANCE_AFTER` | |
| `BINGO_PRIZE_ID` | |
| `CARD_ID` | |
| `PAYOUT_ID` (Test 12) | |

**Tester:** _________________  
**Fecha inicio:** _________________  
**Fecha fin:** _________________

---

## Preparación (una sola vez)

- [x] **PREP-A** — Servicios levantados (API, BO, portal, bingo-display, Postgres)
- [x] **PREP-B** — API reiniciada tras cambios en `api/.env`
- [x] **PREP-C** — Jugador de prueba registrado (`POST /player/register`)
- [x] **PREP-D** — Depósito Mixer **PENDING** creado vía portal/Swagger (E2E ngrok)
- [x] **PREP-E** — Usuario limitado con solo `bo.users.manage` (sin `bo.players.manage`)

### PREP-E — Usuario limitado

Crear usuario BO con rol que tenga **solo** `bo.users.manage`. Login → `LIMITED_TOKEN`.

**Creado para QA (2026-08-20):**
- Email: `qa-limited@example.com` / Password: `ChangeMe123!`
- Rol: `qa-users-only` (solo `bo.users.manage`)

### PREP-D — Crear depósito Mixer PENDING
USED Token -- 33d49830-2b32-4d25-977e-7d6890021ac5     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzM2Q0OTgzMC0yYjMyLTRkMjUtOTc3ZS03ZDY4OTAwMjFhYzUiLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwia2luZCI6InVzZXIiLCJpYXQiOjE3ODY5ODc1NjgsImV4cCI6MTc4NzAxNjM2OH0.T17vaSdudksIqN8rmpntrKO1K4f_AuQO66foG0l1j3A
1. `POST /player/login` → guardar `PLAYER_TOKEN` y `PLAYER_ID`   dmourglia@gmail.com  123456789  daa6f55b-344a-4610-96eb-18e050662900  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkYWE2ZjU1Yi0zNDRhLTQ2MTAtOTZlYi0xOGUwNTA2NjI5MDAiLCJlbWFpbCI6ImRtb3VyZ2xpYUBnbWFpbC5jb20iLCJraW5kIjoicGxheWVyIiwiaWF0IjoxNzg2OTg3ODAwLCJleHAiOjE3ODcwMTY2MDB9.MQSanSFdpalKkZG80gCnO3p7wilR6Xlcj1Igj_RdJZs
2. `GET /player/wallet` → anotar `BALANCE_BEFORE`   2969500
3. `GET /player/deposits/payment-methods` (JWT jugador)
   - Elegir método con `providerId: "mixer-gaming"`   a1000000-0000-4000-8000-000000000084
   - Copiar `id` (UUID) → `PAYMENT_METHOD_ID`
4. `POST /player/deposits`:
   ```json
   {
     "amountCents": 1000,
     "paymentMethodId": "<PAYMENT_METHOD_ID>"
   }
   ```
   - Respuesta → copiar `depositId` → `DEPOSIT_ID`
5. Prisma → tabla **Deposit** → buscar `DEPOSIT_ID`:
   - `status` = `PENDING`
   - `providerId` = `mixer-gaming`
   - Copiar `externalRef` → `EXTERNAL_REF` (**número Mixer, no el UUID**) 2442
   - Copiar `amountCents` → `DEPOSIT_AMOUNT_CENTS` 1000

> **Importante:** el webhook usa `transaction.id` = `EXTERNAL_REF`, **no** `DEPOSIT_ID`.

### Body Mixer de referencia (Tests 1–4)

Reemplazá `EXTERNAL_REF`, `USER_ID` (`Player.paymentsUserId`) y el monto (`amount` en **pesos** = `amountCents / 100`):

```json
{
  "success": true,
  "status": "approved",
  "transaction": {
    "id": <EXTERNAL_REF>,
    "user_id": "<USER_ID>",
    "currency": "ARS",
    "transaction_type": 1,
    "amount": "<monto en pesos, ej. 10>",
    "status": "approved"
  }
}
```

**Header:** `X-Signature` = HMAC-SHA256 hex (minúsculas) sobre  
`{id}_{amount}_{currency}_{user_id}` → ej. `2447_10_ARS_2001`

Calcular firma para Swagger:

```bash
cd api
npx tsx scripts/sign-mixer-webhook.ts --id <EXTERNAL_REF> --amount 10 --currency ARS --user-id <USER_ID>
```

---

## Fase 2 — Webhooks y pagos (Mixer)

### Test 1 — Webhook sin X-Signature → 401

- [ ] **Hecho** _(opcional Swagger; Mixer siempre envía firma en prod)_

| Campo | Valor |
|-------|-------|
| Método | `POST /webhooks/payments/mixer-gaming` |
| Header `X-Signature` | **No enviar** |
| Body | Body Mixer de referencia (arriba) |

**Esperado:** HTTP **401** — `{ "error": "Unauthorized webhook" }`

**Resultado real:** _________________

---

### Test 2 — Firma / secret incorrecto → 401

- [x] **Hecho**

| Campo | Valor |
|-------|-------|
| Método | `POST /webhooks/payments/mixer-gaming` |
| Prueba E2E | `PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET` incorrecto en `.env` + depósito real Mixer vía ngrok |

**Esperado:** HTTP **401** — depósito **PENDING**, saldo sin cambio

**Resultado real:** 401 en ngrok ✅ (2026-08-20)

---

### Test 3 — Webhook X-Signature correcto → 200 COMPLETED

- [x] **Hecho**

| Campo | Valor |
|-------|-------|
| Método | `POST /webhooks/payments/mixer-gaming` |
| Prueba E2E | Webhook real Mixer → ngrok → API con secret correcto en `.env` |

**Esperado:** HTTP **200** — `{ "ok": true, "status": "COMPLETED" }`

**Verificar:**
- [x] Deposit en DB → `status = COMPLETED`
- [x] Saldo jugador acreditado

**Resultado real:** 200 COMPLETED ✅ (2026-08-20, ngrok)

---

### Test 4 — Replay idempotente

- [x] **Hecho**

Repetir **exactamente** el Test 3 (mismo body y header).

**Esperado:** HTTP **200** — `{ "ok": true, "alreadyProcessed": true }`

**Verificar:**
- [x] Saldo = `BALANCE_AFTER` (sin cambio)

**Resultado real:** 200 `alreadyProcessed: true` ✅ (2026-08-20, Swagger). Log `api/logs/2026-08-20.log` requestId `d92fe96b`: auth OK → `deposit already completed (idempotent)` → response 200.

---

### Test 5 — Una sola transacción DEPOSIT

- [x] **Hecho**

Prisma → **WalletTransaction** → filtrar `depositId = <DEPOSIT_ID>` y `type = DEPOSIT`

**Esperado:** **exactamente 1** fila

**Cantidad encontrada:** 1 (`depositId=00ad7824-b75d-4ff9-aba5-8f95bd18b0c6`, `externalRef=2451`) ✅

---

### Test 6 — Manual credits: usuario limitado → 403

- [x] **Hecho**

| Campo | Valor |
|-------|-------|
| Método | `POST /backoffice/players/{playerId}/wallet/manual-credits` |
| Authorize | `LIMITED_TOKEN` (`qa-limited@example.com`) |
| Body | `{ "amountCents": 1000 }` |
| `playerId` | `daa6f55b-344a-4610-96eb-18e050662900` |

**Esperado:** HTTP **403** Forbidden

**Resultado real:** 403 `{"error":"Forbidden","missing":["bo.players.manage"]}` ✅ (2026-08-20)

---

### Test 7 — Manual credits: admin → 201

- [x] **Hecho**

| Campo | Valor |
|-------|-------|
| Login | `POST /auth/login` → admin → `ADMIN_TOKEN` |
| Método | `POST /backoffice/players/{playerId}/wallet/manual-credits` |
| Authorize | `ADMIN_TOKEN` |
| Body | `{ "amountCents": 5000, "note": "QA manual", "idempotencyKey": "<uuid-v4>" }` |

**Esperado:** HTTP **201** — respuesta con `depositId`, `transactionId`, `balanceCents`

**Resultado real:** 201 — `depositId=8865dc63-e4e3-478f-8496-7cdac4606e79`, `balanceCents=3014500` ✅ (2026-08-20)

---

### Test 7b — Manual credits: replay idempotente → 200

- [ ] **Hecho**

Repetir **exactamente** el POST del Test 7 (mismo `idempotencyKey`, monto y jugador).

**Esperado:** HTTP **200** — `{ "alreadyProcessed": true }`; saldo sin segundo crédito; 1 solo `Deposit`.

**Resultado real:** _________________

---

### Test 8 — Audit log tras crédito manual

- [x] **Hecho**

Prisma → **AdminAuditLog** (último registro):

**Esperado:**
- [x] `action` = `MANUAL_WALLET_CREDIT`
- [x] `targetType` = `player`, `targetId` = `PLAYER_ID`
- [x] `amountCents` = `5000`, `note` = `QA manual`
- [x] `depositId` coincide con Test 7 (`8865dc63-e4e3-478f-8496-7cdac4606e79`)

---

### Test 9 — Manual credits: límite máximo → 400

- [x] **Hecho**

| Campo | Valor |
|-------|-------|
| Authorize | `ADMIN_TOKEN` |
| Body | `{ "amountCents": 10000001 }` |

**Esperado:** HTTP **400** — error de máximo manual credit

**Resultado real:** 400 `amountCents exceeds maximum manual credit (10000000)` ✅ (2026-08-20)

---

### Test 10 — Fail-fast prod sin secret Mixer _(opcional)_

- [ ] **Hecho** / [ ] **Omitido**

1. Parar API
2. `.env`:
   ```
   NODE_ENV=production
   PAYMENTS_MIXER_GAMING_BASE_URL=https://psp-test.mixergaming.com
   PAYMENTS_MIXER_GAMING_CLIENT_ID=37
   PAYMENTS_MIXER_GAMING_CLIENT_SECRET=<tu secret>
   # PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET=   ← comentar o borrar
   ```
3. `npm run dev`

**Esperado:** API **no arranca** (Mixer configurado sin webhook secret en prod)

- [ ] `.env` revertido a desarrollo

---

## Fase 3 — Premios

### Test 11 — prize-credits sin victoria → 404

- [x] **Hecho**

Elegir `BINGO_PRIZE_ID` + `CARD_ID` **sin** fila en `DeferredRoundPrizeWin`.

| Campo | Valor |
|-------|-------|
| Método | `POST /backoffice/players/{playerId}/prize-credits` |
| Authorize | `ADMIN_TOKEN` |
| Body | `{ "bingoPrizeId": "20733eb2-7b69-4341-84d0-95a6a9630d86", "playerRoundCardId": "16688e8e-900c-410e-99a9-ea946ac930f7" }` |
| `playerId` | `daa6f55b-344a-4610-96eb-18e050662900` |

**Esperado:** HTTP **404** — `{ "error": "Prize win not registered by game engine" }`

**Resultado real:** 404 ✅ (2026-08-20)

---

### Test 12 — prize-credits con victoria → 201

- [x] **Hecho**

**Opción A — script:**
```bash
cd api
npx tsx scripts/run-prize-credit-phase3-qa.ts
```

**Opción B — manual:** partida ganada + fila en `DeferredRoundPrizeWin`.

| Campo | Valor |
|-------|-------|
| Método | `POST /backoffice/players/{playerId}/prize-credits` |
| Authorize | `ADMIN_TOKEN` |
| Body | IDs del deferred win |

**Esperado:** HTTP **201** — `payoutId`, `balanceCents` actualizado

**Resultado real:** 201 — `payoutId=d6668a45-...`, `balanceCents=1000` ✅ (2026-08-20, script phase3)

---

### Test 13 — prize-credits idempotente → 409

- [x] **Hecho**

Repetir **exactamente** el POST del Test 12.

**Esperado:** HTTP **409** — `{ "error": "Prize already credited for this card" }`

**Resultado real:** 409 ✅ (2026-08-20)

---

### Test 14 — Settlement limpio

- [x] **Hecho**

Prisma:

- [x] **DeferredRoundPrizeWin** — 0 filas para ese par premio/cartón
- [x] **PrizePayout** — **1 sola** fila para `(bingoPrizeId, playerRoundCardId)`
- [x] **WalletTransaction** — 1 fila PRIZE_CREDIT por `payoutId`

---

## Fase 4 — Tokens y sesiones

> Al terminar Tests 16–21, **reactivar** user y player (`active = true`).

### Test 15 — Admin activo → 200

- [x] **Hecho**

1. `POST /auth/login` → `{ "email": "admin@example.com", "password": "ChangeMe123!" }` → `ADMIN_TOKEN`
2. `GET /auth/me` con Bearer

**Esperado:** HTTP **200**

**Resultado real:** 200 ✅ (2026-08-20)

---

### Test 16 — Admin desactivado → /auth/me 401

- [x] **Hecho**

1. Prisma → **User** → admin → `active = false`
2. `GET /auth/me` con **mismo** `ADMIN_TOKEN` (sin re-login)

**Esperado:** HTTP **401** — `{ "error": "Account inactive or not found" }`

**Resultado real:** 401 ✅ (2026-08-20)

---

### Test 17 — Admin desactivado → /users 401

- [x] **Hecho**

Mismo token → `GET /users`

**Esperado:** HTTP **401**

**Resultado real:** 401 ✅ (2026-08-20)

- [x] Admin reactivado (`User.active = true`)

---

### Test 18 — Jugador activo → 200

- [x] **Hecho**

1. `POST /player/login` → `PLAYER_TOKEN`
2. `GET /player/wallet`

**Esperado:** HTTP **200**

**Resultado real:** 200 — `balanceCents=3014500` ✅ (2026-08-20)

---

### Test 19 — Jugador desactivado → /player/me 401

- [x] **Hecho**

1. Prisma → **Player** → `active = false`
2. `GET /player/me` con mismo `PLAYER_TOKEN`

**Esperado:** HTTP **401**

**Resultado real:** 401 ✅ (2026-08-20)

---

### Test 20 — Jugador desactivado → /player/wallet 401

- [x] **Hecho**

Mismo token → `GET /player/wallet`

**Esperado:** HTTP **401**

**Resultado real:** 401 ✅ (2026-08-20)

---

### Test 21 — Jugador desactivado → depósitos 401

- [x] **Hecho**

Mismo token → `GET /player/deposits/payment-methods`

**Esperado:** HTTP **401**

**Resultado real:** 401 ✅ (2026-08-20)

- [x] Player reactivado (`Player.active = true`)

---

### Test 22 — Token BO en portal → 403

- [x] **Hecho**

`GET /player/wallet` con Authorize = **`ADMIN_TOKEN`**

**Esperado:** HTTP **403** — `{ "error": "Player authentication required" }`

**Resultado real:** 403 ✅ (2026-08-20)

---

### Test 23 — Token jugador en backoffice → 403

- [x] **Hecho**

`GET /users` con Authorize = **`PLAYER_TOKEN`**

**Esperado:** HTTP **403** — `{ "error": "Player token cannot access backoffice routes" }`

**Resultado real:** 403 ✅ (2026-08-20)

---

### Test 24 — Fail-fast JWT prod _(opcional)_

- [ ] **Hecho** / [ ] **Omitido**

1. Parar API
2. `.env`: `NODE_ENV=production` + `JWT_SECRET=dev-secret-change-in-production-min-32-chars-long-ok`
3. `npm run dev`

**Esperado:** API **no arranca**

- [ ] `.env` revertido

---

### Test 25 — JWT fuerte en prod _(opcional)_

- [ ] **Hecho** / [ ] **Omitido**

1. `.env`:
   ```
   NODE_ENV=production
   JWT_SECRET=<random ≥32 chars>
   PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET=<secret configurado>
   ```
2. `npm run dev`

**Esperado:** API arranca OK

- [ ] `.env` revertido

---

## E2E script _(opcional)_

### Test 26 — Prize credit E2E

- [ ] **Hecho** / [ ] **Omitido**

```bash
cd api
npx tsx scripts/run-prize-credit-test.ts
```

**Precondición:** al menos un cartón en DB.

**Esperado:** HTTP 201 + segundo POST 409

> Los webhooks Mixer (Tests 1–5) se validan manualmente en Swagger; no hay script E2E de depósito Mixer.

---

## Suite automática (cierre)

- [x] `npm run test:unit` — OK (62 tests, 2026-08-20)
- [x] `webhooks.integration.test.ts` — OK (4 tests)
- [x] `manual-credits.integration.test.ts` — OK (2 tests)
- [x] `prizes.integration.test.ts` — OK (3 tests)
- [x] `auth-boundaries.integration.test.ts` — OK (4 tests)
- [x] `rbac.integration.test.ts` — OK (6 tests)
- [x] `startup-guards.unit.test.ts` — OK (5 tests)

```bash
cd api
npm run test:unit
npx tsx --test tests/integration/security/webhooks.integration.test.ts
npx tsx --test tests/integration/security/manual-credits.integration.test.ts
npx tsx --test tests/integration/security/prizes.integration.test.ts
npx tsx --test tests/integration/security/auth-boundaries.integration.test.ts
npx tsx --test tests/integration/security/rbac.integration.test.ts
npx tsx --test tests/unit/config/startup-guards.unit.test.ts
```

---

## Resumen de progreso

| Bloque | Tests | Hechos |
|--------|-------|--------|
| Preparación | PREP A–E | 5/5 |
| Fase 2 (Mixer) | 1–10 | 8/10 _(1 y 10 opcionales)_ |
| Fase 3 | 11–14 | 4/4 |
| Fase 4 | 15–25 | 9/11 _(24–25 opcionales)_ |
| E2E | 26 | 0/1 _(opcional)_ |
| Automáticos | suite | 7/7 |

---

## Errores frecuentes (Mixer)

| Error | Causa | Solución |
|-------|--------|----------|
| `deposit_not_found` | `transaction.id` = UUID en vez de `externalRef` | Usar número Mixer de la columna `externalRef` |
| `Unauthorized webhook` | Falta/mal firma | Calcular `X-Signature` con `npx tsx scripts/sign-mixer-webhook.ts` |
| Webhook OK pero saldo mal | `amount` en pesos incorrecto | `amount` = `amountCents / 100` como string |
| `Invalid webhook: missing transaction id` | Body mal formado | `transaction` debe ser objeto (no array vacío) |
| Test 6 devuelve 201 | Token es admin, no limitado | PREP-E |
| Test 12 script falla | Sin cartones en DB | Comprar cartón en portal |

---

## Notas / incidencias

_Anotá acá cualquier fallo, screenshot, o ticket:_

```
2026-08-20 — Test 2 E2E: webhook secret incorrecto en .env → 401 ngrok, depósito PENDING
2026-08-20 — Test 3 E2E: webhook real Mixer + ngrok + X-Signature → 200 COMPLETED, saldo OK
2026-08-20 — Tests 4–5: replay idempotente + 1 WalletTransaction (logs api/logs/2026-08-20.log)
2026-08-20 — Tests 6–9: RBAC manual credits + audit log
2026-08-20 — Tests 11–14: prize-credits (script run-prize-credit-phase3-qa.ts)
2026-08-20 — Tests 15–23: auth boundaries (script run-phase4-auth-qa.ts)
2026-08-20 — Suite automática: 62 unit + 19 integration security + 5 startup-guards — all pass
```
