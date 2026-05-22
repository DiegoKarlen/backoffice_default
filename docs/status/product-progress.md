# Avance producto — portal jugador, backoffice y sorteos

Documento vivo para verificar alcance y priorizar trabajo. Actualizar estados y fechas al cerrar ítems.

**Leyenda de estado**

| Símbolo | Significado |
|--------|-------------|
| `[ ]` | Pendiente / no verificado |
| `[~]` | En curso o parcial |
| `[x]` | Hecho / verificado en el código o en QA |
| `[-]` | Fuera de alcance explícito o no aplica por ahora |

**Última revisión del documento:** 2026-05-14 — **§1.1–§1.4**, **§2.1–§2.3**, **§3.1–§3.3** cerrados en checklist. Bingo 90 fuera de alcance.

---

## 1. Validación funcional (¿nos falta algo?)

Objetivo: cerrar el flujo **negocio completo** con evidencia (manual o automatizada), no solo pantallas sueltas.

### 1.1 Portal jugador (`/player/*`)

| Ítem | Estado | Notas |
|------|--------|--------|
| Registro + login JWT + sesión (`sessionStorage` / token) | [x] | `POST /player/register`, `POST /player/login`; token en `sessionStorage` |
| Perfil / saldo (`/player/me`, wallet) | [x] | Dashboard muestra saldo en pesos + centavos |
| Movimientos de wallet (`/player/wallet/transactions`) | [x] | Lista legible; incluye `detail` para premio (bingo/figura), compra (bingo/partida), depósito |
| Listado público salas + agenda (`/public/bingos/rooms`, `upcoming` con `bingoRoundId`) | [x] | Selector de sala + tabla de partidas |
| Compra cartones bingo 75 (`carton-purchase`) con saldo suficiente | [x] | Flujo desde tabla de partidas |
| Error claro: saldo insuficiente (402) | [x] | API `402` + mensaje en español en portal (`translatePlayerApiError`) |
| Error claro: partida no SCHEDULED / bingo inactivo | [x] | API `400` con texto en inglés mapeado a ES en el portal |
| **Ver mis cartones** (grillas 5×5) tras comprar | [x] | `GET /player/my-cards` + sección **Mis cartones** (grilla 5×5, centro libre) |
| **Premios acreditados visibles** en portal (wallet + UX, no solo JSON) | [x] | Movimientos tipo `PRIZE_CREDIT` con línea “Premio · {bingo} · {figura}”; el abono automático en sorteo sigue siendo §1.3 |
| Recuperación de contraseña / verificación email | [-] | Opcional producto |

### 1.2 Backoffice (RBAC + operaciones)

| Ítem | Estado | Notas |
|------|--------|--------|
| Usuarios admin, roles, funcionalidades | [x] | Pantallas admin-users / roles / functionalities + RBAC |
| Salas y bingos (CRUD, agenda, sync rondas) | [x] | Salas + bingos en BO; agenda/upcoming según producto |
| Módulo jugadores: listado, búsqueda, acreditación manual | [x] | Jugadores: filtros, tabla, **Acreditar saldo** |
| Actividad jugador: compras + prize payouts (`/backoffice/players/...`) | [x] | Panel Actividad: JSON compras + pagos |
| Crédito manual de premio desde BO | [x] | Formulario en Actividad: UUID `BingoPrize` + `PlayerRoundCard` → `POST .../prize-credits` (sin curl). Script `api/scripts/run-prize-credit-test.ts` sigue válido para automatizar. Ver **nota UI** abajo. |

**Verificado / cerrado:** 2026-05-07 — QA funcional portal + BO actividad + premio (API o BO).

**Nota — acreditar premio en BO (recordatorio):** El flujo habitual en producción será el **premio automático** en el sorteo (§1.3). Este formulario es útil hoy para QA / contingencia; **cuando se refine la UI del BO en esa zona**, volver a definir si **se mantiene**, se **oculta** (solo dev/API) o se **reemplaza** por algo más guiado. Por ahora queda como está.

### 1.3 Motor en vivo (bingo display / SSE)

