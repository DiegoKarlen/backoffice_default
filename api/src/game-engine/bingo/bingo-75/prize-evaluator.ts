import { prisma } from "../../../lib/prisma.js";

import {

  BINGO_FIGURE_EVAL_ORDER,

  buildMarkedGrid,

  figureCompletionDrawIndex,

  winsFullHouse,

  type Bingo75Cell,

} from "./figures.js";

import { sortCardsForTieBreak } from "./prize-winner-order.js";

import type { EvaluateAfterBallParams, PrizeAwardBroadcastPayload } from "../types.js";



export type { PrizeAwardBroadcastPayload };



type EligibleCard = {

  id: string;

  playerId: string;

  cells75: Bingo75Cell[];

  completionIndex: number;

  player: { id: string; active: boolean; username: string };

};



/** Cartones que completaron la figura en la primera bolilla de la partida (misma bolilla = todos). */

function uniquePerRoundWinners(eligible: EligibleCard[]): EligibleCard[] {

  if (eligible.length === 0) return [];

  const firstBallIndex = Math.min(...eligible.map((e) => e.completionIndex));

  return eligible.filter((e) => e.completionIndex === firstBallIndex);

}



/**

 * Tras cada bolilla: revisa cartones 75 y registra ganadores (sin acreditar wallet).

 *

 * Reglas (§3.2):

 * - Figuras en `BINGO_FIGURE_EVAL_ORDER` (línea, doble línea, letras B-I-N-G-O, perímetro, cartón lleno).

 * - La wallet se acredita siempre al cerrar la partida (`settleDeferredSplitPrizesForRound`).

 * - `prizePayoutMode` solo define cómo liquidar al cierre: monto completo por ganador vs reparto del pozo.

 * - Por premio: si `uniquePerRound`, la figura se paga una sola vez por partida (primera bolilla en que alguien la cumple).

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

  const drawnOrdered = drawnNumbers;



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

      const alreadyDeferred = await prisma.deferredRoundPrizeWin.findFirst({

        where: { bingoPrizeId: prize.id, bingoRoundId },

        select: { id: true },

      });

      const alreadyImmediate = await prisma.prizePayout.findFirst({

        where: {

          bingoPrizeId: prize.id,

          playerRoundCard: { bingoRoundId },

        },

        select: { id: true },

      });

      if (alreadyDeferred || alreadyImmediate) continue;

    }



    const eligible: Array<(typeof cards)[number] & { cells75: Bingo75Cell[]; completionIndex: number }> = [];



    for (const card of cards) {

      if (!card.player.active) continue;



      const existingImmediate = await prisma.prizePayout.findFirst({

        where: { playerRoundCardId: card.id, bingoPrizeId: prize.id },

        select: { id: true },

      });

      if (existingImmediate) continue;



      const existingDef = await prisma.deferredRoundPrizeWin.findFirst({

        where: { playerRoundCardId: card.id, bingoPrizeId: prize.id, bingoRoundId },

        select: { id: true },

      });

      if (existingDef) continue;



      const cells75: Bingo75Cell[] = card.cells.map((c) => ({

        row: c.row,

        col: c.col,

        number: c.number,

        isFree: c.isFree,

      }));

      const completionIndex = figureCompletionDrawIndex(prize.figure, cells75, drawnOrdered);

      if (completionIndex < 0) continue;

      eligible.push({ ...card, cells75, completionIndex });

    }



    const toAward = prize.uniquePerRound ? uniquePerRoundWinners(eligible) : eligible;



    for (const card of toAward) {

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


