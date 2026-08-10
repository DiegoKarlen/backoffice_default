import { el } from "../lib/dom.js";
import { isPaymentsEnabled } from "../payments/config.js";
import { PP_TAB_KEY, setToken } from "../lib/session.js";
import type { PpTab } from "../types.js";

const PP_TABS: PpTab[] = isPaymentsEnabled()
  ? ["buy", "cards", "tx", "deposit"]
  : ["buy", "cards", "tx"];

function isPpTab(v: string | null): v is PpTab {
  return v != null && PP_TABS.includes(v as PpTab);
}

export function renderLoggedShell(root: HTMLElement, onLogout: () => void): void {
  root.innerHTML = "";
  root.appendChild(
    el(`
    <div class="pp-root pp-root--app">
      <header class="pp-app-header">
        <div class="pp-app-header__text">
          <h1 class="pp-title">Portal jugador</h1>
          <p class="pp-userline" id="pp-user-line"></p>
        </div>
        <div class="pp-wallet-chip" aria-live="polite">
          <span class="pp-wallet-label">Saldo disponible</span>
          <p class="pp-wallet-amount" id="pp-balance-amount">—</p>
        </div>
        <button type="button" class="pp-btn pp-btn-ghost pp-btn-logout" id="btn-logout">Cerrar sesión</button>
      </header>
      <nav class="pp-nav" id="pp-main-nav" aria-label="Secciones">
        <button type="button" class="pp-nav-btn pp-nav-btn--active" data-view="buy">Comprar cartones</button>
        <button type="button" class="pp-nav-btn" data-view="cards">Cartones comprados</button>
        <button type="button" class="pp-nav-btn" data-view="tx">Movimientos</button>
        ${isPaymentsEnabled() ? `<button type="button" class="pp-nav-btn" data-view="deposit">Depositar</button>` : ""}
      </nav>
      <div id="panel-logged"><p class="pp-loading">Cargando…</p></div>
      <div id="msg" class="pp-msg"></div>
    </div>`),
  );

  root.querySelector("#btn-logout")?.addEventListener("click", () => {
    setToken(null);
    try {
      sessionStorage.removeItem(PP_TAB_KEY);
    } catch {
      /* ignore */
    }
    onLogout();
  });
}

export function readSavedTab(): PpTab {
  try {
    const v = sessionStorage.getItem(PP_TAB_KEY);
    if (isPpTab(v)) return v;
  } catch {
    /* ignore */
  }
  return "buy";
}

export function setActiveTab(root: HTMLElement, tab: PpTab): void {
  try {
    sessionStorage.setItem(PP_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
  root.querySelectorAll(".pp-nav-btn").forEach((b) => {
    const btn = b as HTMLButtonElement;
    const v = btn.getAttribute("data-view") as PpTab | null;
    btn.classList.toggle("pp-nav-btn--active", v === tab);
  });
  root.querySelectorAll(".pp-view").forEach((sec) => {
    const s = sec as HTMLElement;
    s.classList.toggle("pp-view--active", s.getAttribute("data-view") === tab);
    s.hidden = s.getAttribute("data-view") !== tab;
  });
}
