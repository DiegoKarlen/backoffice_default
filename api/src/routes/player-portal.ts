import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { listWalletTransactionsForPlayer, parseOptionalType } from "../lib/wallet-transactions-for-player.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signPlayerAccessToken } from "../lib/jwt.js";
import { requirePlayer, type AuthedRequest } from "../middleware/auth.js";
import { purchaseCartonsForRound } from "../services/carton-purchase.js";

export const playerPortalRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

playerPortalRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const username = parsed.data.username.trim();

  const dup = await prisma.player.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { id: true },
  });
  if (dup) {
    res.status(409).json({ error: "Email or username already registered" });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const player = await prisma.$transaction(async (tx) => {
    const p = await tx.player.create({
      data: { email, username, passwordHash },
    });
    await tx.wallet.create({
      data: { playerId: p.id, balanceCents: 0, currencyCode: "ARS" },
    });
    return p;
  });

  const token = signPlayerAccessToken({ sub: player.id, email: player.email });

  res.status(201).json({
    accessToken: token,
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
    player: {
      id: player.id,
      email: player.email,
      username: player.username,
    },
  });
});

playerPortalRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();

  const player = await prisma.player.findFirst({ where: { email, active: true } });
  if (!player || !(await verifyPassword(parsed.data.password, player.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signPlayerAccessToken({ sub: player.id, email: player.email });

  res.json({
    accessToken: token,
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
    player: {
      id: player.id,
      email: player.email,
      username: player.username,
    },
  });
});

playerPortalRouter.get("/me", requirePlayer, async (req: AuthedRequest, res) => {
  const sub = req.auth?.sub;
  if (!sub) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const player = await prisma.player.findFirst({
    where: { id: sub, active: true },
    select: {
      id: true,
      email: true,
      username: true,
      createdAt: true,
      wallet: { select: { balanceCents: true, currencyCode: true } },
    },
  });
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json({
    player: {
      ...player,
      createdAt: player.createdAt.toISOString(),
    },
  });
});

playerPortalRouter.get("/wallet", requirePlayer, async (req: AuthedRequest, res) => {
  const sub = req.auth?.sub;
  if (!sub) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const w = await prisma.wallet.findUnique({
    where: { playerId: sub },
    select: { balanceCents: true, currencyCode: true, updatedAt: true },
  });
  if (!w) {
    res.json({ wallet: null });
    return;
  }
  res.json({
    wallet: {
      balanceCents: w.balanceCents,
      currencyCode: w.currencyCode,
      updatedAt: w.updatedAt.toISOString(),
    },
  });
});

playerPortalRouter.get("/wallet/transactions", requirePlayer, async (req: AuthedRequest, res) => {
  const sub = req.auth?.sub;
  if (!sub) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

  const fromRaw = typeof req.query.from === "string" ? req.query.from.trim() : "";
  const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";
  let createdAtFrom: Date | undefined;
  let createdAtTo: Date | undefined;
  if (fromRaw) {
    const d = new Date(fromRaw);
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid from datetime (use ISO 8601)" });
      return;
    }
    createdAtFrom = d;
  }
  if (toRaw) {
    const d = new Date(toRaw);
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid to datetime (use ISO 8601)" });
      return;
    }
    createdAtTo = d;
  }
  if (createdAtFrom && createdAtTo && createdAtFrom.getTime() > createdAtTo.getTime()) {
    res.status(400).json({ error: "from must be on or before to" });
    return;
  }

  const roomSlug = typeof req.query.roomSlug === "string" ? req.query.roomSlug.trim() : "";
  const bingoIdRaw = typeof req.query.bingoId === "string" ? req.query.bingoId.trim() : "";
  const bingoRoundIdRaw = typeof req.query.bingoRoundId === "string" ? req.query.bingoRoundId.trim() : "";
  const seqRaw = typeof req.query.roundSequence === "string" ? req.query.roundSequence.trim() : "";
  const typeRaw = typeof req.query.type === "string" ? req.query.type.trim() : "";

  const bingoId = z.string().uuid().safeParse(bingoIdRaw).success ? bingoIdRaw : undefined;
  const bingoRoundId = z.string().uuid().safeParse(bingoRoundIdRaw).success ? bingoRoundIdRaw : undefined;
  const roundSequenceParsed = seqRaw === "" ? undefined : Number(seqRaw);
  const roundSequence =
    roundSequenceParsed != null && Number.isInteger(roundSequenceParsed) && roundSequenceParsed > 0
      ? roundSequenceParsed
      : undefined;

  if (roundSequence != null && !bingoRoundId && !bingoId) {
    res.status(400).json({ error: "bingoId or bingoRoundId is required when filtering by roundSequence" });
    return;
  }

  const typeFilter = parseOptionalType(typeRaw);

  const payload = await listWalletTransactionsForPlayer({
    playerId: sub,
    limit,
    order: "desc",
    createdAtFrom,
    createdAtTo,
    type: typeFilter,
    roomSlug: roomSlug || undefined,
    bingoId,
    bingoRoundId,
    roundSequence: bingoRoundId ? undefined : roundSequence,
  });
  res.json(payload);
});

