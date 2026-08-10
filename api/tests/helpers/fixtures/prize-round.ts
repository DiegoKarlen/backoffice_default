import assert from "node:assert/strict";
import { BingoRoundStatus, BingoStatus, BingoType, Prisma, type BingoFigure } from "@prisma/client";
import { prisma } from "../../../src/lib/prisma.js";
import { hashPassword } from "../../../src/lib/password.js";
import type { CardCellInput } from "../../../src/game-engine/bingo/bingo-75/player-card.js";
import { fingerprintCells as fpCells } from "../../../src/game-engine/bingo/bingo-75/player-card.js";
import { twoDistinctCardsSameRow0 } from "./card-cells.js";

export type PrizeRoundFixtureIds = {
  roomId: string;
  bingoId: string;
  roundId: string;
  prizeLineId: string;
  playerAId: string;
  playerBId: string;
  purchaseAId: string;
  purchaseBId: string;
  cardAId: string;
  cardBId: string;
};

export type PrizeRoundFixture = PrizeRoundFixtureIds & {
  cellsA: CardCellInput[];
  cellsB: CardCellInput[];
};

export async function cleanupPrizeRoundFixture(ids: PrizeRoundFixtureIds): Promise<void> {
  const order = [
    () => prisma.deferredRoundPrizeWin.deleteMany({ where: { bingoRoundId: ids.roundId } }),
    () =>
      prisma.walletTransaction.deleteMany({
        where: { wallet: { playerId: { in: [ids.playerAId, ids.playerBId] } } },
      }),
    () => prisma.prizePayout.deleteMany({ where: { bingoPrizeId: ids.prizeLineId } }),
    () => prisma.playerRoundCard.deleteMany({ where: { bingoRoundId: ids.roundId } }),
    () => prisma.cartonPurchase.deleteMany({ where: { bingoRoundId: ids.roundId } }),
    () => prisma.wallet.deleteMany({ where: { playerId: { in: [ids.playerAId, ids.playerBId] } } }),
    () => prisma.player.deleteMany({ where: { id: { in: [ids.playerAId, ids.playerBId] } } }),
    () => prisma.bingoRoundBall.deleteMany({ where: { roundId: ids.roundId } }),
    () => prisma.bingoPrize.deleteMany({ where: { bingoId: ids.bingoId } }),
    () => prisma.bingoRound.deleteMany({ where: { id: ids.roundId } }),
    () => prisma.bingo.delete({ where: { id: ids.bingoId } }),
    () => prisma.room.delete({ where: { id: ids.roomId } }),
  ];
  for (const step of order) {
    try {
      await step();
    } catch {
      // best-effort
    }
  }
}

export async function createPrizeRoundFixture(params: {
  suffix: string;
  prizePayoutMode?: "IMMEDIATE_FULL_PER_WINNER" | "DEFERRED_SPLIT_AT_ROUND_END";
}): Promise<PrizeRoundFixture> {
  const [cellsA, cellsB] = twoDistinctCardsSameRow0();
  const fpA = fpCells(cellsA);
  const fpB = fpCells(cellsB);
  assert.notEqual(fpA, fpB);

  const pwd = await hashPassword("TestPass123!");
  const suffix = params.suffix;
  const room = await prisma.room.create({
    data: {
      name: `int-room-${suffix}`,
      slug: `int-room-${suffix}`,
      status: "ACTIVE",
    },
  });
  const now = new Date();
  const start = new Date(now.getTime() - 60_000);
  const end = new Date(now.getTime() + 86_400_000);
  const bingo = await prisma.bingo.create({
    data: {
      roomId: room.id,
      name: `int-bingo-${suffix}`,
      status: BingoStatus.ACTIVE,
      bingoType: BingoType.BINGO_75,
      startDateTime: start,
      endDateTime: end,
      repeatEveryMinutes: 60,
      cardPrice: new Prisma.Decimal("1.0000"),
      minPlayersToStart: 1,
      prizePayoutMode: params.prizePayoutMode ?? "IMMEDIATE_FULL_PER_WINNER",
      prizes: {
        create: [
          {
            figure: "LINE" as BingoFigure,
            amount: new Prisma.Decimal("10.0000"),
          },
        ],
      },
    },
    include: { prizes: true },
  });
  const prizeLine = bingo.prizes.find((p) => p.figure === "LINE");
  assert.ok(prizeLine);

  const round = await prisma.bingoRound.create({
    data: {
      bingoId: bingo.id,
      sequence: 1,
      startsAt: new Date(now.getTime() + 120_000),
      status: BingoRoundStatus.DRAWING,
    },
  });

  const playerA = await prisma.player.create({
    data: {
      email: `pa-${suffix}@test.local`,
      username: `pa_${suffix}`,
      passwordHash: pwd,
      active: true,
    },
  });
  const playerB = await prisma.player.create({
    data: {
      email: `pb-${suffix}@test.local`,
      username: `pb_${suffix}`,
      passwordHash: pwd,
      active: true,
    },
  });
  await prisma.wallet.create({ data: { playerId: playerA.id, balanceCents: 0 } });
  await prisma.wallet.create({ data: { playerId: playerB.id, balanceCents: 0 } });

  const purchaseA = await prisma.cartonPurchase.create({
    data: {
      playerId: playerA.id,
      bingoRoundId: round.id,
      quantity: 1,
      unitPriceCents: 100,
      totalCents: 100,
    },
  });
  const purchaseB = await prisma.cartonPurchase.create({
    data: {
      playerId: playerB.id,
      bingoRoundId: round.id,
      quantity: 1,
      unitPriceCents: 100,
      totalCents: 100,
    },
  });

  const cardA = await prisma.playerRoundCard.create({
    data: {
      playerId: playerA.id,
      bingoRoundId: round.id,
      cartonPurchaseId: purchaseA.id,
      cardIndex: 0,
      cardFingerprint: fpA,
      cells: {
        create: cellsA.map((c) => ({
          row: c.row,
          col: c.col,
          number: c.number,
          isFree: c.isFree,
        })),
      },
    },
  });
  const cardB = await prisma.playerRoundCard.create({
    data: {
      playerId: playerB.id,
      bingoRoundId: round.id,
      cartonPurchaseId: purchaseB.id,
      cardIndex: 0,
      cardFingerprint: fpB,
      cells: {
        create: cellsB.map((c) => ({
          row: c.row,
          col: c.col,
          number: c.number,
          isFree: c.isFree,
        })),
      },
    },
  });

  return {
    roomId: room.id,
    bingoId: bingo.id,
    roundId: round.id,
    prizeLineId: prizeLine.id,
    playerAId: playerA.id,
    playerBId: playerB.id,
    purchaseAId: purchaseA.id,
    purchaseBId: purchaseB.id,
    cardAId: cardA.id,
    cardBId: cardB.id,
    cellsA,
    cellsB,
  };
}
