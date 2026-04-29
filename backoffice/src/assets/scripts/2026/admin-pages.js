/**
 * Sign-in + administration CRUD pages (users / roles / functionalities).
 */
import {
  clearSession,
  getToken,
  getUser,
  hasFunctionality,
  requireAuth,
  setSession,
} from "./bo-config.js";
import { api, loginRequest } from "./bo-api.js";
import { t } from "./bo-i18n.js";

function showToast(el, msg, isError) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.color = isError ? "var(--danger, #c0392b)" : "var(--t-muted)";
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function updateShellUserChrome() {
  const u = getUser();
  const nameEl = document.querySelector(".workspace-name");
  const roleEl = document.querySelector(".workspace-role");
  const avatarEl = document.querySelector(".workspace-avatar");
  const ddName = document.querySelector(".dd-profile-name");
  const ddEmail = document.querySelector(".dd-profile-email");
  const ddAvatar = document.querySelector(".avatar.dd-profile") || document.querySelector(".avatar");
  if (!u) return;
  const label = u.displayName || u.email || "User";
  const initials = label
    .split(/\s+/)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (nameEl) nameEl.textContent = label;
  if (roleEl) roleEl.textContent = u.roles?.map((r) => r.code).join(", ") || "—";
  if (avatarEl) avatarEl.textContent = initials;
  if (ddName) ddName.textContent = label;
  if (ddEmail) ddEmail.textContent = u.email || "";
  if (ddAvatar && ddAvatar.textContent && ddAvatar.childNodes.length === 1) ddAvatar.textContent = initials;
}

function wireLogout() {
  const link = document.getElementById("bo-logout");
  if (!link || link.dataset.boWired) return;
  link.dataset.boWired = "1";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    clearSession();
    window.location.href = "signin.html";
  });
}

function filterNavByFunctionality() {
  document.querySelectorAll("a.nav-link[data-bo-func]").forEach((a) => {
    const code = a.getAttribute("data-bo-func");
    // Sin sesión, hasFunctionality siempre es false y ocultaba todo el bloque Admin.
    // Solo aplicamos RBAC en el menú cuando ya hay token; si no, se muestran los enlaces
    // (las páginas siguen exigiendo login).
    if (!getToken()) return;
    if (code && !hasFunctionality(code)) {
      a.style.display = "none";
    }
  });
}

function getPageType() {
  return document.body?.getAttribute("data-bo-page") || "";
}

/* --- Sign in --- */

function initSignin() {
  const form = document.getElementById("bo-signin-form");
  if (!form) return;
  const err = document.getElementById("bo-signin-error");
  if (getToken()) {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    window.location.href = next && next.startsWith("/") ? next : "index.html";
    return;
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.style.display = "none";
    const email = document.getElementById("email")?.value?.trim();
    const password = document.getElementById("password")?.value;
    const persist = document.getElementById("remember")?.checked;
    try {
      clearSession();
      const data = await loginRequest({ email, password });
      setSession(data.accessToken, data.user, persist);
      const params = new URLSearchParams(window.location.search);
      let next = params.get("next");
      if (next) {
        try {
          next = decodeURIComponent(next);
        } catch {
          /* keep */
        }
      }
      if (next && !next.includes("signin.html")) {
        window.location.href = next.startsWith("/") ? next.slice(1) : next;
      } else {
        window.location.href = "index.html";
      }
    } catch (ex) {
      showToast(err, ex.message || t("errors.loginFailed"), true);
    }
  });
}

/* --- Users --- */

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

/** @type {{ getSelectedIds: () => string[], setSelectedIds: (ids: string[]) => void, destroy: () => void } | null} */
let createUserRolePickerApi = null;
/** @type {{ getSelectedIds: () => string[], setSelectedIds: (ids: string[]) => void, destroy: () => void } | null} */
let editUserRolePickerApi = null;
/** @type {{ getSelectedIds: () => string[], setSelectedIds: (ids: string[]) => void, destroy: () => void } | null} */
let createRoleFuncPickerApi = null;
/** @type {{ getSelectedIds: () => string[], setSelectedIds: (ids: string[]) => void, destroy: () => void } | null} */
let editRoleFuncPickerApi = null;

/**
 * Chip + search picker (shared UX: users→roles and roles→functionalities).
 * @param {HTMLElement} hostEl
 * @param {Array<{ id: string, code: string, name: string, module?: string | null }>} items
 * @param {string[]} initialIds
 * @param {{ placeholder: string, emptyHint: string, removeAria: string }} labels
 */
