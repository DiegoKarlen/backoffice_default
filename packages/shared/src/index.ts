export { connectSseWithReconnect, type SseListenerMap, type SseReconnectOptions } from "./sse.js";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Centavos → texto legible (es-AR). */
export function formatMoneyFromCents(cents: number, currencyCode: string): string {
  const v = cents / 100;
  return `${v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`;
}

/** Precio decimal string (API) → mismo formato que wallet. */
export function formatDecimalPrice(price: string, currencyCode: string): string {
  const trimmed = price.trim();
  if (!trimmed) return "—";
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return trimmed;
  return formatMoneyFromCents(Math.round(n * 100), currencyCode);
}
