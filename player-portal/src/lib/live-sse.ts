import {
  connectSseWithReconnect,
  type SseListenerMap,
  type SseReconnectOptions,
} from "@shared/index.ts";

export function liveEventsUrl(apiBase: string, roomSlug: string): string {
  const base = apiBase.replace(/\/$/, "");
  return `${base}/public/bingos/live/events?roomSlug=${encodeURIComponent(roomSlug)}`;
}

export type PortalRoomLiveHandlers = {
  onSnapshot: (data: unknown) => void;
  /** Tras `ball`, fin de ronda, etc. — típicamente refetch de `/live/state`. */
  onActivity?: () => void;
  onStatusChange?: SseReconnectOptions["onStatusChange"];
};

/**
 * SSE de una sala para marcar cartones en vivo (portal).
 * Escucha `state` y eventos de actividad que requieren refrescar snapshot.
 */
export function connectPortalRoomLive(
  apiBase: string,
  roomSlug: string,
  handlers: PortalRoomLiveHandlers,
): () => void {
  const bump = () => {
    handlers.onActivity?.();
  };
  const listeners: SseListenerMap = {
    state: (data) => handlers.onSnapshot(data),
    ball: bump,
    ball_delta: bump,
    round_start: bump,
    round_end: bump,
    round_cancelled: bump,
    idle: bump,
  };
  return connectSseWithReconnect({
    url: liveEventsUrl(apiBase, roomSlug),
    listeners,
    onStatusChange: handlers.onStatusChange,
  });
}
