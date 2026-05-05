# Bingo display (frontend público)

Aplicación **separada del backoffice**: muestra la lista de próximos bingos y un panel reservado para el bingo en vivo (la lógica del juego se implementará después).

## Requisitos

- API corriendo (por defecto `http://localhost:4001`) con rutas públicas:
  - `GET /public/bingos/upcoming`
  - `GET /public/bingos/current` (placeholder)

## Desarrollo

```bash
cd bingo-display
npm install
npm run dev
```

Abre `http://localhost:5174`. Sin variable de entorno, las llamadas usan el proxy `/api` → `http://localhost:4001`.

## Producción

```bash
npm run build
```

Salida en `dist/`. Serví los archivos estáticos detrás del mismo dominio que la API o configurá `VITE_API_URL` en build para el origen correcto.

## Variables

Ver `.env.example`.

En la **API** (`api/.env`): `BINGO_DRAW_INTERVAL_MS` (ritmo entre bolas), `BINGO_SCHEDULER_POLL_MS` (si no hay fechas en horizonte, cada cuánto se vuelve a leer la agenda).

## En vivo

Los sorteos **arrancan solos** según bingos `ACTIVE` en base (`startDateTime`, `repeatEveryMinutes`), misma lógica que `/public/bingos/upcoming`.

- `GET /public/bingos/live/state` — snapshot JSON (`nextScheduledAt`, etc.).
- `GET /public/bingos/live/events` — SSE (`state`, `round_start`, `ball`, `round_end`, `idle`).
- `POST /public/bingos/live/stop` — detiene planificador y sorteo (desarrollo / operación).

La UI usa **EventSource** contra el mismo origen (`/api/...` con proxy en dev).
