import type { BingoDrawMode, BingoFigure, BingoType } from "@prisma/client";

export type LiveSessionPhase = "idle" | "drawing";

export type LiveSnapshot = {
  phase: LiveSessionPhase;
  serverTime: string;
  drawIntervalMs: number;
  roomSlug: string;
  roomTitle: string;
  nextScheduledAt: string | null;
  nextName: string | null;
  /** `BingoRound.sequence` del próximo sorteo (idle: `nextKick`; en curso: `followingKick`). */
  nextRoundSequence: number | null;
  current: null | {
    bingoId: string;
    roundId: string;
    roundSequence: number;
    name: string;
    bingoType: BingoType;
    drawn: number[];
    lastBall: number | null;
    remainingInQueue: number;
    remainingBallNumbers: number[];
    totalBalls: number;
    progress: number;
    scheduledStartsAt: string;
    drawMode: BingoDrawMode;
    canMarkLiveBall: boolean;
    prizeMode: string;
    jackpotMaxBall: number | null;
    prizes: Array<{
      figure: BingoFigure;
      amount: string;
      displayAmount: string;
      payoutCents: number;
    }>;
  };
};

/** Context passed from scheduler when a round is promoted to DRAWING. */
export type ScheduledDrawingRound = {
  occ: { startsAt: string; startsAtMs: number };
  round: { id: string; sequence: number };
  bingo: {
    id: string;
    name: string;
    bingoType: BingoType;
    drawMode: BingoDrawMode;
    prizeMode: string;
    jackpotEnabled: boolean;
    jackpotMaxBall: number | null;
    prizes: Array<{ figure: BingoFigure; amount: string; displayAmount: string }>;
  };
  ballQueue: number[];
};
