import { publicBingosPath } from "./config.js";

export type BingoFigure = "LINE" | "PERIMETER" | "FULL_HOUSE";

export type OccurrencePrize = {
  figure: BingoFigure;
  amount: string;
};

export type Occurrence = {
  bingoId: string;
  name: string;
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
  roomSlug: string;
  roomTitle: string;
  nextScheduledAt: string | null;
  nextName: string | null;
  current: null | {
    bingoId: string;
    roundId: string;
    roundSequence: number;
    name: string;
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

export type PublicRoom = {
  id: string;
  name: string;
  slug: string;
};

export async function fetchPublicRooms(): Promise<PublicRoom[]> {
  const url = publicBingosPath("/rooms");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Rooms: ${res.status}`);
  const data = (await res.json()) as { rooms: PublicRoom[] };
  return data.rooms ?? [];
}

export async function fetchUpcoming(params?: { limit?: number; horizonDays?: number }): Promise<UpcomingResponse> {
  const extra = new URLSearchParams();
  if (params?.limit != null) extra.set("limit", String(params.limit));
  if (params?.horizonDays != null) extra.set("horizonDays", String(params.horizonDays));
  const baseUrl = publicBingosPath("/upcoming");
  const sep = baseUrl.includes("?") ? "&" : "?";
  const qs = extra.toString();
  const url = qs ? `${baseUrl}${sep}${qs}` : baseUrl;
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
