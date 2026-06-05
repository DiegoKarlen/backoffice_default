/**
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

function showRolesListView() {
  const list = document.getElementById("bo-roles-list-view");
  const create = document.getElementById("bo-role-create-panel");
  const edit = document.getElementById("bo-role-edit-panel");
  if (list) list.hidden = false;
  if (create) create.hidden = true;
  if (edit) edit.hidden = true;
}

function showRolesCreateView() {
  const list = document.getElementById("bo-roles-list-view");
  const create = document.getElementById("bo-role-create-panel");
  const edit = document.getElementById("bo-role-edit-panel");
  if (list) list.hidden = true;
  if (create) create.hidden = false;
  if (edit) edit.hidden = true;
}

function showRolesEditView() {
  const list = document.getElementById("bo-roles-list-view");
  const create = document.getElementById("bo-role-create-panel");
  const edit = document.getElementById("bo-role-edit-panel");
  if (list) list.hidden = true;
  if (create) create.hidden = true;
  if (edit) edit.hidden = false;
}

/** @type {Array<Record<string, unknown>>} */
let rolesListCache = [];
/** @type {ReturnType<typeof attachBoPager> | null} */
let rolesPager = null;

function paintRolesPage(tbody, roles, functionalities) {
  tbody.innerHTML = roles
    .map(
      (r) => `
    <tr data-id="${r.id}">
      <td class="cell-name">${esc(r.code)}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.description || "—")}</td>
      <td>${/** @type {Array<unknown>} */ (r.functionalities).length}</td>
      <td style="text-align:right;"><button type="button" class="btn btn--ghost btn--sm bo-edit-role">${t("roles.edit")}</button></td>
    </tr>`,
    )
    .join("");

  tbody.querySelectorAll(".bo-edit-role").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      const role = rolesListCache.find((x) => x.id === id);
      if (role) openRoleEditor(/** @type {Parameters<typeof openRoleEditor>[0]} */ (role), functionalities);
    });
  });
}

async function renderRolesTable(tbody, functionalities) {
  const { roles } = await api.roles.list();
  rolesListCache = roles;
  const anchor = pagerAnchorFromTbody(tbody);
  if (!rolesPager && anchor) {
    rolesPager = attachBoPager({
      anchor,
      getItems: () => rolesListCache,
      renderPage: (slice) =>
        paintRolesPage(tbody, /** @type {typeof rolesListCache} */ (slice), functionalities),
    });
  } else {
    rolesPager?.reset();
  }
  rolesPager?.refresh();
}

let editRolePanel = null;

function openRoleEditor(role, functionalities) {
  if (!editRolePanel) return;
  editRolePanel.dataset.roleId = role.id;
  const rh = editRolePanel.querySelector("#bo-role-edit-heading");
  if (rh) rh.textContent = t("rolesExtra.editTitlePrefix");
  const codeEl = editRolePanel.querySelector("#edit-role-code-display");
  if (codeEl) codeEl.value = role.code || "";
  editRolePanel.querySelector("#edit-role-name").value = role.name;
  editRolePanel.querySelector("#edit-role-desc").value = role.description || "";
  editRoleFuncPickerApi?.destroy();
  editRoleFuncPickerApi = null;
  const holder = editRolePanel.querySelector("#edit-role-funcs");
  const ids = role.functionalities.map((f) => f.id);
  if (holder) {
    editRoleFuncPickerApi = mountFunctionalityPicker(holder, functionalities, ids);
  }
  showRolesEditView();
}

async function initRolesPage() {
  rolesPager = null;
  const tbody = document.querySelector("#bo-roles-tbody");
  const msg = document.getElementById("bo-roles-msg");
  const form = document.getElementById("bo-role-create-form");
  editRolePanel = document.getElementById("bo-role-edit-panel");

  let functionalities = [];
  try {
    const f = await api.functionalities.list();
    functionalities = f.functionalities;
    destroyLocalRoleFuncPickers();
    const holder = document.getElementById("create-role-funcs");
    if (holder) createRoleFuncPickerApi = mountFunctionalityPicker(holder, functionalities, []);
  } catch (e) {
    showToast(msg, e.message, true);
    return;
  }

  try {
    await renderRolesTable(tbody, functionalities);
  } catch (e) {
    showToast(msg, e.message, true);
    return;
  }

  showRolesListView();

  const btnNew = document.getElementById("bo-roles-btn-new");
  if (btnNew && !btnNew.dataset.boWired) {
    btnNew.dataset.boWired = "1";
    btnNew.addEventListener("click", () => {
      showRolesCreateView();
      form?.reset();
      createRoleFuncPickerApi?.setSelectedIds([]);
    });
  }

  const cancelCreate = document.getElementById("bo-role-create-cancel");
  if (cancelCreate && !cancelCreate.dataset.boWired) {
    cancelCreate.dataset.boWired = "1";
    cancelCreate.addEventListener("click", () => {
      showRolesListView();
    });
  }

  if (form && !form.dataset.boSubmitWired) {
    form.dataset.boSubmitWired = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.style.display = "none";
      const code = document.getElementById("create-role-code")?.value?.trim();
      const name = document.getElementById("create-role-name")?.value?.trim();
      const description = document.getElementById("create-role-desc")?.value?.trim();
      const functionalityIds = createRoleFuncPickerApi?.getSelectedIds() ?? [];
      try {
        await api.roles.create({ code, name, description: description || undefined, functionalityIds });
        form.reset();
        createRoleFuncPickerApi?.setSelectedIds([]);
        await renderRolesTable(tbody, functionalities);
        showToast(msg, t("roles.msgCreated"), false);
        showRolesListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }

  const editCancel = document.getElementById("bo-role-edit-cancel");
  if (editCancel && !editCancel.dataset.boWired) {
    editCancel.dataset.boWired = "1";
    editCancel.addEventListener("click", () => {
      showRolesListView();
    });
  }

  const editSave = document.getElementById("bo-role-edit-save");
  if (editSave && !editSave.dataset.boWired) {
    editSave.dataset.boWired = "1";
    editSave.addEventListener("click", async () => {
      msg.style.display = "none";
      const id = editRolePanel?.dataset?.roleId;
      if (!id) return;
      const name = editRolePanel.querySelector("#edit-role-name")?.value?.trim();
      const description = editRolePanel.querySelector("#edit-role-desc")?.value?.trim();
      const functionalityIds = editRoleFuncPickerApi?.getSelectedIds() ?? [];
      try {
        await api.roles.patch(id, { name, description: description || null, functionalityIds });
        await renderRolesTable(tbody, functionalities);
        showToast(msg, t("roles.msgSaved"), false);
        showRolesListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }
}

export { initRolesPage };
