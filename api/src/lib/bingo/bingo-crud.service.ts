import {
  BingoDrawMode,
  BingoPrizeMode,
  BingoStatus,
  BingoType,
  PrizePayoutMode,
  type Prisma,
} from "@prisma/client";
import { rescheduleLiveSessionForRoom } from "../../game-engine/bingo/live-session.js";
import { syncScheduledRoundsForBingo } from "../bingo-rounds-sync.js";
import { invalidateUpcomingCache } from "../bingo-upcoming.js";
import { prisma } from "../prisma.js";
import { prizeRowDbData, syncBingoPrizesInUpdateTx, validatePrizes } from "./bingo-prize-sync.js";
import { createBingoSchema, updateBingoSchema } from "./bingo-schemas.js";
import { serializeBingo, toDecimalString } from "./bingo-serializer.js";
import { validateBingo, validateScheduleBounds } from "./bingo-validation.js";
import type { z } from "zod";

type CreateBody = z.infer<typeof createBingoSchema>;
type UpdateBody = z.infer<typeof updateBingoSchema>;

const bingoInclude = {
  prizes: { orderBy: { figure: "asc" as const } },
  room: true,
} satisfies Prisma.BingoInclude;

export async function listBingos(where: Prisma.BingoWhereInput) {
  const list = await prisma.bingo.findMany({
    where,
    orderBy: [{ startDateTime: "asc" }, { name: "asc" }],
    include: bingoInclude,
  });
  return list.map((b) => serializeBingo(b));
}

export async function getBingoById(id: string) {
  const bingo = await prisma.bingo.findFirst({
    where: { id },
    include: bingoInclude,
  });
  return bingo ? serializeBingo(bingo) : null;
}

export async function createBingo(body: CreateBody, userId?: string) {
  if (body.bingoType !== BingoType.BINGO_75) {
    throw Object.assign(new Error("Only BINGO_75 is supported"), { statusCode: 400 });
  }

  const prizeMode = body.prizeMode ?? BingoPrizeMode.FIXED;
  const startDt = new Date(body.startDateTime);
  const endDt = new Date(body.endDateTime);

  const created = await prisma.bingo.create({
    data: {
      roomId: body.roomId,
      name: body.name.trim(),
      status: body.status ?? BingoStatus.INACTIVE,
      bingoType: body.bingoType,
      startDateTime: startDt,
      endDateTime: endDt,
      repeatEveryMinutes: body.repeatEveryMinutes ?? null,
      cardPrice: toDecimalString(body.cardPrice),
      prizeMode,
      prizePoolSeed:
        prizeMode === BingoPrizeMode.PERCENTAGE ? toDecimalString(body.prizePoolSeed ?? 0) : "0",
      minPlayersToStart: body.minPlayersToStart,
      prizePayoutMode: body.prizePayoutMode ?? PrizePayoutMode.IMMEDIATE_FULL_PER_WINNER,
      drawMode: body.drawMode ?? BingoDrawMode.VIRTUAL,
      createdByUserId: userId ?? null,
      updatedByUserId: userId ?? null,
      prizes: {
        create: body.prizes.map((p) => ({
          figure: p.figure,
          ...prizeRowDbData(p),
        })),
      },
    },
    include: bingoInclude,
  });

  await syncScheduledRoundsForBingo(created.id);
  rescheduleLiveSessionForRoom(created.roomId);
  invalidateUpcomingCache();
  return serializeBingo(created);
}

export async function updateBingo(id: string, body: UpdateBody, userId?: string) {
  const existing = await prisma.bingo.findFirst({ where: { id } });
  if (!existing) return null;

  if (body.bingoType !== undefined && body.bingoType !== BingoType.BINGO_75) {
    throw Object.assign(new Error("Only BINGO_75 is supported"), { statusCode: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.bingo.update({
      where: { id },
      data: {
        ...(body.roomId !== undefined ? { roomId: body.roomId } : {}),
        name: body.name !== undefined ? body.name.trim() : undefined,
        status: body.status,
        bingoType: body.bingoType,
        startDateTime: body.startDateTime !== undefined ? new Date(body.startDateTime) : undefined,
        endDateTime:
          body.endDateTime !== undefined
            ? body.endDateTime === null
              ? null
              : new Date(body.endDateTime)
            : undefined,
        repeatEveryMinutes:
          body.repeatEveryMinutes !== undefined ? body.repeatEveryMinutes ?? null : undefined,
        cardPrice: body.cardPrice !== undefined ? toDecimalString(body.cardPrice) : undefined,
        prizeMode: body.prizeMode,
        prizePoolSeed:
          body.prizePoolSeed !== undefined
            ? toDecimalString(body.prizePoolSeed)
            : body.prizeMode === BingoPrizeMode.FIXED
              ? "0"
              : undefined,
        minPlayersToStart: body.minPlayersToStart,
        prizePayoutMode: body.prizePayoutMode,
        drawMode: body.drawMode,
        updatedByUserId: userId ?? null,
      },
    });

    if (body.prizes !== undefined) {
      await syncBingoPrizesInUpdateTx(tx, id, body.prizes);
    }

    return tx.bingo.findFirstOrThrow({
      where: { id: u.id },
      include: bingoInclude,
    });
  });

  await syncScheduledRoundsForBingo(updated.id);
  rescheduleLiveSessionForRoom(existing.roomId);
  if (updated.roomId !== existing.roomId) rescheduleLiveSessionForRoom(updated.roomId);
  invalidateUpcomingCache();
  return serializeBingo(updated);
}

export async function setBingoStatus(id: string, status: BingoStatus, userId?: string) {
  const bingo = await prisma.bingo.findFirst({ where: { id } });
  if (!bingo) return null;

  const updated = await prisma.bingo.update({
    where: { id },
    data: { status, updatedByUserId: userId ?? null },
    include: bingoInclude,
  });
  await syncScheduledRoundsForBingo(updated.id);
  rescheduleLiveSessionForRoom(updated.roomId);
  invalidateUpcomingCache();
  return serializeBingo(updated);
}

export async function deleteBingo(id: string): Promise<string | null> {
  const bingo = await prisma.bingo.findFirst({ where: { id } });
  if (!bingo) return null;
  await prisma.bingo.delete({ where: { id } });
  rescheduleLiveSessionForRoom(bingo.roomId);
  invalidateUpcomingCache();
  return bingo.roomId;
}

export {
  validateBingo,
  validatePrizes,
  validateScheduleBounds,
  BingoPrizeMode,
  BingoStatus,
  BingoType,
};
