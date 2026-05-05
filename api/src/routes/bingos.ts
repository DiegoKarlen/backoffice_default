import { Router } from "express";
import { z } from "zod";
import { BingoFigure, BingoStatus, BingoType, Prisma } from "@prisma/client";
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
  roomName: string;
  status: BingoStatus;
  bingoType: BingoType;
  startDateTime: Date;
  repeatEveryMinutes: number | null;
  cardPrice: Prisma.Decimal;
  minPlayersToStart: number;
  createdAt: Date;
  updatedAt: Date;
  prizes?: { id: string; bingoId: string; figure: BingoFigure; amount: Prisma.Decimal }[];
}) {
  return {
    id: b.id,
    roomName: b.roomName,
    status: b.status,
    bingoType: b.bingoType,
    startDateTime: b.startDateTime,
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
  roomName: z.string().min(1).max(200),
  status: z.nativeEnum(BingoStatus).optional(),
  bingoType: z.nativeEnum(BingoType),
  startDateTime: z.string().datetime(),
  repeatEveryMinutes: z.number().int().min(1).max(10_080).optional().nullable(),
  cardPrice: z.union([z.string(), z.number()]),
  minPlayersToStart: z.number().int().min(1).max(100_000).default(2),
  prizes: z.array(prizeSchema).min(1),
});

