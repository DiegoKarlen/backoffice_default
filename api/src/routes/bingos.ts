import { Router } from "express";
import { BingoStatus, BingoType, Prisma } from "@prisma/client";
import {
  BingoPrizeMode,
  createBingo,
  deleteBingo,
  getBingoById,
  listBingos,
  setBingoStatus,
  updateBingo,
  validateBingo,
  validatePrizes,
  validateScheduleBounds,
} from "../lib/bingo/bingo-crud.service.js";
import { createBingoSchema, updateBingoSchema } from "../lib/bingo/bingo-schemas.js";
import { toDecimalString } from "../lib/bingo/bingo-serializer.js";
import { buildUpcomingPayload } from "../lib/bingo-upcoming.js";
import { prisma } from "../lib/prisma.js";
import { type AuthedRequest, requireAuth } from "../middleware/auth.js";
import { attachBingoRoundRoutes } from "./bingo-rounds.js";

export const bingosRouter = Router();
bingosRouter.use(requireAuth);

bingosRouter.get("/upcoming", async (req: AuthedRequest, res, next) => {
  try {
    const payload = await buildUpcomingPayload(req.query);
    res.json(payload);
  } catch (e) {
    next(e);
  }
});

bingosRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const q = req.query;
    const name = typeof q.name === "string" ? q.name.trim() : "";
    const status = typeof q.status === "string" ? q.status : "";
    const bingoType = typeof q.bingoType === "string" ? q.bingoType : "";
    const roomId = typeof q.roomId === "string" ? q.roomId.trim() : "";
    const roomName = typeof q.roomName === "string" ? q.roomName.trim() : "";

    const where: Prisma.BingoWhereInput = {};
    if (name) where.name = { contains: name, mode: "insensitive" };
    if (roomId) where.roomId = roomId;
    if (roomName) {
      where.room = { name: { contains: roomName, mode: "insensitive" } };
    }
    if (status && Object.values(BingoStatus).includes(status as BingoStatus)) {
      where.status = status as BingoStatus;
    }
    if (bingoType && Object.values(BingoType).includes(bingoType as BingoType)) {
      where.bingoType = bingoType as BingoType;
    }

    res.json({ bingos: await listBingos(where) });
  } catch (e) {
    next(e);
  }
});

attachBingoRoundRoutes(bingosRouter);

bingosRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const bingo = await getBingoById(req.params.id);
    if (!bingo) {
      res.status(404).json({ error: "Bingo not found" });
      return;
    }
    res.json({ bingo });
  } catch (e) {
    next(e);
  }
});

bingosRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = createBingoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;

    const vErr = validateBingo(body);
    if (vErr) {
      res.status(400).json({ error: vErr });
      return;
    }
    const prizeMode = body.prizeMode ?? BingoPrizeMode.FIXED;
    const pErr = validatePrizes(body.prizes, prizeMode, body.prizePoolSeed);
    if (pErr) {
      res.status(400).json({ error: pErr });
      return;
    }

    const boundsErr = validateScheduleBounds(
      new Date(body.startDateTime),
      new Date(body.endDateTime),
    );
    if (boundsErr) {
      res.status(400).json({ error: boundsErr });
      return;
    }

    const roomRow = await prisma.room.findFirst({ where: { id: body.roomId } });
    if (!roomRow) {
      res.status(400).json({ error: "Room not found" });
      return;
    }

    const bingo = await createBingo(body, req.auth?.sub);
    res.status(201).json({ bingo });
  } catch (e) {
    const statusCode = (e as { statusCode?: number }).statusCode;
    if (statusCode === 400) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Bad request" });
      return;
    }
    next(e);
  }
});

bingosRouter.put("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = updateBingoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;

    const existing = await prisma.bingo.findFirst({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Bingo not found" });
      return;
    }

    const vErr = validateBingo({
      repeatEveryMinutes:
        body.repeatEveryMinutes !== undefined ? body.repeatEveryMinutes : existing.repeatEveryMinutes,
      cardPrice: body.cardPrice !== undefined ? body.cardPrice : existing.cardPrice,
      minPlayersToStart:
        body.minPlayersToStart !== undefined ? body.minPlayersToStart : existing.minPlayersToStart,
    });
    if (vErr) {
      res.status(400).json({ error: vErr });
      return;
    }
    const mergedPrizeMode = body.prizeMode ?? existing.prizeMode;
    if (body.prizes !== undefined) {
      const mergedSeed =
        body.prizePoolSeed !== undefined ? body.prizePoolSeed : existing.prizePoolSeed.toString();
      const pErr = validatePrizes(body.prizes, mergedPrizeMode, mergedSeed);
      if (pErr) {
        res.status(400).json({ error: pErr });
        return;
      }
    } else if (body.prizeMode === BingoPrizeMode.PERCENTAGE) {
      const mergedSeed =
        body.prizePoolSeed !== undefined ? body.prizePoolSeed : existing.prizePoolSeed.toString();
      const seed = Number(toDecimalString(mergedSeed));
      if (!Number.isFinite(seed) || seed < 0) {
        res.status(400).json({
          error: "prizePoolSeed must be a non-negative number when prize mode is PERCENTAGE",
        });
        return;
      }
    }

    const mergedStart =
      body.startDateTime !== undefined ? new Date(body.startDateTime) : existing.startDateTime;
    const mergedEnd =
      body.endDateTime !== undefined
        ? body.endDateTime === null
          ? null
          : new Date(body.endDateTime)
        : existing.endDateTime;
    const boundsErr = validateScheduleBounds(mergedStart, mergedEnd);
    if (boundsErr) {
      res.status(400).json({ error: boundsErr });
      return;
    }

    if (body.roomId !== undefined) {
      const roomRow = await prisma.room.findFirst({ where: { id: body.roomId } });
      if (!roomRow) {
        res.status(400).json({ error: "Room not found" });
        return;
      }
    }

    try {
      const bingo = await updateBingo(req.params.id, body, req.auth?.sub);
      if (!bingo) {
        res.status(404).json({ error: "Bingo not found" });
        return;
      }
      res.json({ bingo });
    } catch (e) {
      if (e instanceof Error && (e.name === "PrizeRemoveBlocked" || e.name === "PrizeAmountLocked")) {
        res.status(409).json({ error: e.message });
        return;
      }
      const statusCode = (e as { statusCode?: number }).statusCode;
      if (statusCode === 400) {
        res.status(400).json({ error: e instanceof Error ? e.message : "Bad request" });
        return;
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
});

bingosRouter.patch("/:id/activate", async (req: AuthedRequest, res, next) => {
  try {
    const bingo = await setBingoStatus(req.params.id, BingoStatus.ACTIVE, req.auth?.sub);
    if (!bingo) {
      res.status(404).json({ error: "Bingo not found" });
      return;
    }
    res.json({ bingo });
  } catch (e) {
    next(e);
  }
});

bingosRouter.patch("/:id/deactivate", async (req: AuthedRequest, res, next) => {
  try {
    const bingo = await setBingoStatus(req.params.id, BingoStatus.INACTIVE, req.auth?.sub);
    if (!bingo) {
      res.status(404).json({ error: "Bingo not found" });
      return;
    }
    res.json({ bingo });
  } catch (e) {
    next(e);
  }
});

bingosRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const roomId = await deleteBingo(req.params.id);
    if (!roomId) {
      res.status(404).json({ error: "Bingo not found" });
      return;
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
