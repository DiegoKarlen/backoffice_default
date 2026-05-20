import type { Request, Response } from "express";
import { BingoRoundStatus, BingoStatus, type BingoFigure, type BingoType, PrizePayoutMode } from "@prisma/client";
import { buildUpcomingPayload, type UpcomingOccurrence } from "../../lib/bingo-upcoming.js";
import { syncScheduledRoundsForBingo } from "../../lib/bingo-rounds-sync.js";
import { prisma } from "../../lib/prisma.js";
import { BingoRoundCancelReason } from "../../lib/bingo-round-cancellation.js";
import {
  cancelRoundForMinCartons,
  countSoldCartons,
  isTerminalRoundStatus,
  promoteRoundToDrawing,
} from "../../lib/bingo-round-kickoff.js";
import { refundCartonPurchasesForCancelledRound } from "../../services/round-cancellation-refund.js";
import { settleDeferredSplitPrizesForRound } from "../../services/settle-deferred-split-prizes.js";
import { ballCountForType, createBallQueue, getBingoEngine } from "./registry.js";

type Phase = "idle" | "drawing";

function envMs(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

let drawIntervalMs = envMs("BINGO_DRAW_INTERVAL_MS", 2200);
if (drawIntervalMs < 300) drawIntervalMs = 300;

const ROUND_COUNTDOWN_UI_MS = 5400;
const ROUND_POST_COUNTDOWN_WAIT_MS = envMs(
  "BINGO_ROUND_POST_COUNTDOWN_WAIT_MS",
  envMs("BINGO_ROUND_BOLILLERO_BEAT_MS", 2000),
);
const ROUND_INTRO_MS = envMs(
  "BINGO_ROUND_INTRO_MS",
  ROUND_COUNTDOWN_UI_MS + ROUND_POST_COUNTDOWN_WAIT_MS,
);

const IDLE_POLL_MS = envMs("BINGO_SCHEDULER_POLL_MS", 60_000);

type SseClient = Response;

export type LiveSnapshot = {
  phase: Phase;
  serverTime: string;
  drawIntervalMs: number;
  roomSlug: string;
  roomTitle: string;
  nextScheduledAt: string | null;
  nextName: string | null;
  current: null | {
    bingoId: string;
    roundId: string;
    roundSequence: number;
    name: string;
    bingoType: BingoType;
    drawn: number[];
    lastBall: number | null;
    remainingInQueue: number;
    remainingBallNumbers: number[];
    totalBalls: number;
    progress: number;
    scheduledStartsAt: string;
    prizes: Array<{ figure: BingoFigure; amount: string }>;
  };
};

const sessions = new Map<string, BingoLiveSession>();

class BingoLiveSession {
  private phase: Phase = "idle";
  private drawTimer: ReturnType<typeof setTimeout> | null = null;
  private roundIntroTimeout: ReturnType<typeof setTimeout> | null = null;
  private kickTimer: ReturnType<typeof setTimeout> | null = null;
  private idlePollTimer: ReturnType<typeof setTimeout> | null = null;

  private bingoId: string | null = null;
  private displayLine: string | null = null;
  private bingoType: BingoType | null = null;
  private scheduledStartsAt: string | null = null;
  private currentPrizes: Array<{ figure: BingoFigure; amount: string }> | null = null;
  private queue: number[] = [];
  private drawn: number[] = [];

  private lastPlayedStartsAtMs: number | null = null;
  private pendingOcc: UpcomingOccurrence | null = null;
  private nextKick: UpcomingOccurrence | null = null;
  private followingKick: UpcomingOccurrence | null = null;

  private currentRoundId: string | null = null;
  private currentRoundSequence: number | null = null;

  private sseClients = new Set<SseClient>();

  constructor(
    private readonly roomId: string,
    private readonly roomSlug: string,
    private readonly roomTitle: string,
  ) {}

  private clearRoundIntroTimeout(): void {
    if (this.roundIntroTimeout) {
      clearTimeout(this.roundIntroTimeout);
      this.roundIntroTimeout = null;
    }
  }

  private clearDrawTimer(): void {
    this.clearRoundIntroTimeout();
    if (this.drawTimer) {
      clearTimeout(this.drawTimer);
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
    const nextSched =
      this.phase === "drawing" ? this.followingKick?.startsAt ?? null : this.nextKick?.startsAt ?? null;
    const nextNm =
      this.phase === "drawing" ? this.followingKick?.name ?? null : this.nextKick?.name ?? null;

    return {
      phase: this.phase,
      serverTime: new Date().toISOString(),
      drawIntervalMs,
      roomSlug: this.roomSlug,
      roomTitle: this.roomTitle,
      nextScheduledAt: nextSched,
      nextName: nextNm,
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

  private async refreshFollowingKick(afterStartsAtMs: number): Promise<void> {
    const payload = await buildUpcomingPayload(
      { limit: "500", horizonDays: "60" } as Request["query"],
      new Date(),
      { roomId: this.roomId },
    );
    this.followingKick = payload.upcoming.find((o) => o.startsAtMs > afterStartsAtMs) ?? null;
  }

  private async scheduleNextWake(): Promise<void> {
    this.clearKickTimer();
    this.clearIdlePollTimer();
    this.nextKick = null;
    this.followingKick = null;

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
            status: BingoRoundStatus.SCHEDULED,
          },
        });
      } catch {
        round = await prisma.bingoRound.findFirst({
          where: { bingoId: row.id, startsAt: startsAtDate },
        });
      }
    }

    if (!round) {
      this.lastPlayedStartsAtMs = occ.startsAtMs;
      void this.scheduleNextWake();
      return;
    }

    if (isTerminalRoundStatus(round.status)) {
      this.lastPlayedStartsAtMs = occ.startsAtMs;
      void this.scheduleNextWake();
      return;
    }

    if (round.status === BingoRoundStatus.DRAWING) {
      this.lastPlayedStartsAtMs = occ.startsAtMs;
      void this.scheduleNextWake();
      return;
    }

    const cartonCount = await countSoldCartons(round.id);
    if (cartonCount < row.minPlayersToStart) {
      const cancelled = await cancelRoundForMinCartons(round.id);
      if (!cancelled) {
        this.lastPlayedStartsAtMs = occ.startsAtMs;
        void this.scheduleNextWake();
        return;
      }
      let refundSummary: Awaited<ReturnType<typeof refundCartonPurchasesForCancelledRound>> | null = null;
      let refundError: string | null = null;
      try {
        refundSummary = await refundCartonPurchasesForCancelledRound(round.id);
      } catch (e) {
        refundError = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error("[live-session] refund after round cancel failed", e);
      }
      this.lastPlayedStartsAtMs = occ.startsAtMs;
      this.broadcast("round_cancelled", {
        reason: "min_cartons_not_met",
        minRequired: row.minPlayersToStart,
        soldCartons: cartonCount,
        roundId: round.id,
        bingoId: row.id,
        refund: refundSummary
          ? {
              refundedPurchases: refundSummary.refundedPurchases,
              totalCentsRefunded: refundSummary.totalCentsRefunded,
              skippedAlreadyRefunded: refundSummary.skippedAlreadyRefunded,
            }
          : undefined,
        refundError: refundError ?? undefined,
      });
      void this.scheduleNextWake();
      return;
    }

    const promoted = await promoteRoundToDrawing(round.id);
    if (!promoted) {
      this.lastPlayedStartsAtMs = occ.startsAtMs;
      void this.scheduleNextWake();
      return;
    }

    this.lastPlayedStartsAtMs = occ.startsAtMs;
    this.currentRoundId = round.id;
    this.currentRoundSequence = round.sequence;
    this.bingoId = row.id;
    this.displayLine = row.name;
    this.bingoType = row.bingoType;
    this.scheduledStartsAt = occ.startsAt;
    this.currentPrizes = row.prizes.map((p) => ({ figure: p.figure, amount: p.amount.toString() }));
    this.queue = createBallQueue(row.bingoType);
    this.drawn = [];
    this.phase = "drawing";
    this.nextKick = null;
    await this.refreshFollowingKick(occ.startsAtMs);

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
    this.roundIntroTimeout = setTimeout(() => {
      this.roundIntroTimeout = null;
      this.tickDraw();
    }, ROUND_INTRO_MS);
  }

  private endRound(): void {
    this.clearDrawTimer();

    const finishedRoundId = this.currentRoundId;
    const bingoIdSnap = this.bingoId;
    const roundSequenceSnap = this.currentRoundSequence;
    const displayLineSnap = this.displayLine;
    const bingoTypeSnap = this.bingoType;
    const scheduledStartsAtSnap = this.scheduledStartsAt;
    const drawnSnap = [...this.drawn];

    this.phase = "idle";

    this.currentRoundId = null;
    this.currentRoundSequence = null;
    this.bingoId = null;
    this.displayLine = null;
    this.bingoType = null;
    this.scheduledStartsAt = null;
    this.currentPrizes = null;
    this.queue = [];
    this.drawn = [];
    this.followingKick = null;

    const pending = this.pendingOcc;
    this.pendingOcc = null;

    void (async () => {
      try {
        if (finishedRoundId && bingoIdSnap) {
          const bingo = await prisma.bingo.findUnique({
            where: { id: bingoIdSnap },
            select: { prizePayoutMode: true },
          });
          if (bingo?.prizePayoutMode === PrizePayoutMode.DEFERRED_SPLIT_AT_ROUND_END) {
            await settleDeferredSplitPrizesForRound({ bingoRoundId: finishedRoundId });
          }
        }
        if (finishedRoundId) {
          await prisma.bingoRound.update({
            where: { id: finishedRoundId },
            data: { status: BingoRoundStatus.COMPLETED },
          });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[live-session] finalize round (settle + COMPLETED) failed", e);
        if (finishedRoundId) {
          await prisma.bingoRound
            .update({
              where: { id: finishedRoundId },
              data: { status: BingoRoundStatus.COMPLETED },
            })
            .catch(() => {});
        }
      }

      this.broadcast("round_end", {
        bingoId: bingoIdSnap,
        roundId: finishedRoundId,
        roundSequence: roundSequenceSnap,
        name: displayLineSnap,
        bingoType: bingoTypeSnap,
        ballsCalled: drawnSnap.length,
        drawn: drawnSnap,
        scheduledStartsAt: scheduledStartsAtSnap,
      });
      this.broadcast("state", this.getSnapshot());

      if (pending) {
        void this.beginScheduledRound(pending);
      } else {
        void this.scheduleNextWake();
      }
    })();
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

    const btype = this.bingoType;
    if (rid && this.bingoId) {
      void this.afterBall({
        bingoId: this.bingoId,
        roundIdSnapshot: rid,
        drawnSnapshot: [...this.drawn],
        bingoType: btype,
      });
      return;
    }

    if (this.queue.length === 0) {
      this.endRound();
    } else {
      this.scheduleNextDrawTick();
    }
  }

  private scheduleNextDrawTick(): void {
    if (this.phase !== "drawing") return;
    if (this.drawTimer) {
      clearTimeout(this.drawTimer);
      this.drawTimer = null;
    }
    this.drawTimer = setTimeout(() => {
      this.drawTimer = null;
      this.tickDraw();
    }, drawIntervalMs);
  }

  private async afterBall(params: {
    bingoId: string;
    roundIdSnapshot: string;
    drawnSnapshot: number[];
    bingoType: BingoType;
  }): Promise<void> {
    const engine = getBingoEngine(params.bingoType);
    try {
      const shouldEndRound = await engine.evaluateAfterBall({
        bingoRoundId: params.roundIdSnapshot,
        bingoId: params.bingoId,
        drawnNumbers: params.drawnSnapshot,
        onPrizeCredited: (payload) => {
          this.broadcast("prize_awarded", payload);
        },
      });
      if (this.phase !== "drawing") return;
      if (shouldEndRound) {
        this.queue = [];
        this.endRound();
        return;
      }
      if (this.queue.length === 0) {
        this.endRound();
        return;
      }
      this.scheduleNextDrawTick();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[live-session] afterBall", params.bingoType, err);
      if (this.phase === "drawing" && this.queue.length > 0) {
        this.scheduleNextDrawTick();
      } else if (this.phase === "drawing") {
        this.endRound();
      }
    }
  }

  bootstrap(): void {
    void this.scheduleNextWake();
  }

  refreshIdleSchedule(): void {
    if (this.phase !== "idle") return;
    void this.scheduleNextWake();
  }

  requestStop(): void {
    const rid = this.currentRoundId;
    if (rid && this.phase === "drawing") {
      void prisma.deferredRoundPrizeWin
        .deleteMany({ where: { bingoRoundId: rid } })
        .catch((err) => console.error("[live-session] delete deferred wins on manual stop", err));
      void prisma.bingoRound
        .update({
          where: { id: rid },
          data: {
            status: BingoRoundStatus.CANCELLED,
            cancellationReason: BingoRoundCancelReason.MANUAL_STOP,
          },
        })
        .catch(console.error);
    }
    this.clearTimers();
    this.phase = "idle";
    this.pendingOcc = null;
    this.nextKick = null;
    this.followingKick = null;
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
