import { Router } from "express";
import { z } from "zod";
import {
  ensureLiveSessionForRoom,
  getLiveSession,
  registerDrawnBallForRoom,
  registerLiveSession,
} from "../game-engine/bingo/live-session.js";
import { requireRoomFromSlugQuery, roomFromSlugQuery } from "../lib/bingo-live-room.js";
import { httpError, zodFlattenError } from "../lib/route-helpers.js";
import { asyncHandler } from "../middleware/async-handler.js";
import type { AuthedRequest } from "../middleware/auth.js";

const drawBallSchema = z.object({
  number: z.number().int().min(1).max(90),
});

/**
 * Operación de sorteo Live solo desde backoffice autenticado.
 * Registrar en `bingosRouter` antes de rutas `/:id`.
 */
export function attachBingoLiveBackofficeRoutes(router: Router): void {
  router.get(
    "/live/state",
    asyncHandler(async (req: AuthedRequest, res) => {
      const room = await requireRoomFromSlugQuery(req);
      registerLiveSession(room);
      const session = getLiveSession(room.id);
      res.json(session!.getSnapshot());
    }),
  );

  router.post(
    "/live/draw-ball",
    asyncHandler(async (req: AuthedRequest, res) => {
      const room = await requireRoomFromSlugQuery(req);
      const parsed = drawBallSchema.safeParse(req.body);
      if (!parsed.success) {
        throw zodFlattenError(parsed.error);
      }
      registerLiveSession(room);
      const result = await registerDrawnBallForRoom(room.id, parsed.data.number);
      if (!result.ok) {
        throw httpError(result.status, result.error);
      }
      res.json({ ok: true });
    }),
  );

  router.post(
    "/live/stop",
    asyncHandler(async (req: AuthedRequest, res) => {
      const room = await requireRoomFromSlugQuery(req);
      const session = await ensureLiveSessionForRoom(room.id);
      session.requestStop();
      res.json({ ok: true });
    }),
  );
}

/** Para tests / reutilización en rutas públicas de solo lectura. */
export { roomFromSlugQuery };
