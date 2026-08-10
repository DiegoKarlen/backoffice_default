/**
 * Backoffice — deposit payment methods (enable / disable).
 */
import { api } from "./bo-api.js";
import { t } from "./bo-i18n.js";
import { esc, formatBoMoneyFromCents } from "./bo-shared.js";
import { showToast } from "./admin-pages/utils.js";

/** @type {Array<Record<string, unknown>>} */
let methodsCache = [];

function formatLimit(cents, currency) {
  return formatBoMoneyFromCents(Number(cents), String(currency ?? "ARS"));
}

function paintMethodsTable(tbody) {
  if (!methodsCache.length) {
    tbody.innerHTML = `<tr><td colspan="7">${esc(t("paymentMethods.empty"))}</td></tr>`;
    return;
  }

  tbody.innerHTML = methodsCache
    .map((m) => {
      const active = m.active === true;
      const toggleLabel = active ? t("paymentMethods.deactivate") : t("paymentMethods.activate");
      return `
    <tr data-id="${esc(String(m.id))}">
      <td class="cell-name">${esc(String(m.name))}</td>
      <td class="mono">${esc(String(m.providerId))}</td>
      <td class="mono">${esc(String(m.externalId))}</td>
      <td>${esc(String(m.currencyCode))}</td>
      <td class="mono">${esc(formatLimit(m.minCents, m.currencyCode))}</td>
      <td class="mono">${esc(formatLimit(m.maxCents, m.currencyCode))}</td>
      <td>
        <span class="badge ${active ? "badge--ok" : "badge--muted"}">${esc(active ? t("paymentMethods.statusActive") : t("paymentMethods.statusInactive"))}</span>
        <button type="button" class="btn btn--ghost btn--sm bo-toggle-payment-method">${esc(toggleLabel)}</button>
      </td>
    </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".bo-toggle-payment-method").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      const row = methodsCache.find((x) => x.id === id);
      if (!row) return;
      void toggleMethod(String(id), row.active !== true, btn);
    });
  });
}

async function toggleMethod(id, nextActive, btn) {
  if (btn instanceof HTMLButtonElement) {
    btn.disabled = true;
  }
  try {
    const { paymentMethod } = await api.paymentMethods.patch(id, { active: nextActive });
    const idx = methodsCache.findIndex((x) => x.id === id);
    if (idx >= 0) methodsCache[idx] = paymentMethod;
    const tbody = document.getElementById("bo-payment-methods-tbody");
    if (tbody) paintMethodsTable(tbody);
  } catch (e) {
    showToast(
      document.getElementById("bo-payment-methods-msg"),
      e instanceof Error ? e.message : t("paymentMethods.toggleError"),
      true,
    );
  } finally {
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = false;
    }
  }
}

export async function initPaymentMethodsPage() {
  const tbody = document.getElementById("bo-payment-methods-tbody");
  if (!tbody) return;

  try {
    const { paymentMethods } = await api.paymentMethods.list();
    methodsCache = paymentMethods ?? [];
    paintMethodsTable(tbody);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7">${esc(e instanceof Error ? e.message : t("paymentMethods.loadError"))}</td></tr>`;
  }
}