function mountItemPicker(hostEl, items, initialIds = [], labels) {
  const selected = new Set((initialIds || []).map((id) => String(id)));

  hostEl.innerHTML = `
    <div class="bo-role-picker">
      <div class="bo-role-picker-chips" aria-live="polite"></div>
      <div class="bo-role-picker-field">
        <input type="search" class="input input--underline bo-role-picker-search" autocomplete="off" spellcheck="false"
          placeholder="${esc(labels.placeholder)}" />
        <ul class="bo-role-picker-dropdown" role="listbox" hidden></ul>
      </div>
    </div>
  `;

  const chipsEl = hostEl.querySelector(".bo-role-picker-chips");
  const searchEl = /** @type {HTMLInputElement} */ (hostEl.querySelector(".bo-role-picker-search"));
  const dropEl = hostEl.querySelector(".bo-role-picker-dropdown");
  if (!chipsEl || !searchEl || !dropEl) {
    return {
      getSelectedIds: () => [],
      setSelectedIds: () => {},
      destroy: () => {
        hostEl.innerHTML = "";
      },
    };
  }

  function itemById(id) {
    return items.find((x) => String(x.id) === String(id));
  }

  function renderChips() {
    const ids = [...selected];
    if (ids.length === 0) {
      chipsEl.innerHTML = `<p class="bo-role-picker-empty">${esc(labels.emptyHint)}</p>`;
      return;
    }
    chipsEl.innerHTML = ids
      .map((id) => {
        const r = itemById(id);
        if (!r) return "";
        const rid = esc(String(id));
        return `<span class="tag t-info bo-role-chip" data-pick-id="${rid}">
          <span>${esc(r.code)} — ${esc(r.name)}</span>
          <button type="button" class="bo-role-chip-remove" data-pick-id="${rid}" aria-label="${esc(labels.removeAria)}">×</button>
        </span>`;
      })
      .join("");
    chipsEl.querySelectorAll(".bo-role-chip-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        selected.delete(btn.getAttribute("data-pick-id"));
        renderChips();
        renderDropdown();
      });
    });
  }

  function filterAvailable(query) {
    const q = (query || "").trim().toLowerCase();
    let available = items.filter((r) => !selected.has(String(r.id)));
    available = [...available].sort((a, b) => String(a.code).localeCompare(String(b.code)));
    if (!q) return available;
    return available.filter((r) => {
      const parts = [r.code, r.name, r.module].filter(Boolean).map((x) => String(x).toLowerCase());
      return parts.some((p) => p.includes(q));
    });
  }

  function renderDropdown() {
    const rows = filterAvailable(searchEl.value).slice(0, 15);
    dropEl.innerHTML = rows
      .map(
        (r) =>
          `<li role="presentation"><button type="button" class="bo-role-picker-option" role="option" data-pick-id="${esc(String(r.id))}">${esc(r.code)} — ${esc(r.name)}</button></li>`,
      )
      .join("");
    dropEl.hidden = rows.length === 0;
  }

  /** @param {MouseEvent} ev */
  function onDocClick(ev) {
    if (!hostEl.contains(/** @type {Node} */ (ev.target))) dropEl.hidden = true;
  }

  document.addEventListener("click", onDocClick);

  searchEl.addEventListener("input", () => renderDropdown());
  searchEl.addEventListener("focus", () => renderDropdown());
  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dropEl.hidden = true;
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  dropEl.addEventListener("mousedown", (e) => {
    if (e.target.closest(".bo-role-picker-option")) e.preventDefault();
  });
  dropEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".bo-role-picker-option");
    if (!btn) return;
    const pid = btn.getAttribute("data-pick-id");
    if (pid) selected.add(pid);
    searchEl.value = "";
    renderChips();
    renderDropdown();
    searchEl.focus();
  });

  renderChips();
  renderDropdown();

  return {
    getSelectedIds: () => [...selected].map(String),
    setSelectedIds: (ids) => {
      selected.clear();
      (ids || []).forEach((id) => selected.add(String(id)));
      renderChips();
      renderDropdown();
    },
    destroy: () => {
      document.removeEventListener("click", onDocClick);
      hostEl.innerHTML = "";
    },
  };
}

/**
 * Buscar roles y asignarlos como chips (crear / editar usuario).
 * @param {HTMLElement} hostEl
 * @param {Array<{ id: string, code: string, name: string }>} allRoles
 * @param {string[]} initialIds
 */
function mountRolePicker(hostEl, allRoles, initialIds = []) {
  return mountItemPicker(hostEl, allRoles, initialIds, {
    placeholder: t("users.searchRoles"),
    emptyHint: t("users.noRolesYet"),
    removeAria: t("users.removeRole"),
  });
}

/**
 * Buscar funcionalidades y asignarlas como chips (crear / editar rol).
 */
function mountFunctionalityPicker(hostEl, allFunctionalities, initialIds = []) {
  return mountItemPicker(hostEl, allFunctionalities, initialIds, {
    placeholder: t("roles.searchFuncs"),
    emptyHint: t("roles.noFuncsYet"),
    removeAria: t("roles.removeFunc"),
  });
}

