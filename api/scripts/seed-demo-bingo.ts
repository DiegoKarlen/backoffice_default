/**
 * Demo seed for end-to-end validation (§1.4).
 *
 * Run from api/:
 *   npm run dev   (API)
 *   npx tsx scripts/seed-demo-bingo.ts
 *
 * Loads api/.env (DATABASE_URL).
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

function envStr(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : fallback;
}

function envInt(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? Math.trunc(v) : fallback;
}

async function main(): Promise<void> {
  const roomSlug = envStr("SEED_DEMO_ROOM_SLUG", "demo");
  const roomName = envStr("SEED_DEMO_ROOM_NAME", "Sala Demo");
  const bingoName = envStr("SEED_DEMO_BINGO_NAME", "Bingo Demo 75");
  const repeatEveryMinutes = envInt("SEED_DEMO_REPEAT_MIN", 5);
  const minPlayersToStart = envInt("SEED_DEMO_MIN_CARTONS", 1);

  const cardPriceStr = envStr("SEED_DEMO_CARD_PRICE", "100.00");
  const linePrizeStr = envStr("SEED_DEMO_PRIZE_LINE", "200.00");
  const perimeterPrizeStr = envStr("SEED_DEMO_PRIZE_PERIMETER", "300.00");
  const fullHousePrizeStr = envStr("SEED_DEMO_PRIZE_FULL_HOUSE", "500.00");

  const now = new Date();
  const startsAt = new Date(now.getTime() + 2 * 60_000);
  // Keep the sync horizon small for demo (avoid generating tens of thousands of rounds).
  const endDateTime = new Date(now.getTime() + 6 * 60 * 60_000);

  const room = await prisma.room.upsert({
    where: { slug: roomSlug },
    create: { slug: roomSlug, name: roomName, status: "ACTIVE" },
    update: { name: roomName, status: "ACTIVE" },
  });

  const existing = await prisma.bingo.findFirst({
    where: { roomId: room.id, name: bingoName },
    select: { id: true },
  });

  const bingoFinal = existing
    ? await prisma.bingo.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          bingoType: "BINGO_75",
          startDateTime: startsAt,
          endDateTime,
          repeatEveryMinutes,
          cardPrice: new Prisma.Decimal(cardPriceStr),
          minPlayersToStart,
        },
      })
    : await prisma.bingo.create({
        data: {
          roomId: room.id,
          name: bingoName,
          status: "ACTIVE",
          bingoType: "BINGO_75",
          startDateTime: startsAt,
          endDateTime,
          repeatEveryMinutes,
          cardPrice: new Prisma.Decimal(cardPriceStr),
          minPlayersToStart,
        },
      });

  await prisma.bingoPrize.upsert({
    where: { bingoId_figure: { bingoId: bingoFinal.id, figure: "LINE" } },
    create: { bingoId: bingoFinal.id, figure: "LINE", amount: new Prisma.Decimal(linePrizeStr) },
    update: { amount: new Prisma.Decimal(linePrizeStr) },
  });
  await prisma.bingoPrize.upsert({
    where: { bingoId_figure: { bingoId: bingoFinal.id, figure: "PERIMETER" } },
    create: {
      bingoId: bingoFinal.id,
      figure: "PERIMETER",
      amount: new Prisma.Decimal(perimeterPrizeStr),
    },
    update: { amount: new Prisma.Decimal(perimeterPrizeStr) },
  });
  await prisma.bingoPrize.upsert({
    where: { bingoId_figure: { bingoId: bingoFinal.id, figure: "FULL_HOUSE" } },
    create: {
      bingoId: bingoFinal.id,
      figure: "FULL_HOUSE",
      amount: new Prisma.Decimal(fullHousePrizeStr),
    },
    update: { amount: new Prisma.Decimal(fullHousePrizeStr) },
  });

  // For the E2E demo we only need one SCHEDULED round that is buyable.
  // (The full scheduler sync can be run separately; it may generate a large number of rounds.)
  const existingRound = await prisma.bingoRound.findFirst({
    where: { bingoId: bingoFinal.id, startsAt },
    select: { id: true, sequence: true, startsAt: true, status: true },
  });

  let nextRound = existingRound;
  if (!nextRound) {
    const maxSeqAgg = await prisma.bingoRound.aggregate({
      where: { bingoId: bingoFinal.id },
      _max: { sequence: true },
    });
    const sequence = (maxSeqAgg._max.sequence ?? 0) + 1;
    nextRound = await prisma.bingoRound.create({
      data: { bingoId: bingoFinal.id, startsAt, sequence, status: "SCHEDULED" },
      select: { id: true, sequence: true, startsAt: true, status: true },
    });
  } else if (nextRound.status === "CANCELLED") {
    nextRound = await prisma.bingoRound.update({
      where: { id: nextRound.id },
      data: { status: "SCHEDULED" },
      select: { id: true, sequence: true, startsAt: true, status: true },
    });
  }

  // eslint-disable-next-line no-console
  console.log("Demo seed OK:", {
    room: { slug: room.slug, name: room.name },
    bingo: { id: bingoFinal.id, name: bingoFinal.name, startsAt: bingoFinal.startDateTime.toISOString() },
    nextRound: nextRound
      ? { id: nextRound.id, sequence: nextRound.sequence, startsAt: nextRound.startsAt.toISOString(), status: nextRound.status }
      : null,
  });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

