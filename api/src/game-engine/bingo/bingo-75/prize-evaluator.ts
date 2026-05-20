import { PrizePayoutMode } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { decimalPriceToCents } from "../../../lib/money.js";
import { creditPrizeToWinner } from "../../../services/prize-payout.js";
import {
  BINGO_FIGURE_EVAL_ORDER,
  buildMarkedGrid,
  figureSatisfied,
  winsFullHouse,
  type Bingo75Cell,
} from "./figures.js";
import { sortCardsForTieBreak } from "./prize-winner-order.js";
import type { EvaluateAfterBallParams, PrizeAwardBroadcastPayload } from "../types.js";

export type { PrizeAwardBroadcastPayload };

/**
 * Tras cada bolilla: revisa cartones 75 y acredita premios no pagados aún.
 *
 * Reglas (§3.2):
 * - Figuras en orden LINE → PERIMETER → FULL_HOUSE.
 * - Por premio: si `uniquePerRound` (config en BO), un solo ganador por partida (desempate
 *   `createdAt` → `cardIndex` → `id`); si no, cada cartón elegible entra en el reparto.
 * - Modo `IMMEDIATE_FULL_PER_WINNER`: cada ganador cobra el monto completo al ganar.
 * - Modo `DEFERRED_SPLIT_AT_ROUND_END`: se registran ganadores; el monto del premio se divide
 *   en partes iguales al cerrar la ronda (liquidación en `settleDeferredSplitPrizesForRound`).
 * - Un mismo cartón puede ganar varias figuras a medida que avanza el sorteo.
 * - La partida termina cuando cualquier cartón completa cartón lleno (FULL_HOUSE).
 *
 * @returns `true` si algún cartón tiene cartón lleno (corta el sorteo).
 */
export async function evaluateRoundPrizesAfterBall(
  params: EvaluateAfterBallParams,
): Promise<boolean> {
  const { bingoRoundId, bingoId, drawnNumbers } = params;
  const drawn = new Set(drawnNumbers);

  const bingo = await prisma.bingo.findUnique({
    where: { id: bingoId },
    select: { prizePayoutMode: true },
  });
  const deferredMode = bingo?.prizePayoutMode === PrizePayoutMode.DEFERRED_SPLIT_AT_ROUND_END;

  const prizes = await prisma.bingoPrize.findMany({
    where: { bingoId },
    orderBy: { figure: "asc" },
  });
  prizes.sort(
    (a, b) =>
      BINGO_FIGURE_EVAL_ORDER.indexOf(a.figure) - BINGO_FIGURE_EVAL_ORDER.indexOf(b.figure),
  );

  const cards = sortCardsForTieBreak(
    await prisma.playerRoundCard.findMany({
      where: { bingoRoundId },
      include: {
        cells: { orderBy: [{ row: "asc" }, { col: "asc" }] },
        player: { select: { id: true, active: true, username: true } },
      },
    }),
  );

  for (const prize of prizes) {
    if (prize.uniquePerRound) {
      const alreadyImmediate = await prisma.prizePayout.findFirst({
        where: {
          bingoPrizeId: prize.id,
          playerRoundCard: { bingoRoundId },
        },
        select: { id: true },
      });
      const alreadyDeferred = deferredMode
        ? await prisma.deferredRoundPrizeWin.findFirst({
            where: { bingoPrizeId: prize.id, bingoRoundId },
            select: { id: true },
          })
        : null;
      if (alreadyImmediate || alreadyDeferred) continue;
    }

    for (const card of cards) {
      if (!card.player.active) continue;

      const existingImmediate = await prisma.prizePayout.findFirst({
        where: { playerRoundCardId: card.id, bingoPrizeId: prize.id },
        select: { id: true },
      });
      if (existingImmediate) continue;

      if (deferredMode) {
        const existingDef = await prisma.deferredRoundPrizeWin.findFirst({
          where: { playerRoundCardId: card.id, bingoPrizeId: prize.id, bingoRoundId },
          select: { id: true },
        });
        if (existingDef) continue;
      }

      const cells: Bingo75Cell[] = card.cells.map((c) => ({
        row: c.row,
        col: c.col,
        number: c.number,
        isFree: c.isFree,
      }));
      const marked = buildMarkedGrid(cells, drawn);
      if (!figureSatisfied(prize.figure, marked)) continue;

      if (deferredMode) {
        try {
          const row = await prisma.deferredRoundPrizeWin.create({
            data: {
              bingoRoundId,
              bingoPrizeId: prize.id,
              playerId: card.playerId,
              playerRoundCardId: card.id,
            },
          });
          params.onPrizeCredited?.({
            bingoRoundId,
            bingoId,
            playerId: card.playerId,
            playerUsername: card.player.username,
            playerRoundCardId: card.id,
            bingoPrizeId: prize.id,
            figure: prize.figure,
            deferredSettlement: true,
            payoutId: row.id,
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[bingo-75/prize-evaluator] deferredRoundPrizeWin create failed", e);
        }
      } else {
        try {
          const result = await creditPrizeToWinner({
            playerId: card.playerId,
            bingoPrizeId: prize.id,
            playerRoundCardId: card.id,
          });
          const creditedCents = decimalPriceToCents(prize.amount);
          params.onPrizeCredited?.({
            bingoRoundId,
            bingoId,
            playerId: card.playerId,
            playerUsername: card.player.username,
            playerRoundCardId: card.id,
            bingoPrizeId: prize.id,
            figure: prize.figure,
            amountCents: creditedCents,
            payoutId: result.payoutId,
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[bingo-75/prize-evaluator] creditPrizeToWinner failed", e);
        }
      }

      if (prize.uniquePerRound) break;
    }
  }

  for (const card of cards) {
    const cells: Bingo75Cell[] = card.cells.map((c) => ({
      row: c.row,
      col: c.col,
      number: c.number,
      isFree: c.isFree,
    }));
    const marked = buildMarkedGrid(cells, drawn);
    if (winsFullHouse(marked)) return true;
  }
  return false;
}
