import { PrizeSettlementTiming } from "@prisma/client";
import type { EvaluateAfterBallParams, PrizeAwardBroadcastPayload } from "../types.js";
import { computeDeferredWinsAfterBall } from "./prize-evaluation.logic.js";
import {
  insertDeferredRoundPrizeWin,
  loadBingoJackpotMaxBall,
  loadBingoPrizeSettlementTiming,
  loadBingoPrizes,
  loadRoundAwardState,
  loadRoundCards,
} from "./prize-evaluation.repo.js";
import { settleDeferredSplitPrizesForRound } from "../../../services/settle-deferred-split-prizes.js";

export type { PrizeAwardBroadcastPayload };
export { computeDeferredWinsAfterBall } from "./prize-evaluation.logic.js";
export type { DeferredWinCandidate } from "./prize-evaluation.logic.js";
export {
  cardPrizeKey,
  loadBingoJackpotMaxBall,
  loadBingoPrizeSettlementTiming,
  loadBingoPrizes,
  loadRoundAwardState,
  loadRoundCards,
  insertDeferredRoundPrizeWin,
  type BingoPrizeRow,
  type RoundAwardState,
  type RoundCardRow,
} from "./prize-evaluation.repo.js";

type PersistedWin = {
  win: Awaited<ReturnType<typeof computeDeferredWinsAfterBall>>["newWins"][number];
  deferredRowId: string;
};

function creditKey(playerRoundCardId: string, bingoPrizeId: string): string {
  return `${playerRoundCardId}:${bingoPrizeId}`;
}

/**
 * Tras cada bolilla: revisa cartones 75 y registra ganadores.
 *
 * Reglas (§3.2):
 * - Figuras en `BINGO_FIGURE_EVAL_ORDER` (línea, doble línea, letras B-I-N-G-O, perímetro, cartón lleno).
 * - `prizeSettlementTiming`: ON_FIGURE acredita wallet al salir la figura; AT_ROUND_END al cerrar la partida.
 * - `prizePayoutMode`: monto completo por ganador vs reparto del pozo entre ganadores de la misma bolilla.
 * - Cada figura se paga una sola vez por partida (primera bolilla en que alguien la cumple).
 * - Un mismo cartón puede ganar varias figuras a medida que avanza el sorteo.
 * - La partida termina cuando cualquier cartón completa cartón lleno (FULL_HOUSE).
 *
 * @returns `true` si algún cartón tiene cartón lleno (corta el sorteo).
 */
export async function evaluateRoundPrizesAfterBall(
  params: EvaluateAfterBallParams,
): Promise<boolean> {
  const { bingoRoundId, bingoId, drawnNumbers } = params;

  const [prizes, cards, awardState, jackpotMaxBall, settlementTiming] = await Promise.all([
    loadBingoPrizes(bingoId),
    loadRoundCards(bingoRoundId),
    loadRoundAwardState(bingoRoundId),
    loadBingoJackpotMaxBall(bingoId),
    loadBingoPrizeSettlementTiming(bingoId),
  ]);

  const { newWins, shouldEndRound } = computeDeferredWinsAfterBall({
    prizes,
    cards,
    drawnNumbers,
    awardState,
    jackpotMaxBall,
  });

  const persisted: PersistedWin[] = [];

  for (const win of newWins) {
    const row = await insertDeferredRoundPrizeWin({
      bingoRoundId,
      bingoPrizeId: win.bingoPrizeId,
      playerId: win.playerId,
      playerRoundCardId: win.playerRoundCardId,
    });

    if (!row) continue;

    persisted.push({ win, deferredRowId: row.id });
  }

  if (persisted.length === 0) {
    return shouldEndRound;
  }

  if (settlementTiming === PrizeSettlementTiming.ON_FIGURE) {
    const prizeIds = [...new Set(persisted.map((p) => p.win.bingoPrizeId))];
    const credits = await settleDeferredSplitPrizesForRound({
      bingoRoundId,
      bingoPrizeIds: prizeIds,
    });
    const creditByKey = new Map(
      credits.map((c) => [creditKey(c.playerRoundCardId, c.bingoPrizeId), c]),
    );

    for (const { win } of persisted) {
      const credit = creditByKey.get(creditKey(win.playerRoundCardId, win.bingoPrizeId));
      params.onPrizeCredited?.({
        bingoRoundId,
        bingoId,
        playerId: win.playerId,
        playerUsername: win.playerUsername,
        playerRoundCardId: win.playerRoundCardId,
        bingoPrizeId: win.bingoPrizeId,
        figure: win.figure,
        deferredSettlement: false,
        amountCents: credit?.amountCents ?? null,
        payoutId: credit?.payoutId ?? null,
      });
    }
  } else {
    for (const { win, deferredRowId } of persisted) {
      params.onPrizeCredited?.({
        bingoRoundId,
        bingoId,
        playerId: win.playerId,
        playerUsername: win.playerUsername,
        playerRoundCardId: win.playerRoundCardId,
        bingoPrizeId: win.bingoPrizeId,
        figure: win.figure,
        deferredSettlement: true,
        payoutId: deferredRowId,
      });
    }
  }

  return shouldEndRound;
}
