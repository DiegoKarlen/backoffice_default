import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { RoomStatus } from "@prisma/client";
import { env } from "../config/env.js";
import {
  ensureLiveSessionForRoom,
  registerLiveSession,
  getLiveSession,
  registerDrawnBallForRoom,
} from "../game-engine/bingo/live-session.js";
import { buildUpcomingPayload } from "../lib/bingo-upcoming.js";
import { signDisplayOperatorToken } from "../lib/jwt.js";
import { requireLiveDrawAuth } from "../middleware/live-draw-auth.js";
import { prisma } from "../lib/prisma.js";

/**
 * Public routes for bingo display (SSE, upcoming) and live operator actions (auth on mutating routes).
 */
export const publicBingosRouter = Router();

async function roomFromSlugQuery(req: Request): Promise<{ id: string; slug: string; name: string } | null> {
  const slug = typeof req.query.roomSlug === "string" ? req.query.roomSlug.trim() : "";
  if (!slug) return null;
  const room = await prisma.room.findFirst({ where: { slug } });
  return room;
}

publicBingosRouter.get("/rooms", async (_req, res) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { status: RoomStatus.ACTIVE },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });
    res.json({ rooms });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list rooms" });
  }
});

publicBingosRouter.get("/upcoming", async (req, res) => {
  try {
    const payload = await buildUpcomingPayload(req.query);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load upcoming bingos" });
  }
});

/** Estado del juego en vivo para una sala (requiere ?roomSlug=). */
publicBingosRouter.get("/live/state", async (req, res) => {
  try {
    const room = await roomFromSlugQuery(req);
    if (!room) {
      res.status(400).json({ error: "Missing or invalid roomSlug query parameter" });
      return;
    }
    registerLiveSession(room);
    const session = getLiveSession(room.id);
    res.json(session!.getSnapshot());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load live state" });
  }
});

publicBingosRouter.get("/current", async (req, res) => {
  try {
    const room = await roomFromSlugQuery(req);
    if (!room) {
      res.status(400).json({ error: "Missing or invalid roomSlug query parameter" });
      return;
    }
    registerLiveSession(room);
    const session = getLiveSession(room.id);
    res.json(session!.getSnapshot());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load current state" });
  }
});

/** Server-Sent Events: `state`, `round_start`, `ball`, `round_end`, `idle` (por sala). */
publicBingosRouter.get("/live/events", async (req: Request, res: Response) => {
  try {
    const room = await roomFromSlugQuery(req);
    if (!room) {
      res.status(400).json({ error: "Missing or invalid roomSlug query parameter" });
      return;
    }
    registerLiveSession(room);
    const session = getLiveSession(room.id);
    session!.attachSse(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to attach SSE" });
  }
});

const drawBallSchema = z.object({
  number: z.number().int().min(1).max(90),
});

const operatorTokenSchema = z.object({
  secret: z.string().min(1),
});

/**
 * Exchange shared display secret for a short-lived JWT (`kind: display`).
 * Requires `BINGO_DISPLAY_DRAW_SECRET` on the server.
 */
publicBingosRouter.post("/live/operator-token", async (req, res) => {
  try {
    const serverSecret = env.bingoDisplayDrawSecret;
    if (!serverSecret) {
      res.status(503).json({ error: "BINGO_DISPLAY_DRAW_SECRET is not configured on the server" });
      return;
    }
    const parsed = operatorTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (parsed.data.secret !== serverSecret) {
      res.status(401).json({ error: "Invalid secret" });
      return;
    }
    res.json({
      accessToken: signDisplayOperatorToken(),
      tokenType: "Bearer",
      expiresIn: env.jwtExpiresIn,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to issue operator token" });
  }
});

/** Bingo Live: operador marca la bola sorteada en el video. */
publicBingosRouter.post("/live/draw-ball", requireLiveDrawAuth, async (req, res) => {
  try {
    const room = await roomFromSlugQuery(req);
    if (!room) {
      res.status(400).json({ error: "Missing or invalid roomSlug query parameter" });
      return;
    }
    const parsed = drawBallSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    registerLiveSession(room);
    const result = await registerDrawnBallForRoom(room.id, parsed.data.number);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to register drawn ball" });
  }
});

/** Detiene planificador y sorteo de una sala (operación). */
publicBingosRouter.post("/live/stop", requireLiveDrawAuth, async (req, res) => {
  try {
    const room = await roomFromSlugQuery(req);
    if (!room) {
      res.status(400).json({ error: "Missing or invalid roomSlug query parameter" });
      return;
    }
    const session = await ensureLiveSessionForRoom(room.id);
    session.requestStop();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to stop session" });
  }
});