/** Cartones del jugador con celdas para armar grilla (bingo 75: 5×5). Query opcional: `bingoRoundId`, `roomSlug`, `bingoId`, `from` / `to` (ISO, filtran `startsAt` de la partida), `limit` (1–200). */
playerPortalRouter.get("/my-cards", requirePlayer, async (req: AuthedRequest, res) => {
  const sub = req.auth?.sub;
  if (!sub) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const roundIdRaw = typeof req.query.bingoRoundId === "string" ? req.query.bingoRoundId.trim() : "";
  const roomSlug = typeof req.query.roomSlug === "string" ? req.query.roomSlug.trim() : "";
  const bingoIdRaw = typeof req.query.bingoId === "string" ? req.query.bingoId.trim() : "";
  const fromRaw = typeof req.query.from === "string" ? req.query.from.trim() : "";
  const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";
  const limitRaw = typeof req.query.limit === "string" ? req.query.limit.trim() : "";

  const take = Math.min(200, Math.max(1, limitRaw ? Number(limitRaw) || 80 : 80));

  const roundUuid = roundIdRaw && z.string().uuid().safeParse(roundIdRaw).success ? roundIdRaw : undefined;
  const bingoId = bingoIdRaw && z.string().uuid().safeParse(bingoIdRaw).success ? bingoIdRaw : undefined;

  let startsAt: Prisma.DateTimeFilter | undefined;
  if (fromRaw || toRaw) {
    startsAt = {};
    if (fromRaw) {
      const d = new Date(fromRaw);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "Invalid from datetime (use ISO 8601)" });
        return;
      }
      startsAt.gte = d;
    }
    if (toRaw) {
      const d = new Date(toRaw);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "Invalid to datetime (use ISO 8601)" });
        return;
      }
      startsAt.lte = d;
    }
  }

  const bingoRoundWhere: Prisma.BingoRoundWhereInput = {};
  if (bingoId) bingoRoundWhere.bingoId = bingoId;
  if (roomSlug) bingoRoundWhere.bingo = { room: { slug: roomSlug } };
  if (startsAt && Object.keys(startsAt).length > 0) bingoRoundWhere.startsAt = startsAt;

  const where: Prisma.PlayerRoundCardWhereInput = { playerId: sub };

  if (roundUuid) {
    where.bingoRoundId = roundUuid;
  } else if (Object.keys(bingoRoundWhere).length > 0) {
    where.bingoRound = bingoRoundWhere;
  }

  const cards = await prisma.playerRoundCard.findMany({
    where,
    orderBy: [{ bingoRound: { startsAt: "desc" } }, { cardIndex: "asc" }],
    take,
    include: {
      bingoRound: {
        select: {
          id: true,
          sequence: true,
          startsAt: true,
          bingo: {
            select: {
              id: true,
              name: true,
              bingoType: true,
              room: { select: { slug: true, name: true } },
            },
          },
        },
      },
      cells: { orderBy: [{ row: "asc" }, { col: "asc" }] },
    },
  });

  const payload = cards.map((c) => {
    const rows = 5;
    const cols = 5;
    const grid: Array<Array<{ number: number | null; isFree: boolean }>> = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ number: null, isFree: false })),
    );
    for (const cell of c.cells) {
      if (cell.row >= 0 && cell.row < rows && cell.col >= 0 && cell.col < cols) {
        grid[cell.row]![cell.col] = {
          number: cell.number,
          isFree: cell.isFree,
        };
      }
    }
    return {
      id: c.id,
      cardIndex: c.cardIndex,
      bingoRoundId: c.bingoRoundId,
      round: {
        id: c.bingoRound.id,
        bingoId: c.bingoRound.bingo.id,
        sequence: c.bingoRound.sequence,
        startsAt: c.bingoRound.startsAt.toISOString(),
        bingoName: c.bingoRound.bingo.name,
        bingoType: c.bingoRound.bingo.bingoType,
        roomSlug: c.bingoRound.bingo.room.slug,
        roomName: c.bingoRound.bingo.room.name,
      },
      grid,
    };
  });

  res.json({ cards: payload });
});

const purchaseBodySchema = z.object({
  quantity: z.number().int().min(1).max(99),
});

playerPortalRouter.post(
  "/bingo-rounds/:bingoRoundId/carton-purchase",
  requirePlayer,
  async (req: AuthedRequest, res) => {
    const sub = req.auth?.sub;
    if (!sub) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const roundId = req.params.bingoRoundId;
    if (!z.string().uuid().safeParse(roundId).success) {
      res.status(400).json({ error: "Invalid round id" });
      return;
    }
    const parsed = purchaseBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const result = await purchaseCartonsForRound({
        playerId: sub,
        bingoRoundId: roundId,
        quantity: parsed.data.quantity,
      });
      res.status(201).json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Purchase failed";
      if (msg === "Insufficient balance") {
        res.status(402).json({ error: msg });
        return;
      }
      if (
        msg === "Player not found" ||
        msg === "Player is inactive" ||
        msg === "Round not found"
      ) {
        res.status(404).json({ error: msg });
        return;
      }
      if (
        msg.includes("not active") ||
        msg.includes("not open") ||
        msg.includes("Only BINGO_75") ||
        msg.includes("quantity")
      ) {
        res.status(400).json({ error: msg });
        return;
      }
      // eslint-disable-next-line no-console
      console.error(e);
      res.status(500).json({ error: msg });
    }
  },
);
