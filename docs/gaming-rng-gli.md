# RNG del bingo — notas para revisión tipo GLI / laboratorio

Este documento describe el diseño del generador aleatorio usado en `api/src/game-engine/rng/`. **No sustituye** un informe de certificación: GLI (u otro laboratorio) certifica **producto + proceso + build**, no solo el código fuente.

Para la arquitectura de motores (bingo 75/90, futuras familias slots/crash), ver [game-engine.md](./game-engine.md).

## Qué está implementado

| Aspecto | Implementación |
|--------|----------------|
| Fuente | Node.js `crypto.randomInt` (`node:crypto`) — CSPRNG del sistema |
| Enteros uniformes | Rango inclusivo vía API nativa de Node |
| Barajado de bolas | Fisher–Yates in-place (`rng.shuffleInPlace`) |
| Aislamiento | Sorteos de juego concentrados en `game-engine/rng/index.ts` |
| Trazabilidad opcional | Variables `BINGO_RNG_AUDIT_LOG`, `BINGO_RNG_AUDIT_VERBOSE` |

## Variables de entorno (API)

- **`BINGO_RNG_AUDIT_LOG=1`**: emite líneas JSON en consola (`console.info`) por hitos de RNG y eventos de juego (`emitGameRngAudit`). Útil para correlacionar con logs de partida en auditoría.
- **`BINGO_RNG_AUDIT_VERBOSE=1`**: además registra **cada** entero aleatorio dentro del barajado (muy verboso en partidas 75/90 bolas).

## Qué suele pedir un laboratorio además del código

- Baterías estadísticas sobre millones de salidas (uniformidad, independencia).
- Descripción formal del flujo de datos desde RNG hasta resultado visible al jugador.
- Control de versiones del binario desplegado y trazabilidad del build.
- Políticas de acceso para que nadie pueda fijar semillas ni alterar resultados en producción.
- Requisitos locales específicos según jurisdicción.

## Identificación de implementación

Constantes exportadas en `game-engine/rng/index.ts`: `RNG_IMPLEMENTATION_ID`, `RNG_IMPLEMENTATION_VERSION`, `RNG_CRYPTO_SOURCE` — pueden citarse en informes de build.
