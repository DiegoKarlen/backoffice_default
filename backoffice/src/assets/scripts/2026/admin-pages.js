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

function roleCheckboxHtml(roles, selectedIds) {
  const sel = new Set(selectedIds || []);
  return roles
    .map(
      (r) => `
    <label class="check" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <input type="checkbox" name="role" value="${r.id}" ${sel.has(r.id) ? "checked" : ""}>
      <span class="box"></span>
      <span>${esc(r.code)} — ${esc(r.name)}</span>
    </label>`
    )
    .join("");
}

let editUserPanel = null;

function openUserEditor(user) {
  if (!editUserPanel) return;
  editUserPanel.dataset.userId = user.id;
  const heading = editUserPanel.querySelector("#bo-user-edit-heading");
  if (heading) heading.textContent = t("usersExtra.editTitlePrefix");
  editUserPanel.querySelector("#edit-email").textContent = user.email;
  editUserPanel.querySelector("#edit-displayName").value = user.displayName || "";
  editUserPanel.querySelector("#edit-active").checked = !!user.active;
  editUserPanel.querySelector("#edit-password").value = "";
  const roles = window.__boRolesList || [];
  const holder = editUserPanel.querySelector("#edit-roles");
  holder.innerHTML = roleCheckboxHtml(
    roles,
    user.roles.map((r) => r.id)
  );
  editUserPanel.hidden = false;
  editUserPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    const holder = document.getElementById("create-roles");
    if (holder) holder.innerHTML = roleCheckboxHtml(roles, []);
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

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.style.display = "none";
    const email = document.getElementById("create-email")?.value?.trim();
    const password = document.getElementById("create-password")?.value;
    const displayName = document.getElementById("create-displayName")?.value?.trim();
    const active = document.getElementById("create-active")?.checked ?? true;
    const roleIds = Array.from(form.querySelectorAll('input[name="role"]:checked')).map((i) => i.value);
    try {
      await api.users.create({ email, password, displayName: displayName || undefined, active, roleIds });
      form.reset();
      const cr = document.getElementById("create-roles");
      if (cr) cr.innerHTML = roleCheckboxHtml(roles, []);
      await renderUsersTable(tbody);
      showToast(msg, t("users.msgCreated"), false);
    } catch (ex) {
      showToast(msg, ex.message, true);
    }
  });

  document.getElementById("bo-user-edit-cancel")?.addEventListener("click", () => {
    if (editUserPanel) editUserPanel.hidden = true;
  });

  document.getElementById("bo-user-edit-save")?.addEventListener("click", async () => {
    msg.style.display = "none";
    const id = editUserPanel?.dataset?.userId;
    if (!id) return;
    const displayName = editUserPanel.querySelector("#edit-displayName")?.value?.trim();
    const active = editUserPanel.querySelector("#edit-active")?.checked;
    const password = editUserPanel.querySelector("#edit-password")?.value;
    const roleIds = Array.from(
      editUserPanel.querySelectorAll('input[name="role"]:checked')
    ).map((i) => i.value);
    const body = { displayName: displayName || null, active, roleIds };
    if (password && password.length >= 8) body.password = password;
    try {
      await api.users.patch(id, body);
      editUserPanel.hidden = true;
      await renderUsersTable(tbody);
      showToast(msg, t("users.msgSaved"), false);
    } catch (ex) {
      showToast(msg, ex.message, true);
    }
  });
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

function functionalityCheckboxHtml(functionalities, selectedIds) {
  const sel = new Set(selectedIds || []);
  return functionalities
    .map(
      (f) => `
    <label class="check" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <input type="checkbox" name="func" value="${f.id}" ${sel.has(f.id) ? "checked" : ""}>
      <span class="box"></span>
      <span>${esc(f.code)} — ${esc(f.name)}</span>
    </label>`
    )
    .join("");
}

let editRolePanel = null;

function openRoleEditor(role, functionalities) {
  if (!editRolePanel) return;
  editRolePanel.dataset.roleId = role.id;
  const rh = editRolePanel.querySelector("#bo-role-edit-heading");
  if (rh) rh.textContent = t("rolesExtra.editHeading");
  editRolePanel.querySelector("#edit-role-code").textContent = role.code;
  editRolePanel.querySelector("#edit-role-name").value = role.name;
  editRolePanel.querySelector("#edit-role-desc").value = role.description || "";
  const holder = editRolePanel.querySelector("#edit-role-funcs");
  const ids = role.functionalities.map((f) => f.id);
  holder.innerHTML = functionalityCheckboxHtml(functionalities, ids);
  editRolePanel.hidden = false;
  editRolePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    const holder = document.getElementById("create-role-funcs");
    if (holder) holder.innerHTML = functionalityCheckboxHtml(functionalities, []);
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

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.style.display = "none";
    const code = document.getElementById("create-role-code")?.value?.trim();
    const name = document.getElementById("create-role-name")?.value?.trim();
    const description = document.getElementById("create-role-desc")?.value?.trim();
    const functionalityIds = Array.from(form.querySelectorAll('input[name="func"]:checked')).map(
      (i) => i.value
    );
    try {
      await api.roles.create({ code, name, description: description || undefined, functionalityIds });
      form.reset();
      const holder = document.getElementById("create-role-funcs");
      if (holder) holder.innerHTML = functionalityCheckboxHtml(functionalities, []);
      await renderRolesTable(tbody, functionalities);
      showToast(msg, t("roles.msgCreated"), false);
    } catch (ex) {
      showToast(msg, ex.message, true);
    }
  });

  document.getElementById("bo-role-edit-cancel")?.addEventListener("click", () => {
    if (editRolePanel) editRolePanel.hidden = true;
  });

  document.getElementById("bo-role-edit-save")?.addEventListener("click", async () => {
    msg.style.display = "none";
    const id = editRolePanel?.dataset?.roleId;
    if (!id) return;
    const name = editRolePanel.querySelector("#edit-role-name")?.value?.trim();
    const description = editRolePanel.querySelector("#edit-role-desc")?.value?.trim();
    const functionalityIds = Array.from(
      editRolePanel.querySelectorAll('input[name="func"]:checked')
    ).map((i) => i.value);
    try {
      await api.roles.patch(id, { name, description: description || null, functionalityIds });
      editRolePanel.hidden = true;
      await renderRolesTable(tbody, functionalities);
      showToast(msg, t("roles.msgSaved"), false);
    } catch (ex) {
      showToast(msg, ex.message, true);
    }
  });
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
  if (fh) fh.textContent = t("funcExtra.editHeading");
  editFuncPanel.querySelector("#edit-func-code").textContent = f.code;
  editFuncPanel.querySelector("#edit-func-name").value = f.name;
  editFuncPanel.querySelector("#edit-func-module").value = f.module || "";
  editFuncPanel.querySelector("#edit-func-desc").value = f.description || "";
  editFuncPanel.hidden = false;
  editFuncPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

  form?.addEventListener("submit", async (e) => {
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
    } catch (ex) {
      showToast(msg, ex.message, true);
    }
  });

  document.getElementById("bo-func-edit-cancel")?.addEventListener("click", () => {
    if (editFuncPanel) editFuncPanel.hidden = true;
  });

  document.getElementById("bo-func-edit-save")?.addEventListener("click", async () => {
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
      editFuncPanel.hidden = true;
      await renderFuncTable(tbody);
      showToast(msg, t("func.msgSaved"), false);
    } catch (ex) {
      showToast(msg, ex.message, true);
    }
  });
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
