import { Router, type Request, type Response } from "express";
import { RoomStatus } from "@prisma/client";
import {
  registerLiveSession,
  getLiveSession,
} from "../game-engine/bingo/live-session.js";
import { roomFromSlugQuery } from "../lib/bingo-live-room.js";
import { buildUpcomingPayload } from "../lib/bingo-upcoming.js";
import { httpError } from "../lib/route-helpers.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { prisma } from "../lib/prisma.js";

/**
 * Rutas públicas de solo lectura para bingo-display (SSE, upcoming, snapshot).
 * El marcado de bolas Live vive en `/backoffice/bingos/live/*` (sesión backoffice).
 */
export const publicBingosRouter = Router();

function requireRoomFromSlug(req: Request): Promise<{ id: string; slug: string; name: string }> {
  return roomFromSlugQuery(req).then((room) => {
    if (!room) {
      throw httpError(400, "Missing or invalid roomSlug query parameter");
    }
    return room;
  });
}

publicBingosRouter.get(
  "/rooms",
  asyncHandler(async (_req, res) => {
    const rooms = await prisma.room.findMany({
      where: { status: RoomStatus.ACTIVE },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });
    res.json({ rooms });
  }),
);

publicBingosRouter.get(
  "/upcoming",
  asyncHandler(async (req, res) => {
    const payload = await buildUpcomingPayload(req.query);
    res.json(payload);
  }),
);

/** Estado del juego en vivo para una sala (requiere ?roomSlug=). */
publicBingosRouter.get(
  "/live/state",
  asyncHandler(async (req, res) => {
    const room = await requireRoomFromSlug(req);
    registerLiveSession(room);
    const session = getLiveSession(room.id);
    res.json(session!.getSnapshot());
  }),
);

publicBingosRouter.get(
  "/current",
  asyncHandler(async (req, res) => {
    const room = await requireRoomFromSlug(req);
    registerLiveSession(room);
    const session = getLiveSession(room.id);
    res.json(session!.getSnapshot());
  }),
);

/** Server-Sent Events: `state`, `round_start`, `ball`, `round_end`, `idle` (por sala). */
publicBingosRouter.get(
  "/live/events",
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const room = await requireRoomFromSlug(req);
      registerLiveSession(room);
      const session = getLiveSession(room.id);
      session!.attachSse(req, res);
    } catch (err) {
      if (!res.headersSent) {
        throw err;
      }
    }
  }),
);

