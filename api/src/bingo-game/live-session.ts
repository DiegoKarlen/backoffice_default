import type { Request, Response } from "express";
import { BingoRoundStatus, BingoStatus, type BingoFigure, type BingoType } from "@prisma/client";
import { buildUpcomingPayload, type UpcomingOccurrence } from "../lib/bingo-upcoming.js";
import { syncScheduledRoundsForBingo } from "../lib/bingo-rounds-sync.js";
import { prisma } from "../lib/prisma.js";
import { ballCountForType, createBallQueue } from "./engine.js";

type Phase = "idle" | "drawing";

function envMs(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

let drawIntervalMs = envMs("BINGO_DRAW_INTERVAL_MS", 2200);
if (drawIntervalMs < 300) drawIntervalMs = 300;

/** Si no hay ocurrencias en horizonte, reconsultar la agenda cada tantos ms. */
const IDLE_POLL_MS = envMs("BINGO_SCHEDULER_POLL_MS", 60_000);

type SseClient = Response;

export type LiveSnapshot = {
  phase: Phase;
  serverTime: string;
  drawIntervalMs: number;
  /** Sala de esta sesión (broadcast independiente por URL). */
  roomSlug: string;
  roomTitle: string;
  /** Próximo inicio programado según BD (ACTIVE + startDateTime + repeat). */
  nextScheduledAt: string | null;
  nextName: string | null;
  current: null | {
    bingoId: string;
    /** Partida persistida (cartones / bolas). */
    roundId: string;
    /** Número de partida dentro del bingo — UI “PARTIDA #N”. */
    roundSequence: number;
    name: string;
    bingoType: BingoType;
    drawn: number[];
    lastBall: number | null;
    remainingInQueue: number;
    /** Números aún en bolsa (orden ascendente; solo para visualización). */
    remainingBallNumbers: number[];
    totalBalls: number;
    progress: number;
    /** Instantáneo de agenda de esta ronda (ISO). */
    scheduledStartsAt: string;
    /** Premios configurados en el bingo (figura + monto). */
    prizes: Array<{ figure: BingoFigure; amount: string }>;
  };
};

const sessions = new Map<string, BingoLiveSession>();

class BingoLiveSession {
  private phase: Phase = "idle";
  private drawTimer: ReturnType<typeof setInterval> | null = null;
  private kickTimer: ReturnType<typeof setTimeout> | null = null;
  private idlePollTimer: ReturnType<typeof setTimeout> | null = null;

  private bingoId: string | null = null;
  /** Resolved label for UI (Room.name fallback Bingo.name). */
  private displayLine: string | null = null;
  private bingoType: BingoType | null = null;
  private scheduledStartsAt: string | null = null;
  private currentPrizes: Array<{ figure: BingoFigure; amount: string }> | null = null;
  private queue: number[] = [];
  private drawn: number[] = [];

  /** Último cupo de agenda ya iniciado (evita repetir el mismo slot). */
  private lastPlayedStartsAtMs: number | null = null;

  /** Si el horario de una partida cayó durante otra, se encola una sola. */
  private pendingOcc: UpcomingOccurrence | null = null;

  /** Próximo evento que estamos esperando (para snapshot / UI). */
  private nextKick: UpcomingOccurrence | null = null;

  private currentRoundId: string | null = null;
  private currentRoundSequence: number | null = null;

  private sseClients = new Set<SseClient>();

  constructor(
    private readonly roomId: string,
    private readonly roomSlug: string,
    private readonly roomTitle: string,
  ) {}

  private clearDrawTimer(): void {
    if (this.drawTimer) {
      clearInterval(this.drawTimer);
      this.drawTimer = null;
    }
  }

  private clearKickTimer(): void {
    if (this.kickTimer) {
      clearTimeout(this.kickTimer);
      this.kickTimer = null;
    }
  }

  private clearIdlePollTimer(): void {
    if (this.idlePollTimer) {
      clearTimeout(this.idlePollTimer);
      this.idlePollTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearDrawTimer();
    this.clearKickTimer();
    this.clearIdlePollTimer();
  }

  getSnapshot(): LiveSnapshot {
    const total = this.bingoType ? ballCountForType(this.bingoType) : 0;
    const progress = total ? this.drawn.length / total : 0;
    const id = this.bingoId;
    const label = this.displayLine;
    const btype = this.bingoType;
    const sched = this.scheduledStartsAt;
    const prizes = this.currentPrizes ?? [];
    const roundId = this.currentRoundId;
    const hasCtx =
      this.phase === "drawing" &&
      id &&
      label &&
      btype &&
      sched &&
      roundId != null &&
      this.currentRoundSequence != null;
    return {
      phase: this.phase,
      serverTime: new Date().toISOString(),
      drawIntervalMs,
      roomSlug: this.roomSlug,
      roomTitle: this.roomTitle,
      nextScheduledAt: this.nextKick?.startsAt ?? null,
      nextName: this.nextKick?.name ?? null,
      current:
        !hasCtx
          ? null
          : {
              bingoId: id,
              roundId,
              roundSequence: this.currentRoundSequence!,
              name: label,
              bingoType: btype,
              drawn: [...this.drawn],
              lastBall: this.drawn.length ? this.drawn[this.drawn.length - 1]! : null,
              remainingInQueue: this.queue.length,
              remainingBallNumbers: [...this.queue].sort((a, b) => a - b),
              totalBalls: total,
              progress,
              scheduledStartsAt: sched,
              prizes,
            },
    };
  }

  private sseWrite(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private broadcast(event: string, data: unknown): void {
    const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.sseClients) {
      try {
        res.write(line);
      } catch {
        this.sseClients.delete(res);
      }
    }
  }

  /** Programa el siguiente inicio según agenda filtrada por esta sala. */
  private async scheduleNextWake(): Promise<void> {
    this.clearKickTimer();
    this.clearIdlePollTimer();
    this.nextKick = null;

    const payload = await buildUpcomingPayload(
      { limit: "500", horizonDays: "60" } as Request["query"],
      new Date(),
      { roomId: this.roomId },
    );

    const last = this.lastPlayedStartsAtMs;
    const cand = payload.upcoming.filter((o) => last == null || o.startsAtMs > last);

    if (!cand.length) {
      this.phase = "idle";
      this.broadcast("idle", {
        message: "Sin ocurrencias futuras en el horizonte — revisá bingos ACTIVE y ventana horaria.",
      });
      this.broadcast("state", this.getSnapshot());
      this.idlePollTimer = setTimeout(() => {
        this.idlePollTimer = null;
        void this.scheduleNextWake();
      }, IDLE_POLL_MS);
      return;
    }

    const now = Date.now();
    const next = cand.find((o) => o.startsAtMs >= now) ?? cand[0]!;
    this.nextKick = next;
    const delay = Math.max(0, next.startsAtMs - now);

    this.broadcast("state", this.getSnapshot());

    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      void this.beginScheduledRound(next);
    }, delay);
  }

  private async beginScheduledRound(occ: UpcomingOccurrence): Promise<void> {
    if (this.phase === "drawing") {
      this.pendingOcc = occ;
      return;
    }

    const row = await prisma.bingo.findFirst({
      where: { id: occ.bingoId, status: BingoStatus.ACTIVE, roomId: this.roomId },
      include: { prizes: { orderBy: { figure: "asc" } }, room: true },
    });

    if (!row) {
      this.lastPlayedStartsAtMs = occ.startsAtMs;
      void this.scheduleNextWake();
      return;
    }

    if (row.endDateTime && occ.startsAtMs > row.endDateTime.getTime()) {
      this.lastPlayedStartsAtMs = occ.startsAtMs;
      void this.scheduleNextWake();
      return;
    }

    const startsAtDate = new Date(occ.startsAtMs);
    let round = await prisma.bingoRound.findFirst({
      where: { bingoId: row.id, startsAt: startsAtDate },
    });

    if (!round) {
      await syncScheduledRoundsForBingo(row.id);
      round = await prisma.bingoRound.findFirst({
        where: { bingoId: row.id, startsAt: startsAtDate },
      });
    }

    if (!round) {
      const maxSeq = await prisma.bingoRound.aggregate({
        where: { bingoId: row.id },
        _max: { sequence: true },
      });
      const sequence = (maxSeq._max.sequence ?? 0) + 1;
      try {
        round = await prisma.bingoRound.create({
          data: {
            bingoId: row.id,
            sequence,
            startsAt: startsAtDate,
            status: BingoRoundStatus.DRAWING,
          },
        });
      } catch {
        round = await prisma.bingoRound.findFirst({
          where: { bingoId: row.id, startsAt: startsAtDate },
        });
        if (round) {
          await prisma.bingoRound.update({
            where: { id: round.id },
            data: { status: BingoRoundStatus.DRAWING },
          });
        }
      }
    } else if (round.status !== BingoRoundStatus.DRAWING) {
      await prisma.bingoRound.update({
        where: { id: round.id },
        data: { status: BingoRoundStatus.DRAWING },
      });
    }

    if (!round) {
      this.lastPlayedStartsAtMs = occ.startsAtMs;
      void this.scheduleNextWake();
      return;
    }

    this.lastPlayedStartsAtMs = occ.startsAtMs;
    this.currentRoundId = round.id;
    this.currentRoundSequence = round.sequence;
    this.bingoId = row.id;
    this.displayLine = row.room?.name ?? row.name;
    this.bingoType = row.bingoType;
    this.scheduledStartsAt = occ.startsAt;
    this.currentPrizes = row.prizes.map((p) => ({ figure: p.figure, amount: p.amount.toString() }));
    this.queue = createBallQueue(row.bingoType);
    this.drawn = [];
    this.phase = "drawing";
    this.nextKick = null;

    this.broadcast("round_start", {
      bingoId: row.id,
      roundId: round.id,
      roundSequence: round.sequence,
      name: this.displayLine,
      bingoType: row.bingoType,
      totalBalls: ballCountForType(row.bingoType),
      scheduledStartsAt: occ.startsAt,
    });
    this.broadcast("state", this.getSnapshot());

    this.clearDrawTimer();
    this.drawTimer = setInterval(() => this.tickDraw(), drawIntervalMs);
    this.tickDraw();
  }

  private endRound(): void {
    this.clearDrawTimer();
    const finishedRoundId = this.currentRoundId;
    if (finishedRoundId) {
      void prisma.bingoRound
        .update({
          where: { id: finishedRoundId },
          data: { status: BingoRoundStatus.COMPLETED },
        })
        .catch(console.error);
    }

    this.phase = "idle";
    this.broadcast("round_end", {
      bingoId: this.bingoId,
      roundId: finishedRoundId,
      roundSequence: this.currentRoundSequence,
      name: this.displayLine,
      bingoType: this.bingoType,
      ballsCalled: this.drawn.length,
      drawn: [...this.drawn],
      scheduledStartsAt: this.scheduledStartsAt,
    });

    this.currentRoundId = null;
    this.currentRoundSequence = null;
    this.bingoId = null;
    this.displayLine = null;
    this.bingoType = null;
    this.scheduledStartsAt = null;
    this.currentPrizes = null;
    this.queue = [];
    this.drawn = [];

    this.broadcast("state", this.getSnapshot());

    const pending = this.pendingOcc;
    this.pendingOcc = null;
    if (pending) {
      void this.beginScheduledRound(pending);
    } else {
      void this.scheduleNextWake();
    }
  }

  private tickDraw(): void {
    if (this.phase !== "drawing" || !this.bingoType) return;
    const ball = this.queue.shift();
    if (ball === undefined) {
      this.endRound();
      return;
    }
    this.drawn.push(ball);
    const rid = this.currentRoundId;
    if (rid) {
      void prisma.bingoRoundBall
        .create({
          data: {
            roundId: rid,
            drawOrder: this.drawn.length,
            number: ball,
          },
        })
        .catch(console.error);
    }
    this.broadcast("ball", {
      ball,
      drawn: [...this.drawn],
      remainingInQueue: this.queue.length,
      bingoId: this.bingoId,
      name: this.displayLine,
      bingoType: this.bingoType,
    });
    this.broadcast("state", this.getSnapshot());
    if (this.queue.length === 0) {
      this.endRound();
    }
  }

  bootstrap(): void {
    void this.scheduleNextWake();
  }

  /**
   * Relee la agenda desde BD y reprograma el countdown en idle.
   * Sin esto, un `kickTimer` largo deja UI obsoleta si el bingo se edita/desactiva antes (misma sala: lista vacía vs contador).
   */
  refreshIdleSchedule(): void {
    if (this.phase !== "idle") return;
    void this.scheduleNextWake();
  }

  requestStop(): void {
    if (this.currentRoundId && this.phase === "drawing") {
      void prisma.bingoRound
        .update({
          where: { id: this.currentRoundId },
          data: { status: BingoRoundStatus.CANCELLED },
        })
        .catch(console.error);
    }
    this.clearTimers();
    this.phase = "idle";
    this.pendingOcc = null;
    this.nextKick = null;
    this.lastPlayedStartsAtMs = null;
    this.currentRoundId = null;
    this.currentRoundSequence = null;
    this.bingoId = null;
    this.displayLine = null;
    this.bingoType = null;
    this.scheduledStartsAt = null;
    this.currentPrizes = null;
    this.queue = [];
    this.drawn = [];
    this.broadcast("idle", { message: "Sesión detenida manualmente" });
    this.broadcast("state", this.getSnapshot());
  }

  attachSse(req: Request, res: Response): void {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    this.sseClients.add(res);
    this.sseWrite(res, "state", this.getSnapshot());

    const onClose = () => {
      this.sseClients.delete(res);
      req.off("close", onClose);
    };
    req.on("close", onClose);
  }
}

/** Crea y arranca la sesión en vivo para una sala (un scheduler por roomId). */
export function registerLiveSession(room: { id: string; slug: string; name: string }): BingoLiveSession {
  let s = sessions.get(room.id);
  if (s) return s;
  s = new BingoLiveSession(room.id, room.slug, room.name);
  sessions.set(room.id, s);
  s.bootstrap();
  return s;
}

export function getLiveSession(roomId: string): BingoLiveSession | undefined {
  return sessions.get(roomId);
}

export async function ensureLiveSessionForRoom(roomId: string): Promise<BingoLiveSession> {
  let s = sessions.get(roomId);
  if (s) return s;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new Error("Room not found");
  return registerLiveSession(room);
}

/** Tras crear/editar/desactivar/borrar un bingo: sincroniza el scheduler en memoria con la BD (solo en idle). */
export function rescheduleLiveSessionForRoom(roomId: string): void {
  const s = sessions.get(roomId);
  if (!s) return;
  s.refreshIdleSchedule();
}

void prisma.room.findMany().then((rooms) => {
  for (const r of rooms) {
    registerLiveSession(r);
  }
});
