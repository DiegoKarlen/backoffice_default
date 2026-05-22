# Plan de mejoras de código — sin romper producción

Documento de **backlog ejecutable** derivado de la auditoría (calidad, modularización, basura, duplicación, prácticas modernas, performance).

**Regla de oro:** cada tarea se entrega en **PR pequeño**, con tests o checklist QA antes de merge. No mezclar refactors masivos con features nuevas.

**Leyenda**

| Campo | Significado |
|-------|-------------|
| **ID** | Identificador de tarea (referencia en PR/commits) |
| **Riesgo** | Bajo / Medio / Alto — probabilidad de romper flujos críticos |
| **Bloquea** | IDs que deben completarse antes |
| **DoD** | Definition of Done — criterio de cierre |

**Flujos críticos que NO pueden romperse** (regresión obligatoria en cada PR que toque API o motor):

1. Crear/editar bingo (BO) — premios, `prizeMode`, pozo, figuras, `drawMode`
2. Compra de cartones (portal) — saldo, fingerprints únicos
3. Sorteo virtual — bolillas, premios inmediatos y diferidos, liquidación al cierre
4. Sorteo live — `draw-ball`, display, snapshot SSE
5. Cancelación de partida — reembolsos wallet
6. Login admin / player / display JWT

---

## Fase 0 — Red de seguridad (hacer primero)

Sin esto, los refactors de P0/P1 son arriesgados.

| ID | Tarea | Archivos / ámbito | Riesgo | DoD |
|----|--------|-------------------|--------|-----|
| **Q0.1** | Inventario de scripts de test y comando único documentado | `api/package.json`, README raíz | Bajo | `npm test` en `api/` documentado; lista de tests existentes |
| **Q0.2** | Baseline: ejecutar todos los tests actuales y guardar resultado | CI local o nota en PR | Bajo | 0 fallos antes de tocar `prize-evaluator` |
| **Q0.3** | Test de integración “una bolilla, un premio line” (si no existe) ampliado a 2 cartones + premio unique | `prize-evaluator.integration.test.ts` | Bajo | Assert cantidad de `deferred` / `payout` sin duplicar |
| **Q0.4** | Checklist manual de regresión (1 página) enlazado a `product-progress.md` §1 | `docs/status/product-progress.md` | Bajo | 15–20 pasos copy-paste para QA tras cada PR grande |
| **Q0.5** | Branch de trabajo dedicada `chore/code-quality` o epic en tracker | Git | Bajo | Convención acordada: 1 PR = 1 ID de este doc |

**Bloquea:** todo P0 en adelante (recomendado).

---

## Fase P0 — Crítico (performance + dinero + seguridad)

Orden sugerido **dentro de P0**: Q0 → **Q1** → **Q2** → **Q3** → **Q4**.

### Q1 — Performance evaluación de premios

| ID | Tarea | Detalle técnico | Riesgo | Bloquea | DoD |
|----|--------|-----------------|--------|---------|-----|
| **Q1.1** | Análisis y tests de comportamiento actual | Capturar queries (log Prisma `query` en test) o contar llamadas en test | Bajo | Q0.2 | Test documenta comportamiento esperado (golden) |
| **Q1.2** | Precarga por ronda: cartones + cells + player en un `findMany` | `prize-evaluator.ts` | Medio | Q1.1 | Misma salida que antes en test de integración |
| **Q1.3** | Sets en memoria: payouts y deferred ya existentes por `(roundId, prizeId, cardId)` | Una query al inicio de `evaluateRoundPrizesAfterBall` | Medio | Q1.2 | 0 `findFirst` dentro del loop cartón×premio |
| **Q1.4** | Batch inserts donde haya múltiples deferred en la misma bolilla | `createMany` con skipDuplicates si aplica | Medio | Q1.3 | Tests + sorteo manual 50+ cartones sin timeout |
| **Q1.5** | Revisar índices Prisma (solo si explain muestra seq scan) | migración opcional | Bajo | Q1.4 | Migración reversible; `prisma migrate` en dev |

