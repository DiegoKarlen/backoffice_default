/**
 * Base URL de la API admin (mismo proceso que sirve `/public/bingos/*`).
 * En desarrollo: `npm run dev` del bingo-display puede usar proxy `/api` → sin CORS.
 */
export function apiBase(): string {
  const explicit = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  const useProxy = import.meta.env.DEV && import.meta.env.VITE_USE_PROXY !== "0";
  if (useProxy) return ""; // rutas relativas `/api/...` → vite proxy

  return "http://localhost:4001";
}

export function publicBingosPath(suffix: string): string {
  const base = apiBase();
  const path = `/public/bingos${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
  if (base) return `${base}${path}`;
  return `/api${path}`;
}
