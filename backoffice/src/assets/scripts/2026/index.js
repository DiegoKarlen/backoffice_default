/**
 * 2026 entry point.
 *
 * Flujo: solo `signin.html` (data-bo-page="signin") es público; cualquier otra
 * página redirige a login si no hay token.
 */

import '../../styles/2026/index.scss';
import { getToken, isLoginPage, redirectToSignIn } from './bo-config.js';
import { mountShell } from './Shell.js';
import { initAdminPages } from './admin-pages.js';
import { initBoSpaNav } from './bo-spa-nav.js';
import { initShellBehaviors } from './init.js';
import { initI18nUi, initLanguageSelector } from './bo-i18n.js';

function redirectSignupToSignin() {
  const path = window.location.pathname || '';
  if (path.endsWith('signup.html')) {
    window.location.replace(`signin.html${window.location.search}`);
    return true;
  }
  return false;
}

/** Bloquea acceso sin sesión a todas las páginas salvo login. */
function enforceAuthenticatedShell() {
  if (isLoginPage()) return true;
  if (!getToken()) {
    redirectToSignIn();
    return false;
  }
  return true;
}

function markShellTransitionReady() {
  document.documentElement.classList.add("bo-shell-ready");
}

function start() {
  if (redirectSignupToSignin()) return;
  if (!enforceAuthenticatedShell()) return;

  const hasShellHosts = !!document.querySelector("[data-shell-sidebar]");
  const reduceMotion =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (hasShellHosts && !reduceMotion) {
    document.documentElement.classList.add("bo-use-page-enter");
  }

  mountShell();
  initI18nUi();
  initLanguageSelector();
  initShellBehaviors();
  initAdminPages();
  initBoSpaNav();

  if (!hasShellHosts || reduceMotion) {
    markShellTransitionReady();
  } else {
    requestAnimationFrame(() => {
      requestAnimationFrame(markShellTransitionReady);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
