import type {
  BingoFigure,
  LivePhase,
  LiveSnapshot,
  OccurrencePrize,
  PublicRoom,
  UpcomingBingosResponse,
} from "@shared/index.ts";
import { publicBingosPath } from "./config.js";

export type { BingoFigure, LivePhase, LiveSnapshot, OccurrencePrize, PublicRoom };
export type Occurrence = UpcomingBingosResponse["upcoming"][number];
export type UpcomingResponse = UpcomingBingosResponse;

export async function fetchPublicRooms(): Promise<PublicRoom[]> {
  const url = publicBingosPath("/rooms");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Rooms: ${res.status}`);
  const data = (await res.json()) as { rooms: PublicRoom[] };
  return data.rooms ?? [];
}

export async function fetchUpcoming(params?: {
  limit?: number;
  horizonDays?: number;
}): Promise<UpcomingResponse> {
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

export async function fetchLiveSnapshot(signal?: AbortSignal): Promise<LiveSnapshot> {
  const url = publicBingosPath("/live/state");
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Live: ${res.status}`);
  return res.json() as Promise<LiveSnapshot>;
}

/** URL absoluta o relativa para `EventSource` (mismo origen con proxy Vite). */
export function liveEventsUrl(): string {
  return publicBingosPath("/live/events");
}
