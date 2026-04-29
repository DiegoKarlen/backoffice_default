/**
 * Backoffice i18n — add locales in locales/<code>.js and register in LOCALE_MODULES.
 */
import en from "./locales/en.js";
import es from "./locales/es.js";

/** @type {Record<string, object>} */
export const LOCALE_MODULES = { en, es };

/** Keys listed here appear in the language selector (order preserved). */
export const AVAILABLE_LOCALES = ["en", "es"];

const STORAGE_KEY = "bo_locale";

function normalizeStored(code) {
  if (!code || typeof code !== "string") return null;
  const c = code.trim().toLowerCase();
  return AVAILABLE_LOCALES.includes(c) ? c : null;
}

/**
 * @returns {string}
 */
export function getLocale() {
  try {
    const stored = normalizeStored(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch (_) {}
  if (typeof navigator !== "undefined") {
    const nav = (navigator.language || "").toLowerCase();
    if (nav.startsWith("es")) return "es";
  }
  return "en";
}

/**
 * @param {string} code
 */
export function setLocale(code) {
  const c = normalizeStored(code);
  if (!c) return;
  try {
    localStorage.setItem(STORAGE_KEY, c);
  } catch (_) {}
  window.location.reload();
}

/**
 * For nesting like `nav.items.home`
 * @param {string} key
 * @param {Record<string, string>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  const loc = LOCALE_MODULES[getLocale()] || LOCALE_MODULES.en;
  const parts = key.split(".");
  /** @type {unknown} */
  let v = loc;
  for (const p of parts) {
    if (v != null && typeof v === "object" && p in /** @type {object} */ (v))
      v = /** @type {Record<string, unknown>} */ (v)[p];
    else return key;
  }
  if (typeof v !== "string") return key;
  return v.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    params[name] != null ? String(params[name]) : "",
  );
}

function syncHtmlLang() {
  const loc = getLocale();
  document.documentElement.lang = loc;
  document.documentElement.setAttribute("data-bo-locale", loc);
}

/**
 * Apply [data-i18n], [data-i18n-placeholder], [data-i18n-aria-label]
 * @param {ParentNode} [root=document]
 */
export function applyDomI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key || !(el instanceof HTMLInputElement)) return;
    el.placeholder = t(key);
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria-label");
    if (!key) return;
    el.setAttribute("aria-label", t(key));
  });
}

/**
 * @param {string} page — value of data-bo-page (e.g. home, users)
 */
export function titleForPage(page) {
  const map = {
    home: "titles.home",
    signin: "titles.signin",
    users: "titles.users",
    roles: "titles.roles",
    functionalities: "titles.functionalities",
  };
  const key = map[page] || "titles.home";
  return t(key);
}

/**
 * Breadcrumb string for the shell topbar (pipe-separated segments).
 * @param {string} page — `data-bo-page` value
 */
export function crumbsStringForPage(page) {
  const map = {
    home: "home",
    signin: "home",
    users: "users",
    roles: "roles",
    functionalities: "functionalities",
  };
  const suffix = map[page] || "home";
  return t(`crumbs.${suffix}`);
}

/** Wire language buttons `[data-bo-lang]` (reloads on change). */
export function initLanguageSelector() {
  document.querySelectorAll("[data-bo-lang]").forEach((btn) => {
    if (btn.dataset.boLangWired) return;
    btn.dataset.boLangWired = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const code = btn.getAttribute("data-bo-lang");
      if (code) setLocale(code);
    });
  });
}

/** Run once at startup after DOM ready fragment exists */
export function initI18nUi() {
  syncHtmlLang();
  applyDomI18n(document);
  const page = document.body.getAttribute("data-bo-page") || "home";
  document.title = titleForPage(page);
}
