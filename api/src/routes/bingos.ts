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
import {
  mergeJackpotPrize,
  stripJackpotPrizeFromList,
  validateJackpotConfig,
} from "../lib/bingo/bingo-jackpot.js";
import { createBingoSchema, updateBingoSchema } from "../lib/bingo/bingo-schemas.js";
import { toDecimalString } from "../lib/bingo/bingo-serializer.js";
import { buildUpcomingPayload } from "../lib/bingo-upcoming.js";
import { httpError, rethrowBingoMutationError, zodFlattenError } from "../lib/route-helpers.js";
import { prisma } from "../lib/prisma.js";
import { type AuthedRequest, requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { attachBingoLiveBackofficeRoutes } from "./bingo-live-backoffice.js";
import { attachBingoRoundRoutes } from "./bingo-rounds.js";

export const bingosRouter = Router();
bingosRouter.use(requireAuth);

bingosRouter.get(
  "/upcoming",
  asyncHandler(async (req: AuthedRequest, res) => {
    const payload = await buildUpcomingPayload(req.query);
    res.json(payload);
  }),
);

bingosRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
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
  }),
);

attachBingoLiveBackofficeRoutes(bingosRouter);
attachBingoRoundRoutes(bingosRouter);

bingosRouter.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const bingo = await getBingoById(req.params.id);
    if (!bingo) {
      throw httpError(404, "Bingo not found");
    }
    res.json({ bingo });
  }),
);

bingosRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = createBingoSchema.safeParse(req.body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }
    const body = parsed.data;

    const vErr = validateBingo(body);
    if (vErr) {
      throw httpError(400, vErr);
    }
    const prizeMode = body.prizeMode ?? BingoPrizeMode.FIXED;
    const jErr = validateJackpotConfig({
      jackpotEnabled: body.jackpotEnabled,
      jackpotMaxBall: body.jackpotMaxBall,
      jackpotAmount: body.jackpotAmount,
      bingoType: body.bingoType,
    });
    if (jErr) throw httpError(400, jErr);
    const prizesForValidation = mergeJackpotPrize(body.prizes, {
      enabled: body.jackpotEnabled === true,
      amount: body.jackpotAmount,
    });
    const pErr = validatePrizes(prizesForValidation, prizeMode, body.prizePoolSeed);
    if (pErr) {
      throw httpError(400, pErr);
    }

    const boundsErr = validateScheduleBounds(
      new Date(body.startDateTime),
      new Date(body.endDateTime),
    );
    if (boundsErr) {
      throw httpError(400, boundsErr);
    }

    const roomRow = await prisma.room.findFirst({ where: { id: body.roomId } });
    if (!roomRow) {
      throw httpError(400, "Room not found");
    }

    try {
      const bingo = await createBingo(body, req.auth?.sub);
      res.status(201).json({ bingo });
    } catch (e) {
      rethrowBingoMutationError(e);
    }
  }),
);

bingosRouter.put(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = updateBingoSchema.safeParse(req.body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }
    const body = parsed.data;

    const existing = await prisma.bingo.findFirst({ where: { id: req.params.id } });
    if (!existing) {
      throw httpError(404, "Bingo not found");
    }

    const vErr = validateBingo({
      repeatEveryMinutes:
        body.repeatEveryMinutes !== undefined ? body.repeatEveryMinutes : existing.repeatEveryMinutes,
      cardPrice: body.cardPrice !== undefined ? body.cardPrice : existing.cardPrice,
      minPlayersToStart:
        body.minPlayersToStart !== undefined ? body.minPlayersToStart : existing.minPlayersToStart,
    });
    if (vErr) {
      throw httpError(400, vErr);
    }
    const mergedPrizeMode = body.prizeMode ?? existing.prizeMode;
    const mergedJackpotEnabled =
      body.jackpotEnabled !== undefined ? body.jackpotEnabled : existing.jackpotEnabled;
    const mergedJackpotMaxBall =
      body.jackpotMaxBall !== undefined ? body.jackpotMaxBall : existing.jackpotMaxBall;
    const mergedJackpotAmount =
      body.jackpotAmount !== undefined ? body.jackpotAmount : existing.jackpotAmount?.toString();
    const mergedBingoType = body.bingoType ?? existing.bingoType;

    const jErr = validateJackpotConfig({
      jackpotEnabled: mergedJackpotEnabled,
      jackpotMaxBall: mergedJackpotMaxBall,
      jackpotAmount: mergedJackpotAmount,
      bingoType: mergedBingoType,
    });
    if (jErr) throw httpError(400, jErr);

    if (body.prizes !== undefined || body.jackpotEnabled !== undefined) {
      const mergedSeed =
        body.prizePoolSeed !== undefined ? body.prizePoolSeed : existing.prizePoolSeed.toString();
      const manualPrizes =
        body.prizes !== undefined ? stripJackpotPrizeFromList(body.prizes) : [];
      const prizesForValidation =
        body.prizes !== undefined
          ? mergeJackpotPrize(manualPrizes, {
              enabled: mergedJackpotEnabled,
              amount: mergedJackpotAmount,
            })
          : [];
      if (body.prizes !== undefined) {
        const pErr = validatePrizes(prizesForValidation, mergedPrizeMode, mergedSeed);
        if (pErr) {
          throw httpError(400, pErr);
        }
      }
    } else if (body.prizeMode === BingoPrizeMode.PERCENTAGE) {
      const mergedSeed =
        body.prizePoolSeed !== undefined ? body.prizePoolSeed : existing.prizePoolSeed.toString();
      const seed = Number(toDecimalString(mergedSeed));
      if (!Number.isFinite(seed) || seed < 0) {
        throw httpError(400, "prizePoolSeed must be a non-negative number when prize mode is PERCENTAGE");
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
      throw httpError(400, boundsErr);
    }

    if (body.roomId !== undefined) {
      const roomRow = await prisma.room.findFirst({ where: { id: body.roomId } });
      if (!roomRow) {
        throw httpError(400, "Room not found");
      }
    }

    try {
      const bingo = await updateBingo(req.params.id, body, req.auth?.sub);
      if (!bingo) {
        throw httpError(404, "Bingo not found");
      }
      res.json({ bingo });
    } catch (e) {
      rethrowBingoMutationError(e);
    }
  }),
);

bingosRouter.patch(
  "/:id/activate",
  asyncHandler(async (req: AuthedRequest, res) => {
    const bingo = await setBingoStatus(req.params.id, BingoStatus.ACTIVE, req.auth?.sub);
    if (!bingo) {
      throw httpError(404, "Bingo not found");
    }
    res.json({ bingo });
  }),
);

bingosRouter.patch(
  "/:id/deactivate",
  asyncHandler(async (req: AuthedRequest, res) => {
    const bingo = await setBingoStatus(req.params.id, BingoStatus.INACTIVE, req.auth?.sub);
    if (!bingo) {
      throw httpError(404, "Bingo not found");
    }
    res.json({ bingo });
  }),
);

bingosRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const roomId = await deleteBingo(req.params.id);
    if (!roomId) {
      throw httpError(404, "Bingo not found");
    }
    res.status(204).send();
  }),
);