**No hacer en Q1:** cambiar reglas de figuras, orden de ganadores ni montos de pozo.

---

### Q2 — Wallet unificado (eliminar duplicación, mismo comportamiento)

| ID | Tarea | Archivos | Riesgo | Bloquea | DoD |
|----|--------|----------|--------|---------|-----|
| **Q2.1** | Crear `api/src/services/wallet-ledger.ts` | `debit`, `credit`, `getBalanceForUpdate` con transacción | Medio | Q0.2 | Tests unitarios con mock o DB test |
| **Q2.2** | Migrar `wallet.ts` a ledger | Sin cambiar firmas públicas | Medio | Q2.1 | Tests wallet existentes verdes |
| **Q2.3** | Migrar `carton-purchase.ts` | Misma semántica 402/400 | Alto | Q2.2 | Compra manual portal OK |
| **Q2.4** | Migrar `prize-payout.ts` | Premio inmediato igual | Alto | Q2.3 | Test integración premio |
| **Q2.5** | Migrar `round-cancellation-refund.ts` | Reembolso total igual | Alto | Q2.4 | Cancelar partida en BO + saldo |
| **Q2.6** | Eliminar código muerto duplicado (bloques FOR UPDATE repetidos) | grep `FOR UPDATE` solo en ledger | Bajo | Q2.5 | Un solo lugar con lock |

---

### Q3 — Seguridad live y configuración

| ID | Tarea | Detalle | Riesgo | Bloquea | DoD |
|----|--------|---------|--------|---------|-----|
| **Q3.1** | Auditar rutas `public/bingos/live/*` | `public-bingos.ts`, `live-session.ts` | Bajo | — | Lista escrita en PR |
| **Q3.2** | Auth obligatoria en `draw-ball` / `stop` (JWT display o API key por sala) | Middleware reutilizar `requireAuth` variante display | Medio | Q3.1 | Display con token sigue funcionando; curl sin token → 401 |
| **Q3.3** | Validar env al boot con Zod | `api/src/config/env.ts` | Bajo | — | Falla rápido si falta `JWT_SECRET` |
| **Q3.4** | CORS: lista explícita desde env (`CORS_ORIGINS`) | `index.ts` | Medio | Q3.3 | Dev localhost sigue OK; prod solo orígenes configurados |
| **Q3.5** | Rate limit en login player/admin | `express-rate-limit` | Bajo | — | No bloquea uso normal en QA |

**Compatibilidad:** en dev, flag `LIVE_DRAW_AUTH_OPTIONAL=true` solo si hace falta transición (documentar y quitar en prod).

---

### Q4 — Live session: preparar escala (sin cambiar UX)

| ID | Tarea | Detalle | Riesgo | Bloquea | DoD |
|----|--------|---------|--------|---------|-----|
| **Q4.1** | Documentar limitación single-instance | `docs/architecture.md` (nuevo) | Bajo | — | Diagrama memoria vs Redis |
| **Q4.2** | Extraer interfaz `LiveSessionStore` (implementación in-memory actual) | `live-session.ts` | Medio | Q1, Q3 | Mismo API exportado; tests si existen |
| **Q4.3** | No registrar side-effects en import del módulo | Mover registro a `index.ts` bootstrap | Medio | Q4.2 | Arranque explícito; tests no arrancan sesiones fantasma |
| **Q4.4** | Reducir payload SSE: delta de bolilla vs snapshot completo (opcional flag) | `live-session.ts`, clients | Alto | Q4.2, Q3.2 | Feature flag `SSE_DELTA=1`; con flag off, comportamiento idéntico al actual |
| **Q4.5** | Spike Redis (no obligatorio en P0): POC pub/sub | branch aparte | Bajo | Q4.1 | Decisión documentada; no merge hasta Q4.2 estable |

**No hacer en P0:** migrar todo a Redis en producción sin sticky sessions probados.

---

## Fase P1 — Mantenibilidad y duplicación

Dependencias: **P0 completo** (al menos Q1 + Q2) antes de partir god files que tocan premios/wallet.

