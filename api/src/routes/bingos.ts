import { Router } from "express";
import { z } from "zod";
import { BingoFigure, BingoRoundStatus, BingoStatus, BingoType, Prisma, RoomStatus } from "@prisma/client";
import { rescheduleLiveSessionForRoom } from "../bingo-game/live-session.js";
import { syncScheduledRoundsForBingo } from "../lib/bingo-rounds-sync.js";
import { buildUpcomingPayload } from "../lib/bingo-upcoming.js";
import { prisma } from "../lib/prisma.js";
import { type AuthedRequest, requireAuth } from "../middleware/auth.js";

export const bingosRouter = Router();
bingosRouter.use(requireAuth);

function toDecimalString(v: unknown): string {
  if (v === null || v === undefined) return "0";
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v);
}

function serializeBingo(b: {
  id: string;
  roomId: string;
  name: string;
  status: BingoStatus;
  bingoType: BingoType;
  startDateTime: Date;
  endDateTime: Date | null;
  repeatEveryMinutes: number | null;
  cardPrice: Prisma.Decimal;
  minPlayersToStart: number;
  createdAt: Date;
  updatedAt: Date;
  room?: { id: string; name: string; status: RoomStatus };
  prizes?: { id: string; bingoId: string; figure: BingoFigure; amount: Prisma.Decimal }[];
}) {
  return {
    id: b.id,
    roomId: b.roomId,
    room: b.room ? { id: b.room.id, name: b.room.name, status: b.room.status } : undefined,
    name: b.name,
    status: b.status,
    bingoType: b.bingoType,
    startDateTime: b.startDateTime,
    endDateTime: b.endDateTime,
    repeatEveryMinutes: b.repeatEveryMinutes,
    cardPrice: b.cardPrice.toString(),
    minPlayersToStart: b.minPlayersToStart,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    prizes: b.prizes
      ? b.prizes.map((p) => ({
          id: p.id,
          bingoId: p.bingoId,
          figure: p.figure,
          amount: p.amount.toString(),
        }))
      : undefined,
  };
}

const prizeSchema = z.object({
  figure: z.nativeEnum(BingoFigure),
  amount: z.union([z.string(), z.number()]),
});

const baseBody = z.object({
  roomId: z.string().min(1),
  name: z.string().min(1).max(200),
  status: z.nativeEnum(BingoStatus).optional(),
  bingoType: z.nativeEnum(BingoType),
  startDateTime: z.string().datetime(),
  endDateTime: z.union([z.string().datetime(), z.null()]).optional(),
  repeatEveryMinutes: z.number().int().min(1).max(10_080).optional().nullable(),
  cardPrice: z.union([z.string(), z.number()]),
  minPlayersToStart: z.number().int().min(1).max(100_000).default(2),
  prizes: z.array(prizeSchema).min(1),
});

/** Alta: fin de ciclo y repetición obligatorios (formulario backoffice completo). */
const createSchema = baseBody.extend({
  endDateTime: z.string().datetime(),
  repeatEveryMinutes: z.number().int().min(1).max(10_080),
});
const updateSchema = baseBody.partial().extend({
  roomId: z.string().min(1).optional(),
  prizes: z.array(prizeSchema).min(1).optional(),
});

function validatePrizes(prizes: Array<{ figure: BingoFigure; amount: unknown }>): string | null {
  if (!prizes.length) return "At least one prize is required";
  const seen = new Set<string>();
  for (const p of prizes) {
    const key = String(p.figure);
    if (seen.has(key)) return `Duplicate prize figure: ${key}`;
    seen.add(key);
    const n = Number(toDecimalString(p.amount));
    if (!Number.isFinite(n) || n <= 0) return `Prize amount must be a positive number (${key})`;
  }
  return null;
}

function validateScheduleBounds(start: Date, end: Date | null | undefined): string | null {
  if (end != null && end.getTime() < start.getTime()) {
    return "endDateTime must be on or after startDateTime";
  }
  return null;
}

function validateBingo(body: {
  repeatEveryMinutes?: number | null;
  cardPrice?: unknown;
  minPlayersToStart?: number;
}): string | null {
  if (body.repeatEveryMinutes != null && body.repeatEveryMinutes < 1) {
    return "repeatEveryMinutes must be >= 1";
  }
  if (body.cardPrice !== undefined) {
    const n = Number(toDecimalString(body.cardPrice));
    if (!Number.isFinite(n) || n <= 0) return "cardPrice must be a positive number";
  }
  if (body.minPlayersToStart !== undefined && body.minPlayersToStart < 1) {
    return "minPlayersToStart must be >= 1";
  }
  return null;
}

bingosRouter.get("/upcoming", async (req: AuthedRequest, res) => {
  const payload = await buildUpcomingPayload(req.query);
  res.json(payload);
});

