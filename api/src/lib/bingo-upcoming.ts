import type { Request } from "express";
import { BingoFigure, BingoStatus, BingoType, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type UpcomingPrize = {
  figure: BingoFigure;
  amount: string;
};

export type UpcomingOccurrence = {
  bingoId: string;
  roomName: string;
  bingoType: BingoType;
  cardPrice: string;
  startsAt: string;
  startsAtMs: number;
  prizes: UpcomingPrize[];
};

export type UpcomingPayload = {
  serverTime: string;
  next: UpcomingOccurrence | null;
  upcoming: UpcomingOccurrence[];
};

function nextOccurrenceAfter(params: {
  startDateTime: Date;
  repeatEveryMinutes: number | null;
  now: Date;
}): Date | null {
  const { startDateTime, repeatEveryMinutes, now } = params;
  const startMs = startDateTime.getTime();
  const nowMs = now.getTime();

  if (!repeatEveryMinutes || repeatEveryMinutes < 1) {
    return startMs > nowMs ? startDateTime : null;
  }

  const intervalMs = repeatEveryMinutes * 60_000;
  if (startMs > nowMs) return startDateTime;

  const elapsed = nowMs - startMs;
  const mod = ((elapsed % intervalMs) + intervalMs) % intervalMs;
  const add = mod === 0 ? 0 : intervalMs - mod;
  const nextMs = nowMs + add;
  return new Date(nextMs);
}

function upcomingRunsForBingo(params: {
  bingoId: string;
  roomName: string;
  bingoType: BingoType;
  cardPrice: Prisma.Decimal;
  startDateTime: Date;
  repeatEveryMinutes: number | null;
  now: Date;
  horizonMs: number;
  maxRuns: number;
}): Array<{ bingoId: string; roomName: string; bingoType: BingoType; cardPrice: string; startsAt: Date }> {
  const {
    bingoId,
    roomName,
    bingoType,
    cardPrice,
    startDateTime,
    repeatEveryMinutes,
    now,
    horizonMs,
    maxRuns,
  } = params;

  const out: Array<{
    bingoId: string;
    roomName: string;
    bingoType: BingoType;
    cardPrice: string;
    startsAt: Date;
  }> = [];

  const nowMs = now.getTime();
  const limitMs = nowMs + horizonMs;

  const first = nextOccurrenceAfter({ startDateTime, repeatEveryMinutes, now });
  if (!first) return out;

  let cur = first.getTime();
  let guard = 0;
  while (cur <= limitMs && out.length < maxRuns && guard < 50_000) {
    guard += 1;
    out.push({
      bingoId,
      roomName,
      bingoType,
      cardPrice: cardPrice.toString(),
      startsAt: new Date(cur),
    });

    if (!repeatEveryMinutes || repeatEveryMinutes < 1) break;
    cur += repeatEveryMinutes * 60_000;
  }

  return out;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * Shared payload for GET /backoffice/bingos/upcoming (auth) and GET /public/bingos/upcoming (no auth).
 */
export async function buildUpcomingPayload(q: Request["query"], nowInput?: Date): Promise<UpcomingPayload> {
  const now = nowInput ?? new Date();

  const horizonDaysRaw =
    typeof q.horizonDays === "string" ? Number(q.horizonDays) : typeof q.h === "string" ? Number(q.h) : 14;
  const horizonDays = clampInt(horizonDaysRaw, 1, 60);
  const horizonMs = horizonDays * 24 * 60 * 60_000;

  const limitRaw = typeof q.limit === "string" ? Number(q.limit) : typeof q.n === "string" ? Number(q.n) : 24;
  const maxTotal = clampInt(limitRaw, 1, 100);

  const perBingoMax = clampInt(Math.ceil(maxTotal / 4) + 8, 4, 48);

  const rows = await prisma.bingo.findMany({
    where: { status: BingoStatus.ACTIVE },
    orderBy: [{ startDateTime: "asc" }, { roomName: "asc" }],
    include: { prizes: { orderBy: { figure: "asc" } } },
  });

  const occurrences: UpcomingOccurrence[] = [];

  for (const b of rows) {
    const runs = upcomingRunsForBingo({
      bingoId: b.id,
      roomName: b.roomName,
      bingoType: b.bingoType,
      cardPrice: b.cardPrice,
      startDateTime: b.startDateTime,
      repeatEveryMinutes: b.repeatEveryMinutes,
      now,
      horizonMs,
      maxRuns: perBingoMax,
    });
    const prizes: UpcomingPrize[] = b.prizes.map((p) => ({
      figure: p.figure,
      amount: p.amount.toString(),
    }));

    for (const r of runs) {
      occurrences.push({
        bingoId: r.bingoId,
        roomName: r.roomName,
        bingoType: r.bingoType,
        cardPrice: r.cardPrice,
        startsAt: r.startsAt.toISOString(),
        startsAtMs: r.startsAt.getTime(),
        prizes,
      });
    }
  }

  occurrences.sort((a, b) => a.startsAtMs - b.startsAtMs);
  const trimmed = occurrences.slice(0, maxTotal);

  const next = trimmed.length ? trimmed[0] : null;

  return {
    serverTime: now.toISOString(),
    next,
    upcoming: trimmed,
  };
}
