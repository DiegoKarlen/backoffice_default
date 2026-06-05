/** @param {number} cents @param {string} currencyCode */
export function formatMoneyFromCents(cents, currencyCode) {
  const v = cents / 100;
  return `${v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`;
}

/** @param {string} price @param {string} currencyCode */
export function formatDecimalPrice(price, currencyCode) {
  const trimmed = price.trim();
  if (!trimmed) return "—";
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return trimmed;
  return formatMoneyFromCents(Math.round(n * 100), currencyCode);
}

/**
 * @param {number} cents
 * @param {string} currencyCode
 * @param {string} [locale]
 * @param {{ minimumFractionDigits?: number; maximumFractionDigits?: number }} [options]
 */
export function formatMoneyFromCentsIntl(cents, currencyCode, locale = "es-AR", options) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  const minFd = options?.minimumFractionDigits ?? 2;
  const maxFd = options?.maximumFractionDigits ?? 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: minFd,
      maximumFractionDigits: maxFd,
    }).format(n / 100);
  } catch {
    return formatMoneyFromCents(n, currencyCode);
  }
}

/** @param {unknown} raw */
export function parseDecimalMoneyAmount(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return NaN;
  return Number(s.replace(",", "."));
}
