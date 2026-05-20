/** Códigos persistidos en `BingoRound.cancellationReason` cuando la partida queda cancelada. */
export const BingoRoundCancelReason = {
  MIN_CARTONS_NOT_MET: "MIN_CARTONS_NOT_MET",
  MANUAL_STOP: "MANUAL_STOP",
  BINGO_INACTIVE: "BINGO_INACTIVE",
  SCHEDULE_REMOVED: "SCHEDULE_REMOVED",
} as const;

export type BingoRoundCancelReasonCode = (typeof BingoRoundCancelReason)[keyof typeof BingoRoundCancelReason];