function destroyRoleFuncPickers() {
  createRoleFuncPickerApi?.destroy();
  createRoleFuncPickerApi = null;
  editRoleFuncPickerApi?.destroy();
  editRoleFuncPickerApi = null;
}

function destroyUserRolePickers() {
  createUserRolePickerApi?.destroy();
  createUserRolePickerApi = null;
  editUserRolePickerApi?.destroy();
  editUserRolePickerApi = null;
}

async function renderUsersTable(tbody) {
  const { users } = await api.users.list();
  tbody.innerHTML = users
    .map(
      (u) => `
    <tr data-id="${u.id}">
      <td class="cell-name">${esc(u.email)}</td>
      <td>${esc(u.displayName || "—")}</td>
      <td>${u.active ? `<span class="tag t-active">${t("users.active")}</span>` : `<span class="tag t-old">${t("users.inactive")}</span>`}</td>
      <td>${u.roles.map((r) => `<span class="tag t-info">${esc(r.code)}</span>`).join(" ")}</td>
      <td style="text-align:right;"><button type="button" class="btn btn--ghost btn--sm bo-edit-user">${t("users.edit")}</button></td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll(".bo-edit-user").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      const u = users.find((x) => x.id === id);
      if (u) openUserEditor(u);
    });
  });
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
  if (!hasFunctionality("bo.users.manage")) {
    document.querySelector("[data-bo-users-wrap]")?.remove();
    showToast(document.getElementById("bo-users-msg"), t("errors.noPermissionUsers"), true);
    return;
  }
  const tbody = document.querySelector("#bo-users-tbody");
  const msg = document.getElementById("bo-users-msg");
  const form = document.getElementById("bo-user-create-form");
  editUserPanel = document.getElementById("bo-user-edit-panel");

  let roles = [];
  try {
    const r = await api.roles.list();
    roles = r.roles;
    window.__boRolesList = roles;
    destroyUserRolePickers();
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

/* --- Roles --- */

async function renderRolesTable(tbody, functionalities) {
  const { roles } = await api.roles.list();
  tbody.innerHTML = roles
    .map(
      (r) => `
    <tr data-id="${r.id}">
      <td class="cell-name">${esc(r.code)}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.description || "—")}</td>
      <td>${r.functionalities.length}</td>
      <td style="text-align:right;"><button type="button" class="btn btn--ghost btn--sm bo-edit-role">${t("roles.edit")}</button></td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll(".bo-edit-role").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      const role = roles.find((x) => x.id === id);
      if (role) openRoleEditor(role, functionalities);
    });
  });
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
  if (!hasFunctionality("bo.roles.manage")) {
    document.querySelector("[data-bo-roles-wrap]")?.remove();
    showToast(document.getElementById("bo-roles-msg"), t("errors.noPermissionRoles"), true);
    return;
  }
  const tbody = document.querySelector("#bo-roles-tbody");
  const msg = document.getElementById("bo-roles-msg");
  const form = document.getElementById("bo-role-create-form");
  editRolePanel = document.getElementById("bo-role-edit-panel");

  let functionalities = [];
  try {
    const f = await api.functionalities.list();
    functionalities = f.functionalities;
    destroyRoleFuncPickers();
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

/* --- Functionalities --- */

async function renderFuncTable(tbody) {
  const { functionalities } = await api.functionalities.list();
  tbody.innerHTML = functionalities
    .map(
      (f) => `
    <tr data-id="${f.id}">
      <td class="cell-name">${esc(f.code)}</td>
      <td>${esc(f.name)}</td>
      <td>${esc(f.module || "—")}</td>
      <td>${esc(f.description || "—")}</td>
      <td style="text-align:right;"><button type="button" class="btn btn--ghost btn--sm bo-edit-func">${t("func.edit")}</button></td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll(".bo-edit-func").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      const fn = functionalities.find((x) => x.id === id);
      if (fn) openFuncEditor(fn);
    });
  });
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
  if (!hasFunctionality("bo.functionalities.manage")) {
    document.querySelector("[data-bo-func-wrap]")?.remove();
    showToast(document.getElementById("bo-func-msg"), t("errors.noPermissionFunc"), true);
    return;
  }
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

export function initAdminPages() {
  const page = getPageType();
  if (page === "signin") {
    initSignin();
    return;
  }

  /** Todas las páginas con shell exigen sesión (refuerzo junto a index.js). */
  if (!requireAuth()) return;

  wireLogout();
  filterNavByFunctionality();
  updateShellUserChrome();

  if (page === "users") initUsersPage();
  else if (page === "roles") initRolesPage();
  else if (page === "functionalities") initFunctionalitiesPage();
}
