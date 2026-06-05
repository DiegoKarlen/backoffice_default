/**
 * Admin pages — sign-in and TOTP step.
 */
import { clearSession, getToken, setSession } from "../bo-config.js";
import { loginRequest, loginTotpRequest } from "../bo-api.js";
import { t } from "../bo-i18n.js";
import { showToast } from "./utils.js";

function initSignin() {
  const form = document.getElementById("bo-signin-form");
  if (!form) return;
  const err = document.getElementById("bo-signin-error");
  const stepPw = document.getElementById("bo-step-password");
  const stepTotp = document.getElementById("bo-step-totp");
  const totpEmailEl = document.getElementById("bo-totp-email");
  const totpCode = document.getElementById("bo-totp-code");
  const totpContinue = document.getElementById("bo-totp-continue");
  const totpBack = document.getElementById("bo-totp-back");

  if (getToken()) {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    window.location.href = next && next.startsWith("/") ? next : "index.html";
    return;
  }

  let pendingTwoFactorToken = null;
  let pendingPersist = false;

  function showPasswordStep() {
    pendingTwoFactorToken = null;
    if (stepPw) stepPw.hidden = false;
    if (stepTotp) stepTotp.hidden = true;
    if (totpCode) totpCode.value = "";
  }

  function showTotpStep(email, token, persist) {
    pendingTwoFactorToken = token;
    pendingPersist = persist;
    if (stepPw) stepPw.hidden = true;
    if (stepTotp) stepTotp.hidden = false;
    if (totpEmailEl) totpEmailEl.textContent = t("signin.totpEmailLine", { email: email || "—" });
    if (totpCode) {
      totpCode.value = "";
      totpCode.focus();
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.style.display = "none";
    const email = document.getElementById("email")?.value?.trim();
    const password = document.getElementById("password")?.value;
    const persist = document.getElementById("remember")?.checked;
    try {
      clearSession();
      const data = await loginRequest({ email, password });
      if (data.requiresTwoFactor && data.twoFactorToken) {
        showTotpStep(data.user?.email || email, data.twoFactorToken, persist);
        return;
      }
      if (!data.accessToken) {
        throw new Error(t("errors.loginFailed"));
      }
      setSession(data.accessToken, data.user, persist);
      const params = new URLSearchParams(window.location.search);
      let next = params.get("next");
      if (next) {
        try {
          next = decodeURIComponent(next);
        } catch {
          /* keep */
        }
      }
      if (next && !next.includes("signin.html")) {
        window.location.href = next.startsWith("/") ? next.slice(1) : next;
      } else {
        window.location.href = "index.html";
      }
    } catch (ex) {
      showToast(err, ex.message || t("errors.loginFailed"), true);
    }
  });

  totpContinue?.addEventListener("click", async () => {
    err.style.display = "none";
    const code = totpCode?.value?.trim() ?? "";
    if (!pendingTwoFactorToken) {
      showToast(err, t("errors.loginFailed"), true);
      return;
    }
    try {
      const data = await loginTotpRequest({ twoFactorToken: pendingTwoFactorToken, code });
      if (!data.accessToken) throw new Error(t("errors.loginFailed"));
      setSession(data.accessToken, data.user, pendingPersist);
      const params = new URLSearchParams(window.location.search);
      let next = params.get("next");
      if (next) {
        try {
          next = decodeURIComponent(next);
        } catch {
          /* keep */
        }
      }
      if (next && !next.includes("signin.html")) {
        window.location.href = next.startsWith("/") ? next.slice(1) : next;
      } else {
        window.location.href = "index.html";
      }
    } catch (ex) {
      showToast(err, ex.message || t("errors.loginFailed"), true);
    }
  });

  totpBack?.addEventListener("click", () => {
    err.style.display = "none";
    showPasswordStep();
  });
}

export { initSignin };
