import { Router } from "express";
import { z } from "zod";
import { httpError, rethrowPlayerWalletError, zodFlattenError } from "../lib/route-helpers.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { creditWalletManualDeposit } from "../services/wallet.js";
import { creditPrizeToWinner } from "../services/prize-payout.js";
import { listWalletTransactionsForPlayer } from "../lib/wallet-transactions-for-player.js";
import { getWalletTransactionCardDetail } from "../lib/wallet-transaction-card-detail.js";
import { getPlayerDepositAudit } from "../payments/deposit.service.js";
import { BO } from "../lib/functionality-codes.js";
import { requireFunctionality } from "../middleware/require-functionality.js";

export const playersRouter = Router();

playersRouter.use(requireAuth);
playersRouter.use(requireFunctionality(BO.PLAYERS_MANAGE));

const listQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const uuidParam = z.string().uuid();

playersRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }
    const { q, limit = 50 } = parsed.data;

    const where =
      q && q.trim()
        ? {
            OR: [
              { email: { contains: q.trim(), mode: "insensitive" as const } },
              { username: { contains: q.trim(), mode: "insensitive" as const } },
            ],
          }
        : undefined;

    const players = await prisma.player.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        email: true,
        username: true,
        active: true,
        createdAt: true,
        wallet: {
          select: {
            balanceCents: true,
            currencyCode: true,
          },
        },
      },
    });

    res.json({
      players: players.map((p) => ({
        id: p.id,
        email: p.email,
        username: p.username,
        active: p.active,
        createdAt: p.createdAt.toISOString(),
        wallet: p.wallet
          ? {
              balanceCents: p.wallet.balanceCents,
              currencyCode: p.wallet.currencyCode,
            }
          : null,
      })),
    });
  }),
);

/** `from` / `to`: opcional, formato `YYYY-MM-DD` (interpretación en UTC para el día calendario). */
function parseWalletTxQueryDateFrom(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function parseWalletTxQueryDateTo(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** Ledger de wallet (mismo shape que `/player/wallet/transactions`; más reciente primero). */
playersRouter.get(
  "/:playerId/wallet/transactions",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parseId = uuidParam.safeParse(req.params.playerId);
    if (!parseId.success) {
      throw httpError(400, "Invalid player id");
    }
    const playerId = parseId.data;

    const fromRaw = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";
    let createdAtFrom: Date | undefined;
    let createdAtTo: Date | undefined;
    if (fromRaw) {
      const d = parseWalletTxQueryDateFrom(fromRaw);
      if (!d) {
        throw httpError(400, "Invalid from date (use YYYY-MM-DD)");
      }
      createdAtFrom = d;
    }
    if (toRaw) {
      const d = parseWalletTxQueryDateTo(toRaw);
      if (!d) {
        throw httpError(400, "Invalid to date (use YYYY-MM-DD)");
      }
      createdAtTo = d;
    }
    if (createdAtFrom && createdAtTo && createdAtFrom.getTime() > createdAtTo.getTime()) {
      throw httpError(400, "from must be on or before to");
    }

    const hasDateRange = !!(createdAtFrom || createdAtTo);
    const defaultLimit = hasDateRange ? 500 : 100;
    const limit = Math.min(hasDateRange ? 2000 : 200, Math.max(1, Number(req.query.limit) || defaultLimit));

    const payload = await listWalletTransactionsForPlayer({
      playerId,
      limit,
      order: "desc",
      createdAtFrom,
      createdAtTo,
    });
    res.json(payload);
  }),
);

/** Auditoría de depósito (initiate + webhook request/response). */
playersRouter.get(
  "/:playerId/deposits/:depositId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const pPlayer = uuidParam.safeParse(req.params.playerId);
    const pDeposit = uuidParam.safeParse(req.params.depositId);
    if (!pPlayer.success || !pDeposit.success) {
      throw httpError(400, "Invalid id");
    }
    try {
      const audit = await getPlayerDepositAudit(pPlayer.data, pDeposit.data);
      res.json(audit);
    } catch {
      throw httpError(404, "Deposit not found");
    }
  }),
);

