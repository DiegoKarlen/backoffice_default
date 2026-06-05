/**
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

function showUsersListView() {
  const list = document.getElementById("bo-users-list-view");
  const create = document.getElementById("bo-user-create-panel");
  const edit = document.getElementById("bo-user-edit-panel");
  if (list) list.hidden = false;
  if (create) create.hidden = true;
  if (edit) edit.hidden = true;
}

function showUsersCreateView() {
  const list = document.getElementById("bo-users-list-view");
  const create = document.getElementById("bo-user-create-panel");
  const edit = document.getElementById("bo-user-edit-panel");
  if (list) list.hidden = true;
  if (create) create.hidden = false;
  if (edit) edit.hidden = true;
}

function showUsersEditView() {
  const list = document.getElementById("bo-users-list-view");
  const create = document.getElementById("bo-user-create-panel");
  const edit = document.getElementById("bo-user-edit-panel");
  if (list) list.hidden = true;
  if (create) create.hidden = true;
  if (edit) edit.hidden = false;
}

/** @type {Array<Record<string, unknown>>} */
let usersListCache = [];
/** @type {ReturnType<typeof attachBoPager> | null} */
let usersPager = null;

function paintUsersPage(tbody, users) {
  tbody.innerHTML = users
    .map(
      (u) => `
    <tr data-id="${u.id}">
      <td class="cell-name">${esc(u.email)}</td>
      <td>${esc(u.displayName || "—")}</td>
      <td>${u.active ? `<span class="tag t-active">${t("users.active")}</span>` : `<span class="tag t-old">${t("users.inactive")}</span>`}</td>
      <td>${/** @type {Array<{ code: string }>} */ (u.roles).map((r) => `<span class="tag t-info">${esc(r.code)}</span>`).join(" ")}</td>
      <td style="text-align:right;"><button type="button" class="btn btn--ghost btn--sm bo-edit-user">${t("users.edit")}</button></td>
    </tr>`,
    )
    .join("");

  tbody.querySelectorAll(".bo-edit-user").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      const u = usersListCache.find((x) => x.id === id);
      if (u) openUserEditor(/** @type {Parameters<typeof openUserEditor>[0]} */ (u));
    });
  });
}

async function renderUsersTable(tbody) {
  const { users } = await api.users.list();
  usersListCache = users;
  const anchor = pagerAnchorFromTbody(tbody);
  if (!usersPager && anchor) {
    usersPager = attachBoPager({
      anchor,
      getItems: () => usersListCache,
      renderPage: (slice) => paintUsersPage(tbody, /** @type {typeof usersListCache} */ (slice)),
    });
  } else {
    usersPager?.reset();
  }
  usersPager?.refresh();
}

let editUserPanel = null;

function openUserEditor(user) {
  const panel = document.getElementById("bo-user-edit-panel");
  if (!panel) return;
  panel.dataset.userId = user.id;
  const heading = panel.querySelector("#bo-user-edit-heading");
  if (heading) heading.textContent = t("usersExtra.editTitlePrefix");
  const emailEl = /** @type {HTMLInputElement | null} */ (panel.querySelector("#edit-email"));
  if (emailEl) emailEl.value = user.email || "";
  panel.querySelector("#edit-displayName").value = user.displayName || "";
  panel.querySelector("#edit-active").checked = !!user.active;
  panel.querySelector("#edit-password").value = "";
  const roles = window.__boRolesList || [];
  const holder = panel.querySelector("#edit-roles");
  editUserRolePickerApi?.destroy();
  editUserRolePickerApi = null;
  if (holder) {
    editUserRolePickerApi = mountRolePicker(
      holder,
      roles,
      user.roles.map((r) => r.id),
    );
  }
  showUsersEditView();
}

async function initUsersPage() {
  usersPager = null;
  const tbody = document.querySelector("#bo-users-tbody");
  const msg = document.getElementById("bo-users-msg");
  const form = document.getElementById("bo-user-create-form");
  editUserPanel = document.getElementById("bo-user-edit-panel");

  let roles = [];
  try {
    const r = await api.roles.list();
    roles = r.roles;
    window.__boRolesList = roles;
    destroyLocalUserRolePickers();
    const holder = document.getElementById("create-roles");
    if (holder) createUserRolePickerApi = mountRolePicker(holder, roles, []);
  } catch (e) {
    showToast(msg, e.message, true);
    return;
  }

  try {
    await renderUsersTable(tbody);
  } catch (e) {
    showToast(msg, e.message, true);
    return;
  }

  showUsersListView();

  const btnNew = document.getElementById("bo-users-btn-new");
  if (btnNew && !btnNew.dataset.boWired) {
    btnNew.dataset.boWired = "1";
    btnNew.addEventListener("click", () => {
      showUsersCreateView();
      form?.reset();
      createUserRolePickerApi?.setSelectedIds([]);
      const ca = document.getElementById("create-active");
      if (ca) ca.checked = true;
    });
  }

  const cancelCreate = document.getElementById("bo-user-create-cancel");
  if (cancelCreate && !cancelCreate.dataset.boWired) {
    cancelCreate.dataset.boWired = "1";
    cancelCreate.addEventListener("click", () => {
      showUsersListView();
    });
  }

  if (form && !form.dataset.boSubmitWired) {
    form.dataset.boSubmitWired = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.style.display = "none";
      const email = document.getElementById("create-email")?.value?.trim();
      const password = document.getElementById("create-password")?.value;
      const displayName = document.getElementById("create-displayName")?.value?.trim();
      const active = document.getElementById("create-active")?.checked ?? true;
      const roleIds = createUserRolePickerApi?.getSelectedIds() ?? [];
      try {
        await api.users.create({ email, password, displayName: displayName || undefined, active, roleIds });
        form.reset();
        createUserRolePickerApi?.setSelectedIds([]);
        await renderUsersTable(tbody);
        showToast(msg, t("users.msgCreated"), false);
        showUsersListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }

  const editCancel = document.getElementById("bo-user-edit-cancel");
  if (editCancel && !editCancel.dataset.boWired) {
    editCancel.dataset.boWired = "1";
    editCancel.addEventListener("click", () => {
      showUsersListView();
    });
  }

  const editSave = document.getElementById("bo-user-edit-save");
  if (editSave && !editSave.dataset.boWired) {
    editSave.dataset.boWired = "1";
    editSave.addEventListener("click", async () => {
      msg.style.display = "none";
      const id = editUserPanel?.dataset?.userId;
      if (!id) return;
      const displayName = editUserPanel.querySelector("#edit-displayName")?.value?.trim();
      const active = editUserPanel.querySelector("#edit-active")?.checked;
      const password = editUserPanel.querySelector("#edit-password")?.value;
      const roleIds = editUserRolePickerApi?.getSelectedIds() ?? [];
      const body = { displayName: displayName || null, active, roleIds };
      if (password && password.length >= 8) body.password = password;
      try {
        await api.users.patch(id, body);
        await renderUsersTable(tbody);
        showToast(msg, t("users.msgSaved"), false);
        showUsersListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }
}

export { initUsersPage };
