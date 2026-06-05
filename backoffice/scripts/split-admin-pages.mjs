import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src", "assets", "scripts", "2026");
const srcFile = path.join(src, "admin-pages.js");
const outDir = path.join(src, "admin-pages");
fs.mkdirSync(outDir, { recursive: true });

const lines = fs.readFileSync(srcFile, "utf8").split(/\r?\n/);
const slice = (a, b) => lines.slice(a - 1, b).join("\n");

const utilsBody = slice(22, 27);
const shellBody = slice(29, 93);
const homeBody = slice(95, 310);
const signinBody = slice(314, 424);
const securityBody = slice(426, 544);
const usersViewsBody = slice(548, 573);
const rolesViewsBody = slice(575, 600);
const funcViewsBody = slice(602, 627);
const pickersBody = slice(629, 809);
const usersBody = slice(811, 997);
const rolesBody = slice(1000, 1174);
const funcBody = slice(1177, 1337);
/** router.js: permisos centralizados — no regenerar desde el monolito. */
const routerPath = path.join(outDir, "router.js");

const utils = `/**
 * Admin pages — shared toast helper.
 */
${utilsBody}

export { showToast };
`;

const shell = `/**
 * Admin pages — shell chrome, nav and page detection.
 */
import {
  clearSession,
  getToken,
  getUser,
  hasFunctionality,
} from "../bo-config.js";

${shellBody}

export {
  updateShellUserChrome,
  wireLogout,
  filterNavByFunctionality,
  getPageType,
};
`;

const home = `/**
 * Admin pages — home dashboard (upcoming bingos).
 */
import { api } from "../bo-api.js";
import { getLocale, t } from "../bo-i18n.js";
${homeBody}

export { disposeHomePage, initHomePage };
`;

const signin = `/**
 * Admin pages — sign-in and TOTP step.
 */
import { clearSession, getToken, setSession } from "../bo-config.js";
import { loginRequest, loginTotpRequest } from "../bo-api.js";
import { t } from "../bo-i18n.js";
import { showToast } from "./utils.js";

${signinBody}

export { initSignin };
`;

const security = `/**
 * Admin pages — account security (TOTP setup).
 */
import { getUser, refreshStoredUser } from "../bo-config.js";
import { api } from "../bo-api.js";
import { t } from "../bo-i18n.js";
import QRCode from "qrcode";
import { showToast } from "./utils.js";

${securityBody}

export { initSecurityPage };
`;

const pickers = `/**
 * Admin pages — role/functionality chip pickers.
 */
import { esc } from "../bo-escape.js";
import { t } from "../bo-i18n.js";

${pickersBody}

export {
  mountItemPicker,
  mountRolePicker,
  mountFunctionalityPicker,
  destroyRoleFuncPickers,
  destroyUserRolePickers,
};
`;

const users = `/**
 * Admin pages — users CRUD.
 */
import { api } from "../bo-api.js";
import { t } from "../bo-i18n.js";
import { attachBoPager, pagerAnchorFromTbody } from "../bo-pager.js";
import { esc } from "../bo-escape.js";
import { mountRolePicker } from "./pickers.js";
import { showToast } from "./utils.js";

/** @type {{ getSelectedIds: () => string[], setSelectedIds: (ids: string[]) => void, destroy: () => void } | null} */
let createUserRolePickerApi = null;
/** @type {{ getSelectedIds: () => string[], setSelectedIds: (ids: string[]) => void, destroy: () => void } | null} */
let editUserRolePickerApi = null;

function destroyLocalUserRolePickers() {
  createUserRolePickerApi?.destroy();
  createUserRolePickerApi = null;
  editUserRolePickerApi?.destroy();
  editUserRolePickerApi = null;
}

${usersViewsBody}

${usersBody}

export { initUsersPage };
`;

const roles = `/**
 * Admin pages — roles CRUD.
 */
import { api } from "../bo-api.js";
import { t } from "../bo-i18n.js";
import { attachBoPager, pagerAnchorFromTbody } from "../bo-pager.js";
import { esc } from "../bo-escape.js";
import { mountFunctionalityPicker } from "./pickers.js";
import { showToast } from "./utils.js";

/** @type {{ getSelectedIds: () => string[], setSelectedIds: (ids: string[]) => void, destroy: () => void } | null} */
let createRoleFuncPickerApi = null;
/** @type {{ getSelectedIds: () => string[], setSelectedIds: (ids: string[]) => void, destroy: () => void } | null} */
let editRoleFuncPickerApi = null;

function destroyLocalRoleFuncPickers() {
  createRoleFuncPickerApi?.destroy();
  createRoleFuncPickerApi = null;
  editRoleFuncPickerApi?.destroy();
  editRoleFuncPickerApi = null;
}

${rolesViewsBody}

${rolesBody}

export { initRolesPage };
`;

const functionalities = `/**
 * Admin pages — functionalities CRUD.
 */
import { api } from "../bo-api.js";
import { t } from "../bo-i18n.js";
import { attachBoPager, pagerAnchorFromTbody } from "../bo-pager.js";
import { esc } from "../bo-escape.js";
import { showToast } from "./utils.js";

${funcViewsBody}

${funcBody}

export { initFunctionalitiesPage };
`;

const router = fs.existsSync(routerPath)
  ? fs.readFileSync(routerPath, "utf8")
  : (() => {
      throw new Error(
        "admin-pages/router.js missing — create it before re-running split-admin-pages.mjs",
      );
    })();

fs.writeFileSync(path.join(outDir, "utils.js"), utils);
fs.writeFileSync(path.join(outDir, "shell.js"), shell);
fs.writeFileSync(path.join(outDir, "home.js"), home);
fs.writeFileSync(path.join(outDir, "signin.js"), signin);
fs.writeFileSync(path.join(outDir, "security.js"), security);
fs.writeFileSync(path.join(outDir, "pickers.js"), pickers);
fs.writeFileSync(path.join(outDir, "users.js"), users);
fs.writeFileSync(path.join(outDir, "roles.js"), roles);
fs.writeFileSync(path.join(outDir, "functionalities.js"), functionalities);
fs.writeFileSync(path.join(outDir, "router.js"), router);

const entry = `/**
 * Sign-in + administration CRUD pages (users / roles / functionalities).
 */
export { initAdminPages } from "./admin-pages/router.js";
`;

fs.writeFileSync(path.join(src, "admin-pages.js"), entry);
console.log("Split admin-pages into", outDir);
