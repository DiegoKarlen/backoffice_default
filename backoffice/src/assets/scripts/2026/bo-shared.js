/**
 * Backoffice facade over `@shared` (webpack transpiles packages/shared via shared-ts rule).
 */
import { escapeHtml } from "@shared/escape-html.js";
import {
  formatDecimalPrice,
  formatMoneyFromCents,
  formatMoneyFromCentsIntl,
  parseDecimalMoneyAmount,
} from "@shared/money.js";

export { escapeHtml as esc, formatDecimalPrice, formatMoneyFromCents, parseDecimalMoneyAmount };

/** Locale para montos según `document.documentElement.lang` o i18n del BO. */
export function moneyLocaleTag() {
  const lang = document.documentElement.lang || "es";
  if (lang === "es" || lang.startsWith("es")) return "es-AR";
  if (lang.startsWith("en")) return "en-US";
  return lang;
}

/**
 * Centavos → moneda con locale del BO.
 * @param {number | null | undefined} cents
 * @param {string} [currencyCode]
 * @param {{ minimumFractionDigits?: number; maximumFractionDigits?: number }} [intlOpts]
 */
export function formatBoMoneyFromCents(cents, currencyCode = "ARS", intlOpts) {
  return formatMoneyFromCentsIntl(cents, currencyCode, moneyLocaleTag(), intlOpts);
}
