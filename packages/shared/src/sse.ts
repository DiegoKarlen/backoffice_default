export type SseListenerMap = Record<string, (data: unknown) => void>;

export type SseConnectionStatus = "connecting" | "connected" | "reconnecting" | "closed";

/** Eventos SSE del motor bingo live (API `live-session`). */
export const BINGO_LIVE_SSE_EVENTS = [
  "state",
  "ball",
  "ball_delta",
  "round_start",
  "round_end",
  "round_cancelled",
  "idle",
  "prize_awarded",
] as const;

export type BingoLiveSseEvent = (typeof BINGO_LIVE_SSE_EVENTS)[number];

export const DEFAULT_SSE_RECONNECT_MS = 2000;
export const DEFAULT_SSE_MAX_RECONNECT_MS = 30_000;
export const DEFAULT_SSE_BACKOFF_FACTOR = 1.5;

export type SseReconnectDelayOptions = {
  baseMs: number;
  maxMs: number;
  factor: number;
};

export type SseReconnectOptions = {
  url: string;
  listeners: SseListenerMap;
  /** Delay tras el primer error (default {@link DEFAULT_SSE_RECONNECT_MS}). */
  reconnectDelayMs?: number;
  /** Tope de espera entre intentos (default {@link DEFAULT_SSE_MAX_RECONNECT_MS}). */
  maxReconnectDelayMs?: number;
  /** Multiplicador por fallo consecutivo (default {@link DEFAULT_SSE_BACKOFF_FACTOR}). */
  backoffFactor?: number;
  /** Llamado al cambiar estado de la conexión (útil para indicadores UI). */
  onStatusChange?: (status: SseConnectionStatus, meta?: { attempt: number }) => void;
};

/**
 * Calcula el delay antes del siguiente intento (`attempt` = 1 en el primer retry tras error).
 */
export function computeReconnectDelayMs(attempt: number, opts: SseReconnectDelayOptions): number {
  const base = opts.baseMs;
  const max = opts.maxMs;
  const factor = opts.factor;
  if (attempt <= 0) return base;
  const scaled = base * factor ** (attempt - 1);
  return Math.min(Math.round(scaled), max);
}

function attachListeners(es: EventSource, listeners: SseListenerMap): void {
  for (const [event, handler] of Object.entries(listeners)) {
    es.addEventListener(event, (ev) => {
      try {
        const raw = (ev as MessageEvent<string>).data;
        const data = raw ? (JSON.parse(raw) as unknown) : null;
        handler(data);
      } catch {
        /* ignore malformed payloads */
      }
    });
  }
}

/**
 * EventSource con reconexión automática y backoff exponencial (se resetea al abrir bien).
 */
export function connectSseWithReconnect(opts: SseReconnectOptions): () => void {
  const baseMs = opts.reconnectDelayMs ?? DEFAULT_SSE_RECONNECT_MS;
  const maxMs = opts.maxReconnectDelayMs ?? DEFAULT_SSE_MAX_RECONNECT_MS;
  const factor = opts.backoffFactor ?? DEFAULT_SSE_BACKOFF_FACTOR;
  const delayOpts: SseReconnectDelayOptions = { baseMs, maxMs, factor };

  let es: EventSource | null = null;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failAttempt = 0;

  const setStatus = (status: SseConnectionStatus, attempt = failAttempt) => {
    opts.onStatusChange?.(status, { attempt });
  };

  const scheduleReconnect = () => {
    if (closed) return;
    failAttempt += 1;
    const delay = computeReconnectDelayMs(failAttempt, delayOpts);
    setStatus("reconnecting", failAttempt);
    retryTimer = setTimeout(connect, delay);
  };

  const connect = () => {
    if (closed) return;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    setStatus(failAttempt > 0 ? "reconnecting" : "connecting", failAttempt);
    es = new EventSource(opts.url);
    attachListeners(es, opts.listeners);

    es.onopen = () => {
      failAttempt = 0;
      setStatus("connected", 0);
    };

    es.onerror = () => {
      es?.close();
      es = null;
      if (!closed) {
        scheduleReconnect();
      }
    };
  };

  connect();

  return () => {
    closed = true;
    setStatus("closed", failAttempt);
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    es?.close();
    es = null;
  };
}
