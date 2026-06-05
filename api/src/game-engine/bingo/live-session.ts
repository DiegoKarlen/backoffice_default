import type { Request, Response } from "express";
import {
  BingoDrawMode,
  BingoPrizeMode,
  BingoRoundStatus,
  type BingoFigure,
  type BingoType,
} from "@prisma/client";
import { computePrizePayoutCents, computeRoundPrizePoolCents } from "../../lib/bingo-prize-pool.js";
import { prisma } from "../../lib/prisma.js";
import { BingoRoundCancelReason } from "../../lib/bingo-round-cancellation.js";
import { settleDeferredSplitPrizesForRound } from "../../services/settle-deferred-split-prizes.js";
import { ballCountForType, getBingoEngine } from "./registry.js";
import { liveSessionStore } from "./live-session-registry.js";
import { LiveSessionBroadcaster } from "./live-broadcast.js";
import { drawIntervalMs, ROUND_INTRO_MS } from "./live-session-config.js";
import type { LiveSessionPhase, LiveSnapshot, ScheduledDrawingRound } from "./live-session-types.js";
import { BingoLiveScheduler, type LiveSchedulerHost } from "./live-scheduler.js";
export type { LiveSnapshot, LiveSessionPhase } from "./live-session-types.js";

export class BingoLiveSession implements LiveSchedulerHost {
  readonly roomId: string;
  private phase: LiveSessionPhase = "idle";
  private drawTimer: ReturnType<typeof setTimeout> | null = null;
  private roundIntroTimeout: ReturnType<typeof setTimeout> | null = null;

  private bingoId: string | null = null;
  private displayLine: string | null = null;
  private bingoType: BingoType | null = null;
  private drawMode: BingoDrawMode = BingoDrawMode.VIRTUAL;
  private scheduledStartsAt: string | null = null;
  private currentPrizeMode: string | null = null;
  private currentPrizes: Array<{ figure: BingoFigure; amount: string; displayAmount: string }> | null =
    null;
  private queue: number[] = [];
  private drawn: number[] = [];

  private currentRoundId: string | null = null;
  private currentRoundSequence: number | null = null;
  private roundPoolCents = 0;

  private readonly broadcaster = new LiveSessionBroadcaster();
  private readonly scheduler: BingoLiveScheduler;

  constructor(
    roomId: string,
    private readonly roomSlug: string,
    private readonly roomTitle: string,
  ) {
    this.roomId = roomId;
    this.scheduler = new BingoLiveScheduler(this);
  }

  getPhase(): LiveSessionPhase {
    return this.phase;
  }

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

  private clearTimers(): void {
    this.clearDrawTimer();
    this.scheduler.clearScheduleTimers();
  }

  private mapPrizesForSnapshot(): Array<{
    figure: BingoFigure;
    amount: string;
    displayAmount: string;
    payoutCents: number;
  }> {
    const prizes = this.currentPrizes ?? [];
    const pool = this.roundPoolCents;
    const mode = (this.currentPrizeMode ?? BingoPrizeMode.FIXED) as BingoPrizeMode;
    return prizes.map((p) => ({
      figure: p.figure,
      amount: p.amount,
      displayAmount: p.displayAmount,
      payoutCents: computePrizePayoutCents(mode, { amount: p.amount }, pool),
    }));
  }

  private async refreshRoundPoolCents(): Promise<void> {
    const rid = this.currentRoundId;
    if (!rid) {
      this.roundPoolCents = 0;
      return;
    }
    this.roundPoolCents = await computeRoundPrizePoolCents(rid);
  }

  private remainingBallNumbersForSnapshot(): number[] {
    if (!this.bingoType) return [];
    if (this.drawMode === BingoDrawMode.VIRTUAL) {
      return [...this.queue].sort((a, b) => a - b);
    }
    const total = ballCountForType(this.bingoType);
    const drawnSet = new Set(this.drawn);
    const out: number[] = [];
    for (let n = 1; n <= total; n++) {
      if (!drawnSet.has(n)) out.push(n);
    }
    return out;
  }

