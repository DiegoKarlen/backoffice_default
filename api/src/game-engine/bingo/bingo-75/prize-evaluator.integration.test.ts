import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BingoRoundStatus, BingoStatus, BingoType, Prisma, type BingoFigure } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { hashPassword } from "../../../lib/password.js";
import { evaluateRoundPrizesAfterBall } from "./prize-evaluator.js";
import { settleDeferredSplitPrizesForRound } from "../../../services/settle-deferred-split-prizes.js";
import {
  fingerprintCells as fpCells,
  generateBingo75Cells,
  type CardCellInput,
} from "./player-card.js";

function alignRow0FromSource(target: CardCellInput[], source: CardCellInput[]): void {
  for (let col = 0; col < 5; col++) {
    const s = source.find((c) => c.row === 0 && c.col === col);
    const t = target.find((c) => c.row === 0 && c.col === col);
    assert.ok(s && t);
    t.number = s.number;
    t.isFree = s.isFree;
  }
}

function twoDistinctCardsSameRow0(): [CardCellInput[], CardCellInput[]] {
  const a = generateBingo75Cells();
  let b = generateBingo75Cells();
  alignRow0FromSource(b, a);
  let guard = 0;
  while (guard++ < 50) {
    const fa = fpCells(a);
    const fb = fpCells(b);
    if (fa !== fb) return [a, b];
    b = generateBingo75Cells();
    alignRow0FromSource(b, a);
  }
  throw new Error("could not produce two distinct card fingerprints");
}

function row0DrawnNumbers(cells: CardCellInput[]): number[] {
  return cells
    .filter((c) => c.row === 0 && !c.isFree && c.number != null)
    .map((c) => c.number as number);
}

type FixtureIds = {
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

async function cleanupFixture(ids: FixtureIds): Promise<void> {
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
      // best-effort cleanup
    }
  }
}

