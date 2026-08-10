# Módulo de pagos — plan de implementación y seguimiento

Documento vivo para dar seguimiento a la integración de **depósitos** en el portal jugador, con arquitectura **multi-proveedor** (primer proveedor: [MixerGaming Payments API](https://github.com/MixerGaming/Payments-API/wiki)).

**Rama de trabajo:** `feature/integracion-metodo-pago`  
**Última revisión del documento:** 2026-07-30  
**Estado global:** Fases 1–3 implementadas; E2E stub verificado; sandbox Mixer pendiente de credenciales

---

## Leyenda

| Símbolo | Significado |
|--------|-------------|
| `[ ]` | Pendiente |
| `[~]` | En curso / parcial |
| `[x]` | Completado y verificado |
| `[-]` | Fuera de alcance por ahora |

**Verificación:** marcar `[x]` solo cuando el ítem funciona en local (o QA acordado) y el código está en la rama de trabajo.

---

## Resumen por fase

| Fase | Nombre | Estado | Notas |
|------|--------|--------|-------|
| 0 | Refinamiento y decisiones | [~] | Credenciales sandbox Mixer pendientes |
| 1 | Módulo portal + UI (stub) | [x] | QA visual opcional |
| 2 | Módulo API + adapter MixerGaming | [~] | Código listo; cierre sandbox con Mixer |
| 3 | Webhook + acreditación wallet | [~] | E2E stub OK; E2E Mixer pendiente |
| 4 | Extensibilidad (2.º proveedor) | [~] | Stub operativo; falta doc formal |
| 5 | Pulido, tests y documentación | [~] | Postman + script E2E; faltan tests unit |

---

## Arquitectura acordada (referencia)

- **No microservicio** por ahora: módulos dentro de `player-portal` y `api`.
- **Portal:** `player-portal/src/payments/` — único punto de entrada para UI de depósitos.
- **API:** `api/src/payments/` — adapters por proveedor, orquestador de depósitos, webhooks.
- **Wallet:** reutiliza `Deposit`, `WalletTransaction`, `wallet-ledger` (sin duplicar lógica en compra de cartones).

```
Portal (payments module) → API /player/deposits/* → PaymentProvider adapter → MixerGaming
MixerGaming webhook → API /webhooks/payments/:providerId → deposit.service → wallet
```

---

## Fase 0 — Refinamiento y decisiones

Objetivo: cerrar requisitos antes de implementar.

| Ítem | Estado | Notas |
|------|--------|--------|
| Confirmar UX: tab **Depositar** en nav principal | [x] | Implementado como cuarta pestaña |
| Confirmar moneda v1 (¿solo **ARS**?) | [~] | Default ARS; confirmar con Mixer |
| Definir métodos de pago habilitados en v1 | [ ] | Depende de cuenta sandbox Mixer |
| Decidir modelo de **perfil jugador** (DNI, teléfono, nombre) | [x] | Híbrido: formulario al depositar + persistir en `Player` |
| Obtener credenciales **sandbox** MixerGaming | [ ] | **Bloqueante para prueba real** |
| Definir `return_url` dev y producción | [x] | Dev: `PAYMENTS_RETURN_URL_BASE` + `/?deposit=return&depositId=` |
| Definir URL pública del **webhook** | [x] | Dev: ngrok → `/webhooks/payments/mixer-gaming` (validado) |
| Alinear con doc wiki: OAuth, métodos, depósito, notificaciones | [x] | Implementado según wiki |
| OK explícito para comenzar Fase 1 | [x] | 2026-07-30 |

---

## Fase 1 — Módulo portal + UI (stub)

Objetivo: estructura modular y pantalla de depósito **sin** gateway real. Validar UX con capturas.

### 1.1 Estructura del módulo (`player-portal/src/payments/`)

| Ítem | Estado | Notas |
|------|--------|--------|
| Crear carpeta `payments/` con `index.ts` (API pública del módulo) | [x] | `createPaymentsModule()` |
| `types.ts` — tipos agnósticos de proveedor | [x] | `PaymentMethod`, `DepositIntent`, etc. |
| `api-client.ts` — cliente hacia nuestra API (stub/mock inicial) | [x] | |
| `deposit-flow.ts` — validación monto, submit, estados UI | [x] | |
| `providers/registry.ts` + `providers/types.ts` | [x] | `PaymentProviderUiAdapter` |
| `providers/_stub/` — métodos mock para desarrollo | [x] | |
| `views/deposit-form.ts` — monto + selector de método | [x] | |
| `views/deposit-return.ts` (opcional v1) | [x] | Banner al volver de redirect |

### 1.2 Integración con el portal existente

| Ítem | Estado | Notas |
|------|--------|--------|
| Extender `PpTab` con `"deposit"` en `types.ts` | [x] | |
| Tab **Depositar** en `shell.ts` | [x] | Cuarta pestaña en nav |
| Montar vista vía módulo en `dashboard.ts` (sin lógica inline) | [x] | |
| `app.ts`: manejo query `?deposit=return` | [x] | |
| Estilos en `style.css` (coherentes con portal actual) | [x] | |
| Feature flag `VITE_PAYMENTS_ENABLED` | [x] | Ocultar tab si deshabilitado |
| **No** importar pagos desde `buy.ts` / `transactions.ts` | [x] | Solo vía `payments/` |

### 1.3 Comportamiento stub

| Ítem | Estado | Notas |
|------|--------|--------|
| Listar 2–3 métodos mock con min/max | [x] | |
| Validar monto vacío / cero / negativo en cliente | [x] | |
| Submit muestra mensaje “Integración pendiente” o simula éxito local | [x] | |
| Callback `onBalanceChanged` definido (sin efecto real aún) | [x] | |

### 1.4 Criterio de cierre Fase 1

| Ítem | Estado | Notas |
|------|--------|--------|
| Tab Depositar usable en local (`:5175`) | [x] | Verificado en dev |
| Capturas UX aprobadas por producto | [ ] | |
| Estructura de carpetas lista para Fase 2 | [x] | |

---

## Fase 2 — Módulo API + adapter MixerGaming

Objetivo: backend modular; listar métodos reales e **iniciar** depósito (estado `PENDING`). Sin acreditación automática aún.

### 2.1 Estructura del módulo (`api/src/payments/`)

| Ítem | Estado | Notas |
|------|--------|--------|
| `payment-provider.interface.ts` — contrato común | [x] | `listDepositMethods`, `initiateDeposit`, `parseWebhook` |
| `providers/registry.ts` | [x] | Resuelve por `providerId` |
| `providers/mixer-gaming/client.ts` — OAuth + HTTP | [x] | Cache token por `expires_in` |
| `providers/mixer-gaming/mapper.ts` — request/response | [~] | Lógica en client + index |
| `providers/mixer-gaming/index.ts` — implementación interface | [x] | |
| `deposit.service.ts` — orquestador agnóstico | [x] | Crear `Deposit` PENDING, delegar provider |
| `config.ts` — variables de entorno | [x] | Ver `.env.example` |
| `index.ts` — rutas player + webhooks | [x] | Montaje en `api/src/index.ts` |

### 2.2 Variables de entorno

| Ítem | Estado | Notas |
|------|--------|--------|
| `PAYMENTS_ENABLED` | [x] | |
| `PAYMENTS_DEFAULT_PROVIDER=mixer-gaming` | [x] | Fallback a stub sin credenciales |
| `PAYMENTS_MIXER_GAMING_BASE_URL` | [x] | |
| `PAYMENTS_MIXER_GAMING_CLIENT_ID` | [x] | |
| `PAYMENTS_MIXER_GAMING_CLIENT_SECRET` | [x] | |
| `PAYMENTS_DEFAULT_CURRENCY` (ARS) | [x] | |
| `PAYMENTS_DEFAULT_COUNTRY` (AR) | [x] | |
| `PAYMENTS_RETURN_URL_BASE` | [x] | |
| Documentar en `api/.env.example` y `player-portal/.env.example` | [x] | Raíz `.env.example` |

### 2.3 Endpoints player

| Ítem | Estado | Notas |
|------|--------|--------|
| `GET /player/deposits/payment-methods` | [x] | Proxy agregado; v1 un proveedor |
| `POST /player/deposits` — `{ amountCents, paymentMethodId }` | [x] | |
| `GET /player/deposits/:id` — estado local | [x] | `PENDING` / `COMPLETED` / `FAILED` |
| Rutas en módulo; `player-portal.ts` delgado | [x] | |
| Auth: `requirePlayer` en todos | [x] | |
| Rate limit en `POST /player/deposits` | [x] | |

### 2.4 Modelo de datos

| Ítem | Estado | Notas |
|------|--------|--------|
| Migración Prisma: campos opcionales en `Deposit` | [x] | `providerId`, `paymentMethodId`, `paymentMethodName`, `providerPayload`, `failedReason` |
| Índice único `(providerId, externalRef)` | [x] | Idempotencia |
| Migración perfil `Player` (si se eligió en Fase 0) | [x] | phone, dni, firstName, lastName, countryCode |
| `npx prisma migrate` + client regenerado | [x] | |

### 2.5 Portal — conectar API real

| Ítem | Estado | Notas |
|------|--------|--------|
| `payments/api-client.ts` consume endpoints reales | [x] | |
| Cargar métodos al abrir tab Depositar | [x] | |
| Validar min/max según método seleccionado | [x] | |
| Submit → redirect URL o mostrar QR | [x] | Según respuesta MixerGaming |
| Remover o aislar provider `_stub` en dev | [x] | Stub en API cuando no hay credenciales |

### 2.6 Criterio de cierre Fase 2

| Ítem | Estado | Notas |
|------|--------|--------|
| Sandbox: listar métodos ARS desde portal | [ ] | Requiere credenciales Mixer |
| Sandbox: iniciar depósito → redirect o QR | [ ] | Requiere credenciales Mixer |
| Registro `Deposit` PENDING + `externalRef` en DB | [x] | Verificado con stub + Postman |
| Saldo **no** cambia hasta webhook | [x] | Verificado (stub PENDING sin webhook) |

---

## Fase 3 — Webhook + acreditación wallet

Objetivo: completar el ciclo: notificación → acreditar saldo → visible en Movimientos.

### 3.1 Webhook

| Ítem | Estado | Notas |
|------|--------|--------|
| `GET /webhooks/payments/:providerId` (ping) | [x] | Validación URL en navegador/Postman |
| `POST /webhooks/payments/:providerId` | [x] | Público; sin JWT player |
| `providers/mixer-gaming/webhook.handler.ts` | [x] | Parse según wiki §3.5 |
| Idempotencia: webhook duplicado no duplica crédito | [x] | Lock + status COMPLETED |
| Logs sin secretos ni tokens completos | [x] | |

### 3.2 Acreditación

| Ítem | Estado | Notas |
|------|--------|--------|
| `deposit.service.completeDeposit()` | [x] | `PENDING` → `COMPLETED` |
| `deposit.service.failDeposit()` | [x] | `PENDING` → `FAILED` |
| Usar `lockWalletForPlayer` + `applyWalletDelta` | [x] | Mismo patrón que crédito manual BO |
| Crear `WalletTransaction` tipo `DEPOSIT` | [x] | |
| Monto en centavos; conversión solo al llamar gateway | [x] | |

### 3.3 Portal — post-depósito

| Ítem | Estado | Notas |
|------|--------|--------|
| Return URL: detectar vuelta y mostrar estado | [x] | `deposit-return.ts` |
| Polling `GET /player/deposits/:id` mientras PENDING | [x] | Cada 3s, hasta 2 min |
| Refresh saldo en header al completar | [x] | |
| Mensaje éxito / error / pendiente en `#msg` | [x] | |
| Movimientos: depósito visible sin cambios en `transactions.ts` core | [x] | Tipo `DEPOSIT` ya existe |

### 3.4 Criterio de cierre Fase 3

| Ítem | Estado | Notas |
|------|--------|--------|
| E2E sandbox: depositar → webhook → saldo actualizado | [ ] | **Pendiente credenciales Mixer** |
| E2E: movimiento DEPOSIT en tab Movimientos | [x] | Verificado con stub |
| Webhook duplicado probado | [x] | `npm run test:deposit-webhook` + Postman |
| Depósito fallido no acredita saldo | [x] | Verificado stub (`success: false`) |

---

## Fase 4 — Extensibilidad (segundo proveedor)

Objetivo: demostrar que agregar un proveedor **no rompe** el módulo.

| Ítem | Estado | Notas |
|------|--------|--------|
| Provider fake o `_stub` real en API (`providers/_stub/`) | [x] | Interface completa + webhook |
| Registro en `registry.ts` sin tocar `deposit.service` core | [x] | |
| UI adapter opcional en portal `providers/_stub/` | [x] | |
| `GET /player/deposits/payment-methods` agrega métodos de N proveedores | [x] | stub + mixer (si configurado) |
| `POST /player/deposits` acepta `providerId` opcional | [x] | Default desde env |
| Documentar checklist “Cómo agregar un proveedor” | [ ] | `docs/payments-providers.md` |

### Criterio de cierre Fase 4

| Ítem | Estado | Notas |
|------|--------|--------|
| Segundo proveedor registrado y listado en UI | [x] | Stub en dev sin credenciales Mixer |
| Sin cambios en `buy.ts` ni wallet de cartones | [x] | |

---

## Fase 5 — Pulido, tests y documentación

| Ítem | Estado | Notas |
|------|--------|--------|
| Tests unit: OAuth client, mappers, validación montos | [ ] | `api/tests/unit/payments/` |
| Tests integración: initiate deposit (mock HTTP) | [ ] | |
| Tests integración: webhook idempotente | [x] | `npm run test:deposit-webhook` |
| Colección Postman pagos | [x] | `docs/postman/` |
| Scripts ngrok dev | [x] | `scripts/ngrok*.cmd` |
| Errores API traducidos / mapeados en portal (ES) | [ ] | Similar a `translatePlayerApiError` |
| Depósitos PENDING abandonados → job o timeout FAILED | [ ] | Opcional v1 |
| `docs/payments-providers.md` — guía para nuevos adapters | [ ] | |
| Actualizar `docs/architecture.md` con módulo pagos | [ ] | |
| Actualizar `docs/status/product-progress.md` § portal depósitos | [ ] | |
| Revisión seguridad: secrets, rate limits, logs | [ ] | |
| QA manual checklist firmado | [ ] | Ver abajo |

### QA manual (checklist final)

| Caso | Estado |
|------|--------|
| Monto menor al mínimo del método → error claro | [ ] |
| Monto mayor al máximo → error claro | [ ] |
| Sin método seleccionado → no envía | [ ] |
| Redirect externo y vuelta al portal | [ ] |
| Saldo insuficiente en compra sigue funcionando (regresión) | [ ] |
| Crédito manual BO sigue funcionando (regresión) | [ ] |

---

## Desarrollo local con ngrok

Objetivo: recibir webhooks reales de **MixerGaming** mientras la API corre en `localhost:4001`.

Mixer envía el POST desde internet; `localhost` no es alcanzable. **ngrok** crea un túnel HTTPS público hacia tu máquina.

### Qué exponer

| Servicio | Puerto | ¿Túnel ngrok? | Uso |
|----------|--------|---------------|-----|
| API | `4001` | **Sí** | Webhook MixerGaming |
| Player portal | `5175` | Opcional | Solo si probás return URL fuera de tu PC |

En la misma PC donde desarrollás, el **return URL** puede seguir siendo `http://localhost:5175` (`PAYMENTS_RETURN_URL_BASE`).

### Instalación (Windows)

1. Cuenta en [ngrok.com](https://ngrok.com) y descarga el binario.
2. Autenticación (una vez):

```powershell
ngrok config add-authtoken TU_TOKEN
```

3. Con la API levantada (`npm run dev` en `api/`):

```powershell
ngrok http 4001
```

4. Copiar la URL **HTTPS** que muestra, por ejemplo:

```
https://abc123.ngrok-free.app
```

5. En el **panel de MixerGaming (sandbox)**, configurar la URL de notificaciones:

```
https://abc123.ngrok-free.app/webhooks/payments/mixer-gaming
```

Método: `POST`. Body JSON según [wiki §3.5](https://github.com/MixerGaming/Payments-API/wiki/3.5.-Transaction-notifications).

### Variables `api/.env` (sandbox)

```env
PAYMENTS_ENABLED=1
PAYMENTS_DEFAULT_PROVIDER=mixer-gaming
PAYMENTS_MIXER_GAMING_BASE_URL=https://sandbox-url-de-mixer
PAYMENTS_MIXER_GAMING_CLIENT_ID=...
PAYMENTS_MIXER_GAMING_CLIENT_SECRET=...
PAYMENTS_RETURN_URL_BASE=http://localhost:5175
PAYMENTS_DEFAULT_CURRENCY=ARS
PAYMENTS_DEFAULT_COUNTRY=AR
```

El webhook **no** va en `.env`: se configura en el panel de Mixer con la URL de ngrok.

### Verificar que el túnel llega a la API

```powershell
# Health (debe responder ok)
Invoke-RestMethod -Uri "https://TU-SUBDOMINIO.ngrok-free.app/health"

# Webhook stub de prueba (con depositId real PENDING)
Invoke-RestMethod -Method POST `
  -Uri "https://TU-SUBDOMINIO.ngrok-free.app/webhooks/payments/stub" `
  -ContentType "application/json" `
  -Body '{"depositId":"<uuid>","success":true}'
```

Inspector de requests ngrok: [http://127.0.0.1:4040](http://127.0.0.1:4040)

### Notas

- **Plan free:** la URL cambia cada vez que reiniciás ngrok → actualizar panel Mixer.
- **Plan de pago:** dominio fijo (`https://tu-api.ngrok.app`) evita reconfigurar.
- **CORS:** no aplica al webhook (server-to-server).
- Si también tunelás el portal (`ngrok http 5175`), agregar el origen ngrok a `CORS_ORIGINS` y usar esa URL en `PAYMENTS_RETURN_URL_BASE`.

### Flujo E2E con ngrok

```
Portal (:5175) → POST /player/deposits → API → MixerGaming (redirect/QR)
Jugador paga en Mixer
Mixer → POST https://xxx.ngrok.app/webhooks/payments/mixer-gaming
ngrok → localhost:4001 → acredita wallet
Portal (polling) → GET /player/deposits/:id → COMPLETED + saldo actualizado
```

---

## Guía QA — primer depósito sandbox

### A) Sin Mixer (stub + webhook local)

Valida Fase 3 sin credenciales ni ngrok:

```powershell
cd api
npm run dev
# otra terminal:
npm run test:deposit-webhook
```

El script: registra jugador → depósito stub PENDING → webhook → verifica saldo e idempotencia.

### B) Con MixerGaming sandbox + ngrok

Checklist manual:

| Paso | Acción | Verificación |
|------|--------|--------------|
| 1 | `ngrok http 4001` activo | URL HTTPS visible |
| 2 | Credenciales sandbox en `api/.env` | `PAYMENTS_DEFAULT_PROVIDER=mixer-gaming` |
| 3 | Webhook en panel Mixer | `{ngrok}/webhooks/payments/mixer-gaming` |
| 4 | API + portal levantados | `:4001` y `:5175` |
| 5 | Login portal jugador | Tab **Depositar** |
| 6 | Completar perfil (nombre, DNI, teléfono) | Requerido para mixer-gaming |
| 7 | Elegir método ARS, monto dentro de min/max | Redirect o QR |
| 8 | Completar pago en sandbox Mixer | — |
| 9 | Inspeccionar ngrok `:4040` | POST webhook 200 |
| 10 | Portal: saldo y Movimientos | Tipo `DEPOSIT`, estado COMPLETED |
| 11 | Repetir webhook (replay en ngrok) | Saldo no debe duplicarse |

### C) Depósito fallido (stub)

```powershell
# Tras crear depósito stub, simular fallo:
Invoke-RestMethod -Method POST -Uri "http://localhost:4001/webhooks/payments/stub" `
  -ContentType "application/json" `
  -Body '{"depositId":"<uuid>","success":false}'
```

Saldo sin cambios; depósito `FAILED`.

---

## Fuera de alcance (v1)

| Ítem | Estado |
|------|--------|
| Retiros / withdrawals MixerGaming | [-] |
| Microservicio de pagos separado | [-] |
| Multi-moneda en UI | [-] |
| Depósito desde backoffice (ya existe crédito manual) | [-] |
| Integración Kushki token en frontend (si no es método v1) | [-] |

---

## Referencias

| Recurso | URL |
|---------|-----|
| Wiki home | https://github.com/MixerGaming/Payments-API/wiki |
| Login OAuth | https://github.com/MixerGaming/Payments-API/wiki/1.-Login-to-the-API |
| Listado métodos | https://github.com/MixerGaming/Payments-API/wiki/2.1.-List-of-payment-methods |
| Depósitos | https://github.com/MixerGaming/Payments-API/wiki/3.1.-Deposits |
| Notificaciones | https://github.com/MixerGaming/Payments-API/wiki/3.5.-Transaction-notifications |
| Código portal actual | `player-portal/src/` |
| Wallet / depósitos DB | `database/prisma/schema.prisma` (`Deposit`, `WalletTransaction`) |
| Crédito manual (referencia) | `api/src/services/wallet.ts` |
| Postman (QA pagos) | `docs/postman/payments.postman_collection.json` |
| Script E2E stub | `api/scripts/run-deposit-webhook-test.ts` |

---

## Bitácora de cambios

| Fecha | Autor | Cambio |
|-------|-------|--------|
| 2026-07-30 | — | Fase 1 implementada en `player-portal/src/payments/` |
| 2026-07-30 | — | Fases 2–3 API + webhook; guía ngrok y script `test:deposit-webhook` |
| 2026-07-30 | — | Postman, ngrok scripts, E2E stub verificado; doc sincronizado |
