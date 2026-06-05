import { Router } from "express";
import { BingoRoundStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { getRoundPrizesForBo, getRoundPurchasedCardsForBo } from "../lib/bingo-round-bo-detail.js";
import { buildRoundPrizeBreakdown } from "../lib/bingo-round-prize-breakdown.js";
import { decimalPriceToCents } from "../lib/money.js";
import { httpError } from "../lib/route-helpers.js";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/async-handler.js";
import type { AuthedRequest } from "../middleware/auth.js";

const roundIdParam = z.string().uuid();

/**
 * Rutas de partidas bajo `/backoffice/bingos/:id/rounds*`.
 * Registrar en el router de bingos **antes** de `GET /:id`.
 */
export function attachBingoRoundRoutes(router: Router): void {
  router.get(
    "/:id/rounds",
    asyncHandler(async (req: AuthedRequest, res) => {
      const { id } = req.params;
      const bingo = await prisma.bingo.findFirst({
        where: { id },
        select: {
          id: true,
          name: true,
          prizeMode: true,
          prizePoolSeed: true,
          cardPrice: true,
          prizes: { orderBy: { figure: "asc" }, select: { figure: true, amount: true } },
        },
      });
      if (!bingo) {
        throw httpError(404, "Bingo not found");
      }
      const seedCents = decimalPriceToCents(bingo.prizePoolSeed);
      const cardPriceCents = decimalPriceToCents(bingo.cardPrice);

      const q = req.query;
      const fromRaw = typeof q.from === "string" ? q.from.trim() : "";
      const toRaw = typeof q.to === "string" ? q.to.trim() : "";
      const seqRaw = typeof q.sequence === "string" ? q.sequence.trim() : "";
      const statusRaw = typeof q.status === "string" ? q.status.trim() : "";
      const finishedOnlyRaw =
        typeof q.finishedOnly === "string" ? q.finishedOnly.trim().toLowerCase() : "";
      const finishedOnly = finishedOnlyRaw === "true" || finishedOnlyRaw === "1";
      const limitRaw = typeof q.limit === "string" ? q.limit.trim() : "";
      const sortRaw = typeof q.sort === "string" ? q.sort.trim().toLowerCase() : "";

      const startsAtWhere: Prisma.DateTimeFilter = {};
      if (fromRaw) {
        const d = new Date(fromRaw);
        if (Number.isNaN(d.getTime())) {
          throw httpError(400, "Invalid from datetime (use ISO 8601)");
        }
        startsAtWhere.gte = d;
      }
      if (toRaw) {
        const d = new Date(toRaw);
        if (Number.isNaN(d.getTime())) {
          throw httpError(400, "Invalid to datetime (use ISO 8601)");
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
          throw httpError(400, "sequence must be a positive integer (round #)");
        }
        where.sequence = n;
      }
      if (statusRaw !== "") {
        const allowedStatus = Object.values(BingoRoundStatus) as string[];
        if (!allowedStatus.includes(statusRaw)) {
          throw httpError(400, "Invalid status");
        }
        where.status = statusRaw as BingoRoundStatus;
      } else if (finishedOnly) {
        where.status = { in: [BingoRoundStatus.COMPLETED, BingoRoundStatus.CANCELLED] };
      }

      let take: number | undefined;
      if (limitRaw !== "") {
        const n = Number(limitRaw);
        if (!Number.isInteger(n) || n < 1 || n > 500) {
          throw httpError(400, "limit must be an integer between 1 and 500");
        }
        take = n;
      }

      if (sortRaw !== "" && sortRaw !== "asc" && sortRaw !== "desc") {
        throw httpError(400, "sort must be asc or desc");
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
      const salesCentsByRound = new Map<string, number>();
      if (roundIds.length > 0) {
        const payouts = await prisma.prizePayout.findMany({
          where: { playerRoundCard: { bingoRoundId: { in: roundIds } } },
          select: { playerRoundCard: { select: { bingoRoundId: true } } },
        });
        for (const p of payouts) {
          const rid = p.playerRoundCard.bingoRoundId;
          prizeCountByRound.set(rid, (prizeCountByRound.get(rid) ?? 0) + 1);
        }
        const salesGroups = await prisma.cartonPurchase.groupBy({
          by: ["bingoRoundId"],
          where: { bingoRoundId: { in: roundIds } },
          _sum: { totalCents: true },
        });
        for (const g of salesGroups) {
          salesCentsByRound.set(g.bingoRoundId, g._sum.totalCents ?? 0);
        }
      }

      res.json({
        bingoId: bingo.id,
        bingoName: bingo.name,
        prizeMode: bingo.prizeMode,
        cardPriceCents,
        rounds: rounds.map((r) => {
          const nums = r.balls.map((b) => b.number);
          const includeBalls =
            r.status === BingoRoundStatus.COMPLETED ||
            r.status === BingoRoundStatus.DRAWING ||
            nums.length > 0;
          const cardSalesCents = salesCentsByRound.get(r.id) ?? 0;
          const roundPoolCents = seedCents + cardSalesCents;
          const { prizePoolCents, prizeLines } = buildRoundPrizeBreakdown(
            bingo.prizeMode,
            bingo.prizePoolSeed,
            bingo.prizes,
            roundPoolCents,
          );
          return {
            id: r.id,
            sequence: r.sequence,
            startsAt: r.startsAt.toISOString(),
            status: r.status,
            cancellationReason: r.cancellationReason ?? null,
            balls: includeBalls ? nums : [],
            cardsSold: r._count.playerRoundCards,
            prizesPaid: prizeCountByRound.get(r.id) ?? 0,
            cardPriceCents,
            prizePoolSeedCents: prizePoolCents != null ? seedCents : null,
            cardSalesCents: prizePoolCents != null ? cardSalesCents : null,
            prizePoolCents,
            prizeLines,
          };
        }),
      });
    }),
  );

  router.get(
    "/:id/rounds/:roundId/cards",
    asyncHandler(async (req: AuthedRequest, res) => {
      const bingoId = req.params.id;
      const roundParsed = roundIdParam.safeParse(req.params.roundId);
      if (!roundParsed.success) {
        throw httpError(400, "Invalid round id");
      }
      const result = await getRoundPurchasedCardsForBo({ bingoId, roundId: roundParsed.data });
      if (!result.ok) {
        throw httpError(result.status, result.error);
      }
      res.json(result);
    }),
  );

  router.get(
    "/:id/rounds/:roundId/prizes",
    asyncHandler(async (req: AuthedRequest, res) => {
      const bingoId = req.params.id;
      const roundParsed = roundIdParam.safeParse(req.params.roundId);
      if (!roundParsed.success) {
        throw httpError(400, "Invalid round id");
      }
      const result = await getRoundPrizesForBo({ bingoId, roundId: roundParsed.data });
      if (!result.ok) {
        throw httpError(result.status, result.error);
      }
      res.json(result);
    }),
  );
}
