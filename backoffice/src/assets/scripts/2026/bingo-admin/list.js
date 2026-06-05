/**
 * Bingo admin — bingo list table and room selects.
 */
import { api } from "../bo-api.js";
import { t, applyDomI18n } from "../bo-i18n.js";
import { attachBoPager, pagerAnchorFromTbody } from "../bo-pager.js";
import { esc, formatDecimalPrice } from "../bo-shared.js";
import { fillEditForm, typeLabel } from "./forms.js";
import { showToast } from "./utils.js";
import {
  getEditingId,
  setEditingId,
  showBingosEditView,
  showBingosListView,
} from "./state.js";
import { openBingoRoundsModal } from "./rounds.js";

/** @type {Array<Record<string, unknown>>} */
let bingosListCache = [];
/** @type {ReturnType<typeof attachBoPager> | null} */
let bingosPager = null;

/**
 * @param {HTMLElement} tbody
 * @param {Array<Record<string, unknown>>} bingos
 */
function paintBingosPage(tbody, bingos) {
  tbody.innerHTML = bingos
    .map(
      (b) => `
    <tr data-id="${esc(b.id)}">
      <td class="cell-name">${esc(b.name)}</td>
      <td>${esc(/** @type {{ name?: string }} */ (b.room)?.name ?? "—")}</td>
      <td>${esc(typeLabel(/** @type {string} */ (b.bingoType)))}</td>
      <td>${b.status === "ACTIVE" ? `<span class="tag t-active">${esc(t("bingo.statusActive"))}</span>` : `<span class="tag t-old">${esc(t("bingo.statusInactive"))}</span>`}</td>
      <td>${esc(new Date(/** @type {string} */ (b.startDateTime)).toLocaleString())}</td>
      <td>${b.endDateTime ? esc(new Date(/** @type {string} */ (b.endDateTime)).toLocaleString()) : "—"}</td>
      <td>${b.repeatEveryMinutes != null ? esc(String(b.repeatEveryMinutes)) : "—"}</td>
      <td class="mono">${esc(formatDecimalPrice(String(b.cardPrice ?? ""), "ARS"))}</td>
      <td>${esc(String(b.minPlayersToStart ?? "—"))}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button type="button" class="btn btn--ghost btn--sm bo-rounds-bingo">${esc(t("bingo.roundsOpen"))}</button>
        <button type="button" class="btn btn--ghost btn--sm bo-edit-bingo">${esc(t("bingo.edit"))}</button>
        ${
          b.status !== "ACTIVE"
            ? `<button type="button" class="btn btn--ghost btn--sm bo-act-bingo">${esc(t("bingo.activate"))}</button>`
            : `<button type="button" class="btn btn--ghost btn--sm bo-deact-bingo">${esc(t("bingo.deactivate"))}</button>`
        }
        <button type="button" class="btn btn--ghost btn--sm bo-del-bingo">${esc(t("bingo.delete"))}</button>
      </td>
    </tr>`,
    )
    .join("");

  tbody.querySelectorAll(".bo-rounds-bingo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      const nameCell = tr?.querySelector(".cell-name");
      const bingoName = nameCell?.textContent?.trim() ?? "";
      if (!id) return;
      await openBingoRoundsModal(id, bingoName);
    });
  });

  tbody.querySelectorAll(".bo-edit-bingo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr")?.dataset?.id;
      if (!id) return;
      const msg = document.getElementById("bo-bingos-msg");
      try {
        await fillRoomSelects();
        const { bingo } = await api.bingos.get(id);
        setEditingId(id);
        const heading = document.getElementById("bo-bingo-edit-heading");
        if (heading) {
          const name = bingo?.name ? String(bingo.name) : "";
          heading.textContent = name
            ? `${t("bingoExtra.editTitlePrefix")}: ${name}`
            : t("bingoExtra.editTitlePrefix");
        }
        fillEditForm(bingo);
        showBingosEditView();
        applyDomI18n(document.getElementById("bo-bingo-edit-panel"));
      } catch (e) {
        showToast(msg, e.message, true);
      }
    });
  });

  tbody.querySelectorAll(".bo-act-bingo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr")?.dataset?.id;
      if (!id) return;
      const msg = document.getElementById("bo-bingos-msg");
      try {
        await api.bingos.activate(id);
        await renderBingosTable(tbody);
        showToast(msg, t("bingo.msgSaved"), false);
      } catch (e) {
        showToast(msg, e.message, true);
      }
    });
  });

  tbody.querySelectorAll(".bo-deact-bingo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr")?.dataset?.id;
      if (!id) return;
      const msg = document.getElementById("bo-bingos-msg");
      try {
        await api.bingos.deactivate(id);
        await renderBingosTable(tbody);
        showToast(msg, t("bingo.msgSaved"), false);
      } catch (e) {
        showToast(msg, e.message, true);
      }
    });
  });

  tbody.querySelectorAll(".bo-del-bingo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr")?.dataset?.id;
      if (!id || !window.confirm(t("bingo.confirmDelete"))) return;
      const msg = document.getElementById("bo-bingos-msg");
      try {
        await api.bingos.remove(id);
        await renderBingosTable(tbody);
        showToast(msg, t("bingo.msgDeleted"), false);
      } catch (e) {
        showToast(msg, e.message, true);
      }
    });
  });
}

async function renderBingosTable(tbody) {
  const name = document.getElementById("bingo-filter-name")?.value?.trim();
  const roomName = document.getElementById("bingo-filter-roomName")?.value?.trim();
  const status = document.getElementById("bingo-filter-status")?.value;
  const bingoType = document.getElementById("bingo-filter-type")?.value;

  const { bingos } = await api.bingos.list({
    name,
    roomName: roomName || undefined,
    status,
    bingoType,
  });
  bingosListCache = bingos;
  const anchor = pagerAnchorFromTbody(tbody);
  if (!bingosPager && anchor) {
    bingosPager = attachBoPager({
      anchor,
      getItems: () => bingosListCache,
      renderPage: (slice) => paintBingosPage(tbody, /** @type {typeof bingosListCache} */ (slice)),
    });
  } else {
    bingosPager?.reset();
  }
  bingosPager?.refresh();
}

async function fillRoomSelects() {
  const { rooms } = await api.rooms.list({});
  const opts = rooms
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}${s.status !== "ACTIVE" ? " (" + t("room.statusInactive") + ")" : ""}</option>`)
    .join("");
  const createSel = document.getElementById("create-roomId");
  const editSel = document.getElementById("edit-roomId");
  if (createSel) createSel.innerHTML = opts;
  if (editSel) editSel.innerHTML = opts;
}

export { renderBingosTable, fillRoomSelects };

export function resetBingosPager() {
  bingosPager = null;
}