| Ítem | Estado | Notas |
|------|--------|--------|
| Agenda por sala + arranque automático de partidas | [x] | `live-session` + `buildUpcomingPayload` por sala |
| Sorteo de bolillas + persistencia `BingoRoundBall` | [x] | `tickDraw` → `BingoRoundBall` |
| **Evaluación de cartones jugador vs bolillas** | [x] | Bingo **75**: LINE / PERIMETER / FULL_HOUSE (`bingo-75-figures.ts`); tras cada bolilla `evaluateRoundPrizesAfterBall` |
| **Acreditación automática de premios** | [x] | `creditPrizeToWinner` desde `round-prize-evaluator`; SSE `prize_awarded`; idempotencia por `PrizePayout` existente |
| **Bingo Live (`drawMode` LIVE)** | [x] | Video placeholder + grilla manual en display; `POST /public/bingos/live/draw-ball` (sin auth por ahora); virtual sin cambios |
| Respeto de `minPlayersToStart` con **cartones reales** | [x] | En `startsAt`, con la ronda aún `SCHEDULED`: cuenta cartones; si `< minPlayersToStart` → `CANCELLED` (sin pasar por `DRAWING`) + reembolso; si alcanza cupo → `DRAWING` y `round_start`. Ventas cierran al llegar `startsAt` (`isRoundOpenForPurchase`). |

**Implementación (API):** `api/src/game-engine/bingo/` (`bingo-75/figures.ts`, `prize-evaluator.ts`, `live-session.ts`). Bingo **90**: fuera de alcance por ahora.

### 1.4 Cierre end-to-end (definir “done”)

| Ítem | Estado | Notas |
|------|--------|--------|
| Caso feliz: registro → carga saldo (BO) → compra → sorteo → premio en wallet | [x] | Validado manual en local: compra OK, `PRIZE_CREDIT` en movimientos + popup `¡PREMIO!` en `bingo-display` (SSE `prize_awarded`). |
| Caso borde: mismo cartón / fingerprint (colisión) ya contemplado en compra | [x] | `allocateWithUniqueFingerprint` + unique `(bingoRoundId, cardFingerprint)`; tests: `allocate-unique-fingerprint.test.ts`, `player-card.test.ts` (`npm test` en `api/`) |
| Bingo 90: compra / sorteo | [-] | Fuera de alcance; compra acotada a 75 en servicio |

**Verificado / cerrado:** 2026-05-14 — E2E feliz (manual 2026-05-07) + colisión fingerprint (`npm test` en `api/`, 8 tests OK).

## 2. Usabilidad (portal jugador + backoffice)

Objetivo: experiencia **clara y defendible** para jugador y operador, sin depender de UUIDs pegados a mano donde ya hay datos en API.

### 2.1 Portal jugador

**Cerrado:** 2026-05-14 — checklist completo; pulido final: `friendlyError` en carga de partidas + `formatDecimalPrice` en tabla de compra.

| Ítem | Estado | Notas |
|------|--------|--------|
| Login primario / registro secundario (jerarquía clara) | [x] | `mountGuestAuth`: vista por defecto login (`Iniciar sesión` + CTA primario); registro vía enlace secundario `Registrate` / vuelta con `pp-btn-link`. |
| Estados vacíos (“sin salas”, “sin partidas”, “sin movimientos”) | [x] | Copy en salas (`— No hay salas activas —`), partidas, movimientos, cartones, “elegí sala”, estados de carga. |
| Errores legibles (network, 401, saldo, partida cerrada) | [x] | `friendlyError` + `translatePlayerApiError` en compra, dashboard y carga de partidas (`showRoundsForSlug`); 401 → flash sesión. |
| Formato monetario consistente (ej. ARS con decimales) | [x] | `formatMoney` / `formatDecimalPrice` (es-AR, 2 dec.) en saldo, movimientos y columna precio de la tabla de partidas. |
| **Mis partidas / mis compras** (lista antes de detalle cartón) | [x] | **Movimientos**: líneas `Compra cartones · {bingo} · Partida #N` + filtros sala/bingo/partida. **Cartones**: filtros por partida y grillas con caption (bingo, partida, fecha). |
| Visualización de cartones (comparar / ver grillas) | [x] | Pestaña **Cartones comprados**: grillas 5×5, varias por partida, marcado en vivo (`pp-cell-hit`), filtros para acotar por ronda. |
| Responsive / accesibilidad básica (labels, foco, contraste) | [x] | `viewport`; `flex-wrap` / grid filtros; `label for=`, `aria-label` nav/grillas/cantidad, `aria-live` saldo; dark `prefers-color-scheme`; tabla `overflow-x`. |