const createSchema = baseBody;
const updateSchema = baseBody.partial().extend({
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

function nextOccurrenceAfter(params: {
  startDateTime: Date;
  repeatEveryMinutes: number | null;
  now: Date;
}): Date | null {
  const { startDateTime, repeatEveryMinutes, now } = params;
  const startMs = startDateTime.getTime();
  const nowMs = now.getTime();

  if (!repeatEveryMinutes || repeatEveryMinutes < 1) {
    return startMs > nowMs ? startDateTime : null;
  }

  const intervalMs = repeatEveryMinutes * 60_000;
  if (startMs > nowMs) return startDateTime;

  const elapsed = nowMs - startMs;
  const mod = ((elapsed % intervalMs) + intervalMs) % intervalMs;
  const add = mod === 0 ? 0 : intervalMs - mod;
  const nextMs = nowMs + add;
  return new Date(nextMs);
}

function upcomingRunsForBingo(params: {
  bingoId: string;
  roomName: string;
  bingoType: BingoType;
  cardPrice: Prisma.Decimal;
  startDateTime: Date;
  repeatEveryMinutes: number | null;
  now: Date;
  horizonMs: number;
  maxRuns: number;
}): Array<{ bingoId: string; roomName: string; bingoType: BingoType; cardPrice: string; startsAt: Date }> {
  const {
    bingoId,
    roomName,
    bingoType,
    cardPrice,
    startDateTime,
    repeatEveryMinutes,
    now,
    horizonMs,
    maxRuns,
  } = params;

  const out: Array<{
    bingoId: string;
    roomName: string;
    bingoType: BingoType;
    cardPrice: string;
    startsAt: Date;
  }> = [];

  const nowMs = now.getTime();
  const limitMs = nowMs + horizonMs;

  const first = nextOccurrenceAfter({ startDateTime, repeatEveryMinutes, now });
  if (!first) return out;

  let cur = first.getTime();
  let guard = 0;
  while (cur <= limitMs && out.length < maxRuns && guard < 50_000) {
    guard += 1;
    out.push({
      bingoId,
      roomName,
      bingoType,
      cardPrice: cardPrice.toString(),
      startsAt: new Date(cur),
    });

    if (!repeatEveryMinutes || repeatEveryMinutes < 1) break;
    cur += repeatEveryMinutes * 60_000;
  }

  return out;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

bingosRouter.get("/upcoming", async (req: AuthedRequest, res) => {
  const now = new Date();
  const q = req.query;

  const horizonDaysRaw =
    typeof q.horizonDays === "string" ? Number(q.horizonDays) : typeof q.h === "string" ? Number(q.h) : 14;
  const horizonDays = clampInt(horizonDaysRaw, 1, 60);
  const horizonMs = horizonDays * 24 * 60 * 60_000;

  const limitRaw = typeof q.limit === "string" ? Number(q.limit) : typeof q.n === "string" ? Number(q.n) : 24;
  const maxTotal = clampInt(limitRaw, 1, 100);

  const perBingoMax = clampInt(Math.ceil(maxTotal / 4) + 8, 4, 48);

  const rows = await prisma.bingo.findMany({
    where: { status: BingoStatus.ACTIVE },
    orderBy: [{ startDateTime: "asc" }, { roomName: "asc" }],
  });

  const occurrences: Array<{
    bingoId: string;
    roomName: string;
    bingoType: BingoType;
    cardPrice: string;
    startsAt: string;
    startsAtMs: number;
  }> = [];

  for (const b of rows) {
    const runs = upcomingRunsForBingo({
      bingoId: b.id,
      roomName: b.roomName,
      bingoType: b.bingoType,
      cardPrice: b.cardPrice,
      startDateTime: b.startDateTime,
      repeatEveryMinutes: b.repeatEveryMinutes,
      now,
      horizonMs,
      maxRuns: perBingoMax,
    });
    for (const r of runs) {
      occurrences.push({
        bingoId: r.bingoId,
        roomName: r.roomName,
        bingoType: r.bingoType,
        cardPrice: r.cardPrice,
        startsAt: r.startsAt.toISOString(),
        startsAtMs: r.startsAt.getTime(),
      });
    }
  }

  occurrences.sort((a, b) => a.startsAtMs - b.startsAtMs);
  const trimmed = occurrences.slice(0, maxTotal);

  const next = trimmed.length ? trimmed[0] : null;

  res.json({
    serverTime: now.toISOString(),
    next,
    upcoming: trimmed,
  });
});

bingosRouter.get("/", async (req: AuthedRequest, res) => {
  const q = req.query;
  const roomName = typeof q.roomName === "string" ? q.roomName.trim() : "";
  const status = typeof q.status === "string" ? q.status : "";
  const bingoType = typeof q.bingoType === "string" ? q.bingoType : "";

  const where: Prisma.BingoWhereInput = {};
  if (roomName) where.roomName = { contains: roomName, mode: "insensitive" };
  if (status && Object.values(BingoStatus).includes(status as BingoStatus)) {
    where.status = status as BingoStatus;
  }
  if (bingoType && Object.values(BingoType).includes(bingoType as BingoType)) {
    where.bingoType = bingoType as BingoType;
  }

  const list = await prisma.bingo.findMany({
    where,
    orderBy: [{ startDateTime: "asc" }, { roomName: "asc" }],
    include: { prizes: { orderBy: { figure: "asc" } } },
  });

  res.json({ bingos: list.map((b) => serializeBingo(b)) });
});

bingosRouter.get("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const bingo = await prisma.bingo.findFirst({
    where: { id },
    include: { prizes: { orderBy: { figure: "asc" } } },
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

  const userId = req.auth?.sub;

  const created = await prisma.bingo.create({
    data: {
      roomName: body.roomName.trim(),
      status: body.status ?? BingoStatus.INACTIVE,
      bingoType: body.bingoType,
      startDateTime: new Date(body.startDateTime),
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
    include: { prizes: { orderBy: { figure: "asc" } } },
  });

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

  const userId = req.auth?.sub;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.bingo.update({
      where: { id },
      data: {
        roomName: body.roomName !== undefined ? body.roomName.trim() : undefined,
        status: body.status,
        bingoType: body.bingoType,
        startDateTime: body.startDateTime !== undefined ? new Date(body.startDateTime) : undefined,
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
      include: { prizes: { orderBy: { figure: "asc" } } },
    });
  });

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
    include: { prizes: { orderBy: { figure: "asc" } } },
  });
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
    include: { prizes: { orderBy: { figure: "asc" } } },
  });
  res.json({ bingo: serializeBingo(updated) });
});

bingosRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const bingo = await prisma.bingo.findFirst({ where: { id } });
  if (!bingo) {
    res.status(404).json({ error: "Bingo not found" });
    return;
  }
  await prisma.bingo.delete({ where: { id } });
  res.status(204).send();
});

