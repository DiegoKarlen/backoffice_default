import type { BingoLiveSession } from "./live-session.js";

export type LiveSessionRoomRef = {
  id: string;
  slug: string;
  name: string;
};

/** Abstracción del almacén de sesiones (hoy in-memory; futuro Redis). */
export interface LiveSessionStore {
  get(roomId: string): BingoLiveSession | undefined;
  set(roomId: string, session: BingoLiveSession): void;
}

class InMemoryLiveSessionStore implements LiveSessionStore {
  private readonly sessions = new Map<string, BingoLiveSession>();

  get(roomId: string): BingoLiveSession | undefined {
    return this.sessions.get(roomId);
  }

  set(roomId: string, session: BingoLiveSession): void {
    this.sessions.set(roomId, session);
  }
}

export const liveSessionStore: LiveSessionStore = new InMemoryLiveSessionStore();
