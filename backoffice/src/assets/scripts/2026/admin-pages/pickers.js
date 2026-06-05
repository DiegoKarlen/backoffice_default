/**
 * Admin pages — role/functionality chip pickers.
 */
import { esc } from "../bo-escape.js";
import { t } from "../bo-i18n.js";

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

export {
  mountItemPicker,
  mountRolePicker,
  mountFunctionalityPicker,
  destroyRoleFuncPickers,
  destroyUserRolePickers,
};
