# Checklist QA manual — Suite completa

Marcá cada ítem con `[x]` cuando lo completes. Anotá request/response si algo falla.

**Flujo recomendado:** implementar **Fase 2 (remediación)** → ejecutar **toda** esta suite en orden.

**Swagger:** http://localhost:4001/api/swagger

| Servicio | URL |
|----------|-----|
| API | http://localhost:4001 |
| Backoffice | http://localhost:4000 |
| Player portal | http://localhost:5175 |
| Bingo display | http://localhost:5174/?room=demo |
| PostgreSQL | localhost:5433 |
| Prisma Studio | `cd api && npm run prisma:studio` |

Documento relacionado (detalle histórico Fases 2–4 pagos/premios/auth): [`manual-qa-checklist.md`](./manual-qa-checklist.md)

---

## Credenciales

| Rol | Email | Password |
|-----|-------|----------|
| Admin BO | `admin@example.com` | `ChangeMe123!` |
| Usuario limitado | `qa-limited@example.com` | `ChangeMe123!` |
| Jugador QA | `dmourglia@gmail.com` | `123456789` |
| Webhook Mixer | header `X-Signature` | `PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET` en `api/.env` |

---

## Variables de sesión (completar mientras testeás)

| Variable | Valor |
|----------|-------|
| `ADMIN_TOKEN` | |
| `LIMITED_TOKEN` | |
| `PLAYER_TOKEN` | |
| `PLAYER_ID` | _(ej. `daa6f55b-344a-4610-96eb-18e050662900`)_ |
| `ROUND_ID` | |
| `ROOM_SLUG` | _(ej. `demo`)_ |
| `DEPOSIT_ID` | |
| `EXTERNAL_REF` | _(id numérico Mixer, no UUID)_ |
| `DEPOSIT_AMOUNT_CENTS` | |
| `BALANCE_BEFORE` | |
| `BALANCE_AFTER` | |
| `BINGO_PRIZE_ID` | |
| `CARD_ID` | |
| `PAYOUT_ID` | |

**Tester:** _________________  
**Fecha:** _________________

---

## Preparación (una sola vez)

- [ ] **PREP-A** — Servicios levantados (API, BO, portal, bingo-display, Postgres)
- [ ] **PREP-B** — API reiniciada tras cambios en `api/.env` / migraciones
- [ ] **PREP-C** — `npm run prisma:generate` OK (sin EPERM)
- [ ] **PREP-D** — Jugador de prueba activo con saldo
- [ ] **PREP-E** — Usuario limitado (`qa-limited@example.com`, rol solo `bo.users.manage`)
- [ ] **PREP-F** — Bingo LIVE en sala `demo` (o la que uses): ACTIVE, `minPlayersToStart=1`, repetición cada 5 min

### Tokens en Swagger

1. **Admin:** `POST /auth/login` → Authorize → `Bearer <token>`
2. **Jugador:** `POST /player/login`
3. **Limitado:** login con `qa-limited@example.com`

### Setup bingo LIVE (Fase 1 game)

1. Backoffice → Bingos → crear/editar:
   - Modo sorteo: **LIVE**
   - Inicio dentro de 2–3 minutos
2. Player portal → Comprar → 1 cartón en la partida próxima
3. Esperar `DRAWING` o forzar en Prisma (`BingoRound.status = DRAWING`)
4. Backoffice home → selector sala → panel **Marcar bolillas**

---

# Fase 1 — Integridad del sorteo ✅ (implementada)

> Cierra: race compra vs kickoff, mutex draw-ball, persistencia fail-closed, stop con refund, audit `BALL_DRAWN` / `ROUND_STOPPED`.

### GP1 — Compra bloqueada en partida DRAWING

- [ ] **Hecho**

1. Partida en estado **DRAWING**
2. Player portal → intentar comprar cartón en esa misma partida

**Esperado:** error (*Round is not open for purchases*); saldo sin cambio.

**Verificar Prisma:** sin nueva fila en `CartonPurchase`; `Wallet.balanceCents` igual.

**Resultado real:** _________________

---

### GP2 — Bola duplicada rechazada

- [ ] **Hecho**

**Opción A — UI:** Backoffice home → grilla LIVE → clic bola **12** → segundo clic en **12**.

**Opción B — Swagger:**
```
POST /backoffice/bingos/live/draw-ball?roomSlug=demo
Authorization: Bearer <ADMIN_TOKEN>
Body: { "number": 12 }
```
- 1.er request → **200** `{ "ok": true }`
- 2.º mismo número → **409** `"Ball already drawn"`

**Verificar Prisma `BingoRoundBall`:** 1 sola fila con `number=12` para ese `roundId`.

**Resultado real:** _________________

---

### GP3 — Stop manual con reembolso

- [ ] **Hecho**

