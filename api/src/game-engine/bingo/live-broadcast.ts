import type { Request, Response } from "express";
import { env } from "../../config/env.js";

export type SseClient = Response;

/**
 * SSE fan-out for a single bingo room session.
 */
export class LiveSessionBroadcaster {
  private readonly clients = new Set<SseClient>();

  attach(req: Request, res: Response, initialSnapshot: unknown): void {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    this.clients.add(res);
    this.write(res, "state", initialSnapshot);

    const onClose = () => {
      this.clients.delete(res);
      req.off("close", onClose);
    };
    req.on("close", onClose);
  }

  write(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  broadcast(event: string, data: unknown): void {
    const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) {
      try {
        res.write(line);
      } catch {
        this.clients.delete(res);
      }
    }
  }

  /** Optional lighter payload when `SSE_BALL_DELTA=1` (clients may ignore). */
  broadcastBallDrawn(number: number, ballPayload: unknown): void {
    this.broadcast("ball", ballPayload);
    if (env.sseBallDelta) {
      this.broadcast("ball_delta", { number });
    }
  }

  clientCount(): number {
    return this.clients.size;
  }
}
