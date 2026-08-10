import type { EvaluateAfterBallParams, PrizeAwardBroadcastPayload } from "../types.js";
import { computeDeferredWinsAfterBall } from "./prize-evaluation.logic.js";
import {
  insertDeferredRoundPrizeWin,
  loadBingoJackpotMaxBall,
  loadBingoPrizes,
  loadRoundAwardState,
  loadRoundCards,
} from "./prize-evaluation.repo.js";

export type { PrizeAwardBroadcastPayload };
export { computeDeferredWinsAfterBall } from "./prize-evaluation.logic.js";
export type { DeferredWinCandidate } from "./prize-evaluation.logic.js";
export {
  cardPrizeKey,
  loadBingoJackpotMaxBall,
  loadBingoPrizes,
  loadRoundAwardState,
  loadRoundCards,
  insertDeferredRoundPrizeWin,
  type BingoPrizeRow,
  type RoundAwardState,
  type RoundCardRow,
} from "./prize-evaluation.repo.js";

/**
 * Tras cada bolilla: revisa cartones 75 y registra ganadores (sin acreditar wallet).
 *
 * Reglas (§3.2):
 * - Figuras en `BINGO_FIGURE_EVAL_ORDER` (línea, doble línea, letras B-I-N-G-O, perímetro, cartón lleno).
 * - La wallet se acredita siempre al cerrar la partida (`settleDeferredSplitPrizesForRound`).
 * - `prizePayoutMode` solo define cómo liquidar al cierre: monto completo por ganador vs reparto del pozo.
 * - Por premio: cada figura se paga una sola vez por partida (primera bolilla en que alguien la cumple).
 * - Un mismo cartón puede ganar varias figuras a medida que avanza el sorteo.
 * - La partida termina cuando cualquier cartón completa cartón lleno (FULL_HOUSE).
 *
 * @returns `true` si algún cartón tiene cartón lleno (corta el sorteo).
 */
export async function evaluateRoundPrizesAfterBall(
  params: EvaluateAfterBallParams,
): Promise<boolean> {
  const { bingoRoundId, bingoId, drawnNumbers } = params;

  const [prizes, cards, awardState, jackpotMaxBall] = await Promise.all([
    loadBingoPrizes(bingoId),
    loadRoundCards(bingoRoundId),
    loadRoundAwardState(bingoRoundId),
    loadBingoJackpotMaxBall(bingoId),
  ]);

  const { newWins, shouldEndRound } = computeDeferredWinsAfterBall({
    prizes,
    cards,
    drawnNumbers,
    awardState,
    jackpotMaxBall,
  });

  for (const win of newWins) {
    const row = await insertDeferredRoundPrizeWin({
      bingoRoundId,
      bingoPrizeId: win.bingoPrizeId,
      playerId: win.playerId,
      playerRoundCardId: win.playerRoundCardId,
    });

    if (!row) {
      // Unique constraint race — already persisted by a parallel draw
      continue;
    }

    params.onPrizeCredited?.({
      bingoRoundId,
      bingoId,
      playerId: win.playerId,
      playerUsername: win.playerUsername,
      playerRoundCardId: win.playerRoundCardId,
      bingoPrizeId: win.bingoPrizeId,
      figure: win.figure,
      deferredSettlement: true,
      payoutId: row.id,
    });
  }

  return shouldEndRound;
}