### 2.2 Backoffice

**Cerrado:** 2026-05-14 — checklist completo: navegación jugadores, filtros en tablas, paginación UI (`bo-pager.js` en todas las tablas del BO), feedback acreditación/premio, actividad wallet con correlación compra ↔ partida ↔ premio y modal de cartones.

| Ítem | Estado | Notas |
|------|--------|--------|
| Navegación coherente (módulo Jugadores, migas) | [x] | `Shell.js` → `admin-players`; `data-bo-page="players"` + migas topbar (`crumbs.players`); eyebrow `Juego / Jugador`; vistas lista ↔ actividad / acreditar / premio con Cancelar / Cerrar. |
| Tablas: filtros, paginación si el volumen crece | [x] | **Filtros:** búsqueda jugadores (`q`); actividad wallet por tipo, sala, bingo, partida, fechas (+ filtro cliente en caché). **Paginación:** componente `bo-pager.js` en todas las tablas del BO (usuarios, roles, funcionalidades, salas, bingos, partidas en modal, jugadores, movimientos wallet); slice cliente sobre datos cargados (límites API 200 jugadores / 500 partidas / 200–800 movimientos). |
| Feedback al acreditar saldo / errores | [x] | `showToast` en acreditación manual y premio manual; validación importe; errores API; éxito vuelve a listado. |
| Vista jugador: correlación compra ↔ partida ↔ premios | [x] | Panel **Actividad**: tabla wallet con sala / bingo / partida (#); botón **Ver detalle** en compra y premio → modal con grillas 75 (premio: figura + bolillas). Ya no depende de JSON crudo en pantalla. |

### 2.3 Bingo display (público)

**Cerrado:** 2026-05-14 — premios en vivo + copy alineado con portal (sala / bingo / partida en header, idle, banner y próximos sorteos).

| Ítem | Estado | Notas |
|------|--------|--------|
| Mostrar ganadores / premio (cuando exista motor) | [x] | SSE `prize_awarded`: banner con figura, **usuario** (`playerUsername`), monto ARS; cola si varios premios seguidos |
| Alineación de copy con portal (nombres de sala/bingo) | [x] | Header **SALA** (`roomTitle`) + **BINGO** (`current.name`); idle con sala + nombre de bingo; banner y lista próximos con sala/bingo/`Partida #N` como en portal; label `ROOM` → `SALA`. |

---

## 3. Jugador dentro del sorteo (bingo en vivo)

Objetivo: que las bolillas y los **cartones comprados** determinen premios de forma trazable.

**Cerrado:** 2026-05-14 — **BINGO_75** en vivo: modelo y persistencia (3.1), motor de premios con `uniquePerRound` configurable (3.2) y reglas de negocio documentadas (3.3). Bingo 90: fuera de alcance.

### 3.1 Modelo y datos

**Cerrado:** 2026-05-14 — modelo Prisma + persistencia en compra/sorteo + reglas de figura 75 verificadas en código y tests unitarios.

| Ítem | Estado | Notas |
|------|--------|--------|
| `PlayerRoundCard` + `BingoCardCell` por partida | [x] | Schema `PlayerRoundCard` / `BingoCardCell` (`schema.prisma`); compra en `carton-purchase.ts` crea 25 celdas por cartón + `cardFingerprint` único por `(bingoRoundId, fingerprint)`. Tests: `player-card.test.ts`, `allocate-unique-fingerprint.test.ts`. |
| `BingoRoundBall` por bolilla | [x] | `BingoRoundBall` (`roundId`, `drawOrder`, `number`); `live-session.ts` → `tickDraw` persiste cada bolilla al sortear. |
| Reglas de figura (`BingoFigure`: LINE, PERIMETER, FULL_HOUSE) vs tipo bingo | [x] | Enum en Prisma + `BingoPrize.figure`; evaluación **BINGO_75** en `game-engine/bingo/bingo-75/figures.ts` (`winsLine`, `winsPerimeter`, `winsFullHouse`, `BINGO_FIGURE_EVAL_ORDER`). Bingo 90: `[-]` fuera de alcance. Tests: `figures.test.ts`. |

### 3.2 Lógica de sorteo

**Cerrado:** 2026-05-14 — evaluación tras cada bolilla, desempate determinista, crédito idempotente y SSE de premio.

| Ítem | Estado | Notas |
|------|--------|--------|
| Tras cada bolilla (o al cierre): detectar cartones que cumplen figura | [x] | En vivo para **BINGO_75**: `evaluateRoundPrizesAfterBall` tras cada bolilla. |
| Desempates / orden si varios ganan o varios premios | [x] | Orden figuras: LINE → PERIMETER → FULL_HOUSE. Por premio, `uniquePerRound` en BO (default sí): un ganador con desempate (`createdAt` → `cardIndex` → `id`); si no, todos los elegibles cobran. Ver `docs/game-engine.md` § Premios en vivo. |
| Integración con `creditPrizeToWinner` (idempotencia, no doble pago) | [x] | Crédito vía `creditPrizeToWinner` + idempotencia por existencia de `PrizePayout` (cartón + premio) y corte por premio ya pagado en la partida. |
| Eventos SSE/display: “premio otorgado” en pantalla pública | [x] | `bingo-display` escucha `prize_awarded` |

### 3.3 Reglas de negocio a documentar (antes de codificar del todo)

**Cerrado:** 2026-05-14 — reglas fijadas e implementadas en `live-session` y `prize-evaluator`; detalle en `docs/game-engine.md` § Premios en vivo.

| Ítem | Estado | Notas |
|------|--------|--------|
| ¿Se detiene el sorteo al primer premio mayor o siguen bolillas? | [x] | Siguen hasta **cartón lleno** (`FULL_HOUSE`): `evaluateRoundPrizesAfterBall` devuelve `true` y `live-session` hace `endRound()`. Premios menores (línea, perímetro) no cortan el sorteo. |
| ¿`minPlayersToStart` cuenta jugadores únicos o cartones vendidos? | [x] | **Cartones vendidos** (`countSoldCartons` vs `minPlayersToStart` en `live-session` **antes** de `promoteRoundToDrawing`). |
| ¿Premios configurados por bingo aplican en orden fijo? | [x] | Sí: LINE → PERIMETER → FULL_HOUSE. Ganadores por figura según `uniquePerRound` (único vs repetible) en cada `BingoPrize`. |

---

## 4. Otros temas recomendados (además de los tres puntos)

### 4.1 Seguridad y cumplimiento

| Ítem | Estado | Notas |
|------|--------|--------|
| Secretos JWT fuera de defaults en prod | [ ] | `.env` |
| Rate limit login/registro | [ ] | Opcional |
| Auditoría de acreditaciones BO (quién, cuándo) | [ ] | Mejorar si solo hay `externalRef` |

### 4.2 Observabilidad y operación

| Ítem | Estado | Notas |
|------|--------|--------|
| Healthcheck API (`/health`) integrado en despliegue | [ ] | |
| Logs estructurados en errores de compra/sorteo/pago | [ ] | |

### 4.3 Datos y entornos

| Ítem | Estado | Notas |
|------|--------|--------|
| Seed reproducible (admin, roles, funcionalidades, sala/bingo demo) | [ ] | |
| Documentar `DATABASE_URL` y puertos locales (API, Vite) | [ ] | README raíz o `/docs` |

### 4.4 Calidad

Objetivo: confianza para release — automatizar reglas críticas y dejar una regresión manual repetible.

| Ítem | Estado | Notas |
|------|--------|--------|
| Tests unitarios API (reglas figura, cartón, desempate, kickoff ronda) | [x] | `npm test` en `api/`: `figures.test.ts`, `player-card.test.ts`, `allocate-unique-fingerprint.test.ts`, `prize-winner-order.test.ts`, `bingo-round-kickoff.test.ts`. |
| Tests de integración API (`prize-evaluator` + Prisma) | [x] | `prize-evaluator.integration.test.ts`: premio LINE `uniquePerRound` (un ganador vs dos), jugador inactivo omitido. Requiere `DATABASE_URL` (Postgres); si no conecta, los casos se marcan *skip* en el runner. |
| Tests E2E o de contrato (portal / BO / display) | [ ] | Flujos críticos según §1: login jugador, compra, SSE sorteo + `prize_awarded`, acreditación visible en wallet; BO acreditar saldo / actividad. Automatizar donde sea viable (Playwright o scripts). |
| Checklist manual de regresión antes de release | [ ] | Basarse en §1.4 y §3: caso feliz, saldo insuficiente, partida cerrada/cancelada, premio único vs repetible, `minPlayersToStart`. Una pasada documentada por release. |
| CI: ejecutar `npm test` (api) en pipeline | [ ] | Bloquear merge si fallan tests unitarios existentes. |

### 4.5 Documentación por módulo

Objetivo: onboarding y operación sin depender del código. Ubicación sugerida: `/docs` (índice raíz) y/o README breve por paquete.

| Módulo | Estado | Qué documentar |
|--------|--------|----------------|
| **`api/`** | [~] | `docs/game-engine.md` + tests (`npm test` en `api/`): unitarios + `prize-evaluator.integration.test.ts` (DB). Falta mapa de rutas (`/player`, `/backoffice`, `/public`), servicios (`wallet`, `carton-purchase`, `prize-payout`), variables de entorno y arranque local. |
| **`database/`** (Prisma) | [ ] | Modelo de dominio (jugador, wallet, bingo, ronda, cartón, premio), migraciones, seed (`seed.ts`, demo), relaciones y enums (`BingoRoundStatus`, `BingoFigure`, cancelación). |
| **`backoffice/`** | [ ] | Módulos SPA (usuarios, roles, salas, bingos, jugadores), RBAC, flujos operador (acreditar saldo, premio manual, actividad wallet), build/dev (`webpack`). |
| **`player-portal/`** | [ ] | Flujos jugador (auth, saldo, compra, cartones, movimientos), errores API mapeados, proxy/dev contra API. |
| **`bingo-display/`** | [ ] | SSE por sala (`state`, `round_start`, `ball`, `prize_awarded`, `round_cancelled`), fases UI (idle, countdown, sorteo), variables Vite. |
| **Integración entre paquetes** | [ ] | Diagrama o tabla: quién llama a qué (portal → API, display → SSE público, BO → API admin), puertos locales, `PUBLIC_BINGO_DISPLAY_ORIGIN`. |
| **`docs/status/product-progress.md`** | [x] | Este archivo: avance y criterios de “hecho”. Mantener al cerrar iteraciones. |

---

## Checklist de regresión (código)

Usar tras PRs que toquen API, motor bingo, wallet o frontends críticos. Marcar cuando aplique.

### Automatizado

- [ ] `npm test` (raíz) o por suite: `npm run test:api:unit`, `test:api:integration`, `test:api:prizes`, `test:api:wallet`
- [ ] Índice de escenarios: `api/tests/README.md` — `cd api && npm run test:list`

### Manual rápido (~15 min)

- [ ] BO: crear bingo 75 — modo premios **fijo** y **%** con pozo; figuras LINE + al menos una letra; guardar y reabrir
- [ ] BO: programar partida / ver ronda en agenda
- [ ] Portal: login jugador; comprar 2 cartones en partida SCHEDULED; saldo descontado
- [ ] Portal: **Mis cartones** muestra grillas 5×5
- [ ] Sorteo **virtual**: partida llega a premio línea; movimiento wallet o deferred según modo; display SSE muestra bolillas
- [ ] Sorteo **live** (si aplica): 1 bolilla manual con JWT display; snapshot coherente
- [ ] BO: cancelar partida programada — reembolso en wallet jugador
- [ ] BO: jugador — listar movimientos con detalle compra/premio

**Plan de mejoras:** `docs/roadmap/code-quality-improvement-plan.md`

**Arquitectura (sesiones live, paquetes):** `docs/architecture.md`

### Comandos útiles antes de QA

```bash
# Batería completa (desde raíz del repo):
npm test

# Diagnóstico rápido por escenario (desde raíz):
npm run test:api:unit          # sin DB (~41 tests)
npm run test:api:prizes        # premios (6 archivos)
npm run test:api:wallet        # compra cartones (2 archivos)
npm run test:shared

# Desde api/:
cd api && npm run test:list    # listar suites
cd api && npm run build
```

Reiniciar API tras pull (`npm run dev` en `api/`) para cargar bootstrap de sesiones live y env validado.

---


