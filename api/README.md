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
| `AUTH_LOGIN_RATE_LIMIT_*` | Login brute-force limits |
| `UPCOMING_CACHE_TTL_MS` | Cache TTL for `/public/bingos/upcoming` (0 = off, default 10000) |
| `SSE_BALL_DELTA` | `1` / `true` emits extra `ball_delta` SSE events (clients may ignore; default off) |
| `OPENAPI_ENABLED` | `1` / `true` serves Swagger UI at `/api/swagger` (default on when `NODE_ENV` ≠ `production`) |
| `OPENAPI_SERVER_URL` | Base URL in OpenAPI spec (default `http://localhost:PORT`) |

### API documentation (Swagger)

With the API running in dev:

- **Swagger UI:** http://localhost:4001/api/swagger
- **OpenAPI JSON:** http://localhost:4001/api/swagger/openapi.json

Use **Authorize** with a JWT from `POST /auth/login` (backoffice) or `POST /player/login` (player).

Live ball marking uses authenticated `POST /backoffice/bingos/live/draw-ball` from the backoffice home page.

### Before refactors (regression)

See `docs/status/product-progress.md` § **Checklist de regresión (código)** and `docs/roadmap/code-quality-improvement-plan.md`.
