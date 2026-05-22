export const PP_TAB_KEY = "pp_active_tab";
export const PP_AUTH_FLASH_KEY = "pp_auth_flash";

let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

export function getToken(): string | null {
  return sessionStorage.getItem("player_token");
}

export function setToken(t: string | null): void {
  if (t) sessionStorage.setItem("player_token", t);
  else sessionStorage.removeItem("player_token");
}

export function setAuthExpiredFlash(text: string): void {
  try {
    sessionStorage.setItem(PP_AUTH_FLASH_KEY, text);
  } catch {
    /* ignore */
  }
}

export function consumeAuthExpiredFlash(): string | null {
  try {
    const v = sessionStorage.getItem(PP_AUTH_FLASH_KEY);
    if (v) {
      sessionStorage.removeItem(PP_AUTH_FLASH_KEY);
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 401 en petición autenticada: limpia sesión y notifica al host (main). */
export function handleSessionExpiredFromApi(): void {
  setToken(null);
  try {
    sessionStorage.removeItem(PP_TAB_KEY);
  } catch {
    /* ignore */
  }
  setAuthExpiredFlash("Tu sesión expiró o no es válida. Iniciá sesión de nuevo.");
  onSessionExpired?.();
}

export function isSessionHandledError(err: unknown): boolean {
  return (
    err instanceof Error && (err as Error & { sessionHandled?: boolean }).sessionHandled === true
  );
}
