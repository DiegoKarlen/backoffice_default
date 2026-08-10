import type {
  BingoDrawMode,
  BingoFigure,
  BingoPrizeMode,
  BingoStatus,
  BingoType,
  Prisma,
  PrizePayoutMode,
  PrizeSettlementTiming,
  RoomStatus,
} from "@prisma/client";

export function toDecimalString(v: unknown): string {
  if (v === null || v === undefined) return "0";
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v);
}

export function serializeBingo(b: {
  id: string;
  roomId: string;
  name: string;
  status: BingoStatus;
  bingoType: BingoType;
  prizePayoutMode: PrizePayoutMode;
  prizeSettlementTiming: PrizeSettlementTiming;
  drawMode: BingoDrawMode;
  startDateTime: Date;
  endDateTime: Date | null;
  repeatEveryMinutes: number | null;
  cardPrice: Prisma.Decimal;
  prizeMode: BingoPrizeMode;
  prizePoolSeed: Prisma.Decimal;
  minPlayersToStart: number;
  jackpotEnabled: boolean;
  jackpotMaxBall: number | null;
  jackpotAmount: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
  room?: { id: string; name: string; status: RoomStatus };
  prizes?: {
    id: string;
    bingoId: string;
    figure: BingoFigure;
    amount: Prisma.Decimal;
  }[];
}) {
  return {
    id: b.id,
    roomId: b.roomId,
    room: b.room ? { id: b.room.id, name: b.room.name, status: b.room.status } : undefined,
    name: b.name,
    status: b.status,
    bingoType: b.bingoType,
    prizePayoutMode: b.prizePayoutMode,
    prizeSettlementTiming: b.prizeSettlementTiming,
    drawMode: b.drawMode,
    startDateTime: b.startDateTime,
    endDateTime: b.endDateTime,
    repeatEveryMinutes: b.repeatEveryMinutes,
    cardPrice: b.cardPrice.toString(),
    prizeMode: b.prizeMode,
    prizePoolSeed: b.prizePoolSeed.toString(),
    minPlayersToStart: b.minPlayersToStart,
    jackpotEnabled: b.jackpotEnabled,
    jackpotMaxBall: b.jackpotMaxBall,
    jackpotAmount: b.jackpotAmount?.toString() ?? null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    prizes: b.prizes
      ? b.prizes.map((p) => ({
          id: p.id,
          bingoId: p.bingoId,
          figure: p.figure,
          amount: p.amount.toString(),
        }))
      : undefined,
  };
}
