/**
 * Bingo admin — page bootstrap and event wiring.
 */
import { api } from "../bo-api.js";
import { t, applyDomI18n } from "../bo-i18n.js";
import { collectPayload, resetCreateForm } from "./forms.js";
import { renderPrizesEditor } from "./prizes.js";
import { fillRoomSelects, renderBingosTable, resetBingosPager } from "./list.js";
import { resetRoundsPager, wireBingoRoundsDialog } from "./rounds.js";
import { getEditingId, setEditingId, showBingosCreateView, showBingosListView } from "./state.js";
import { showToast } from "./utils.js";

export async function initBingosPage() {
  const wrap = document.querySelector("[data-bo-bingos-wrap]");
  if (!wrap) return;

  /** SPA: al cambiar de página el <main> es nuevo; el pager viejo seguía pintando un tbody desconectado. */
  resetBingosPager();
  resetRoundsPager();

  applyDomI18n(wrap);

  wireBingoRoundsDialog();

  const tbody = document.getElementById("bo-bingo-tbody");
  const msg = document.getElementById("bo-bingos-msg");
  const createForm = document.getElementById("bo-bingo-create-form");

  try {
    await fillRoomSelects();
  } catch (e) {
    showToast(msg, e.message, true);
  }

  renderPrizesEditor(document.getElementById("create-prizes"), [], "create");

  try {
    await renderBingosTable(tbody);
  } catch (e) {
    showToast(msg, e.message, true);
  }

  showBingosListView();

  const btnNew = document.getElementById("bo-bingos-btn-new");
  if (btnNew && !btnNew.dataset.boWired) {
    btnNew.dataset.boWired = "1";
    btnNew.addEventListener("click", async () => {
      try {
        await fillRoomSelects();
      } catch {
        /* ignore */
      }
      resetCreateForm();
      showBingosCreateView();
      applyDomI18n(document.getElementById("bo-bingo-create-panel"));
    });
  }

  const bingoFiltersForm = document.getElementById("bo-bingo-filters-form");
  if (bingoFiltersForm && !bingoFiltersForm.dataset.boWired) {
    bingoFiltersForm.dataset.boWired = "1";
    bingoFiltersForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await renderBingosTable(tbody);
      } catch (err) {
        showToast(msg, err.message, true);
      }
    });
  }

  const cancelCreate = document.getElementById("bo-bingo-create-cancel");
  if (cancelCreate && !cancelCreate.dataset.boWired) {
    cancelCreate.dataset.boWired = "1";
    cancelCreate.addEventListener("click", () => showBingosListView());
  }

  if (createForm && !createForm.dataset.boSubmitWired) {
    createForm.dataset.boSubmitWired = "1";
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (msg) msg.style.display = "none";
      try {
        const payload = collectPayload("create");
        await api.bingos.create(payload);
        await renderBingosTable(tbody);
        showToast(msg, t("bingo.msgCreated"), false);
        showBingosListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }

  const editCancel = document.getElementById("bo-bingo-edit-cancel");
  if (editCancel && !editCancel.dataset.boWired) {
    editCancel.dataset.boWired = "1";
    editCancel.addEventListener("click", () => showBingosListView());
  }

  const editForm = document.getElementById("bo-bingo-edit-form");
  if (editForm && !editForm.dataset.boSubmitWired) {
    editForm.dataset.boSubmitWired = "1";
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (msg) msg.style.display = "none";
      if (!getEditingId()) return;
      try {
        const payload = collectPayload("edit");
        await api.bingos.put(getEditingId(), payload);
        await renderBingosTable(tbody);
        showToast(msg, t("bingo.msgSaved"), false);
        showBingosListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }
}

