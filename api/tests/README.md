# API tests

Tests live under `api/tests/` (not next to `src/`) so suites stay grouped and runnable by scenario.

## Layout

```
tests/
  unit/              # Fast, no database (*.unit.test.ts)
  integration/       # Postgres required (*.integration.test.ts)
    prizes/          # evaluateRoundPrizesAfterBall scenarios
    wallet/          # carton purchase, balance rules
  helpers/
    db.ts            # Connection check + skip helper
    fixtures/        # Shared DB fixtures
```

## Commands (from `api/`)

| Command | What runs |
|---------|-----------|
| `npm test` | All tests |
| `npm run test:unit` | Unit only (~seconds, no DB) |
| `npm run test:integration` | Integration only |
| `npm run test:prizes` | Prize scenarios only |
| `npm run test:wallet` | Purchase / wallet scenarios |
| `npm run test:engine` | Bingo 75 engine unit |
| `npm run test:lib` | Lib unit (money, kickoff, pool, …) |
| `npm run test:list` | List suites and file counts |

From repo root: `npm run test:api`, `npm run test:api:unit`, etc.

## Database

Integration tests need `DATABASE_URL` in `api/.env`. If Postgres is down, those tests are **skipped** (unit tests still run).

## Scenario index

### Unit

| File | Topic |
|------|--------|
| `unit/game-engine/bingo-75/figures.unit.test.ts` | Win figures, highlights |
| `unit/game-engine/bingo-75/player-card.unit.test.ts` | Card generation, fingerprint |
| `unit/game-engine/bingo-75/prize-winner-order.unit.test.ts` | Tie-break order |
| `unit/lib/allocate-unique-fingerprint.unit.test.ts` | Fingerprint allocation |
| `unit/lib/bingo-round-kickoff.unit.test.ts` | Purchase window, terminal status |
| `unit/lib/bingo-rounds-sync.unit.test.ts` | Round schedule ms |
| `unit/lib/bingo-prize-pool.unit.test.ts` | Payout cents from pool |
| `unit/lib/bingo-card-grid.unit.test.ts` | 5×5 grid builder |
| `unit/lib/money.unit.test.ts` | `decimalPriceToCents` |
| `unit/services/wallet-ledger.unit.test.ts` | Balance delta rules |
| `unit/middleware/live-draw-auth.unit.test.ts` | Live draw auth rules |

### Integration — prizes

| File | Scenario |
|------|----------|
| `prizes/line-unique-full-per-winner.integration.test.ts` | LINE: monto completo por ganador al liquidar |
| `prizes/line-unique-deferred-split.integration.test.ts` | LINE: reparto 50/50 entre ganadores de la misma bolilla |
| `prizes/line-multi-winner.integration.test.ts` | non-unique → both cards win |
| `prizes/inactive-player-skipped.integration.test.ts` | inactive player excluded |
| `prizes/idempotent-same-draw.integration.test.ts` | repeat evaluate → no duplicate deferred |
| `prizes/deferred-split-settlement.integration.test.ts` | deferred rows cleared after payout |

### Integration — wallet

| File | Scenario |
|------|----------|
| `wallet/carton-purchase-success.integration.test.ts` | Buy 2 cartons, balance + unique fingerprints |
| `wallet/carton-purchase-errors.integration.test.ts` | Insufficient balance; round closed |

## Filter by name (Node test runner)

```bash
npx tsx --test --test-name-pattern="prizes" tests/integration/**/*.integration.test.ts
npx tsx --test --test-name-pattern="Insufficient" tests/integration/wallet/*.integration.test.ts
```

## Shared package

`packages/shared/tests/unit/` — run with `npm run test:shared` from repo root.
