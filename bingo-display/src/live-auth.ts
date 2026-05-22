import { publicBingosPath } from "./config.js";

const SESSION_KEY = "bd_operator_token";

export function getDisplayDrawSecret(): string | undefined {
  const raw = import.meta.env.VITE_BINGO_DISPLAY_DRAW_SECRET as string | undefined;
  return raw?.trim() || undefined;
}

/** Headers for POST draw-ball / stop (shared secret and/or operator JWT). */
export function liveDrawRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = getDisplayDrawSecret();
  if (secret) headers["X-Bingo-Display-Key"] = secret;
  try {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // no sessionStorage (SSR)
  }
  return headers;
}

/**
 * When the API requires live-draw auth, obtain a display operator JWT using the shared secret.
 * No-op if `VITE_BINGO_DISPLAY_DRAW_SECRET` is unset (dev with LIVE_DRAW_AUTH_OPTIONAL).
 */
export async function ensureDisplayOperatorAuth(): Promise<void> {
  const secret = getDisplayDrawSecret();
  if (!secret) return;

  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
  } catch {
    return;
  }

  const url = publicBingosPath("/live/operator-token");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Operator token: ${res.status}`);
  }
  const data = (await res.json()) as { accessToken?: string };
  if (!data.accessToken) throw new Error("Operator token response missing accessToken");
  sessionStorage.setItem(SESSION_KEY, data.accessToken);
}
