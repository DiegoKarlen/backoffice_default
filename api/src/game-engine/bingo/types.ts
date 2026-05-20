import type { BingoType } from "@prisma/client";

export type PrizeAwardBroadcastPayload = {
  bingoRoundId: string;
  bingoId: string;
  playerId: string;
  playerUsername: string;
  playerRoundCardId: string;
  bingoPrizeId: string;
  figure: string;
  /** Omitido cuando `deferredSettlement`: el monto se liquida al cerrar la partida. */
  amountCents?: number | null;
  /** Id de `PrizePayout` si hubo acreditación inmediata; puede ser id de `DeferredRoundPrizeWin` si es diferido. */
  payoutId?: string | null;
  /** Reparto proporcional al cierre: notificación en vivo sin monto. */
  deferredSettlement?: boolean;
};

export type EvaluateAfterBallParams = {
  bingoRoundId: string;
  bingoId: string;
  drawnNumbers: number[];
  onPrizeCredited?: (payload: PrizeAwardBroadcastPayload) => void;
};

/** Contrato de cada variante de bingo (75, 90, …). */
export type BingoVariantEngine = {
  readonly bingoType: BingoType;
  readonly ballCount: number;
  createBallQueue(): number[];
  /**
   * Lógica post-bolilla (premios, fin anticipado de ronda).
   * @returns `true` si la ronda debe terminar antes de vaciar la bolsa.
   */
  evaluateAfterBall(params: EvaluateAfterBallParams): Promise<boolean>;
};
