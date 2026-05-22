import { Router } from "express";
import { BingoRoundStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { getRoundPrizesForBo, getRoundPurchasedCardsForBo } from "../lib/bingo-round-bo-detail.js";
import { prisma } from "../lib/prisma.js";
import type { AuthedRequest } from "../middleware/auth.js";

const roundIdParam = z.string().uuid();

/**
 * Rutas de partidas bajo `/backoffice/bingos/:id/rounds*`.
 * Registrar en el router de bingos **antes** de `GET /:id`.
 */
export function attachBingoRoundRoutes(router: Router): void {
  router.get("/:id/rounds", async (req: AuthedRequest, res) => {
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
    const finishedOnlyRaw = typeof q.finishedOnly === "string" ? q.finishedOnly.trim().toLowerCase() : "";
    const finishedOnly = finishedOnlyRaw === "true" || finishedOnlyRaw === "1";
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
    } else if (finishedOnly) {
      where.status = { in: [BingoRoundStatus.COMPLETED, BingoRoundStatus.CANCELLED] };
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

    if (sortRaw !== "" && sortRaw !== "asc" && sortRaw !== "desc") {
      res.status(400).json({ error: "sort must be asc or desc" });
      return;
    }
    const orderDir = sortRaw === "asc" ? "asc" : "desc";

    const rounds = await prisma.bingoRound.findMany({
      where,
      orderBy: [{ startsAt: orderDir }, { sequence: orderDir }],
      ...(take != null ? { take } : {}),
      include: {
        balls: { orderBy: { drawOrder: "asc" }, select: { number: true } },
        _count: { select: { playerRoundCards: true } },
      },
    });

    const roundIds = rounds.map((r) => r.id);
    const prizeCountByRound = new Map<string, number>();
    if (roundIds.length > 0) {
      const payouts = await prisma.prizePayout.findMany({
        where: { playerRoundCard: { bingoRoundId: { in: roundIds } } },
        select: { playerRoundCard: { select: { bingoRoundId: true } } },
      });
      for (const p of payouts) {
        const rid = p.playerRoundCard.bingoRoundId;
        prizeCountByRound.set(rid, (prizeCountByRound.get(rid) ?? 0) + 1);
      }
    }

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
          cancellationReason: r.cancellationReason ?? null,
          balls: includeBalls ? nums : [],
          cardsSold: r._count.playerRoundCards,
          prizesPaid: prizeCountByRound.get(r.id) ?? 0,
        };
      }),
    });
  });

  router.get("/:id/rounds/:roundId/cards", async (req: AuthedRequest, res) => {
    const bingoId = req.params.id;
    const roundParsed = roundIdParam.safeParse(req.params.roundId);
    if (!roundParsed.success) {
      res.status(400).json({ error: "Invalid round id" });
      return;
    }
    const result = await getRoundPurchasedCardsForBo({ bingoId, roundId: roundParsed.data });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  router.get("/:id/rounds/:roundId/prizes", async (req: AuthedRequest, res) => {
    const bingoId = req.params.id;
    const roundParsed = roundIdParam.safeParse(req.params.roundId);
    if (!roundParsed.success) {
      res.status(400).json({ error: "Invalid round id" });
      return;
    }
    const result = await getRoundPrizesForBo({ bingoId, roundId: roundParsed.data });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  });
}
