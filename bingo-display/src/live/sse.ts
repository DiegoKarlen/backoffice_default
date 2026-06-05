import { connectSseWithReconnect, type SseListenerMap, type SseReconnectOptions } from "@shared/index.ts";
import { liveEventsUrl } from "../api.js";

export type DisplayLiveSseOptions = {
  listeners: SseListenerMap;
  onStatusChange?: SseReconnectOptions["onStatusChange"];
};

/** SSE del display público (misma URL que `EventSource` histórico). */
export function connectDisplayLiveSse(opts: DisplayLiveSseOptions): () => void {
  return connectSseWithReconnect({
    url: liveEventsUrl(),
    listeners: opts.listeners,
    onStatusChange: opts.onStatusChange,
  });
}