1. 1 cartón comprado, partida en **DRAWING**; anotar saldo
2. Swagger:
   ```
   POST /backoffice/bingos/live/stop?roomSlug=demo
   Authorization: Bearer <ADMIN_TOKEN>
   Body: {}
   ```

**Esperado:** `{ "ok": true }`; saldo reintegrado; partida cancelada.

**Verificar Prisma:**
- [ ] `BingoRound.status = CANCELLED`, `cancellationReason = MANUAL_STOP`
- [ ] `WalletTransaction` tipo `REFUND` por la compra
- [ ] Sin `DeferredRoundPrizeWin` pendientes (no liquidados en `PrizePayout`)

**Resultado real:** _________________

---

### GP4 — Auditoría draw y stop

- [ ] **Hecho**

Tras GP2 (bola 7) y GP3:

**Prisma `AdminAuditLog`:**
- [ ] `BALL_DRAWN` — `targetType=bingo_round`, `metadata.ballNumber`, `adminUserId` del operador
- [ ] `ROUND_STOPPED` — `targetType=bingo_round`, `metadata.refund` presente

**Resultado real:** _________________

---

### GP5 — RBAC: limitado no puede marcar bolas

- [ ] **Hecho**

```
POST /backoffice/bingos/live/draw-ball?roomSlug=demo
Authorization: Bearer <LIMITED_TOKEN>
Body: { "number": 5 }
```

**Esperado:** **403** Forbidden

**Resultado real:** _________________

---

# Fase 2 — Remediación seguridad ✅

### R2.1 — Settlement fail-closed al cerrar partida

- [ ] **Hecho**

**Objetivo:** si falla `settleDeferredSplitPrizesForRound`, la partida **no** debe quedar `COMPLETED` con premios sin pagar.

1. Configurar partida VIRTUAL con ganadores deferred y condición que provoque fallo de settlement _(script/DB según implementación)_.
2. Dejar que la partida termine naturalmente.

**Esperado:**
- [ ] Round **no** en `COMPLETED` si settlement falló, **o** estado explícito de error documentado
- [ ] Log de error visible; reintento manual posible
- [ ] Jugadores no pierden premios legítimos en caso feliz (regresión)

**Resultado real:** _________________

---

### R2.2 — Player JWT `tokenVersion`

- [ ] **Hecho**

1. `POST /player/login` → `PLAYER_TOKEN`
2. Cambiar password del jugador (`POST /player/change-password` o Prisma + endpoint)
3. `GET /player/wallet` con **mismo** token antiguo

**Esperado:** **401** — token invalidado.

4. Re-login → nuevo token → **200**.

**Verificar:** campo `tokenVersion` (o equivalente) en `Player`; bump al cambiar password / desactivar.

**Resultado real:** _________________

---

### R2.3 — Backoffice JWT `tokenVersion` (regresión)

- [ ] **Hecho**

_(Ya implementado — validar que sigue OK tras Fase 2.)_

1. Login admin → token
2. Cambiar password admin
3. Request con token viejo → **401**
4. Token legacy sin claim `tv` tras bump → **401**

**Resultado real:** _________________

---

### R2.4 — Visibilidad cartones LIVE en backoffice _(si se implementa restricción)_

- [ ] **Hecho** / [ ] **N/A**

1. Partida LIVE en **DRAWING** con cartones vendidos
2. Usuario **sin** rol auditor → `GET` cartones/partida en BO

**Esperado (si aplica):** **403** o datos enmascarados durante sorteo.

**Resultado real:** _________________

---

### R2.5 — RBAC fino operaciones financieras _(si se implementa)_

- [ ] **Hecho** / [ ] **N/A**

Separar permisos ej. `bo.wallet.manual-credit` vs `bo.players.manage` y validar matrices 403/201.

**Resultado real:** _________________

---

# Seguridad — Pagos, premios, auth (Fases 2–4 del hardening)

> Muchos ítems ya validados en sesión 2026-08-20. Re-ejecutar antes de release.

## Pagos Mixer (Tests 1–10)

### Test 1 — Webhook sin X-Signature → 401

- [ ] **Hecho**

`POST /webhooks/payments/mixer-gaming` **sin** header `X-Signature`, body Mixer válido.

**Esperado:** **401** `{ "error": "Unauthorized webhook" }`

**Resultado real:** _________________

---

### Test 2 — Secret incorrecto → 401

- [x] **Hecho** (2026-08-20, ngrok)

---

### Test 3 — Firma correcta → 200 COMPLETED

- [x] **Hecho** (2026-08-20)

---

### Test 4 — Replay idempotente

- [x] **Hecho** (2026-08-20)

---

### Test 5 — Una sola WalletTransaction DEPOSIT

- [x] **Hecho** (2026-08-20)

