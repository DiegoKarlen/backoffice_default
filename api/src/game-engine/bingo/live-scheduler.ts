import type { Request } from "express";
import { BingoDrawMode, BingoRoundStatus, BingoStatus, type BingoRound, type Prisma } from "@prisma/client";
import { BingoRoundCancelReason } from "../../lib/bingo-round-cancellation.js";
import { buildUpcomingPayload, type UpcomingOccurrence } from "../../lib/bingo-upcoming.js";
import { syncScheduledRoundsForBingo } from "../../lib/bingo-rounds-sync.js";
import { prisma } from "../../lib/prisma.js";
import {
  cancelRoundForMinCartons,
  cancelScheduledRound,
  countSoldCartons,
  isTerminalRoundStatus,
  promoteRoundToDrawing,
} from "../../lib/bingo-round-kickoff.js";
import { refundCartonPurchasesForCancelledRound } from "../../services/round-cancellation-refund.js";
import { bingoPrizeDisplayAmount } from "../../lib/bingo-prize-display.js";
import { createBallQueue } from "./registry.js";
import { IDLE_POLL_MS } from "./live-session-config.js";
import type { LiveSessionPhase, ScheduledDrawingRound } from "./live-session-types.js";

type ActiveBingoRow = Prisma.BingoGetPayload<{
  include: { prizes: { orderBy: { figure: "asc" } }; room: true };
}>;

export type LiveSchedulerHost = {
  readonly roomId: string;
  getPhase(): LiveSessionPhase;
  getSnapshot(): unknown;
  broadcast(event: string, data: unknown): void;
  startDrawingRound(ctx: ScheduledDrawingRound): Promise<void>;
};

/**
 * Idle-phase scheduling: upcoming occurrences, kick timers, and round kickoff (DB).
 */
export class BingoLiveScheduler {
  private kickTimer: ReturnType<typeof setTimeout> | null = null;
  private idlePollTimer: ReturnType<typeof setTimeout> | null = null;

  private lastPlayedStartsAtMs: number | null = null;
  private nextKick: UpcomingOccurrence | null = null;
  private followingKick: UpcomingOccurrence | null = null;

  constructor(private readonly host: LiveSchedulerHost) {}

  getNextKick(): UpcomingOccurrence | null {
    return this.nextKick;
  }

  getFollowingKick(): UpcomingOccurrence | null {
    return this.followingKick;
  }

  clearKickTimer(): void {
    if (this.kickTimer) {
      clearTimeout(this.kickTimer);
      this.kickTimer = null;
    }
  }

  clearIdlePollTimer(): void {
    if (this.idlePollTimer) {
      clearTimeout(this.idlePollTimer);
      this.idlePollTimer = null;
    }
  }

  clearScheduleTimers(): void {
    this.clearKickTimer();
    this.clearIdlePollTimer();
  }

  resetScheduleState(): void {
    this.clearScheduleTimers();
    this.nextKick = null;
    this.followingKick = null;
    this.lastPlayedStartsAtMs = null;
  }

  bootstrap(): void {
    void this.scheduleNextWake();
  }

  refreshIdleSchedule(): void {
    if (this.host.getPhase() !== "idle") return;
    void this.scheduleNextWake();
  }

  async refreshFollowingKick(afterStartsAtMs: number): Promise<void> {
    const payload = await buildUpcomingPayload(
      { limit: "500", horizonDays: "60" } as Request["query"],
      new Date(),
      { roomId: this.host.roomId },
    );
    this.followingKick = payload.upcoming.find((o) => o.startsAtMs > afterStartsAtMs) ?? null;
  }

  private markPlayedAndReschedule(startsAtMs: number): void {
    this.lastPlayedStartsAtMs = startsAtMs;
    void this.scheduleNextWake();
  }