/** Vista de cartón(es) para compra o premio (BINGO_75). */
playersRouter.get(
  "/:playerId/wallet/transactions/:transactionId/card-detail",
  asyncHandler(async (req: AuthedRequest, res) => {
    const pPlayer = uuidParam.safeParse(req.params.playerId);
    const pTx = uuidParam.safeParse(req.params.transactionId);
    if (!pPlayer.success || !pTx.success) {
      throw httpError(400, "Invalid id");
    }
    const result = await getWalletTransactionCardDetail({
      playerId: pPlayer.data,
      walletTransactionId: pTx.data,
    });
    if (!result.ok) {
      throw httpError(result.status, result.error);
    }
    res.json(result.data);
  }),
);

playersRouter.get(
  "/:playerId/purchases",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parseId = uuidParam.safeParse(req.params.playerId);
    if (!parseId.success) {
      throw httpError(400, "Invalid player id");
    }
    const playerId = parseId.data;

    const purchases = await prisma.cartonPurchase.findMany({
      where: { playerId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        bingoRound: {
          include: {
            bingo: {
              include: {
                room: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
      },
    });

    res.json({
      purchases: purchases.map((p) => ({
        id: p.id,
        quantity: p.quantity,
        unitPriceCents: p.unitPriceCents,
        totalCents: p.totalCents,
        createdAt: p.createdAt.toISOString(),
        round: {
          id: p.bingoRound.id,
          sequence: p.bingoRound.sequence,
          startsAt: p.bingoRound.startsAt.toISOString(),
          status: p.bingoRound.status,
          bingo: {
            id: p.bingoRound.bingo.id,
            name: p.bingoRound.bingo.name,
            bingoType: p.bingoRound.bingo.bingoType,
            room: p.bingoRound.bingo.room,
          },
        },
      })),
    });
  }),
);

playersRouter.get(
  "/:playerId/prize-payouts",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parseId = uuidParam.safeParse(req.params.playerId);
    if (!parseId.success) {
      throw httpError(400, "Invalid player id");
    }
    const playerId = parseId.data;

    const payouts = await prisma.prizePayout.findMany({
      where: { playerId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        bingoPrize: { select: { id: true, figure: true, amount: true } },
        playerRoundCard: { select: { id: true, cardFingerprint: true, bingoRoundId: true } },
      },
    });

    res.json({
      prizePayouts: payouts.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        createdAt: p.createdAt.toISOString(),
        prize: {
          id: p.bingoPrize.id,
          figure: p.bingoPrize.figure,
          amount: p.bingoPrize.amount.toString(),
        },
        winningCard: {
          id: p.playerRoundCard.id,
          cardFingerprint: p.playerRoundCard.cardFingerprint,
          bingoRoundId: p.playerRoundCard.bingoRoundId,
        },
      })),
    });
  }),
);

const prizeCreditBodySchema = z.object({
  bingoPrizeId: z.string().uuid(),
  playerRoundCardId: z.string().uuid(),
});

playersRouter.post(
  "/:playerId/prize-credits",
  asyncHandler(async (req: AuthedRequest, res) => {
    const parseId = uuidParam.safeParse(req.params.playerId);
    if (!parseId.success) {
      throw httpError(400, "Invalid player id");
    }
    const playerId = parseId.data;

    const parsed = prizeCreditBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }

    try {
      const result = await creditPrizeToWinner({
        playerId,
        bingoPrizeId: parsed.data.bingoPrizeId,
        playerRoundCardId: parsed.data.playerRoundCardId,
      });
      res.status(201).json(result);
    } catch (e) {
      rethrowPlayerWalletError(e);
    }
  }),
);

const manualCreditBodySchema = z.object({
  amountCents: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

playersRouter.post(
  "/:playerId/wallet/manual-credits",
  asyncHandler(async (req: AuthedRequest, res) => {
    const adminUserId = req.auth?.sub;
    if (!adminUserId) {
      throw httpError(401, "Unauthorized");
    }

    const playerId = req.params.playerId;
    if (!uuidParam.safeParse(playerId).success) {
      throw httpError(400, "Invalid player id");
    }

    const parsed = manualCreditBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }

    try {
      const result = await creditWalletManualDeposit({
        playerId,
        amountCents: parsed.data.amountCents,
        adminUserId,
        note: parsed.data.note,
      });

      res.status(201).json({
        depositId: result.depositId,
        transactionId: result.transactionId,
        walletId: result.walletId,
        balanceCents: result.balanceCents,
      });
    } catch (e) {
      rethrowPlayerWalletError(e);
    }
  }),
);
