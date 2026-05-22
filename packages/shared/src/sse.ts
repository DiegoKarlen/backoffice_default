export type SseListenerMap = Record<string, (data: unknown) => void>;

export type SseReconnectOptions = {
  url: string;
  listeners: SseListenerMap;
  reconnectDelayMs?: number;
};

/**
 * EventSource with automatic reconnect on error (closes and retries after delay).
 */
export function connectSseWithReconnect(opts: SseReconnectOptions): () => void {
  const delay = opts.reconnectDelayMs ?? 2500;
  let es: EventSource | null = null;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    es = new EventSource(opts.url);
    for (const [event, handler] of Object.entries(opts.listeners)) {
      es.addEventListener(event, (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent<string>).data) as unknown;
          handler(data);
        } catch {
          /* ignore malformed payloads */
        }
      });
    }
    es.onerror = () => {
      es?.close();
      es = null;
      if (!closed) {
        retryTimer = setTimeout(connect, delay);
      }
    };
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    es?.close();
    es = null;
  };
}
