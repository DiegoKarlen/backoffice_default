/**
 * Base URL de la API admin (mismo proceso que sirve `/public/bingos/*`).
 * En desarrollo: `npm run dev` del bingo-display puede usar proxy `/api` → sin CORS.
 */
let activeRoomSlug: string | null = null;

export function setRoomSlug(slug: string | null): void {
  activeRoomSlug = slug;
}

export function getRoomSlug(): string | null {
  return activeRoomSlug;
}

export function apiBase(): string {
  const explicit = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  const useProxy = import.meta.env.DEV && import.meta.env.VITE_USE_PROXY !== "0";
  if (useProxy) return ""; // rutas relativas `/api/...` → vite proxy

  return "http://localhost:4001";
}

/** Path under `/public/bingos` with optional `roomSlug` for the active sala. */
export function publicBingosPath(suffix: string): string {
  const base = apiBase();
  const path = `/public/bingos${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
  const slug = getRoomSlug();
  const qs = new URLSearchParams();
  if (slug) qs.set("roomSlug", slug);
  const qstr = qs.toString();
  const fullPath = qstr ? `${path}?${qstr}` : path;
  if (base) return `${base}${fullPath}`;
  return `/api${fullPath}`;
}
