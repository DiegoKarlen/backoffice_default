# Postman — módulo de pagos

## Importar

1. Postman → **Import**
2. Seleccionar:
   - `payments.postman_collection.json`
   - `payments-local.postman_environment.json`
3. Activar el environment **Payments - Local + ngrok**
4. Editar variables si cambió tu URL de ngrok:
   - `ngrokBase` → ej. `https://reboot-reexamine-ethics.ngrok-free.dev`

## Flujo E2E stub (sin Mixer)

Ejecutar en orden:

| # | Request | Notas |
|---|---------|--------|
| 1 | `00 - Health` → Health (local) | `{ "ok": true }` |
| 2 | `02 - Player` → Register **o** Login | Guarda `playerToken` |
| 3 | List payment methods | Debe listar `stub-transfer` |
| 4 | Initiate deposit (stub-transfer) | Guarda `depositId` |
| 5 | `01 - Webhooks` → POST webhook stub - success (local) | `status: COMPLETED` |
| 6 | Get deposit by id | `COMPLETED` |
| 7 | Player wallet | Saldo += `depositAmountCents` |
| 8 | POST webhook idempotencia | `alreadyProcessed: true` |

## Probar ngrok

Con ngrok corriendo (`scripts\ngrok-tunnel-api.cmd`):

1. **Health (ngrok)** → debe responder OK
2. **GET webhook ping - mixer-gaming (ngrok)** → `{ "ok": true, "method": "POST" }`
3. Tras un depósito, **POST webhook stub/mixer (ngrok)**

## MixerGaming real

1. Credenciales en `api/.env`
2. Login player + **Initiate deposit (mixer-gaming)**
3. Copiar `transaction.id` de la respuesta del gateway en variable `externalRef`
4. **POST webhook mixer-gaming - success (ngrok)** con ese `externalRef`

Formato webhook según [wiki §3.5](https://github.com/MixerGaming/Payments-API/wiki/3.5.-Transaction-notifications).
