/**
 * Rooms — list / create / edit (ABM).
 */
import { api } from "./bo-api.js";
import { t, applyDomI18n } from "./bo-i18n.js";

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function showToast(el, msg, isError) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.color = isError ? "var(--danger, #c0392b)" : "var(--t-muted)";
}

/** @type {string|null} */
let editingId = null;

function showRoomsListView() {
  document.getElementById("bo-rooms-list-view").hidden = false;
  document.getElementById("bo-room-create-panel").hidden = true;
  document.getElementById("bo-room-edit-panel").hidden = true;
  editingId = null;
}

function showRoomsCreateView() {
  document.getElementById("bo-rooms-list-view").hidden = true;
  document.getElementById("bo-room-create-panel").hidden = false;
  document.getElementById("bo-room-edit-panel").hidden = true;
  editingId = null;
}

function showRoomsEditView() {
  document.getElementById("bo-rooms-list-view").hidden = true;
  document.getElementById("bo-room-create-panel").hidden = true;
  document.getElementById("bo-room-edit-panel").hidden = false;
}

async function renderRoomsTable(tbody) {
  const name = document.getElementById("room-filter-name")?.value?.trim();
  const status = document.getElementById("room-filter-status")?.value;

  const q = {};
  if (name) q.name = name;
  if (status) q.status = status;

  const { rooms } = await api.rooms.list(q);
  tbody.innerHTML = rooms
    .map(
      (s) => `
    <tr data-id="${esc(s.id)}">
      <td class="cell-name">${esc(s.name)}</td>
      <td class="mono" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;">
        <a href="${esc(s.displayUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(s.displayUrl)}">${esc(s.displayUrl)}</a>
      </td>
      <td>${s.status === "ACTIVE" ? `<span class="tag t-active">${esc(t("room.statusActive"))}</span>` : `<span class="tag t-old">${esc(t("room.statusInactive"))}</span>`}</td>
      <td>${esc(new Date(s.createdAt).toLocaleString())}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button type="button" class="btn btn--ghost btn--sm bo-edit-room">${esc(t("room.edit"))}</button>
        ${
          s.status !== "ACTIVE"
            ? `<button type="button" class="btn btn--ghost btn--sm bo-act-room">${esc(t("room.activate"))}</button>`
            : `<button type="button" class="btn btn--ghost btn--sm bo-deact-room">${esc(t("room.deactivate"))}</button>`
        }
        <button type="button" class="btn btn--ghost btn--sm bo-del-room">${esc(t("room.delete"))}</button>
      </td>
    </tr>`,
    )
    .join("");

  const msg = document.getElementById("bo-rooms-msg");

  tbody.querySelectorAll(".bo-edit-room").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr")?.dataset?.id;
      if (!id) return;
      try {
        const { room } = await api.rooms.get(id);
        editingId = id;
        document.getElementById("edit-room-name").value = room.name || "";
        const slugEl = document.getElementById("edit-room-slug");
        if (slugEl) slugEl.value = room.slug || "";
        document.getElementById("edit-room-active").checked = room.status === "ACTIVE";
        const heading = document.getElementById("bo-room-edit-heading");
        if (heading) {
          heading.textContent = room.name ? `${t("room.editTitlePrefix")}: ${room.name}` : t("room.editTitlePrefix");
        }
        showRoomsEditView();
        applyDomI18n(document.getElementById("bo-room-edit-panel"));
      } catch (e) {
        showToast(msg, e.message, true);
      }
    });
  });

  tbody.querySelectorAll(".bo-act-room").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr")?.dataset?.id;
      if (!id) return;
      try {
        await api.rooms.activate(id);
        await renderRoomsTable(tbody);
        showToast(msg, t("room.msgSaved"), false);
      } catch (e) {
        showToast(msg, e.message, true);
      }
    });
  });

  tbody.querySelectorAll(".bo-deact-room").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr")?.dataset?.id;
      if (!id) return;
      try {
        await api.rooms.deactivate(id);
        await renderRoomsTable(tbody);
        showToast(msg, t("room.msgSaved"), false);
      } catch (e) {
        showToast(msg, e.message, true);
      }
    });
  });

  tbody.querySelectorAll(".bo-del-room").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr")?.dataset?.id;
      if (!id || !window.confirm(t("room.confirmDelete"))) return;
      try {
        await api.rooms.remove(id);
        await renderRoomsTable(tbody);
        showToast(msg, t("room.msgDeleted"), false);
      } catch (e) {
        showToast(msg, e.message, true);
      }
    });
  });
}

