import { publicBingosPath } from "./config.js";

export type BingoFigure =
  | "LINE"
  | "DOUBLE_LINE"
  | "LETTER_B"
  | "LETTER_I"
  | "LETTER_N"
  | "LETTER_G"
  | "LETTER_O"
  | "PERIMETER"
  | "FULL_HOUSE";

export type OccurrencePrize = {
  figure: BingoFigure;
  amount: string;
  displayAmount?: string;
};

export type Occurrence = {
  bingoId: string;
  name: string;
  bingoType: string;
  prizeMode?: string;
  cardPrice: string;
  startsAt: string;
  startsAtMs: number;
  prizes: OccurrencePrize[];
  /** Número de partida (backend); puede ser null si aún no hay fila en BingoRound */
  roundSequence: number | null;
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
  nextRoundSequence: number | null;
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
    drawMode: "VIRTUAL" | "LIVE";
    /** false tras cartón lleno / fin de partida (Live). */
    canMarkLiveBall?: boolean;
    prizes: OccurrencePrize[];
  };
};

/** Bingo Live: marca bola sorteada (público, sin auth por ahora). */
export async function postDrawBall(number: number): Promise<void> {
  const url = publicBingosPath("/live/draw-ball");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ number }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Draw ball: ${res.status}`);
  }
}

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