### Q5 — API: extraer librerías compartidas

| ID | Tarea | Archivos | Riesgo | DoD |
|----|--------|----------|--------|-----|
| **Q5.1** | `bingo-card-grid.ts` — unificar `cellsToGrid5` | wallet-transaction-card-detail, bingo-round-bo-detail | Bajo | Tests existentes o nuevo test grid |
| **Q5.2** | `api/src/errors.ts` + middleware `errorHandler` | `index.ts`, rutas | Medio | Respuestas JSON mismas formas; mapeo Zod → 400 |
| **Q5.3** | Migrar rutas gradualmente a `next(err)` | 1 PR por dominio: `auth`, `players`, `bingos` | Medio | Sin cambiar status codes |
| **Q5.4** | Logger estructurado (pino) reemplazar `console.log` en API | lib/logger.ts | Bajo | Logs en dev legibles |

---

### Q6 — API: modularizar `bingos.ts` y rutas grandes

**Estrategia strangler:** extraer funciones sin cambiar URLs.

| ID | Tarea | Extracción | Riesgo | DoD |
|----|--------|------------|--------|-----|
| **Q6.1** | `bingo.serializer.ts` — `serializeBingo`, listas | `routes/bingos.ts` | Medio | BO lista/detalle igual |
| **Q6.2** | `bingo.prize-sync.ts` — sync premios en update | idem | Alto | Editar bingo con premios % y fijos |
| **Q6.3** | `bingo.service.ts` — create/update core | idem | Alto | Crear bingo desde cero |
| **Q6.4** | `bingo.rounds.ts` — endpoints de partidas | idem | Medio | Rounds list/kickoff |
| **Q6.5** | `routes/bingos.ts` solo wiring + Zod | &lt; 150 líneas | Bajo | File size reducido |

---

### Q7 — API: `live-session.ts` y motor

| ID | Tarea | Riesgo | DoD |
|----|--------|--------|-----|
| **Q7.1** | Separar `live-scheduler.ts` (timers virtual) de `live-broadcast.ts` (SSE) | Medio | Sorteo virtual timing igual |
| **Q7.2** | `prize-evaluator.ts` solo lógica pura; DB en capa `prize-evaluation.repo.ts` | Medio | Tras Q1, solo reorganización |
| **Q7.3** | Decisión bingo-90: ocultar en registry BO o ticket “out of scope” | Bajo | Sin opción 90 en UI si sigue stub |

---

### Q8 — Backoffice: limpieza y modularización

| ID | Tarea | Riesgo | DoD |
|----|--------|--------|-----|
| **Q8.1** | Confirmar scripts no usados (`charts`, `calendar`, `maps`, `palette`) | Bajo | grep + quitar de `index.js` |
| **Q8.2** | Quitar HTML demo del `htmlPlugin` (o carpeta `src/_archive/demo/`) | Medio | Build BO más liviano; nav sin links rotos |
| **Q8.3** | Partir `bingo-admin.js` → `bingo-admin/form.js`, `prizes.js`, `list.js` | Medio | Webpack entry único reexporta |
| **Q8.4** | Partir `admin-pages.js` por dominio (players, rooms, security) | Alto | 1 dominio por PR |
| **Q8.5** | Eliminar aliases webpack rotos (`@/components`) o crear carpetas | Bajo | Build sin warnings |

---

### Q9 — Monorepo `packages/shared` (tipos + utilidades)

| ID | Tarea | Riesgo | DoD |
|----|--------|--------|-----|
| **Q9.1** | Crear `packages/shared` con `escapeHtml`, `formatMoney` | Bajo | Tests vitest en package |
| **Q9.2** | Tipos TS: `LiveSnapshot`, `UpcomingRound`, `BingoPrize` (desde OpenAPI manual o duplicar schema Zod export) | Medio | player-portal importa tipos |
| **Q9.3** | Cliente HTTP mínimo `createApiClient(baseUrl, getToken)` | Medio | Portal usa shared; display en Q9.4 |
| **Q9.4** | Migrar bingo-display a shared | Medio | Display build OK |
| **Q9.5** | Backoffice: copiar bundle UMD de shared o import ESM vía webpack alias | Medio | Sin romper IE si aplica; probar target browsers |