async function createFixture(params: {
  uniquePerRound: boolean;
  suffix: string;
  prizePayoutMode?: "IMMEDIATE_FULL_PER_WINNER" | "DEFERRED_SPLIT_AT_ROUND_END";
}): Promise<FixtureIds & { cellsA: CardCellInput[]; cellsB: CardCellInput[] }> {
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
            uniquePerRound: params.uniquePerRound,
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

describe("evaluateRoundPrizesAfterBall (integration)", () => {
  let connected = false;

  before(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      connected = true;
    } catch {
      connected = false;
    }
  });

  after(async () => {
    await prisma.$disconnect().catch(() => {});
  });

  it("uniquePerRound + full per winner: both deferred, full LINE at settlement", async (t) => {
    if (!connected) {
      t.skip();
      return;
    }
    const suffix = `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fx = await createFixture({ uniquePerRound: true, suffix });
    try {
      const drawn = row0DrawnNumbers(fx.cellsA);
      assert.equal(drawn.length, 5);

      const credited: string[] = [];
      const shouldEnd = await evaluateRoundPrizesAfterBall({
        bingoRoundId: fx.roundId,
        bingoId: fx.bingoId,
        drawnNumbers: drawn,
        onPrizeCredited: (p) => credited.push(p.playerRoundCardId),
      });

      assert.equal(shouldEnd, false);
      assert.equal(credited.length, 2);
      assert.equal(
        await prisma.prizePayout.count({ where: { bingoPrizeId: fx.prizeLineId } }),
        0,
      );
      assert.equal(
        await prisma.deferredRoundPrizeWin.count({ where: { bingoRoundId: fx.roundId } }),
        2,
      );

      await settleDeferredSplitPrizesForRound({ bingoRoundId: fx.roundId });

      const payouts = await prisma.prizePayout.findMany({
        where: { bingoPrizeId: fx.prizeLineId },
      });
      assert.equal(payouts.length, 2);
      assert.equal(payouts.every((p) => p.amountCents === 1000), true);
      const ids = new Set(payouts.map((p) => p.playerRoundCardId));
      assert.ok(ids.has(fx.cardAId));
      assert.ok(ids.has(fx.cardBId));
    } finally {
      await cleanupFixture(fx);
    }
  });

  it("uniquePerRound + deferred: same-draw winners split LINE pool at settlement", async (t) => {
    if (!connected) {
      t.skip();
      return;
    }
    const suffix = `ud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fx = await createFixture({
      uniquePerRound: true,
      suffix,
      prizePayoutMode: "DEFERRED_SPLIT_AT_ROUND_END",
    });
    try {
      const drawn = row0DrawnNumbers(fx.cellsA);
      await evaluateRoundPrizesAfterBall({
        bingoRoundId: fx.roundId,
        bingoId: fx.bingoId,
        drawnNumbers: drawn,
      });

      const deferredRows = await prisma.deferredRoundPrizeWin.findMany({
        where: { bingoRoundId: fx.roundId },
      });
      assert.equal(deferredRows.length, 2);

      await settleDeferredSplitPrizesForRound({ bingoRoundId: fx.roundId });

      const payouts = await prisma.prizePayout.findMany({
        where: { bingoPrizeId: fx.prizeLineId },
      });
      assert.equal(payouts.length, 2);
      assert.equal(payouts.reduce((a, p) => a + p.amountCents, 0), 1000);
      assert.equal(payouts.every((p) => p.amountCents === 500), true);
    } finally {
      await cleanupFixture(fx);
    }
  });

  it("uniquePerRound false: both cards deferred then full LINE at settlement", async (t) => {
    if (!connected) {
      t.skip();
      return;
    }
    const suffix = `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fx = await createFixture({ uniquePerRound: false, suffix });
    try {
      const drawn = row0DrawnNumbers(fx.cellsA);
      const credited: string[] = [];
      await evaluateRoundPrizesAfterBall({
        bingoRoundId: fx.roundId,
        bingoId: fx.bingoId,
        drawnNumbers: drawn,
        onPrizeCredited: (p) => credited.push(p.playerRoundCardId),
      });

      assert.equal(credited.length, 2);
      const ids = new Set(credited);
      assert.ok(ids.has(fx.cardAId));
      assert.ok(ids.has(fx.cardBId));

      await settleDeferredSplitPrizesForRound({ bingoRoundId: fx.roundId });

      const payouts = await prisma.prizePayout.findMany({
        where: { bingoPrizeId: fx.prizeLineId },
      });
      assert.equal(payouts.length, 2);
      assert.equal(payouts.every((p) => p.amountCents === 1000), true);
    } finally {
      await cleanupFixture(fx);
    }
  });

  it("skips inactive player for payout", async (t) => {
    if (!connected) {
      t.skip();
      return;
    }
    const suffix = `i-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fx = await createFixture({ uniquePerRound: false, suffix });
    try {
      await prisma.player.update({
        where: { id: fx.playerAId },
        data: { active: false },
      });

      const drawn = row0DrawnNumbers(fx.cellsA);
      const credited: string[] = [];
      await evaluateRoundPrizesAfterBall({
        bingoRoundId: fx.roundId,
        bingoId: fx.bingoId,
        drawnNumbers: drawn,
        onPrizeCredited: (p) => credited.push(p.playerRoundCardId),
      });

      assert.deepEqual(credited, [fx.cardBId]);
      assert.equal(
        await prisma.deferredRoundPrizeWin.count({ where: { bingoRoundId: fx.roundId } }),
        1,
      );

      await settleDeferredSplitPrizesForRound({ bingoRoundId: fx.roundId });

      const payouts = await prisma.prizePayout.findMany({
        where: { bingoPrizeId: fx.prizeLineId },
      });
      assert.equal(payouts.length, 1);
      assert.equal(payouts[0]!.playerRoundCardId, fx.cardBId);
    } finally {
      await cleanupFixture(fx);
    }
  });

  it("deferred split: records winners then splits prize pool at settlement", async (t) => {
    if (!connected) {
      t.skip();
      return;
    }
    const suffix = `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fx = await createFixture({
      uniquePerRound: false,
      suffix,
      prizePayoutMode: "DEFERRED_SPLIT_AT_ROUND_END",
    });
    try {
      const drawn = row0DrawnNumbers(fx.cellsA);
      const payloads: Array<{ deferred?: boolean; amount?: number }> = [];
      await evaluateRoundPrizesAfterBall({
        bingoRoundId: fx.roundId,
        bingoId: fx.bingoId,
        drawnNumbers: drawn,
        onPrizeCredited: (p) =>
          payloads.push({
            deferred: p.deferredSettlement === true,
            amount: p.amountCents ?? undefined,
          }),
      });

      assert.equal(payloads.length, 2);
      assert.ok(payloads.every((x) => x.deferred === true && x.amount === undefined));

      const deferredRows = await prisma.deferredRoundPrizeWin.findMany({
        where: { bingoRoundId: fx.roundId },
      });
      assert.equal(deferredRows.length, 2);

      const payouts0 = await prisma.prizePayout.findMany({
        where: { bingoPrizeId: fx.prizeLineId },
      });
      assert.equal(payouts0.length, 0);

      await settleDeferredSplitPrizesForRound({ bingoRoundId: fx.roundId });

      const payouts = await prisma.prizePayout.findMany({
        where: { bingoPrizeId: fx.prizeLineId },
      });
      assert.equal(payouts.length, 2);
      const sum = payouts.reduce((a, p) => a + p.amountCents, 0);
      assert.equal(sum, 1000);

      assert.equal(
        await prisma.deferredRoundPrizeWin.count({ where: { bingoRoundId: fx.roundId } }),
        0,
      );
    } finally {
      await cleanupFixture(fx);
    }
  });
});
