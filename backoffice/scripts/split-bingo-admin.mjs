import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src", "assets", "scripts", "2026");
const srcFile = path.join(src, "bingo-admin.js");
const outDir = path.join(src, "bingo-admin");
fs.mkdirSync(outDir, { recursive: true });

const lines = fs.readFileSync(srcFile, "utf8").split(/\r?\n/);
const slice = (a, b) => lines.slice(a - 1, b).join("\n");

const utilsBody = slice(9, 50);
const stateBody = slice(52, 82).replace(/^let editingId = null;\r?\n?/m, "");
const prizesBody = slice(84, 246);
const formsBody = slice(248, 406);
const roundsBody = slice(408, 960);
const listBody = slice(962, 1116);
const initBody = slice(1118, 1225);

const utils = `/**
 * Bingo admin — date/money helpers and toast.
 */
${utilsBody}

export {
  showToast,
  isoToDatetimeLocal,
  datetimeLocalToIso,
  defaultStartDtLocal,
  defaultEndFromStart,
  parseMoneyAmount,
};
`;

const state = `/**
 * Bingo admin — panel visibility and edit state.
 */
let editingId = null;

${stateBody}

export {
  getEditingId,
  setEditingId,
  showBingosListView,
  showBingosCreateView,
  showBingosEditView,
};

export function getEditingId() {
  return editingId;
}

export function setEditingId(id) {
  editingId = id;
}
`;

// Fix state: showBingosListView sets editingId = null inline - keep as is in stateBody
// Remove duplicate get/set if we add to body - simplify state file

const stateFixed = `/**
 * Bingo admin — panel visibility and edit state.
 */
let editingId = null;

${stateBody}

export function getEditingId() {
  return editingId;
}

export function setEditingId(id) {
  editingId = id;
}

export {
  showBingosListView,
  showBingosCreateView,
  showBingosEditView,
};
`;

const prizes = `/**
 * Bingo admin — prize catalog and editor.
 */
import { applyDomI18n, t } from "../bo-i18n.js";
import { esc } from "../bo-escape.js";
import { parseMoneyAmount } from "./utils.js";

${prizesBody}

export {
  prizeFigureLabel,
  defaultPrizeCatalog,
  getPrizeModeForPrefix,
  syncBingoPrizeModeUi,
  wireBingoPrizeMode,
  renderPrizesEditor,
  collectPrizesFromHost,
};
`;

const forms = `/**
 * Bingo admin — create/edit forms and payload.
 */
import { t } from "../bo-i18n.js";
import {
  collectPrizesFromHost,
  getPrizeModeForPrefix,
  renderPrizesEditor,
  wireBingoPrizeMode,
} from "./prizes.js";
import {
  datetimeLocalToIso,
  defaultEndFromStart,
  defaultStartDtLocal,
  isoToDatetimeLocal,
  parseMoneyAmount,
} from "./utils.js";

${formsBody}

export { collectPayload, resetCreateForm, fillEditForm, typeLabel };
`;

const rounds = `/**
 * Bingo admin — rounds modal, cards and prizes detail.
 */
import { api } from "../bo-api.js";
import { t, applyDomI18n } from "../bo-i18n.js";
import { attachBoPager } from "../bo-pager.js";
import { esc } from "../bo-escape.js";
import { datetimeLocalToIso, showToast } from "./utils.js";

${roundsBody}

export { wireBingoRoundsDialog, openBingoRoundsModal };

export function resetRoundsPager() {
  roundsPager = null;
}
`;

const list = `/**
 * Bingo admin — bingo list table and room selects.
 */
import { api } from "../bo-api.js";
import { t, applyDomI18n } from "../bo-i18n.js";
import { attachBoPager, pagerAnchorFromTbody } from "../bo-pager.js";
import { esc } from "../bo-escape.js";
import { fillEditForm, typeLabel } from "./forms.js";
import { showToast } from "./utils.js";
import {
  getEditingId,
  setEditingId,
  showBingosEditView,
  showBingosListView,
} from "./state.js";
import { openBingoRoundsModal } from "./rounds.js";

${listBody}

export { renderBingosTable, fillRoomSelects };

export function resetBingosPager() {
  bingosPager = null;
}
`;

const init = `/**
 * Bingo admin — page bootstrap and event wiring.
 */
import { api } from "../bo-api.js";
import { t, applyDomI18n } from "../bo-i18n.js";
import { collectPayload, resetCreateForm } from "./forms.js";
import { renderPrizesEditor } from "./prizes.js";
import { fillRoomSelects, renderBingosTable, resetBingosPager } from "./list.js";
import { resetRoundsPager, wireBingoRoundsDialog } from "./rounds.js";
import {
  getEditingId,
  showBingosCreateView,
  showBingosListView,
} from "./state.js";
import { showToast } from "./utils.js";

${initBody.replace(/editingId/g, "getEditingId()").replace(/editingId = id/g, "setEditingId(id)")}

`;

// Fix init: editingId replacements are wrong - need careful fix
// Original: editingId = id -> setEditingId(id)
// Original: if (!editingId) -> if (!getEditingId())
// Original: await api.bingos.put(editingId, -> getEditingId()

// Re-read init body and fix manually in init file write

fs.writeFileSync(path.join(outDir, "utils.js"), utils);
fs.writeFileSync(path.join(outDir, "state.js"), stateFixed);

// state showBingosListView uses editingId = null - need export setEditingId and use in show functions
// Check stateBody - it has editingId = null in showBingosListView - good

fs.writeFileSync(path.join(outDir, "prizes.js"), prizes);
fs.writeFileSync(path.join(outDir, "forms.js"), forms);
fs.writeFileSync(path.join(outDir, "rounds.js"), rounds);
fs.writeFileSync(path.join(outDir, "list.js"), list);

// Fix list.js paintBingosPage: editingId = id -> setEditingId(id)
let listJs = fs.readFileSync(path.join(outDir, "list.js"), "utf8");
listJs = listJs.replace(/\beditingId = id\b/g, "setEditingId(id)");
fs.writeFileSync(path.join(outDir, "list.js"), listJs);

let initJs = init;
initJs = initJs.replace(/\broundsPager = null\b/g, "resetRoundsPager()");
initJs = initJs.replace(/\bbingosPager = null\b/g, "resetBingosPager()");
initJs = initJs.replace(/\bif \(!editingId\)/g, "if (!getEditingId())");
initJs = initJs.replace(/\bawait api\.bingos\.put\(editingId,/g, "await api.bingos.put(getEditingId(),");
initJs = initJs.replace(/import \{\s*getEditingId,\s*showBingosCreateView,\s*showBingosListView,\s*\} from "\.\/state\.js";/, 'import { getEditingId, setEditingId, showBingosCreateView, showBingosListView } from "./state.js";');

fs.writeFileSync(path.join(outDir, "init.js"), initJs);

const entry = `/**
 * Bingos — admin ABM (re-exports modular implementation).
 */
export { initBingosPage } from "./bingo-admin/init.js";
`;

fs.writeFileSync(path.join(src, "bingo-admin.js"), entry);
console.log("Split bingo-admin into", outDir);
