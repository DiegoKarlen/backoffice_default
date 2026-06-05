/**
 * Admin pages — bootstrap router for all admin screens.
 */
import {
  hasFunctionality,
  refreshStoredUser,
  requireAuth,
} from "../bo-config.js";
import { api } from "../bo-api.js";
import { t } from "../bo-i18n.js";
import { initBingosPage } from "../bingo-admin.js";
import { initPlayersPage } from "../player-admin.js";
import { initRoomsPage } from "../room-admin.js";
import { disposeHomePage, initHomePage } from "./home.js";
import { initFunctionalitiesPage } from "./functionalities.js";
import { initRolesPage } from "./roles.js";
import { initSecurityPage } from "./security.js";
import { initSignin } from "./signin.js";
import {
  filterNavByFunctionality,
  getPageType,
  updateShellUserChrome,
  wireLogout,
} from "./shell.js";
import { initUsersPage } from "./users.js";
import { showToast } from "./utils.js";

/**
 * Guards a page by functionality: hides main wrap and shows error toast when denied.
 * @returns {boolean} true if the user may proceed
 */
function requirePageFunctionality(funcCode, wrapSelector, msgId, i18nKey) {
  if (hasFunctionality(funcCode)) return true;
  document.querySelector(wrapSelector)?.remove();
  showToast(document.getElementById(msgId), t(i18nKey), true);
  return false;
}

export function initAdminPages() {
  const page = getPageType();
  if (page !== "home") disposeHomePage();
  if (page === "signin") {
    initSignin();
    return;
  }

  /** Todas las páginas con shell exigen sesión (refuerzo junto a index.js). */
  if (!requireAuth()) return;

  void initAdminPagesWithFreshSession(page);
}

async function initAdminPagesWithFreshSession(page) {
  try {
    const data = await api.me();
    if (data?.user) {
      refreshStoredUser(data.user);
    }
  } catch {
    /* keep cached user if API unreachable */
  }

  wireLogout();
  filterNavByFunctionality();
  updateShellUserChrome();

  if (page === "home") {
    void initHomePage();
  } else if (page === "users") {
    if (
      !requirePageFunctionality(
        "bo.users.manage",
        "[data-bo-users-wrap]",
        "bo-users-msg",
        "errors.noPermissionUsers",
      )
    ) {
      return;
    }
    initUsersPage();
  } else if (page === "roles") {
    if (
      !requirePageFunctionality(
        "bo.roles.manage",
        "[data-bo-roles-wrap]",
        "bo-roles-msg",
        "errors.noPermissionRoles",
      )
    ) {
      return;
    }
    initRolesPage();
  } else if (page === "functionalities") {
    if (
      !requirePageFunctionality(
        "bo.functionalities.manage",
        "[data-bo-func-wrap]",
        "bo-func-msg",
        "errors.noPermissionFunc",
      )
    ) {
      return;
    }
    initFunctionalitiesPage();
  } else if (page === "rooms") {
    if (
      !requirePageFunctionality(
        "bo.room.manage",
        "[data-bo-rooms-wrap]",
        "bo-rooms-msg",
        "errors.noPermissionRoom",
      )
    ) {
      return;
    }
    void initRoomsPage();
  } else if (page === "bingos") {
    if (
      !requirePageFunctionality(
        "bo.bingo.manage",
        "[data-bo-bingos-wrap]",
        "bo-bingos-msg",
        "errors.noPermissionBingo",
      )
    ) {
      return;
    }
    void initBingosPage();
  } else if (page === "players") {
    if (
      !requirePageFunctionality(
        "bo.players.manage",
        "[data-bo-players-wrap]",
        "bo-players-msg",
        "errors.noPermissionPlayers",
      )
    ) {
      return;
    }
    void initPlayersPage();
  } else if (page === "security") {
    initSecurityPage();
  }
}
