/**
 * Bingo admin — panel visibility and edit state.
 */
let editingId = null;

function showBingosListView() {
  const list = document.getElementById("bo-bingos-list-view");
  const create = document.getElementById("bo-bingo-create-panel");
  const edit = document.getElementById("bo-bingo-edit-panel");
  if (list) list.hidden = false;
  if (create) create.hidden = true;
  if (edit) edit.hidden = true;
  editingId = null;
}

function showBingosCreateView() {
  const list = document.getElementById("bo-bingos-list-view");
  const create = document.getElementById("bo-bingo-create-panel");
  const edit = document.getElementById("bo-bingo-edit-panel");
  if (list) list.hidden = true;
  if (create) create.hidden = false;
  if (edit) edit.hidden = true;
  editingId = null;
}

function showBingosEditView() {
  const list = document.getElementById("bo-bingos-list-view");
  const create = document.getElementById("bo-bingo-create-panel");
  const edit = document.getElementById("bo-bingo-edit-panel");
  if (list) list.hidden = true;
  if (create) create.hidden = true;
  if (edit) edit.hidden = false;
}

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
