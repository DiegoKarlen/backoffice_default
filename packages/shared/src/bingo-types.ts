/** Figures configured on a bingo (75-ball). */
export type BingoFigure =
  | "LINE"
  | "DOUBLE_LINE"
  | "LETTER_B"
  | "LETTER_I"
  | "LETTER_N"
  | "LETTER_G"
  | "LETTER_O"
  | "PERIMETER"
  | "JACKPOT"
  | "FULL_HOUSE";

export type OccurrencePrize = {
  figure: BingoFigure;
  amount: string;
  displayAmount?: string;
  /** Importe del premio para la partida en curso (centavos). */
  payoutCents?: number;
};

/** Upcoming bingo occurrence (public display + player portal buy tab). */
export type BingoOccurrence = {
  bingoId: string;
  name: string;
  bingoType: string;
  drawMode?: "VIRTUAL" | "LIVE";
  prizeMode?: string;
  cardPrice: string;
  startsAt: string;
  startsAtMs: number;
  prizes: OccurrencePrize[];
  roundSequence: number | null;
  bingoRoundId?: string | null;
};

export type UpcomingBingosResponse = {
  serverTime: string;
  next: BingoOccurrence | null;
  upcoming: BingoOccurrence[];
};

export type LivePhase = "idle" | "drawing";

export type LiveSnapshot = {
  phase: LivePhase;
  serverTime: string;
  drawIntervalMs: number;
  roomSlug: string;
  roomTitle: string;
  nextScheduledAt: string | null;
  nextName: string | null;
  nextRoundSequence: number | null;
  current: null | {
    bingoId: string;
    roundId: string;
    roundSequence: number;
    name: string;
    bingoType: string;
    drawn: number[];
    lastBall: number | null;
    remainingInQueue: number;
    remainingBallNumbers: number[];
    totalBalls: number;
    progress: number;
    scheduledStartsAt: string;
    drawMode: "VIRTUAL" | "LIVE";
    canMarkLiveBall?: boolean;
    jackpotMaxBall?: number | null;
    prizes: OccurrencePrize[];
  };
};

/** Minimal live state for player portal header. */
export type LiveSnapMinimal = {
  phase: LivePhase;
  roomSlug: string;
  current: null | {
    roundId: string;
    drawn: number[];
    lastBall: number | null;
  };
};

export type PublicRoom = {
  id: string;
  name: string;
  slug: string;
};

export type CardCell = { number: number | null; isFree: boolean };

export type PlayerPortalCard = {
  id: string;
  cardIndex: number;
  bingoRoundId: string;
  round: {
    id: string;
    bingoId: string;
    sequence: number;
    startsAt: string;
    bingoName: string;
    bingoType: string;
    roomSlug?: string;
    roomName?: string;
  };
  grid: CardCell[][];
};

export type WalletTxDetail = {
  kind: "prize" | "purchase" | "deposit" | "refund" | "adjustment" | null;
  bingoName?: string;
  figure?: string;
  roundSequence?: number | null;
  depositNote?: string | null;
  depositId?: string | null;
  depositExternalRef?: string | null;
  roomSlug?: string | null;
  bingoId?: string | null;
  bingoRoundId?: string | null;
};
