import { publicBingosPath } from "./config.js";

export type BingoFigure = "LINE" | "PERIMETER" | "FULL_HOUSE";

export type OccurrencePrize = {
  figure: BingoFigure;
  amount: string;
};

export type Occurrence = {
  bingoId: string;
  roomName: string;
  bingoType: string;
  cardPrice: string;
  startsAt: string;
  startsAtMs: number;
  prizes: OccurrencePrize[];
};

export type UpcomingResponse = {
  serverTime: string;
  next: Occurrence | null;
  upcoming: Occurrence[];
};

export type LivePhase = "idle" | "drawing";

export type LiveSnapshot = {
  phase: LivePhase;
  serverTime: string;
  drawIntervalMs: number;
  nextScheduledAt: string | null;
  nextRoomName: string | null;
  current: null | {
    bingoId: string;
    roomName: string;
    bingoType: string;
    drawn: number[];
    lastBall: number | null;
    remainingInQueue: number;
    remainingBallNumbers: number[];
    totalBalls: number;
    progress: number;
    scheduledStartsAt: string;
    prizes: OccurrencePrize[];
  };
};

export async function fetchUpcoming(params?: { limit?: number; horizonDays?: number }): Promise<UpcomingResponse> {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.horizonDays != null) q.set("horizonDays", String(params.horizonDays));
  const qs = q.toString();
  const url = `${publicBingosPath("/upcoming")}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Upcoming: ${res.status}`);
  return res.json() as Promise<UpcomingResponse>;
}

export async function fetchLiveSnapshot(): Promise<LiveSnapshot> {
  const url = publicBingosPath("/live/state");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Live: ${res.status}`);
  return res.json() as Promise<LiveSnapshot>;
}

/** URL absoluta o relativa para `EventSource` (mismo origen con proxy Vite). */
export function liveEventsUrl(): string {
  return publicBingosPath("/live/events");
}