**Orden:** Q9.1 → Q9.2 → portal (Q9.3) → display (Q9.4) → BO (Q9.5).

---

### Q10 — Frontends: partir monolitos

| ID | Tarea | Archivos | Riesgo | DoD |
|----|--------|----------|--------|-----|
| **Q10.1** | player-portal: `auth.ts`, `api.ts`, `views/dashboard.ts`, `views/cards.ts`, `live/sse.ts` | main.ts &lt; 200 líneas entry | Medio | Misma UX; `npm run build` |
| **Q10.2** | bingo-display: `live/`, `ui/ball.ts`, `auth.ts` | main.ts entry delgado | Medio | Sorteo virtual + live manual QA |
| **Q10.3** | SSE: unificar reconnect/backoff en shared | portal + display | Medio | Desconectar red 5s → reconecta |

---

### Q11 — Calidad de toolchain

| ID | Tarea | DoD |
|----|--------|-----|
| **Q11.1** | ESLint + Prettier raíz (api, player-portal, bingo-display) | `npm run lint` sin errores en código tocado |
| **Q11.2** | GitHub Actions: `api` test + `prisma validate` + build Vite apps | PR bloqueado si falla |
| **Q11.3** | Husky opcional: lint-staged solo en archivos staged | No obligatorio si molesta al equipo |

---

## Fase P2 — Excelencia operativa (después de P1 estable)

| ID | Tarea | Riesgo | Notas |
|----|--------|--------|-------|
| **Q12.1** | Cache `buildUpcomingPayload` (TTL 10s por roomId) | Medio | Invalidar al crear round / compra |
| **Q12.2** | Optimizar `carton-purchase` fingerprints (batch/reserva) | Alto | Solo con tests de concurrencia |
| **Q12.3** | Refund cancelación en una transacción | Medio | Muchas compras misma partida |
| **Q12.4** | OpenAPI generado desde Zod | Bajo | Documentación |
| **Q12.5** | Backoffice TypeScript gradual (1 módulo) | Alto | Largo plazo |
| **Q12.6** | Métricas: latencia evaluación premios, bolillas/min | Bajo | Prometheus o logs agregados |
| **Q12.7** | Archivado histórico wallet/balls | Bajo | Diseño solo hasta volumen real |
| **Q12.8** | Redis live session en producción | Alto | Tras Q4.5 spike + load test |

---

## Matriz de dependencias (resumen)

```
Q0 (seguridad tests)
 ├── Q1 (prize-evaluator perf) ──┐
 ├── Q2 (wallet ledger) ─────────┼── Q6, Q7 (refactor rutas/motor)
 └── Q3 (auth live, env) ────────┘
       └── Q4 (live session interface)
             └── Q4.5 Redis spike (opcional)

Q5 (errors, grid) — paralelo tras Q0
Q8 (BO cleanup) — paralelo, poco acoplamiento
Q9 (shared) ── Q10 (partir frontends)
Q11 (CI/lint) — paralelo desde Q0.2

P2 (Q12) — después de P0+P1 en producción estable
```

---

## Estrategia “no romper nada”

### Por cada PR

1. **Una preocupación** — no mezclar Q1 con Q8 en el mismo merge.
2. **Tests antes/después** — si no hay test, checklist Q0.4 manual.
3. **Feature flags** para cambios de comportamiento SSE o auth (`env`).
4. **Migraciones DB** — siempre aditivas primero; backfill en script aparte.
5. **Rollback** — revert del PR vuelve al comportamiento anterior; evitar migraciones destructivas en el mismo PR que lógica.
6. **No cambiar contratos JSON** sin versión o campos opcionales nuevos.
7. **Mantener rutas y status HTTP** — refactors internos solamente.

### Orden de PRs recomendado (sprints)

