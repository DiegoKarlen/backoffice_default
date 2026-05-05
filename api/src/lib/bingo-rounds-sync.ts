import { BingoRoundStatus, BingoStatus } from "@prisma/client";
import { prisma } from "./prisma.js";
import { upcomingRunsForBingo } from "./bingo-upcoming.js";

const SYNC_MAX_RUNS = 50_000;
/** Cap horizonte cuando no hay endDateTime (1 año). */
const DEFAULT_HORIZON_MS = 366 * 24 * 60 * 60 * 1000;

function computeSyncHorizonMs(endDateTime: Date | null, now: Date): number {
  const nowMs = now.getTime();
  const endMs = endDateTime?.getTime();
  if (endMs != null) return Math.min(Math.max(0, endMs - nowMs), DEFAULT_HORIZON_MS);
  return DEFAULT_HORIZON_MS;
}

/**
 * Regenera partidas `SCHEDULED` futuras según la definición actual del bingo.
 * - Bingo INACTIVE: cancela partidas futuras `SCHEDULED`.
 * - Bingo ACTIVE: cancela `SCHEDULED` que ya no están en la agenda objetivo; crea/reactiva las faltantes.
 * No modifica `DRAWING` / `COMPLETED`. Sin tabla de ventas aún: no bloquea por cartones (TODO).
 */
export async function syncScheduledRoundsForBingo(bingoId: string): Promise<void> {
  const bingo = await prisma.bingo.findUnique({ where: { id: bingoId } });
  if (!bingo) return;

  const now = new Date();

  if (bingo.status !== BingoStatus.ACTIVE) {
    await prisma.bingoRound.updateMany({
      where: {
        bingoId,
        status: BingoRoundStatus.SCHEDULED,
        startsAt: { gte: now },
      },
      data: { status: BingoRoundStatus.CANCELLED },
    });
    return;
  }

  const horizonMs = computeSyncHorizonMs(bingo.endDateTime, now);

  const runs = upcomingRunsForBingo({
    bingoId: bingo.id,
    name: bingo.name,
    bingoType: bingo.bingoType,
    cardPrice: bingo.cardPrice,
    startDateTime: bingo.startDateTime,
    endDateTime: bingo.endDateTime,
    repeatEveryMinutes: bingo.repeatEveryMinutes,
    now,
    horizonMs,
    maxRuns: SYNC_MAX_RUNS,
  });

  const targetMsList = [...new Set(runs.map((r) => r.startsAt.getTime()))].sort((a, b) => a - b);
  const targetMs = new Set(targetMsList);

  const futureScheduled = await prisma.bingoRound.findMany({
    where: {
      bingoId,
      status: BingoRoundStatus.SCHEDULED,
      startsAt: { gte: now },
    },
  });

  for (const r of futureScheduled) {
    if (!targetMs.has(r.startsAt.getTime())) {
      await prisma.bingoRound.update({
        where: { id: r.id },
        data: { status: BingoRoundStatus.CANCELLED },
      });
    }
  }

  if (targetMsList.length === 0) return;

  const datesForQuery = targetMsList.map((ms) => new Date(ms));
  const existingForTargets = await prisma.bingoRound.findMany({
    where: {
      bingoId,
      startsAt: { in: datesForQuery },
    },
  });
  const byMs = new Map(existingForTargets.map((x) => [x.startsAt.getTime(), x]));

  const maxSeqAgg = await prisma.bingoRound.aggregate({
    where: { bingoId },
    _max: { sequence: true },
  });
  let nextSeq = maxSeqAgg._max.sequence ?? 0;

  for (const ms of targetMsList) {
    const ex = byMs.get(ms);
    if (ex) {
      if (ex.status === BingoRoundStatus.CANCELLED) {
        await prisma.bingoRound.update({
          where: { id: ex.id },
          data: { status: BingoRoundStatus.SCHEDULED },
        });
      }
      continue;
    }

    nextSeq += 1;
    await prisma.bingoRound.create({
      data: {
        bingoId,
        sequence: nextSeq,
        startsAt: new Date(ms),
        status: BingoRoundStatus.SCHEDULED,
      },
    });
  }
}
