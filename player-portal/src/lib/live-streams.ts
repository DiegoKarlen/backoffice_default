/** Registry for SSE disconnect callbacks (cards tab). */
let disconnectHook: (() => void) | null = null;

export function registerLiveDisconnect(fn: (() => void) | null): void {
  disconnectHook = fn;
}

export function disconnectAllLiveStreams(): void {
  disconnectHook?.();
  disconnectHook = null;
}
