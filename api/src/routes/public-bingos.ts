import { Router, type Request, type Response } from "express";
import { RoomStatus } from "@prisma/client";
import {
  ensureLiveSessionForRoom,
  registerLiveSession,
  getLiveSession,
} from "../bingo-game/live-session.js";
import { buildUpcomingPayload } from "../lib/bingo-upcoming.js";
import { prisma } from "../lib/prisma.js";

/**
 * Read-only routes for the public bingo display app (no JWT).
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

/** Detiene planificador y sorteo de una sala (desarrollo / operación). */
publicBingosRouter.post("/live/stop", async (req, res) => {
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