  getSnapshot(): LiveSnapshot {
    const total = this.bingoType ? ballCountForType(this.bingoType) : 0;
    const progress = total ? this.drawn.length / total : 0;
    const id = this.bingoId;
    const label = this.displayLine;
    const btype = this.bingoType;
    const sched = this.scheduledStartsAt;
    const roundId = this.currentRoundId;
    const hasCtx =
      this.phase === "drawing" &&
      id &&
      label &&
      btype &&
      sched &&
      roundId != null &&
      this.currentRoundSequence != null;
    const nextOcc =
      this.phase === "drawing" ? this.scheduler.getFollowingKick() : this.scheduler.getNextKick();
    const nextSched = nextOcc?.startsAt ?? null;
    const nextNm = nextOcc?.name ?? null;
    const nextRoundSeq = nextOcc?.roundSequence ?? null;

    return {
      phase: this.phase,
      serverTime: new Date().toISOString(),
      drawIntervalMs,
      roomSlug: this.roomSlug,
      roomTitle: this.roomTitle,
      nextScheduledAt: nextSched,
      nextName: nextNm,
      nextRoundSequence: nextRoundSeq,
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
              remainingInQueue:
                this.drawMode === BingoDrawMode.VIRTUAL
                  ? this.queue.length
                  : this.remainingBallNumbersForSnapshot().length,
              remainingBallNumbers: this.remainingBallNumbersForSnapshot(),
              totalBalls: total,
              progress,
              scheduledStartsAt: sched,
              drawMode: this.drawMode,
              canMarkLiveBall: this.drawMode === BingoDrawMode.LIVE && this.phase === "drawing",
              prizeMode: this.currentPrizeMode ?? "FIXED",
              prizes: this.mapPrizesForSnapshot(),
            },
    };
  }

  broadcast(event: string, data: unknown): void {
    this.broadcaster.broadcast(event, data);
  }

  async startDrawingRound(ctx: ScheduledDrawingRound): Promise<void> {
    this.currentRoundId = ctx.round.id;
    this.currentRoundSequence = ctx.round.sequence;
    this.bingoId = ctx.bingo.id;
    this.displayLine = ctx.bingo.name;
    this.bingoType = ctx.bingo.bingoType;
    this.drawMode = ctx.bingo.drawMode;
    this.scheduledStartsAt = ctx.occ.startsAt;
    this.currentPrizeMode = ctx.bingo.prizeMode;
    this.currentPrizes = ctx.bingo.prizes;
    this.queue = [...ctx.ballQueue];
    this.drawn = [];
    this.phase = "drawing";
    await this.refreshRoundPoolCents();

    this.broadcast("round_start", {
      bingoId: ctx.bingo.id,
      roundId: ctx.round.id,
      roundSequence: ctx.round.sequence,
      name: this.displayLine,
      bingoType: ctx.bingo.bingoType,
      drawMode: ctx.bingo.drawMode,
      totalBalls: ballCountForType(ctx.bingo.bingoType),
      scheduledStartsAt: ctx.occ.startsAt,
    });
    this.broadcast("state", this.getSnapshot());

    this.clearDrawTimer();
    this.roundIntroTimeout = setTimeout(() => {
      this.roundIntroTimeout = null;
      if (this.drawMode === BingoDrawMode.VIRTUAL) {
        this.tickDraw();
      }
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
    this.drawMode = BingoDrawMode.VIRTUAL;
    this.scheduledStartsAt = null;
    this.currentPrizeMode = null;
    this.currentPrizes = null;
    this.roundPoolCents = 0;
    this.queue = [];
    this.drawn = [];

    void (async () => {
      try {
        if (finishedRoundId) {
          await settleDeferredSplitPrizesForRound({ bingoRoundId: finishedRoundId });
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

      this.scheduler.continueAfterRoundEnd();
    })();
  }

  private async commitDrawnBall(ball: number): Promise<void> {
    if (this.phase !== "drawing" || !this.bingoType) return;
    this.drawn.push(ball);
    const rid = this.currentRoundId;
    if (rid) {
      await prisma.bingoRoundBall
        .create({
          data: {
            roundId: rid,
            drawOrder: this.drawn.length,
            number: ball,
          },
        })
        .catch(console.error);
    }
    await this.refreshRoundPoolCents();
    this.broadcaster.broadcastBallDrawn(ball, {
      ball,
      drawn: [...this.drawn],
      remainingInQueue:
        this.drawMode === BingoDrawMode.VIRTUAL
          ? this.queue.length
          : this.remainingBallNumbersForSnapshot().length,
      bingoId: this.bingoId,
      name: this.displayLine,
      bingoType: this.bingoType,
    });
    this.broadcast("state", this.getSnapshot());

    const btype = this.bingoType;
    if (rid && this.bingoId) {
      await this.afterBall({
        bingoId: this.bingoId,
        roundIdSnapshot: rid,
        drawnSnapshot: [...this.drawn],
        bingoType: btype,
      });
    }
  }

  private tickDraw(): void {
    if (this.phase !== "drawing" || !this.bingoType || this.drawMode !== BingoDrawMode.VIRTUAL) return;
    const ball = this.queue.shift();
    if (ball === undefined) {
      this.endRound();
      return;
    }
    void this.commitDrawnBall(ball).then(() => {
      if (this.phase !== "drawing") return;
      if (this.queue.length === 0) {
        this.endRound();
      } else {
        this.scheduleNextDrawTick();
      }
    });
  }

  /** Operador en display (bingo Live): registra la bola que salió en el video. */
  async registerDrawnBall(ballNumber: number): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    if (this.phase !== "drawing") {
      return { ok: false, status: 409, error: "La partida ya finalizó; no se pueden marcar más bolas." };
    }
    if (this.drawMode !== BingoDrawMode.LIVE) {
      return { ok: false, status: 409, error: "Bingo is not in Live draw mode" };
    }
    if (!this.bingoType) {
      return { ok: false, status: 409, error: "Round context missing" };
    }
    const roundId = this.currentRoundId;
    if (!roundId) {
      return { ok: false, status: 409, error: "La partida ya finalizó; no se pueden marcar más bolas." };
    }
    const roundRow = await prisma.bingoRound.findUnique({
      where: { id: roundId },
      select: { status: true },
    });
    if (roundRow?.status !== BingoRoundStatus.DRAWING) {
      return { ok: false, status: 409, error: "La partida ya finalizó; no se pueden marcar más bolas." };
    }
    const total = ballCountForType(this.bingoType);
    if (!Number.isInteger(ballNumber) || ballNumber < 1 || ballNumber > total) {
      return { ok: false, status: 400, error: `Ball number must be between 1 and ${total}` };
    }
    if (this.drawn.includes(ballNumber)) {
      return { ok: false, status: 409, error: "Ball already drawn" };
    }
    await this.commitDrawnBall(ballNumber);
    return { ok: true };
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
      if (this.drawMode === BingoDrawMode.VIRTUAL) {
        if (this.queue.length === 0) {
          this.endRound();
          return;
        }
        this.scheduleNextDrawTick();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[live-session] afterBall", params.bingoType, err);
      if (this.phase !== "drawing") return;
      if (this.drawMode === BingoDrawMode.VIRTUAL && this.queue.length > 0) {
        this.scheduleNextDrawTick();
      } else if (this.drawMode === BingoDrawMode.VIRTUAL) {
        this.endRound();
      }
    }
  }

  bootstrap(): void {
    this.scheduler.bootstrap();
  }

  refreshIdleSchedule(): void {
    this.scheduler.refreshIdleSchedule();
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
    this.scheduler.resetScheduleState();
    this.currentRoundId = null;
    this.currentRoundSequence = null;
    this.bingoId = null;
    this.displayLine = null;
    this.bingoType = null;
    this.drawMode = BingoDrawMode.VIRTUAL;
    this.scheduledStartsAt = null;
    this.currentPrizeMode = null;
    this.currentPrizes = null;
    this.queue = [];
    this.drawn = [];
    this.broadcast("idle", { message: "Sesión detenida manualmente" });
    this.broadcast("state", this.getSnapshot());
  }

  attachSse(req: Request, res: Response): void {
    this.broadcaster.attach(req, res, this.getSnapshot());
  }
}

export function registerLiveSession(room: { id: string; slug: string; name: string }): BingoLiveSession {
  let s = liveSessionStore.get(room.id);
  if (s) return s;
  s = new BingoLiveSession(room.id, room.slug, room.name);
  liveSessionStore.set(room.id, s);
  s.bootstrap();
  return s;
}

export function getLiveSession(roomId: string): BingoLiveSession | undefined {
  return liveSessionStore.get(roomId);
}

export async function ensureLiveSessionForRoom(roomId: string): Promise<BingoLiveSession> {
  let s = liveSessionStore.get(roomId);
  if (s) return s;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new Error("Room not found");
  return registerLiveSession(room);
}

export function rescheduleLiveSessionForRoom(roomId: string): void {
  const s = liveSessionStore.get(roomId);
  if (!s) return;
  s.refreshIdleSchedule();
}

export async function registerDrawnBallForRoom(
  roomId: string,
  ballNumber: number,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const session = liveSessionStore.get(roomId);
  if (!session) {
    return { ok: false, status: 404, error: "Live session not found for room" };
  }
  return session.registerDrawnBall(ballNumber);
}

export { liveSessionStore, type LiveSessionStore } from "./live-session-registry.js";
