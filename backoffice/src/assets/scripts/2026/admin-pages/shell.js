/**
 * Admin pages — shell chrome, nav and page detection.
 */
import {
  clearSession,
  getToken,
  getUser,
  hasFunctionality,
} from "../bo-config.js";

function updateShellUserChrome() {
  const u = getUser();
  const nameEl = document.querySelector(".workspace-name");
  const roleEl = document.querySelector(".workspace-role");
  const avatarEl = document.querySelector(".workspace-avatar");
  const ddName = document.querySelector(".dd-profile-name");
  const ddEmail = document.querySelector(".dd-profile-email");
  const ddAvatar = document.querySelector(".avatar.dd-profile") || document.querySelector(".avatar");
  if (!u) return;
  const label = u.displayName || u.email || "User";
  const initials = label
    .split(/\s+/)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (nameEl) nameEl.textContent = label;
  if (roleEl) roleEl.textContent = u.roles?.map((r) => r.code).join(", ") || "—";
  if (avatarEl) avatarEl.textContent = initials;
  if (ddName) ddName.textContent = label;
  if (ddEmail) ddEmail.textContent = u.email || "";
  if (ddAvatar && ddAvatar.textContent && ddAvatar.childNodes.length === 1) ddAvatar.textContent = initials;
}

function wireLogout() {
  const link = document.getElementById("bo-logout");
  if (!link || link.dataset.boWired) return;
  link.dataset.boWired = "1";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    clearSession();
    window.location.href = "signin.html";
  });
}

function filterNavByFunctionality() {
  if (!getToken()) return;

  document.querySelectorAll("a.nav-link[data-bo-func]").forEach((a) => {
    const code = a.getAttribute("data-bo-func");
    if (code && !hasFunctionality(code)) {
      a.style.display = "none";
    }
  });

  /** Ocultar secciones del menú sin ningún ítem visible (p. ej. Juego sin bingo). */
  document.querySelectorAll(".d-sidebar nav.nav-section[data-nav-section]").forEach((sec) => {
    const body = sec.querySelector(".nav-section-body");
    if (!body) {
      sec.style.display = "none";
      return;
    }
    const links = [...body.querySelectorAll("a.nav-link[href]")];
    const anyVisible = links.some((a) => {
      if (a.style.display === "none") return false;
      if (a.getAttribute("hidden") != null) return false;
      return true;
    });
    sec.style.display = anyVisible ? "" : "none";
  });
}

function getPageType() {
  return document.body?.getAttribute("data-bo-page") || "";
}

export {
  updateShellUserChrome,
  wireLogout,
  filterNavByFunctionality,
  getPageType,
};
