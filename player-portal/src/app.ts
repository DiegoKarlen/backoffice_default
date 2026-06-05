import { escapeHtml } from "@shared/index.ts";
import { API_BASE } from "./lib/api.js";
import { el } from "./lib/dom.js";
import { friendlyError } from "./lib/format.js";
import { disconnectAllLiveStreams, registerLiveDisconnect } from "./lib/live-streams.js";
import {
  consumeAuthExpiredFlash,
  getToken,
  isSessionHandledError,
  setSessionExpiredHandler,
  setToken,
  PP_TAB_KEY,
} from "./lib/session.js";
import { mountGuestAuth } from "./views/auth.js";
import { mountDashboard } from "./views/dashboard.js";
import { renderLoggedShell } from "./views/shell.js";

export function renderApp(): void {
  const root = document.getElementById("app");
  if (!root) return;

  const loggedIn = !!getToken();

  if (!loggedIn) {
    disconnectAllLiveStreams();
    root.innerHTML = "";
    root.appendChild(
      el(`
    <div class="pp-root pp-root--guest">
      <h1 class="pp-title">Portal jugador</h1>
      <p class="pp-meta">API: <code>${escapeHtml(API_BASE)}</code></p>
      <div id="auth-forms"></div>
      <div id="msg" class="pp-msg"></div>
    </div>`),
    );
    mountGuestAuth(root, () => renderApp());
    const msgGuest = root.querySelector("#msg") as HTMLElement | null;
    const flash = consumeAuthExpiredFlash();
    if (flash && msgGuest) msgGuest.textContent = flash;
    return;
  }

  renderLoggedShell(root, () => renderApp());
  const panel = root.querySelector("#panel-logged");
  const msg = root.querySelector("#msg") as HTMLElement | null;
  if (!panel) return;

  void (async () => {
    try {
      await mountDashboard(root, msg, () => renderApp());
    } catch (err) {
      if (isSessionHandledError(err)) return;
      if (msg) msg.textContent = friendlyError(err);
      setToken(null);
      try {
        sessionStorage.removeItem(PP_TAB_KEY);
      } catch {
        /* ignore */
      }
      renderApp();
    }
  })();
}

setSessionExpiredHandler(() => {
  disconnectAllLiveStreams();
  renderApp();
});

registerLiveDisconnect(null);
