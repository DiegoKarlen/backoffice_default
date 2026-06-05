/**
 * Admin pages — account security (TOTP setup).
 */
import { getUser, refreshStoredUser } from "../bo-config.js";
import { api } from "../bo-api.js";
import { t } from "../bo-i18n.js";
import QRCode from "qrcode";
import { showToast } from "./utils.js";

function initSecurityPage() {
  const msg = document.getElementById("bo-security-msg");
  const status = document.getElementById("bo-security-status");
  const idle = document.getElementById("bo-security-idle");
  const setup = document.getElementById("bo-security-setup");
  const active = document.getElementById("bo-security-active");
  const btnStart = document.getElementById("bo-security-btn-start");
  const enableForm = document.getElementById("bo-security-enable-form");
  const disableForm = document.getElementById("bo-security-disable-form");
  const disableCancel = document.getElementById("bo-security-disable-cancel");
  const enableCancel = document.getElementById("bo-security-enable-cancel");

  function paint() {
    const u = getUser();
    setup.hidden = true;
    active.hidden = true;
    if (!u) {
      idle.hidden = false;
      if (status) status.textContent = t("security.statusLoading");
      if (btnStart) btnStart.disabled = true;
      return;
    }
    idle.hidden = true;
    if (btnStart) btnStart.disabled = false;
    if (u.totpEnabled) {
      active.hidden = false;
      status.textContent = t("security.statusOn");
    } else {
      idle.hidden = false;
      status.textContent = u.totpPending ? t("security.statusPending") : t("security.statusOff");
      if (btnStart) {
        btnStart.textContent = u.totpPending ? t("security.btnRestart") : t("security.btnStart");
      }
    }
  }

  disableCancel?.addEventListener("click", () => {
    const pwdEl = document.getElementById("bo-disable-password");
    if (pwdEl) pwdEl.value = "";
  });

  enableCancel?.addEventListener("click", () => {
    const codeEl = document.getElementById("bo-enable-code");
    if (codeEl) codeEl.value = "";
    setup.hidden = true;
    idle.hidden = false;
    paint();
  });

  btnStart?.addEventListener("click", async () => {
    if (msg) msg.style.display = "none";
    try {
      const data = await api.totpSetup();
      idle.hidden = true;
      setup.hidden = false;
      active.hidden = true;
      status.textContent = t("security.statusScanning");
      const secEl = document.getElementById("bo-security-secret");
      if (secEl) secEl.textContent = data.secret || "";
      const img = document.getElementById("bo-security-qr");
      if (img && data.otpauthUrl) {
        try {
          img.src = await QRCode.toDataURL(data.otpauthUrl, {
            width: 200,
            margin: 2,
            errorCorrectionLevel: "M",
            color: { dark: "#111111", light: "#ffffff" },
          });
          img.hidden = false;
        } catch {
          img.removeAttribute("src");
          img.hidden = true;
        }
      }
    } catch (ex) {
      showToast(msg, ex.message, true);
    }
  });

  enableForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (msg) msg.style.display = "none";
    const code = document.getElementById("bo-enable-code")?.value?.trim() ?? "";
    try {
      const out = await api.totpEnable({ code });
      if (out?.user) refreshStoredUser(out.user);
      else {
        const data = await api.me();
        if (data?.user) refreshStoredUser(data.user);
      }
      setup.hidden = true;
      const input = document.getElementById("bo-enable-code");
      if (input) input.value = "";
      showToast(msg, t("security.msgEnabled"), false);
      paint();
    } catch (ex) {
      showToast(msg, ex.message, true);
    }
  });

  disableForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (msg) msg.style.display = "none";
    const password = document.getElementById("bo-disable-password")?.value ?? "";
    try {
      await api.totpDisable({ password });
      const data = await api.me();
      if (data?.user) refreshStoredUser(data.user);
      const pwdEl = document.getElementById("bo-disable-password");
      if (pwdEl) pwdEl.value = "";
      showToast(msg, t("security.msgDisabled"), false);
      paint();
    } catch (ex) {
      showToast(msg, ex.message, true);
    }
  });

  paint();
}

export { initSecurityPage };