| Sprint | IDs | Objetivo |
|--------|-----|----------|
| **S1** | Q0.1–Q0.5, Q11.1–Q11.2 | Red de seguridad + CI |
| **S2** | Q1.1–Q1.5 | Performance premios |
| **S3** | Q2.1–Q2.6 | Wallet ledger |
| **S4** | Q3.1–Q3.5, Q5.1–Q5.2 | Seguridad + errores + grid |
| **S5** | Q4.1–Q4.3, Q7.1–Q7.2 | Live session estructura |
| **S6** | Q5.3–Q5.4, Q6.1–Q6.3 | API modular bingos (parte 1) |
| **S7** | Q6.4–Q6.5, Q8.1–Q8.3 | API bingos + BO bingo |
| **S8** | Q9.1–Q9.5, Q10.1 | Shared + portal |
| **S9** | Q10.2–Q10.3, Q8.4–Q8.5 | Display + BO pages |
| **S10+** | Q12.*, Q4.5, Q4.4 | Escala y excelencia |

---

## Checklist de regresión rápida (post-PR)

Copiar en descripción de PR cuando aplique:

- [ ] `cd api && npm test`
- [ ] Crear bingo 75: fijo y %, premios con figuras nuevas
- [ ] Programar partida + comprar 2 cartones (portal)
- [ ] Sorteo virtual hasta premio línea (saldo o deferred según config)
- [ ] Sorteo live: login display, 1 bolilla manual, SSE en display
- [ ] Cancelar partida programada: saldo devuelto
- [ ] BO: listar jugadores, ver movimiento wallet con detalle cartón
- [ ] `npm run build` en player-portal y bingo-display

---

## Seguimiento

Actualizar estados en este archivo o en tu tracker (Jira/Linear) usando los **IDs Qx.y**.

Relacionado: `docs/status/product-progress.md` (alcance funcional), `docs/game-engine.md` (motor).

## Progreso de implementación

| ID | Estado | Notas |
|----|--------|-------|
| Q0.1–Q0.4 | Hecho | `api/README.md`, checklist en `product-progress.md` |
| Q1.1–Q1.4 | Hecho | `prize-evaluator.ts` precarga + sets; test idempotencia |
| Q2.1–Q2.6 | Hecho | `wallet-ledger.ts`; migrados wallet, prize-payout, carton-purchase, refund |
| Q3.1–Q3.5 | Hecho | `config/env.ts`, live draw auth, CORS, rate limit login, display `live-auth.ts` |
| Q4.1–Q4.3 | Hecho | `docs/architecture.md`, `live-session-registry.ts`, bootstrap en `index.ts` |
| Q4.4–Q4.5 | Pendiente | SSE delta, spike Redis |
| Q5.1–Q5.4 | Hecho | `bingo-card-grid`, `errors` + `errorHandler`, `logger` |
| Q5.3 rutas | Parcial | `errorHandler` global; rutas aún con try/catch local |
| Q6.1–Q6.5 | Hecho | `bingo-crud.service`, `bingo-rounds.ts`, `bingos.ts` ~240 líneas |
| Q7.3 | Hecho | API solo BINGO_75; UI sin opción 90 |
| Q7.1–Q7.2 | Pendiente | Partir live-session / prize repo |
| Q8.2 | Hecho | Webpack solo páginas producto (`BO_INCLUDE_ADMINATOR_DEMO=1` para demo) |
| Q8.3–Q8.5 | Pendiente | Partir bingo-admin / admin-pages |
| Q9.1–Q9.5 | Parcial | shared + tests; `bo-escape.js` en bingo-admin |
| Q10 | Parcial | `lib/dom`, `lib/format`; main.ts ~1070 líneas |
| Q11.1–Q11.2 | Hecho | ESLint + CI |
| Q12.1 | Hecho | Cache upcoming TTL 10s + `invalidateUpcomingCache` |
| Q12.3 | Hecho | Reembolso cancelación en una transacción |
| Q12.2, Q4.4, Q4.5, Q12.8 | Pendiente | Fingerprints batch, SSE delta, Redis |

**Última actualización del plan:** 2026-05-19
