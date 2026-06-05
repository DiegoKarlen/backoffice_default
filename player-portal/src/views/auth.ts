import { escapeHtml } from "@shared/index.ts";
import { apiJson } from "../lib/api.js";
import { el } from "../lib/dom.js";
import { friendlyError } from "../lib/format.js";
import { setToken } from "../lib/session.js";

export function mountGuestAuth(root: HTMLElement, onAuthSuccess: () => void): void {
  let mode: "login" | "register" = "login";

  const msg = root.querySelector("#msg") as HTMLElement | null;
  const host = root.querySelector("#auth-forms");
  if (!host) return;

  function paint(): void {
    host.innerHTML = "";
    if (mode === "login") {
      host.appendChild(
        el(`
        <section class="pp-card-block pp-auth-card">
          <h2 class="pp-section-title">Iniciar sesión</h2>
          <p class="pp-hint">Ingresá con tu email y contraseña.</p>
          <form id="form-login" method="post">
            <p class="pp-field"><label for="login-email">Email</label><input id="login-email" name="email" type="email" autocomplete="email" required class="pp-input" /></p>
            <p class="pp-field"><label for="login-password">Contraseña</label><input id="login-password" name="password" type="password" autocomplete="current-password" required class="pp-input" /></p>
            <p class="pp-auth-actions">
              <button type="submit" class="pp-btn">Ingresar</button>
            </p>
          </form>
          <p class="pp-auth-footer">
            ¿No tenés cuenta?
            <button type="button" class="pp-btn-link" id="btn-show-register">Registrate</button>
          </p>
        </section>`),
      );
      host.querySelector("#btn-show-register")?.addEventListener("click", () => {
        mode = "register";
        if (msg) msg.textContent = "";
        paint();
      });
      host.querySelector("#form-login")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (msg) msg.textContent = "";
        const fd = new FormData(e.target as HTMLFormElement);
        try {
          const data = (await apiJson("/player/login", {
            method: "POST",
            body: JSON.stringify({
              email: String(fd.get("email") ?? ""),
              password: String(fd.get("password") ?? ""),
            }),
          })) as { accessToken?: string };
          if (data.accessToken) setToken(data.accessToken);
          onAuthSuccess();
        } catch (err) {
          if (msg) msg.textContent = friendlyError(err);
        }
      });
    } else {
      host.appendChild(
        el(`
        <section class="pp-card-block pp-auth-card">
          <h2 class="pp-section-title">Crear cuenta</h2>
          <p class="pp-hint">Completá los datos para registrarte.</p>
          <form id="form-reg" method="post">
            <p class="pp-field"><label for="reg-email">Email</label><input id="reg-email" name="email" type="email" autocomplete="email" required class="pp-input" /></p>
            <p class="pp-field"><label for="reg-username">Usuario</label><input id="reg-username" name="username" required minlength="3" autocomplete="username" class="pp-input" /></p>
            <p class="pp-field"><label for="reg-password">Contraseña</label><input id="reg-password" name="password" type="password" minlength="8" autocomplete="new-password" required class="pp-input" /></p>
            <p class="pp-auth-actions">
              <button type="submit" class="pp-btn">Crear cuenta</button>
            </p>
          </form>
          <p class="pp-auth-footer">
            <button type="button" class="pp-btn-link" id="btn-show-login">Volver al inicio de sesión</button>
          </p>
        </section>`),
      );
      host.querySelector("#btn-show-login")?.addEventListener("click", () => {
        mode = "login";
        if (msg) msg.textContent = "";
        paint();
      });
      host.querySelector("#form-reg")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (msg) msg.textContent = "";
        const fd = new FormData(e.target as HTMLFormElement);
        try {
          const data = (await apiJson("/player/register", {
            method: "POST",
            body: JSON.stringify({
              email: String(fd.get("email") ?? ""),
              username: String(fd.get("username") ?? ""),
              password: String(fd.get("password") ?? ""),
            }),
          })) as { accessToken?: string };
          if (data.accessToken) setToken(data.accessToken);
          onAuthSuccess();
        } catch (err) {
          if (msg) msg.textContent = friendlyError(err);
        }
      });
    }
  }

  paint();
}
