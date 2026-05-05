import { Router } from "express";
import { bingoLiveSession } from "../bingo-game/live-session.js";
import { buildUpcomingPayload } from "../lib/bingo-upcoming.js";

/**
 * Read-only routes for the public bingo display app (no JWT).
 */
export const publicBingosRouter = Router();

publicBingosRouter.get("/upcoming", async (req, res) => {
  try {
    const payload = await buildUpcomingPayload(req.query);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load upcoming bingos" });
  }
});

/** Estado del juego en vivo (sorteo automático server-side). */
publicBingosRouter.get("/current", (_req, res) => {
  res.json(bingoLiveSession.getSnapshot());
});

publicBingosRouter.get("/live/state", (_req, res) => {
  res.json(bingoLiveSession.getSnapshot());
});

/** Server-Sent Events: `state`, `round_start`, `ball`, `round_end`, `idle`. */
publicBingosRouter.get("/live/events", (req, res) => {
  bingoLiveSession.attachSse(req, res);
});

/** Detiene planificador y sorteo (desarrollo / operación). */
publicBingosRouter.post("/live/stop", (_req, res) => {
  bingoLiveSession.requestStop();
  res.json({ ok: true });
});
