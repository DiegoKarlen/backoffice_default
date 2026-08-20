# Checklist manual — Fases 2, 3 y 4 (seguridad)

Usar **después** de reiniciar la API con el `.env` actualizado.

**Proveedor de pagos en QA:** `mixer-gaming` únicamente.

Servicios: API `:4001`, backoffice `:4000`, portal `:5175`.

Checklist detallado con casillas: [`manual-qa-checklist.md`](./manual-qa-checklist.md)

## Credenciales de referencia

| Rol | Email | Password |
|-----|-------|----------|
| Admin | `admin@example.com` | `ChangeMe123!` |
| Limitado (solo users) | _(crear con solo `bo.users.manage`)_ | _(tu password)_ |
| Webhook Mixer | header `X-Signature` (HMAC-SHA256) | `PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET` en `api/.env` |

---

## Fase 2 — Webhooks y pagos (Mixer)

### 2.1 Autenticación webhook Mixer

- [ ] **Sin X-Signature → 401** — Swagger opcional
- [x] **Secret/firma incorrecto → 401** — E2E secret `.env` incorrecto + ngrok
- [x] **Secret correcto → 200** — E2E webhook real Mixer vía ngrok

### 2.2 Idempotencia webhook

- [ ] Replay mismo webhook → `alreadyProcessed: true`, sin doble saldo
- [ ] Una sola `WalletTransaction` DEPOSIT por `depositId`

### 2.3 Créditos manuales

- [ ] Usuario limitado → `403` en `POST .../wallet/manual-credits`
- [ ] Admin → `201` + fila `AdminAuditLog` (`MANUAL_WALLET_CREDIT`)
- [ ] Monto > `MAX_MANUAL_CREDIT_CENTS` → `400`

### 2.4 Producción (staging)

- [ ] Mixer configurado + `NODE_ENV=production` sin `PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET` → API no arranca

---

## Fase 3 — Premios e idempotencia

### 3.1 prize-credits

- [ ] Sin `DeferredRoundPrizeWin` → **404** `Prize win not registered by game engine`
- [ ] Con victoria en motor → **201** + saldo
- [ ] Segundo intento → **409** `Prize already credited for this card`

### 3.2 Settlement

- [ ] Tras settlement: sin filas deferred, un `PrizePayout` por cartón/premio

---

## Fase 4 — Tokens y sesiones

### 4.1 Usuario backoffice desactivado

- [ ] Login como admin → token válido → `GET /auth/me` → **200**
- [ ] En BO (Users) o DB: `User.active = false` para ese usuario
- [ ] Mismo token → `GET /auth/me` → **401** `Account inactive or not found`
- [ ] Mismo token → `GET /users` → **401**

### 4.2 Jugador desactivado

- [ ] Login/registro jugador → token → `GET /player/wallet` → **200**
- [ ] Desactivar jugador (`Player.active = false` en DB o futuro BO)
- [ ] Mismo token → **401** en:
  - [ ] `GET /player/me`
  - [ ] `GET /player/wallet`
  - [ ] `GET /player/deposits/payment-methods`

### 4.3 Separación de tokens

- [ ] Token BO en ruta `/player/*` → **403** `Player authentication required`
- [ ] Token jugador en ruta `/users` → **403** `Player token cannot access backoffice routes`

### 4.4 Arranque producción (staging)

- [ ] `NODE_ENV=production` + `JWT_SECRET=dev-secret-change-in-production-min-32-chars-long-ok` → API **no arranca**
- [ ] `JWT_SECRET` aleatorio ≥32 chars + webhook Mixer configurado → arranca OK

---

## Suite automática (Fases 2–4)

```bash
cd api
npm run build
npx tsx --test --test-reporter spec \
  tests/unit/config/startup-guards.unit.test.ts \
  tests/integration/security/webhooks.integration.test.ts \
  tests/integration/security/manual-credits.integration.test.ts \
  tests/integration/security/prizes.integration.test.ts \
  tests/integration/security/auth-boundaries.integration.test.ts \
  tests/integration/security/rbac.integration.test.ts
```

E2E premios (API en marcha):

```bash
npx tsx scripts/run-prize-credit-test.ts
```

---

## Orden sugerido QA manual (~40 min)

1. Reiniciar API
2. PREP-D: depósito Mixer PENDING vía portal
3. Fase 2: webhooks Mixer + manual-credits (Swagger)
4. Fase 3: prize-credits sin/con win
5. Fase 4: desactivar user BO → 401; desactivar player → 401; cross-token 403
6. Correr suite automática arriba

Marcar cada ítem. Anotar request/response si algo falla.