---

### Test 6 — Manual credits limitado → 403

- [x] **Hecho** (2026-08-20)

---

### Test 7 — Manual credits admin → 201

- [ ] **Hecho** _(re-validar con idempotencyKey)_

```
POST /backoffice/players/{PLAYER_ID}/wallet/manual-credits
Authorization: Bearer <ADMIN_TOKEN>
Body:
{
  "amountCents": 5000,
  "note": "QA manual suite",
  "idempotencyKey": "<uuid-v4>"
}
```

**Esperado:** **201** — `depositId`, `balanceCents`

**Resultado real:** _________________

---

### Test 7b — Manual credits idempotente → 200

- [ ] **Hecho**

Repetir **exactamente** el POST del Test 7 (mismo `idempotencyKey`).

**Esperado:** **200** — `alreadyProcessed: true`; saldo sin cambio; 1 solo `Deposit`.

**Resultado real:** _________________

---

### Test 8 — Audit log crédito manual

- [ ] **Hecho** _(re-validar)_

Prisma `AdminAuditLog`: `MANUAL_WALLET_CREDIT`, `amountCents`, `depositId`.

---

### Test 9 — Límite máximo manual credit → 400

- [x] **Hecho** (2026-08-20)

---

### Test 10 — Fail-fast prod sin webhook secret _(opcional)_

- [ ] **Hecho** / [ ] **Omitido**

`NODE_ENV=production`, Mixer OK, sin `PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET` → API no arranca.

---

## Premios (Tests 11–14)

- [x] Test 11 — prize-credits sin win → 404
- [x] Test 12 — prize-credits con deferred win → 201
- [x] Test 13 — idempotente → 409
- [x] Test 14 — settlement limpio en DB

**Re-ejecutar:** `cd api && npx tsx scripts/run-prize-credit-phase3-qa.ts`

---

## Tokens y sesiones (Tests 15–25)

- [x] Tests 15–23 — auth boundaries (2026-08-20)
- [ ] Test 24 — fail-fast JWT dev en prod _(opcional)_
- [ ] Test 25 — JWT fuerte en prod _(opcional)_

**Re-ejecutar auth:** ver [`manual-qa-checklist.md`](./manual-qa-checklist.md) Tests 15–23.

---

## E2E y suite automática (cierre)

### Test 26 — Prize credit E2E _(opcional)_

- [ ] **Hecho**

```bash
cd api
npx tsx scripts/run-prize-credit-test.ts
```

---

### Suite automática

- [ ] `npm run test:unit` — 63+ tests OK
- [ ] `npm run test:integration` — 35+ tests OK

```bash
cd api
npm run test:unit
npm run test:integration
```

---

## Body Mixer de referencia (webhooks)

Reemplazá `EXTERNAL_REF`, `USER_ID` (`Player.paymentsUserId`), monto en pesos:

```json
{
  "success": true,
  "status": "approved",
  "transaction": {
    "id": <EXTERNAL_REF>,
    "user_id": "<USER_ID>",
    "currency": "ARS",
    "transaction_type": 1,
    "amount": "<pesos, ej. 10>",
    "status": "approved"
  }
}
```

Calcular firma:

```bash
cd api
npx tsx scripts/sign-mixer-webhook.ts --id <EXTERNAL_REF> --amount 10 --currency ARS --user-id <USER_ID>
```

---

## Orden de ejecución recomendado (post Fase 2)

1. Preparación PREP-A … PREP-F
2. **Fase 1 game:** GP1 → GP5
3. **Fase 2 remediación:** R2.1 → R2.5 (según lo implementado)
4. **Pagos/auth:** Tests 1, 7, 7b, 8 + opcionales
5. **Regresión premios/auth:** scripts phase3 / checklist 11–23
6. Suite automática

---

## Resumen de progreso

| Bloque | Tests | Hechos |
|--------|-------|--------|
| Preparación | PREP A–F | /6 |
| Fase 1 game | GP1–GP5 | /5 |
| Fase 2 remediación | R2.1–R2.5 | /5 |
| Pagos Mixer | 1–10 | /10 |
| Premios | 11–14 | /4 |
| Auth | 15–25 | /11 |
| Automáticos | suite | /2 |

---

## Plantilla rápida

```
GP1: [ ] OK  GP2: [ ] OK  GP3: [ ] OK  GP4: [ ] OK  GP5: [ ] OK
R2.1: [ ] OK  R2.2: [ ] OK  R2.3: [ ] OK  R2.4: [ ] N/A  R2.5: [ ] N/A
Test 1: [ ]  Test 7: [ ]  Test 7b: [ ]  Test 8: [ ]
Unit: [ ]  Integration: [ ]
```

---

## Notas / incidencias

```
(Anotar fallos, screenshots, ticket)
```
