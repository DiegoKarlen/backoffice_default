/**
 * Admin pages — functionalities CRUD.
 */
import { api } from "../bo-api.js";
import { t } from "../bo-i18n.js";
import { attachBoPager, pagerAnchorFromTbody } from "../bo-pager.js";
import { esc } from "../bo-escape.js";
import { showToast } from "./utils.js";

function showFuncListView() {
  const list = document.getElementById("bo-func-list-view");
  const create = document.getElementById("bo-func-create-panel");
  const edit = document.getElementById("bo-func-edit-panel");
  if (list) list.hidden = false;
  if (create) create.hidden = true;
  if (edit) edit.hidden = true;
}

function showFuncCreateView() {
  const list = document.getElementById("bo-func-list-view");
  const create = document.getElementById("bo-func-create-panel");
  const edit = document.getElementById("bo-func-edit-panel");
  if (list) list.hidden = true;
  if (create) create.hidden = false;
  if (edit) edit.hidden = true;
}

function showFuncEditView() {
  const list = document.getElementById("bo-func-list-view");
  const create = document.getElementById("bo-func-create-panel");
  const edit = document.getElementById("bo-func-edit-panel");
  if (list) list.hidden = true;
  if (create) create.hidden = true;
  if (edit) edit.hidden = false;
}

/** @type {Array<Record<string, unknown>>} */
let funcListCache = [];
/** @type {ReturnType<typeof attachBoPager> | null} */
let funcPager = null;

function paintFuncPage(tbody, functionalities) {
  tbody.innerHTML = functionalities
    .map(
      (f) => `
    <tr data-id="${f.id}">
      <td class="cell-name">${esc(f.code)}</td>
      <td>${esc(f.name)}</td>
      <td>${esc(f.module || "—")}</td>
      <td>${esc(f.description || "—")}</td>
      <td style="text-align:right;"><button type="button" class="btn btn--ghost btn--sm bo-edit-func">${t("func.edit")}</button></td>
    </tr>`,
    )
    .join("");

  tbody.querySelectorAll(".bo-edit-func").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      const fn = funcListCache.find((x) => x.id === id);
      if (fn) openFuncEditor(/** @type {Parameters<typeof openFuncEditor>[0]} */ (fn));
    });
  });
}

async function renderFuncTable(tbody) {
  const { functionalities } = await api.functionalities.list();
  funcListCache = functionalities;
  const anchor = pagerAnchorFromTbody(tbody);
  if (!funcPager && anchor) {
    funcPager = attachBoPager({
      anchor,
      getItems: () => funcListCache,
      renderPage: (slice) => paintFuncPage(tbody, /** @type {typeof funcListCache} */ (slice)),
    });
  } else {
    funcPager?.reset();
  }
  funcPager?.refresh();
}

let editFuncPanel = null;

function openFuncEditor(f) {
  if (!editFuncPanel) return;
  editFuncPanel.dataset.funcId = f.id;
  const fh = editFuncPanel.querySelector("#bo-func-edit-heading");
  if (fh) fh.textContent = t("funcExtra.editTitlePrefix");
  const codeEl = editFuncPanel.querySelector("#edit-func-code-display");
  if (codeEl) codeEl.value = f.code || "";
  editFuncPanel.querySelector("#edit-func-name").value = f.name;
  editFuncPanel.querySelector("#edit-func-module").value = f.module || "";
  editFuncPanel.querySelector("#edit-func-desc").value = f.description || "";
  showFuncEditView();
}

async function initFunctionalitiesPage() {
  funcPager = null;
  const tbody = document.querySelector("#bo-func-tbody");
  const msg = document.getElementById("bo-func-msg");
  const form = document.getElementById("bo-func-create-form");
  editFuncPanel = document.getElementById("bo-func-edit-panel");

  try {
    await renderFuncTable(tbody);
  } catch (e) {
    showToast(msg, e.message, true);
    return;
  }

  showFuncListView();

  const btnNew = document.getElementById("bo-func-btn-new");
  if (btnNew && !btnNew.dataset.boWired) {
    btnNew.dataset.boWired = "1";
    btnNew.addEventListener("click", () => {
      showFuncCreateView();
      form?.reset();
    });
  }

  const cancelCreate = document.getElementById("bo-func-create-cancel");
  if (cancelCreate && !cancelCreate.dataset.boWired) {
    cancelCreate.dataset.boWired = "1";
    cancelCreate.addEventListener("click", () => {
      showFuncListView();
    });
  }

  if (form && !form.dataset.boSubmitWired) {
    form.dataset.boSubmitWired = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.style.display = "none";
      const code = document.getElementById("create-func-code")?.value?.trim();
      const name = document.getElementById("create-func-name")?.value?.trim();
      const module = document.getElementById("create-func-module")?.value?.trim();
      const description = document.getElementById("create-func-desc")?.value?.trim();
      try {
        await api.functionalities.create({
          code,
          name,
          module: module || undefined,
          description: description || undefined,
        });
        form.reset();
        await renderFuncTable(tbody);
        showToast(msg, t("func.msgCreated"), false);
        showFuncListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }

  const editCancel = document.getElementById("bo-func-edit-cancel");
  if (editCancel && !editCancel.dataset.boWired) {
    editCancel.dataset.boWired = "1";
    editCancel.addEventListener("click", () => {
      showFuncListView();
    });
  }

  const editSave = document.getElementById("bo-func-edit-save");
  if (editSave && !editSave.dataset.boWired) {
    editSave.dataset.boWired = "1";
    editSave.addEventListener("click", async () => {
      msg.style.display = "none";
      const id = editFuncPanel?.dataset?.funcId;
      if (!id) return;
      const name = editFuncPanel.querySelector("#edit-func-name")?.value?.trim();
      const module = editFuncPanel.querySelector("#edit-func-module")?.value?.trim();
      const description = editFuncPanel.querySelector("#edit-func-desc")?.value?.trim();
      try {
        await api.functionalities.patch(id, {
          name,
          module: module || null,
          description: description || null,
        });
        await renderFuncTable(tbody);
        showToast(msg, t("func.msgSaved"), false);
        showFuncListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }
}

export { initFunctionalitiesPage };
