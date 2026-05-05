/**
 * Bingos — admin ABM matching Users flow (list → create panel → edit panel).
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

function isoToDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(val) {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function defaultStartDtLocal() {
  const d = new Date(Date.now() + 86400000);
  d.setMinutes(0, 0, 0);
  return isoToDatetimeLocal(d.toISOString());
}

function parseMoneyAmount(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return NaN;
  const normalized = s.replace(",", ".");
  return Number(normalized);
}

/** @type {string|null} */
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

function renderPrizesEditor(host, prizes) {
  if (!host) return;
  const figureOptions = [
    { v: "LINE", l: t("bingo.figureLine") },
    { v: "PERIMETER", l: t("bingo.figurePerimeter") },
    { v: "FULL_HOUSE", l: t("bingo.figureFullHouse") },
  ];

  let rows = prizes || [];
  if (!rows.length) rows = [{ figure: "LINE", amount: "1" }];
  host.innerHTML = `
    <div class="field-help" style="margin-bottom:10px;">${esc(t("bingo.prizesHelp"))}</div>
    <div data-bo-prize-list>
      ${rows
        .map(
          (p) => `
        <div class="bo-bingo-prize-row" data-bo-prize-row>
          <div class="field field--underline">
            <label class="field-label" data-i18n="bingo.prizeFigure"></label>
            <select class="input input--underline" data-bo-prize-figure>
              ${figureOptions
                .map(
                  (o) =>
                    `<option value="${esc(o.v)}"${o.v === p.figure ? " selected" : ""}>${esc(o.l)}</option>`,
                )
                .join("")}
            </select>
          </div>
          <div class="field field--underline">
            <label class="field-label" data-i18n="bingo.prizeAmount"></label>
            <input class="input input--underline" type="text" inputmode="decimal" value="${esc(p.amount ?? "")}" data-bo-prize-amount>
          </div>
          <button type="button" class="btn btn--ghost btn--sm" data-bo-prize-remove>${esc(t("bingo.prizeRemove"))}</button>
        </div>`,
        )
        .join("")}
    </div>
    <button type="button" class="btn btn--ghost btn--sm" data-bo-prize-add>${esc(t("bingo.prizeAdd"))}</button>
  `;

  const list = host.querySelector("[data-bo-prize-list]");

  host.querySelectorAll("[data-bo-prize-remove]").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest("[data-bo-prize-row]")?.remove());
  });
  host.querySelector("[data-bo-prize-add]")?.addEventListener("click", () => {
    if (!list) return;
    list.insertAdjacentHTML(
      "beforeend",
      `
      <div class="bo-bingo-prize-row" data-bo-prize-row>
        <div class="field field--underline">
          <label class="field-label" data-i18n="bingo.prizeFigure"></label>
          <select class="input input--underline" data-bo-prize-figure>
            ${figureOptions.map((o) => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join("")}
          </select>
        </div>
        <div class="field field--underline">
          <label class="field-label" data-i18n="bingo.prizeAmount"></label>
          <input class="input input--underline" type="text" inputmode="decimal" value="1" data-bo-prize-amount>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-bo-prize-remove>${esc(t("bingo.prizeRemove"))}</button>
      </div>`,
    );
    applyDomI18n(host);
    const newBtn = list.querySelector("[data-bo-prize-row]:last-child [data-bo-prize-remove]");
    newBtn?.addEventListener("click", () => newBtn.closest("[data-bo-prize-row]")?.remove());
  });

  applyDomI18n(host);
}

function collectPrizesFromHost(host) {
  if (!host) return [];
  const rows = [...host.querySelectorAll("[data-bo-prize-row]")];
  const prizes = [];
  const seen = new Set();

  for (const row of rows) {
    const figRaw = row.querySelector("[data-bo-prize-figure]")?.value;
    const amtRaw = row.querySelector("[data-bo-prize-amount]")?.value;
    const fig = figRaw != null ? String(figRaw).trim() : "";
    const amt = amtRaw != null ? String(amtRaw).trim() : "";

    if (!fig && !amt) continue;
    if (!fig && amt) throw new Error(t("bingo.errPrizeFigureMissing"));
    if (fig && !amt) throw new Error(t("bingo.errPrizeAmountMissing"));

    if (seen.has(fig)) throw new Error(t("bingo.errPrizeDupFigure"));
    seen.add(fig);

    const n = parseMoneyAmount(amt);
    if (!Number.isFinite(n) || n <= 0) throw new Error(t("bingo.errPrizeAmountInvalid"));

    prizes.push({ figure: fig, amount: amt });
  }

  if (prizes.length < 1) throw new Error(t("bingo.errPrizeMinOne"));
  return prizes;
}

function collectPayload(prefix) {
  const startIso = datetimeLocalToIso(document.getElementById(`${prefix}-start`)?.value);
  if (!startIso) throw new Error("Start date required");

  const repeatVal = document.getElementById(`${prefix}-repeatEveryMinutes`)?.value;
  const repeatEveryMinutes = repeatVal != null && String(repeatVal).trim() !== "" ? Number(repeatVal) : null;

  const active = !!document.getElementById(`${prefix}-active`)?.checked;

  const prizesHost = document.getElementById(`${prefix}-prizes`);

  return {
    roomName: document.getElementById(`${prefix}-roomName`)?.value?.trim(),
    status: active ? "ACTIVE" : "INACTIVE",
    bingoType: document.getElementById(`${prefix}-bingoType`)?.value || "BINGO_75",
    startDateTime: startIso,
    repeatEveryMinutes,
    cardPrice: document.getElementById(`${prefix}-cardPrice`)?.value || "0",
    minPlayersToStart: Number(document.getElementById(`${prefix}-minPlayersToStart`)?.value ?? 2),
    prizes: collectPrizesFromHost(prizesHost),
  };
}

