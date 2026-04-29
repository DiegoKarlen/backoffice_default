/**
 * Backoffice session + API base URL (override: localStorage BO_API_BASE).
 */
const DEFAULT_API = "http://localhost:4001";

export const TOKEN_KEY = "bo_token";
export const USER_KEY = "bo_user";

export function getApiBase() {
  try {
    return localStorage.getItem("BO_API_BASE") || DEFAULT_API;
  } catch {
    return DEFAULT_API;
  }
}

export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(token, user, persist) {
  const storage = persist ? localStorage : sessionStorage;
  try {
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

/** Returns true if current user has functionality code (from login payload). */
export function hasFunctionality(code) {
  const u = getUser();
  if (!u?.functionalities) return false;
  return u.functionalities.some((f) => f.code === code);
}

/** Solo la página de login es pública; el resto exige sesión (véase index.js). */
export function isLoginPage() {
  return document.body?.getAttribute("data-bo-page") === "signin";
}

export function redirectToSignIn() {
  const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  window.location.href = `signin.html?next=${next}`;
}

export function requireAuth() {
  if (!getToken()) {
    redirectToSignIn();
    return false;
  }
  return true;
}