export async function initRoomsPage() {
  const wrap = document.querySelector("[data-bo-rooms-wrap]");
  if (!wrap) return;

  const tbody = document.getElementById("bo-room-tbody");
  const msg = document.getElementById("bo-rooms-msg");
  const createForm = document.getElementById("bo-room-create-form");

  applyDomI18n(document.getElementById("bo-rooms-list-view"));

  try {
    await renderRoomsTable(tbody);
  } catch (e) {
    showToast(msg, e.message, true);
  }

  showRoomsListView();

  const btnNew = document.getElementById("bo-rooms-btn-new");
  if (btnNew && !btnNew.dataset.boWired) {
    btnNew.dataset.boWired = "1";
    btnNew.addEventListener("click", () => {
      document.getElementById("create-room-name").value = "";
      const cslug = document.getElementById("create-room-slug");
      if (cslug) cslug.value = "";
      document.getElementById("create-room-active").checked = false;
      showRoomsCreateView();
      applyDomI18n(document.getElementById("bo-room-create-panel"));
    });
  }

  const roomFiltersForm = document.getElementById("bo-room-filters-form");
  if (roomFiltersForm && !roomFiltersForm.dataset.boWired) {
    roomFiltersForm.dataset.boWired = "1";
    roomFiltersForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await renderRoomsTable(tbody);
      } catch (err) {
        showToast(msg, err.message, true);
      }
    });
  }

  const cancelCreate = document.getElementById("bo-room-create-cancel");
  if (cancelCreate && !cancelCreate.dataset.boWired) {
    cancelCreate.dataset.boWired = "1";
    cancelCreate.addEventListener("click", () => showRoomsListView());
  }

  if (createForm && !createForm.dataset.boSubmitWired) {
    createForm.dataset.boSubmitWired = "1";
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (msg) msg.style.display = "none";
      try {
        const name = document.getElementById("create-room-name")?.value?.trim();
        if (!name) throw new Error(t("room.labelName") + " required");
        const slug = document.getElementById("create-room-slug")?.value?.trim().toLowerCase();
        if (!slug) throw new Error(t("room.labelSlug") + " required");
        const active = !!document.getElementById("create-room-active")?.checked;
        await api.rooms.create({ name, slug, status: active ? "ACTIVE" : "INACTIVE" });
        await renderRoomsTable(tbody);
        showToast(msg, t("room.msgCreated"), false);
        showRoomsListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }

  const editCancel = document.getElementById("bo-room-edit-cancel");
  if (editCancel && !editCancel.dataset.boWired) {
    editCancel.dataset.boWired = "1";
    editCancel.addEventListener("click", () => showRoomsListView());
  }

  const editSave = document.getElementById("bo-room-edit-save");
  if (editSave && !editSave.dataset.boWired) {
    editSave.dataset.boWired = "1";
    editSave.addEventListener("click", async () => {
      if (msg) msg.style.display = "none";
      if (!editingId) return;
      try {
        const name = document.getElementById("edit-room-name")?.value?.trim();
        if (!name) throw new Error(t("room.labelName") + " required");
        const slug = document.getElementById("edit-room-slug")?.value?.trim().toLowerCase();
        if (!slug) throw new Error(t("room.labelSlug") + " required");
        const active = !!document.getElementById("edit-room-active")?.checked;
        await api.rooms.put(editingId, { name, slug, status: active ? "ACTIVE" : "INACTIVE" });
        await renderRoomsTable(tbody);
        showToast(msg, t("room.msgSaved"), false);
        showRoomsListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }
}