  async scheduleNextWake(): Promise<void> {
    this.clearKickTimer();
    this.clearIdlePollTimer();
    this.nextKick = null;
    this.followingKick = null;

    const payload = await buildUpcomingPayload(
      { limit: "500", horizonDays: "60" } as Request["query"],
      new Date(),
      { roomId: this.host.roomId },
    );

    const last = this.lastPlayedStartsAtMs;
    const cand = payload.upcoming.filter((o) => last == null || o.startsAtMs > last);

    if (!cand.length) {
      this.host.broadcast("idle", {
        message: "Sin ocurrencias futuras en el horizonte — revisá bingos ACTIVE y ventana horaria.",
      });
      this.host.broadcast("state", this.host.getSnapshot());
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

    this.host.broadcast("state", this.host.getSnapshot());

    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      void this.beginScheduledRound(next);
    }, delay);
  }

  private async resolveActiveBingoForOccurrence(occ: UpcomingOccurrence): Promise<ActiveBingoRow | null> {
    const row = await prisma.bingo.findFirst({
      where: { id: occ.bingoId, status: BingoStatus.ACTIVE, roomId: this.host.roomId },
      include: { prizes: { orderBy: { figure: "asc" } }, room: true },
    });
    if (!row) return null;
    if (row.endDateTime && occ.startsAtMs > row.endDateTime.getTime()) return null;
    return row;
  }

  private async resolveOrCreateScheduledRound(
    bingoId: string,
    startsAtMs: number,
  ): Promise<BingoRound | null> {
    const startsAtDate = new Date(startsAtMs);
    let round = await prisma.bingoRound.findFirst({
      where: { bingoId, startsAt: startsAtDate },
    });

    if (!round) {
      await syncScheduledRoundsForBingo(bingoId);
      round = await prisma.bingoRound.findFirst({
        where: { bingoId, startsAt: startsAtDate },
      });
    }

    if (!round) {
      const maxSeq = await prisma.bingoRound.aggregate({
        where: { bingoId },
        _max: { sequence: true },
      });
      const sequence = (maxSeq._max.sequence ?? 0) + 1;
      try {
        round = await prisma.bingoRound.create({
          data: {
            bingoId,
            sequence,
            startsAt: startsAtDate,
            status: BingoRoundStatus.SCHEDULED,
          },
        });
      } catch {
        round = await prisma.bingoRound.findFirst({
          where: { bingoId, startsAt: startsAtDate },
        });
      }
    }

    return round;
  }

  private async cancelRoundForRoomDrawOverlap(
    occ: UpcomingOccurrence,
    row: ActiveBingoRow,
    round: BingoRound,
  ): Promise<void> {
    if (round.status !== BingoRoundStatus.SCHEDULED) {
      this.markPlayedAndReschedule(occ.startsAtMs);
      return;
    }

    const cancelled = await cancelScheduledRound(
      round.id,
      BingoRoundCancelReason.ROOM_DRAW_IN_PROGRESS,
    );
    if (!cancelled) {
      this.markPlayedAndReschedule(occ.startsAtMs);
      return;
    }

    let refundSummary: Awaited<ReturnType<typeof refundCartonPurchasesForCancelledRound>> | null = null;
    let refundError: string | null = null;
    try {
      refundSummary = await refundCartonPurchasesForCancelledRound(round.id);
    } catch (e) {
      refundError = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[live-scheduler] refund after room overlap cancel failed", e);
    }

    this.lastPlayedStartsAtMs = occ.startsAtMs;
    this.host.broadcast("round_cancelled", {
      reason: "room_draw_in_progress",
      roundId: round.id,
      bingoId: row.id,
      bingoName: row.name,
      startsAt: occ.startsAt,
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
  }

  async beginScheduledRound(occ: UpcomingOccurrence): Promise<void> {
    const row = await this.resolveActiveBingoForOccurrence(occ);
    if (!row) {
      this.markPlayedAndReschedule(occ.startsAtMs);
      return;
    }

    const round = await this.resolveOrCreateScheduledRound(row.id, occ.startsAtMs);
    if (!round) {
      this.markPlayedAndReschedule(occ.startsAtMs);
      return;
    }

    if (isTerminalRoundStatus(round.status)) {
      this.markPlayedAndReschedule(occ.startsAtMs);
      return;
    }

    if (round.status === BingoRoundStatus.DRAWING) {
      this.markPlayedAndReschedule(occ.startsAtMs);
      return;
    }

    if (this.host.getPhase() === "drawing") {
      await this.cancelRoundForRoomDrawOverlap(occ, row, round);
      return;
    }

    const cartonCount = await countSoldCartons(round.id);
    if (cartonCount < row.minPlayersToStart) {
      const cancelled = await cancelRoundForMinCartons(round.id);
      if (!cancelled) {
        this.markPlayedAndReschedule(occ.startsAtMs);
        return;
      }
      let refundSummary: Awaited<ReturnType<typeof refundCartonPurchasesForCancelledRound>> | null = null;
      let refundError: string | null = null;
      try {
        refundSummary = await refundCartonPurchasesForCancelledRound(round.id);
      } catch (e) {
        refundError = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error("[live-scheduler] refund after round cancel failed", e);
      }
      this.lastPlayedStartsAtMs = occ.startsAtMs;
      this.host.broadcast("round_cancelled", {
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
      this.markPlayedAndReschedule(occ.startsAtMs);
      return;
    }

    this.lastPlayedStartsAtMs = occ.startsAtMs;
    this.nextKick = null;

    await this.host.startDrawingRound({
      occ: { startsAt: occ.startsAt, startsAtMs: occ.startsAtMs },
      round: { id: round.id, sequence: round.sequence },
      bingo: {
        id: row.id,
        name: row.name,
        bingoType: row.bingoType,
        drawMode: row.drawMode,
        prizeMode: row.prizeMode,
        prizes: row.prizes.map((p) => ({
          figure: p.figure,
          amount: p.amount.toString(),
          displayAmount: bingoPrizeDisplayAmount(row.prizeMode, p),
        })),
      },
      ballQueue: row.drawMode === BingoDrawMode.VIRTUAL ? createBallQueue(row.bingoType) : [],
    });

    await this.refreshFollowingKick(occ.startsAtMs);
  }

  continueAfterRoundEnd(): void {
    void this.scheduleNextWake();
  }
}
