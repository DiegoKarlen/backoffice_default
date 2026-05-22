import { BingoRoundStatus, BingoStatus, BingoType, Prisma } from "@prisma/client";
import { prisma } from "../../../src/lib/prisma.js";
import { hashPassword } from "../../../src/lib/password.js";
import { decimalPriceToCents } from "../../../src/lib/money.js";

export type PurchaseRoundFixture = {
  roomId: string;
  bingoId: string;
  roundId: string;
  playerId: string;
  unitPriceCents: number;
};

export async function cleanupPurchaseRoundFixture(ids: PurchaseRoundFixture): Promise<void> {
  const order = [
    () => prisma.walletTransaction.deleteMany({ where: { wallet: { playerId: ids.playerId } } }),
    () => prisma.playerRoundCard.deleteMany({ where: { bingoRoundId: ids.roundId } }),
    () => prisma.cartonPurchase.deleteMany({ where: { bingoRoundId: ids.roundId } }),
    () => prisma.wallet.deleteMany({ where: { playerId: ids.playerId } }),
    () => prisma.player.delete({ where: { id: ids.playerId } }),
    () => prisma.bingoRound.delete({ where: { id: ids.roundId } }),
    () => prisma.bingo.delete({ where: { id: ids.bingoId } }),
    () => prisma.room.delete({ where: { id: ids.roomId } }),
  ];
  for (const step of order) {
    try {
      await step();
    } catch {
      /* best-effort */
    }
  }
}

export async function createPurchaseRoundFixture(suffix: string): Promise<PurchaseRoundFixture> {
  const pwd = await hashPassword("TestPass123!");
  const cardPrice = new Prisma.Decimal("10.0000");
  const unitPriceCents = decimalPriceToCents(cardPrice);

  const room = await prisma.room.create({
    data: { name: `pur-room-${suffix}`, slug: `pur-room-${suffix}`, status: "ACTIVE" },
  });

  const now = Date.now();
  const bingo = await prisma.bingo.create({
    data: {
      roomId: room.id,
      name: `pur-bingo-${suffix}`,
      status: BingoStatus.ACTIVE,
      bingoType: BingoType.BINGO_75,
      startDateTime: new Date(now - 60_000),
      endDateTime: new Date(now + 86_400_000),
      repeatEveryMinutes: 60,
      cardPrice,
      minPlayersToStart: 1,
    },
  });

  const round = await prisma.bingoRound.create({
    data: {
      bingoId: bingo.id,
      sequence: 1,
      startsAt: new Date(now + 3_600_000),
      status: BingoRoundStatus.SCHEDULED,
    },
  });

  const player = await prisma.player.create({
    data: {
      email: `pur-${suffix}@test.local`,
      username: `pur_${suffix}`,
      passwordHash: pwd,
      active: true,
    },
  });

  await prisma.wallet.create({
    data: { playerId: player.id, balanceCents: 50_000 },
  });

  return {
    roomId: room.id,
    bingoId: bingo.id,
    roundId: round.id,
    playerId: player.id,
    unitPriceCents,
  };
}