function resetCreateForm() {
  document.getElementById("create-roomName").value = "";
  document.getElementById("create-bingoType").value = "BINGO_75";
  document.getElementById("create-start").value = defaultStartDtLocal();
  document.getElementById("create-repeatEveryMinutes").value = "30";
  document.getElementById("create-cardPrice").value = "1";
  document.getElementById("create-minPlayersToStart").value = "2";
  document.getElementById("create-active").checked = false;
  renderPrizesEditor(document.getElementById("create-prizes"), []);
}

function fillEditForm(bingo) {
  document.getElementById("edit-roomName").value = bingo.roomName || "";
  document.getElementById("edit-bingoType").value = bingo.bingoType || "BINGO_75";
  document.getElementById("edit-start").value = isoToDatetimeLocal(bingo.startDateTime);
  document.getElementById("edit-repeatEveryMinutes").value =
    bingo.repeatEveryMinutes != null ? String(bingo.repeatEveryMinutes) : "";
  document.getElementById("edit-cardPrice").value = String(bingo.cardPrice ?? "0");
  document.getElementById("edit-minPlayersToStart").value = String(bingo.minPlayersToStart ?? 2);
  document.getElementById("edit-active").checked = bingo.status === "ACTIVE";
  renderPrizesEditor(
    document.getElementById("edit-prizes"),
    (bingo.prizes || []).map((p) => ({ figure: p.figure, amount: p.amount })),
  );
}

function typeLabel(tpe) {
  if (tpe === "BINGO_75") return t("bingo.type75");
  if (tpe === "BINGO_90") return t("bingo.type90");
  return tpe;
}

async function renderBingosTable(tbody) {
  const roomName = document.getElementById("bingo-filter-name")?.value?.trim();
  const status = document.getElementById("bingo-filter-status")?.value;
  const bingoType = document.getElementById("bingo-filter-type")?.value;

  const { bingos } = await api.bingos.list({ roomName, status, bingoType });
  tbody.innerHTML = bingos
    .map(
      (b) => `
    <tr data-id="${esc(b.id)}">
      <td class="cell-name">${esc(b.roomName)}</td>
      <td>${esc(typeLabel(b.bingoType))}</td>
      <td>${b.status === "ACTIVE" ? `<span class="tag t-active">${esc(t("bingo.statusActive"))}</span>` : `<span class="tag t-old">${esc(t("bingo.statusInactive"))}</span>`}</td>
      <td>${esc(new Date(b.startDateTime).toLocaleString())}</td>
      <td>${b.repeatEveryMinutes != null ? esc(String(b.repeatEveryMinutes)) : "—"}</td>
      <td>${esc(b.cardPrice)}</td>
      <td>${esc(String(b.minPlayersToStart ?? "—"))}</td>
      <td style="text-align:right;white-space:nowrap;">
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

  tbody.querySelectorAll(".bo-edit-bingo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr")?.dataset?.id;
      if (!id) return;
      const msg = document.getElementById("bo-bingos-msg");
      try {
        const { bingo } = await api.bingos.get(id);
        editingId = id;
        const heading = document.getElementById("bo-bingo-edit-heading");
        if (heading) {
          const name = bingo?.roomName ? String(bingo.roomName) : "";
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

export async function initBingosPage() {
  const wrap = document.querySelector("[data-bo-bingos-wrap]");
  if (!wrap) return;

  const tbody = document.getElementById("bo-bingo-tbody");
  const msg = document.getElementById("bo-bingos-msg");
  const createForm = document.getElementById("bo-bingo-create-form");

  renderPrizesEditor(document.getElementById("create-prizes"), []);

  try {
    await renderBingosTable(tbody);
  } catch (e) {
    showToast(msg, e.message, true);
  }

  showBingosListView();

  const btnNew = document.getElementById("bo-bingos-btn-new");
  if (btnNew && !btnNew.dataset.boWired) {
    btnNew.dataset.boWired = "1";
    btnNew.addEventListener("click", () => {
      resetCreateForm();
      showBingosCreateView();
      applyDomI18n(document.getElementById("bo-bingo-create-panel"));
    });
  }

  const filterApply = document.getElementById("bo-bingo-filter-apply");
  if (filterApply && !filterApply.dataset.boWired) {
    filterApply.dataset.boWired = "1";
    filterApply.addEventListener("click", async () => {
      try {
        await renderBingosTable(tbody);
      } catch (e) {
        showToast(msg, e.message, true);
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
        if (!payload.roomName) throw new Error(t("bingo.labelRoomName") + " required");
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

  const editSave = document.getElementById("bo-bingo-edit-save");
  if (editSave && !editSave.dataset.boWired) {
    editSave.dataset.boWired = "1";
    editSave.addEventListener("click", async () => {
      if (msg) msg.style.display = "none";
      if (!editingId) return;
      try {
        const payload = collectPayload("edit");
        if (!payload.roomName) throw new Error(t("bingo.labelRoomName") + " required");
        await api.bingos.put(editingId, payload);
        await renderBingosTable(tbody);
        showToast(msg, t("bingo.msgSaved"), false);
        showBingosListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }
}

