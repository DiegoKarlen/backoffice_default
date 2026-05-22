# Admin API

## Tests

From this directory (`api/`):

```bash
npm test              # all tests
npm run test:unit     # fast, no database
npm run test:integration
npm run test:prizes   # prize scenarios only
npm run test:wallet   # carton purchase scenarios
npm run test:list     # suite index
```

Full layout and scenario table: **`tests/README.md`**.

From repo root: `npm test` runs shared unit + API unit + API integration + frontend builds.

**Requires:** `DATABASE_URL` in `.env` for integration tests. If the database is unreachable, integration cases are **skipped**; unit tests still run.

### Environment

Copy `.env.example` to `api/.env`. Required: `DATABASE_URL`, `JWT_SECRET` (min 16 chars).

| Variable | Purpose |
|----------|---------|
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `BINGO_DISPLAY_DRAW_SECRET` | Shared key for Live draw-ball / stop |
| `LIVE_DRAW_AUTH_OPTIONAL` | Default `true` when `NODE_ENV` ≠ `production` |
| `AUTH_LOGIN_RATE_LIMIT_*` | Login brute-force limits |
| `UPCOMING_CACHE_TTL_MS` | Cache TTL for `/public/bingos/upcoming` (0 = off, default 10000) |
| `SSE_BALL_DELTA` | `1` / `true` emits extra `ball_delta` SSE events (clients may ignore; default off) |

Display app: set `VITE_BINGO_DISPLAY_DRAW_SECRET` to the same value as `BINGO_DISPLAY_DRAW_SECRET`.

### Before refactors (regression)

See `docs/status/product-progress.md` § **Checklist de regresión (código)** and `docs/roadmap/code-quality-improvement-plan.md`.
