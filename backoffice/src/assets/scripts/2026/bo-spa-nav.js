/**
 * Navegación interna del backoffice sin recargar sidebar/topbar/footer:
 * fetch del HTML, reemplazo de <main class="content"> y actualización de ruta en el chrome.
 */
import { updateShellRoute } from "./Shell.js";
import { initAdminPages } from "./admin-pages.js";
import { applyDomI18n, crumbsStringForPage, titleForPage } from "./bo-i18n.js";

const SPA_FILES = new Set([
  "index.html",
  "admin-users.html",
  "admin-roles.html",
  "admin-functionalities.html",
]);

function fileFromUrl(u) {
  const path = u.pathname || "";
  const seg = path.split("/").filter(Boolean);
  const last = seg.length ? seg[seg.length - 1] : "";
  return last || "index.html";
}

function isSpaUrl(url) {
  try {
    const u = url instanceof URL ? url : new URL(url, window.location.href);
    if (u.origin !== window.location.origin) return false;
    return SPA_FILES.has(fileFromUrl(u));
  } catch {
    return false;
  }
}

function normalizeFetchUrl(href) {
  return new URL(href, window.location.href).href;
}

function swapMainFromDocument(doc) {
  const incoming = doc.querySelector("main.content");
  const shellMain = document.querySelector(".shell .main");
  const current = shellMain?.querySelector("main.content");
  if (!incoming || !shellMain || !current) return false;

  const next = incoming.cloneNode(true);
  current.replaceWith(next);

  const b = doc.body;
  document.body.setAttribute("data-active", b.getAttribute("data-active") || "");
  document.body.setAttribute("data-bo-page", b.getAttribute("data-bo-page") || "");

  const page = document.body.getAttribute("data-bo-page") || "";
  document.title = titleForPage(page);

  const activeKey = document.body.getAttribute("data-active") || "";
  const crumbs = crumbsStringForPage(page);
  updateShellRoute(activeKey, crumbs);

  const mainEl = document.querySelector("main.content");
  if (mainEl) applyDomI18n(mainEl);

  initAdminPages();
  window.scrollTo(0, 0);
  return true;
}

async function navigateSpa(href, options = {}) {
  const { skipPush = false } = options;
  const url = normalizeFetchUrl(href);
  const here = window.location.href.split("#")[0];
  if (!skipPush && url === here) return;

  try {
    const res = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "text/html" },
    });
    if (!res.ok) throw new Error(String(res.status));
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const ok = swapMainFromDocument(doc);
    if (!ok) throw new Error("swap failed");
    if (!skipPush) window.history.pushState({ boSpa: true }, "", url);
  } catch {
    window.location.assign(href);
  }
}

export function initBoSpaNav() {
  /** Tras `mountShell()` ya no existe `[data-shell-sidebar]` (se sustituye por `.d-sidebar`). */
  if (!document.querySelector(".shell") || !document.querySelector(".d-sidebar")) return;

  document.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target === "_blank") return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let url;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (!isSpaUrl(url)) return;

      e.preventDefault();
      navigateSpa(a.href);
    },
    true,
  );

  window.addEventListener("popstate", () => {
    navigateSpa(window.location.href, { skipPush: true });
  });
}