bingosRouter.get("/", async (req: AuthedRequest, res) => {
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

  const list = await prisma.bingo.findMany({
    where,
    orderBy: [{ startDateTime: "asc" }, { name: "asc" }],
    include: { prizes: { orderBy: { figure: "asc" } }, room: true },
  });

  res.json({ bingos: list.map((b) => serializeBingo(b)) });
});

/** Partidas del bingo (bolas ordenadas por extracción cuando hay datos persistidos). Query opcional: `from`, `to` (ISO datetime), `sequence`, `status`, `limit` (1–500), `sort` (`asc`|`desc`, por `startsAt`). */
bingosRouter.get("/:id/rounds", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const bingo = await prisma.bingo.findFirst({
    where: { id },
    select: { id: true, name: true },
  });
  if (!bingo) {
    res.status(404).json({ error: "Bingo not found" });
    return;
  }

  const q = req.query;
  const fromRaw = typeof q.from === "string" ? q.from.trim() : "";
  const toRaw = typeof q.to === "string" ? q.to.trim() : "";
  const seqRaw = typeof q.sequence === "string" ? q.sequence.trim() : "";
  const statusRaw = typeof q.status === "string" ? q.status.trim() : "";
  const limitRaw = typeof q.limit === "string" ? q.limit.trim() : "";
  const sortRaw = typeof q.sort === "string" ? q.sort.trim().toLowerCase() : "";

  const startsAtWhere: Prisma.DateTimeFilter = {};
  if (fromRaw) {
    const d = new Date(fromRaw);
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid from datetime (use ISO 8601)" });
      return;
    }
    startsAtWhere.gte = d;
  }
  if (toRaw) {
    const d = new Date(toRaw);
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid to datetime (use ISO 8601)" });
      return;
    }
    startsAtWhere.lte = d;
  }

  const where: Prisma.BingoRoundWhereInput = { bingoId: id };
  if (Object.keys(startsAtWhere).length > 0) {
    where.startsAt = startsAtWhere;
  }
  if (seqRaw !== "") {
    const n = Number(seqRaw);
    if (!Number.isInteger(n) || n < 1) {
      res.status(400).json({ error: "sequence must be a positive integer (round #)" });
      return;
    }
    where.sequence = n;
  }
  if (statusRaw !== "") {
    const allowedStatus = Object.values(BingoRoundStatus) as string[];
    if (!allowedStatus.includes(statusRaw)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    where.status = statusRaw as BingoRoundStatus;
  }

  let take: number | undefined;
  if (limitRaw !== "") {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      res.status(400).json({ error: "limit must be an integer between 1 and 500" });
      return;
    }
    take = n;
  }

  const sortDesc = sortRaw === "desc";
  if (sortRaw !== "" && sortRaw !== "asc" && sortRaw !== "desc") {
    res.status(400).json({ error: "sort must be asc or desc" });
    return;
  }
  const orderDir = sortDesc ? "desc" : "asc";

  const rounds = await prisma.bingoRound.findMany({
    where,
    orderBy: [{ startsAt: orderDir }, { sequence: orderDir }],
    ...(take != null ? { take } : {}),
    include: {
      balls: { orderBy: { drawOrder: "asc" }, select: { number: true } },
    },
  });

  res.json({
    bingoId: bingo.id,
    bingoName: bingo.name,
    rounds: rounds.map((r) => {
      const nums = r.balls.map((b) => b.number);
      const includeBalls =
        r.status === BingoRoundStatus.COMPLETED ||
        r.status === BingoRoundStatus.DRAWING ||
        nums.length > 0;
      return {
        id: r.id,
        sequence: r.sequence,
        startsAt: r.startsAt.toISOString(),
        status: r.status,
        balls: includeBalls ? nums : [],
      };
    }),
  });
});

bingosRouter.get("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const bingo = await prisma.bingo.findFirst({
    where: { id },
    include: { prizes: { orderBy: { figure: "asc" } }, room: true },
  });
  if (!bingo) {
    res.status(404).json({ error: "Bingo not found" });
    return;
  }
  res.json({ bingo: serializeBingo(bingo) });
});

bingosRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
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
  const pErr = validatePrizes(body.prizes);
  if (pErr) {
    res.status(400).json({ error: pErr });
    return;
  }

  const startDt = new Date(body.startDateTime);
  const endDt = new Date(body.endDateTime);
  const boundsErr = validateScheduleBounds(startDt, endDt);
  if (boundsErr) {
    res.status(400).json({ error: boundsErr });
    return;
  }

  const roomRow = await prisma.room.findFirst({ where: { id: body.roomId } });
  if (!roomRow) {
    res.status(400).json({ error: "Room not found" });
    return;
  }

  const userId = req.auth?.sub;

  const created = await prisma.bingo.create({
    data: {
      roomId: body.roomId,
      name: body.name.trim(),
      status: body.status ?? BingoStatus.INACTIVE,
      bingoType: body.bingoType,
      startDateTime: startDt,
      endDateTime: endDt,
      repeatEveryMinutes: body.repeatEveryMinutes ?? null,
      cardPrice: toDecimalString(body.cardPrice),
      minPlayersToStart: body.minPlayersToStart,
      createdByUserId: userId ?? null,
      updatedByUserId: userId ?? null,
      prizes: {
        create: body.prizes.map((p) => ({
          figure: p.figure,
          amount: toDecimalString(p.amount),
        })),
      },
    },
    include: { prizes: { orderBy: { figure: "asc" } }, room: true },
  });

  await syncScheduledRoundsForBingo(created.id);
  rescheduleLiveSessionForRoom(created.roomId);

  res.status(201).json({ bingo: serializeBingo(created) });
});

bingosRouter.put("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;

  const existing = await prisma.bingo.findFirst({ where: { id } });
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
  if (body.prizes !== undefined) {
    const pErr = validatePrizes(body.prizes);
    if (pErr) {
      res.status(400).json({ error: pErr });
      return;
    }
  }

  const mergedStart = body.startDateTime !== undefined ? new Date(body.startDateTime) : existing.startDateTime;
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

  const userId = req.auth?.sub;

  if (body.roomId !== undefined) {
    const roomRow = await prisma.room.findFirst({ where: { id: body.roomId } });
    if (!roomRow) {
      res.status(400).json({ error: "Room not found" });
      return;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.bingo.update({
      where: { id },
      data: {
        ...(body.roomId !== undefined ? { roomId: body.roomId } : {}),
        name: body.name !== undefined ? body.name.trim() : undefined,
        status: body.status,
        bingoType: body.bingoType,
        startDateTime: body.startDateTime !== undefined ? new Date(body.startDateTime) : undefined,
        endDateTime:
          body.endDateTime !== undefined ? (body.endDateTime === null ? null : new Date(body.endDateTime)) : undefined,
        repeatEveryMinutes:
          body.repeatEveryMinutes !== undefined ? body.repeatEveryMinutes ?? null : undefined,
        cardPrice: body.cardPrice !== undefined ? toDecimalString(body.cardPrice) : undefined,
        minPlayersToStart: body.minPlayersToStart,
        updatedByUserId: userId ?? null,
      },
    });

    if (body.prizes !== undefined) {
      await tx.bingoPrize.deleteMany({ where: { bingoId: id } });
      if (body.prizes.length > 0) {
        await tx.bingoPrize.createMany({
          data: body.prizes.map((p) => ({
            bingoId: id,
            figure: p.figure,
            amount: toDecimalString(p.amount),
          })),
        });
      }
    }

    return tx.bingo.findFirstOrThrow({
      where: { id: u.id },
      include: { prizes: { orderBy: { figure: "asc" } }, room: true },
    });
  });

  await syncScheduledRoundsForBingo(updated.id);
  rescheduleLiveSessionForRoom(existing.roomId);
  if (updated.roomId !== existing.roomId) rescheduleLiveSessionForRoom(updated.roomId);

  res.json({ bingo: serializeBingo(updated) });
});

bingosRouter.patch("/:id/activate", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const bingo = await prisma.bingo.findFirst({ where: { id } });
  if (!bingo) {
    res.status(404).json({ error: "Bingo not found" });
    return;
  }
  const userId = req.auth?.sub;
  const updated = await prisma.bingo.update({
    where: { id },
    data: { status: BingoStatus.ACTIVE, updatedByUserId: userId ?? null },
    include: { prizes: { orderBy: { figure: "asc" } }, room: true },
  });
  await syncScheduledRoundsForBingo(updated.id);
  rescheduleLiveSessionForRoom(updated.roomId);
  res.json({ bingo: serializeBingo(updated) });
});

bingosRouter.patch("/:id/deactivate", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const bingo = await prisma.bingo.findFirst({ where: { id } });
  if (!bingo) {
    res.status(404).json({ error: "Bingo not found" });
    return;
  }
  const userId = req.auth?.sub;
  const updated = await prisma.bingo.update({
    where: { id },
    data: { status: BingoStatus.INACTIVE, updatedByUserId: userId ?? null },
    include: { prizes: { orderBy: { figure: "asc" } }, room: true },
  });
  await syncScheduledRoundsForBingo(updated.id);
  rescheduleLiveSessionForRoom(updated.roomId);
  res.json({ bingo: serializeBingo(updated) });
});

bingosRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const bingo = await prisma.bingo.findFirst({ where: { id } });
  if (!bingo) {
    res.status(404).json({ error: "Bingo not found" });
    return;
  }
  const roomId = bingo.roomId;
  await prisma.bingo.delete({ where: { id } });
  rescheduleLiveSessionForRoom(roomId);
  res.status(204).send();
});

