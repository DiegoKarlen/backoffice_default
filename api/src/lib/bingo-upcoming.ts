import type { Request } from "express";
import { BingoFigure, BingoPrizeMode, BingoStatus, BingoType, Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { bingoPrizeDisplayAmount } from "./bingo-prize-display.js";
import { prisma } from "./prisma.js";

export type UpcomingPrize = {
  figure: BingoFigure;
  amount: string;
  /** Monto fijo o «N%» para etiquetas en cliente. */
  displayAmount: string;
};

export type UpcomingOccurrence = {
  bingoId: string;
  name: string;
  bingoType: BingoType;
  prizeMode: BingoPrizeMode;
  cardPrice: string;
  startsAt: string;
  startsAtMs: number;
  prizes: UpcomingPrize[];
  /** `BingoRound.sequence` cuando la partida ya está materializada */
  roundSequence: number | null;
  /** Id de fila `BingoRound` cuando existe; necesario para comprar cartones vía API jugador. */
  bingoRoundId: string | null;
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

/** Expanded occurrences for one bingo (used by agenda + `syncScheduledRoundsForBingo`). */
export function upcomingRunsForBingo(params: {
  bingoId: string;
  name: string;
  bingoType: BingoType;
  cardPrice: Prisma.Decimal;
  startDateTime: Date;
  endDateTime: Date | null;
  repeatEveryMinutes: number | null;
  now: Date;
  horizonMs: number;
  maxRuns: number;
}): Array<{ bingoId: string; name: string; bingoType: BingoType; cardPrice: string; startsAt: Date }> {
  const {
    bingoId,
    name,
    bingoType,
    cardPrice,
    startDateTime,
    endDateTime,
    repeatEveryMinutes,
    now,
    horizonMs,
    maxRuns,
  } = params;

  const out: Array<{
    bingoId: string;
    name: string;
    bingoType: BingoType;
    cardPrice: string;
    startsAt: Date;
  }> = [];

  const nowMs = now.getTime();
  const endMs = endDateTime ? endDateTime.getTime() : null;
  const limitMs = endMs != null ? Math.min(nowMs + horizonMs, endMs) : nowMs + horizonMs;

  const first = nextOccurrenceAfter({ startDateTime, repeatEveryMinutes, now });
  if (!first) return out;
  if (endMs != null && first.getTime() > endMs) return out;

  let cur = first.getTime();
  let guard = 0;
  while (cur <= limitMs && out.length < maxRuns && guard < 50_000) {
    guard += 1;
    if (endMs != null && cur > endMs) break;
    out.push({
      bingoId,
      name,
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

export type BuildUpcomingOptions = {
  /** When set, only bingos linked to this room are included. */
  roomId?: string;
};

const upcomingCache = new Map<string, { at: number; payload: UpcomingPayload }>();

export function invalidateUpcomingCache(): void {
  upcomingCache.clear();
}

function upcomingCacheKey(
  q: Request["query"],
  options?: BuildUpcomingOptions,
  nowMs?: number,
): string {
  const roomSlug = typeof q.roomSlug === "string" ? q.roomSlug.trim() : "";
  const horizonDays = typeof q.horizonDays === "string" ? q.horizonDays : typeof q.h === "string" ? q.h : "";
  const limit = typeof q.limit === "string" ? q.limit : typeof q.n === "string" ? q.n : "";
  return JSON.stringify({
    roomSlug,
    roomId: options?.roomId ?? "",
    horizonDays,
    limit,
    bucket: nowMs != null ? Math.floor(nowMs / env.upcomingCacheTtlMs) : 0,
  });
}

async function computeUpcomingPayload(
  q: Request["query"],
  nowInput?: Date,
  options?: BuildUpcomingOptions,
): Promise<UpcomingPayload> {
  const now = nowInput ?? new Date();

  let roomIdFilter = options?.roomId;
  if (!roomIdFilter) {
    const roomSlug = typeof q.roomSlug === "string" ? q.roomSlug.trim() : "";
    if (roomSlug) {
      const room = await prisma.room.findFirst({ where: { slug: roomSlug } });
      if (!room) {
        return {
          serverTime: now.toISOString(),
          next: null,
          upcoming: [],
        };
      }
      roomIdFilter = room.id;
    }
  }

  const horizonDaysRaw =
    typeof q.horizonDays === "string" ? Number(q.horizonDays) : typeof q.h === "string" ? Number(q.h) : 14;
  const horizonDays = clampInt(horizonDaysRaw, 1, 60);
  const horizonMs = horizonDays * 24 * 60 * 60_000;

  const limitRaw = typeof q.limit === "string" ? Number(q.limit) : typeof q.n === "string" ? Number(q.n) : 24;
  const maxTotal = clampInt(limitRaw, 1, 100);

  const perBingoMax = clampInt(Math.ceil(maxTotal / 4) + 8, 4, 48);

  const rows = await prisma.bingo.findMany({
    where: {
      status: BingoStatus.ACTIVE,
      ...(roomIdFilter ? { roomId: roomIdFilter } : {}),
    },
    orderBy: [{ startDateTime: "asc" }, { name: "asc" }],
    include: { prizes: { orderBy: { figure: "asc" } }, room: true },
  });

  type OccurrenceDraft = Omit<UpcomingOccurrence, "roundSequence" | "bingoRoundId">;
  const occurrences: OccurrenceDraft[] = [];

  for (const b of rows) {
    const runs = upcomingRunsForBingo({
      bingoId: b.id,
      name: b.name,
      bingoType: b.bingoType,
      cardPrice: b.cardPrice,
      startDateTime: b.startDateTime,
      endDateTime: b.endDateTime,
      repeatEveryMinutes: b.repeatEveryMinutes,
      now,
      horizonMs,
      maxRuns: perBingoMax,
    });
    const prizes: UpcomingPrize[] = b.prizes.map((p) => ({
      figure: p.figure,
      amount: p.amount.toString(),
      displayAmount: bingoPrizeDisplayAmount(b.prizeMode, p),
    }));

    for (const r of runs) {
      occurrences.push({
        bingoId: r.bingoId,
        name: b.name,
        bingoType: r.bingoType,
        prizeMode: b.prizeMode,
        cardPrice: r.cardPrice,
        startsAt: r.startsAt.toISOString(),
        startsAtMs: r.startsAt.getTime(),
        prizes,
      });
    }
  }

  occurrences.sort((a, b) => a.startsAtMs - b.startsAtMs);
  const trimmedRaw = occurrences.slice(0, maxTotal);

  let trimmed: UpcomingOccurrence[] = [];
  if (trimmedRaw.length > 0) {
    const pairSeen = new Set<string>();
    const orPairs: Array<{ bingoId: string; startsAt: Date }> = [];
    for (const o of trimmedRaw) {
      const k = `${o.bingoId}:${o.startsAtMs}`;
      if (pairSeen.has(k)) continue;
      pairSeen.add(k);
      orPairs.push({ bingoId: o.bingoId, startsAt: new Date(o.startsAtMs) });
    }
    const rounds = await prisma.bingoRound.findMany({
      where: { OR: orPairs },
      select: { id: true, bingoId: true, startsAt: true, sequence: true },
    });
    const roundMeta = new Map(
      rounds.map(
        (r) =>
          [`${r.bingoId}:${r.startsAt.getTime()}`, { sequence: r.sequence, id: r.id }] as const,
      ),
    );
    trimmed = trimmedRaw.map((o) => {
      const meta = roundMeta.get(`${o.bingoId}:${o.startsAtMs}`);
      return {
        ...o,
        roundSequence: meta?.sequence ?? null,
        bingoRoundId: meta?.id ?? null,
      };
    });
  }

  /** Solo citas estrictamente futuras: evita que la ranura que acaba de empezar quede primera en la lista. */
  const nowMs = now.getTime();
  trimmed = trimmed.filter((o) => o.startsAtMs > nowMs);

  const next = trimmed.length ? trimmed[0]! : null;

  return {
    serverTime: now.toISOString(),
    next,
    upcoming: trimmed,
  };
}

/**
 * Shared payload for GET /backoffice/bingos/upcoming (auth) and GET /public/bingos/upcoming (no auth).
 * TTL configurable via `UPCOMING_CACHE_TTL_MS` (0 = disabled).
 */
export async function buildUpcomingPayload(
  q: Request["query"],
  nowInput?: Date,
  options?: BuildUpcomingOptions,
): Promise<UpcomingPayload> {
  const ttl = env.upcomingCacheTtlMs;
  if (ttl <= 0) {
    return computeUpcomingPayload(q, nowInput, options);
  }
  const now = nowInput ?? new Date();
  const key = upcomingCacheKey(q, options, now.getTime());
  const hit = upcomingCache.get(key);
  if (hit && now.getTime() - hit.at < ttl) {
    return hit.payload;
  }
  const payload = await computeUpcomingPayload(q, now, options);
  upcomingCache.set(key, { at: now.getTime(), payload });
  return payload;
}
