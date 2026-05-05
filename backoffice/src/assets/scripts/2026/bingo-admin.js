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

/** Default end = start + 7 days (datetime-local string). */
function defaultEndFromStart(startLocalVal) {
  if (!startLocalVal || String(startLocalVal).trim() === "") return "";
  const d = new Date(startLocalVal);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 7);
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
  if (!startIso) throw new Error(t("bingo.errStartRequired"));

  const endRaw = document.getElementById(`${prefix}-end`)?.value;
  const endIso =
    endRaw != null && String(endRaw).trim() !== "" ? datetimeLocalToIso(endRaw) : null;
  if (!endIso) throw new Error(t("bingo.errEndRequired"));

  const roomId = document.getElementById(`${prefix}-roomId`)?.value?.trim();
  if (!roomId) throw new Error(t("bingo.errRoomRequired"));

  const repeatVal = document.getElementById(`${prefix}-repeatEveryMinutes`)?.value;
  const repeatEveryMinutes =
    repeatVal != null && String(repeatVal).trim() !== "" ? Number(repeatVal) : NaN;
  if (!Number.isFinite(repeatEveryMinutes) || repeatEveryMinutes < 1) {
    throw new Error(t("bingo.errRepeatRequired"));
  }

  const name = document.getElementById(`${prefix}-name`)?.value?.trim();
  if (!name) throw new Error(t("bingo.errNameRequired"));

  const cardRaw = document.getElementById(`${prefix}-cardPrice`)?.value;
  const cardPrice = String(cardRaw ?? "").trim();
  const cardNum = parseMoneyAmount(cardPrice);
  if (!Number.isFinite(cardNum) || cardNum <= 0) throw new Error(t("bingo.errCardPriceRequired"));

  const minRaw = document.getElementById(`${prefix}-minPlayersToStart`)?.value;
  const minPlayersToStart = Number(minRaw);
  if (!Number.isFinite(minPlayersToStart) || minPlayersToStart < 1) {
    throw new Error(t("bingo.errMinPlayersRequired"));
  }

  const bingoType = document.getElementById(`${prefix}-bingoType`)?.value?.trim();
  if (!bingoType) throw new Error(t("bingo.errTypeRequired"));

  const active = !!document.getElementById(`${prefix}-active`)?.checked;

  const prizesHost = document.getElementById(`${prefix}-prizes`);

  return {
    roomId,
    name,
    status: active ? "ACTIVE" : "INACTIVE",
    bingoType,
    startDateTime: startIso,
    endDateTime: endIso,
    repeatEveryMinutes,
    cardPrice,
    minPlayersToStart,
    prizes: collectPrizesFromHost(prizesHost),
  };
}

function resetCreateForm() {
  const roomSel = document.getElementById("create-roomId");
  if (roomSel && roomSel.options.length) roomSel.selectedIndex = 0;
  document.getElementById("create-name").value = "";
  document.getElementById("create-bingoType").value = "BINGO_75";
  const startEl = document.getElementById("create-start");
  startEl.value = defaultStartDtLocal();
  const createEnd = document.getElementById("create-end");
  if (createEnd) createEnd.value = defaultEndFromStart(startEl.value);
  document.getElementById("create-repeatEveryMinutes").value = "30";
  document.getElementById("create-cardPrice").value = "1";
  document.getElementById("create-minPlayersToStart").value = "2";
  document.getElementById("create-active").checked = false;
  renderPrizesEditor(document.getElementById("create-prizes"), []);
}

function fillEditForm(bingo) {
  const roomSel = document.getElementById("edit-roomId");
  if (roomSel && bingo.roomId) roomSel.value = bingo.roomId;
  document.getElementById("edit-name").value = bingo.name || "";
  document.getElementById("edit-bingoType").value = bingo.bingoType || "BINGO_75";
  document.getElementById("edit-start").value = isoToDatetimeLocal(bingo.startDateTime);
  const editEnd = document.getElementById("edit-end");
  const startLocal = document.getElementById("edit-start").value;
  if (editEnd) {
    editEnd.value = bingo.endDateTime
      ? isoToDatetimeLocal(bingo.endDateTime)
      : defaultEndFromStart(startLocal);
  }
  document.getElementById("edit-repeatEveryMinutes").value =
    bingo.repeatEveryMinutes != null ? String(bingo.repeatEveryMinutes) : "30";
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

const ROUND_STATUS_TAG = {
  SCHEDULED: "t-used",
  DRAWING: "t-info",
  COMPLETED: "t-active",
  CANCELLED: "t-old",
};

function roundStatusLabel(st) {
  const map = {
    SCHEDULED: "bingo.roundStatusScheduled",
    DRAWING: "bingo.roundStatusDrawing",
    COMPLETED: "bingo.roundStatusCompleted",
    CANCELLED: "bingo.roundStatusCancelled",
  };
  const key = map[st];
  return key ? t(key) : st;
}

/** Sin filtros de fecha/partida: últimas N partidas finalizadas (COMPLETED), más recientes primero. */
const ROUNDS_DEFAULT_COMPLETED_LIMIT = 5;

function clearRoundsFilters() {
  const fromEl = document.getElementById("bo-rounds-filter-from");
  const toEl = document.getElementById("bo-rounds-filter-to");
  const seqEl = document.getElementById("bo-rounds-filter-sequence");
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  if (seqEl) seqEl.value = "";
}

function hasActiveRoundFilters() {
  const fromIso = datetimeLocalToIso(document.getElementById("bo-rounds-filter-from")?.value);
  const toIso = datetimeLocalToIso(document.getElementById("bo-rounds-filter-to")?.value);
  const seqRaw = document.getElementById("bo-rounds-filter-sequence")?.value;
  const seqTrim = seqRaw != null ? String(seqRaw).trim() : "";
  return !!(fromIso || toIso || seqTrim !== "");
}

function getRoundsFilterQuery() {
  if (!hasActiveRoundFilters()) {
    return {
      status: "COMPLETED",
      limit: String(ROUNDS_DEFAULT_COMPLETED_LIMIT),
      sort: "desc",
    };
  }
  const fromIso = datetimeLocalToIso(document.getElementById("bo-rounds-filter-from")?.value);
  const toIso = datetimeLocalToIso(document.getElementById("bo-rounds-filter-to")?.value);
  const seqRaw = document.getElementById("bo-rounds-filter-sequence")?.value;
  const seqTrim = seqRaw != null ? String(seqRaw).trim() : "";
  /** @type {{ from?: string; to?: string; sequence?: string }} */
  const query = {};
  if (fromIso) query.from = fromIso;
  if (toIso) query.to = toIso;
  if (seqTrim !== "") query.sequence = seqTrim;
  return query;
}

function renderRoundsTableHtml(rounds) {
  if (!rounds.length) {
    return `<p class="bo-rounds-empty">${esc(t("bingo.roundsEmpty"))}</p>`;
  }
  return `
    <div class="bo-rounds-table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>${esc(t("bingo.roundsColSeq"))}</th>
            <th>${esc(t("bingo.roundsColStart"))}</th>
            <th>${esc(t("bingo.roundsColStatus"))}</th>
            <th>${esc(t("bingo.roundsColBalls"))}</th>
          </tr>
        </thead>
        <tbody>
          ${rounds
            .map((r) => {
              const tagClass = ROUND_STATUS_TAG[r.status] ?? "t-old";
              const seq = r.sequence;
              const partidaLabel =
                seq != null && Number.isFinite(Number(seq)) ? String(Number(seq)) : "—";
              return `
              <tr>
                <td class="mono bo-rounds-cell-partida">${esc(partidaLabel)}</td>
                <td class="cell-date">${esc(new Date(r.startsAt).toLocaleString())}</td>
                <td><span class="tag ${tagClass}">${esc(roundStatusLabel(r.status))}</span></td>
                <td style="min-width:200px;">${renderRoundBallsCell(r)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderRoundBallsCell(r) {
  const balls = Array.isArray(r.balls) ? r.balls : [];
  if (balls.length > 0) {
    const chips = balls.map((n) => `<span class="bo-rounds-ball">${esc(String(n))}</span>`).join("");
    const extra =
      r.status === "DRAWING"
        ? `<p class="field-help" style="margin:6px 0 0;">${esc(t("bingo.roundsInProgress"))}</p>`
        : "";
    return `<div class="bo-rounds-balls">${chips}</div>${extra}`;
  }
  if (r.status === "COMPLETED") {
    return `<span class="bo-rounds-empty">${esc(t("bingo.roundsNoBalls"))}</span>`;
  }
  return "—";
}

async function loadRoundsTable() {
  const dlg = document.getElementById("bo-bingo-rounds-dialog");
  const content = document.getElementById("bo-bingo-rounds-content");
  const msg = document.getElementById("bo-bingos-msg");
  const bingoId = dlg?.dataset?.bingoId;
  if (!dlg || !content || !bingoId) return;

  content.innerHTML = `<p class="field-help">${esc(t("bingo.roundsLoading"))}</p>`;

  try {
    const data = await api.bingos.rounds(bingoId, getRoundsFilterQuery());
    const rounds = data.rounds || [];
    content.innerHTML = renderRoundsTableHtml(rounds);
  } catch (e) {
    content.innerHTML = `<p class="field-help" style="color:var(--danger, #c0392b);">${esc(e.message)}</p>`;
    showToast(msg, e.message, true);
  }
}

async function openBingoRoundsModal(bingoId, bingoName) {
  const dlg = document.getElementById("bo-bingo-rounds-dialog");
  const heading = document.getElementById("bo-bingo-rounds-heading");
  const content = document.getElementById("bo-bingo-rounds-content");
  if (!dlg || !content || !heading) return;

  dlg.dataset.bingoId = bingoId;
  clearRoundsFilters();
  heading.textContent = `${t("bingo.roundsTitlePrefix")}: ${bingoName || "—"}`;
  content.innerHTML = `<p class="field-help">${esc(t("bingo.roundsLoading"))}</p>`;
  dlg.showModal();
  applyDomI18n(dlg);
  await loadRoundsTable();
}

function wireBingoRoundsDialog() {
  const dlg = document.getElementById("bo-bingo-rounds-dialog");
  if (!dlg || dlg.dataset.boWired) return;
  dlg.dataset.boWired = "1";
  const close = () => dlg.close();
  document.getElementById("bo-bingo-rounds-close")?.addEventListener("click", close);
  document.getElementById("bo-bingo-rounds-dismiss")?.addEventListener("click", close);

  document.getElementById("bo-rounds-filters-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await loadRoundsTable();
  });
  document.getElementById("bo-rounds-filter-clear")?.addEventListener("click", async () => {
    clearRoundsFilters();
    await loadRoundsTable();
  });
}

async function renderBingosTable(tbody) {
  const name = document.getElementById("bingo-filter-name")?.value?.trim();
  const roomName = document.getElementById("bingo-filter-roomName")?.value?.trim();
  const status = document.getElementById("bingo-filter-status")?.value;
  const bingoType = document.getElementById("bingo-filter-type")?.value;

  const { bingos } = await api.bingos.list({
    name,
    roomName: roomName || undefined,
    status,
    bingoType,
  });
  tbody.innerHTML = bingos
    .map(
      (b) => `
    <tr data-id="${esc(b.id)}">
      <td class="cell-name">${esc(b.name)}</td>
      <td>${esc(b.room?.name ?? "—")}</td>
      <td>${esc(typeLabel(b.bingoType))}</td>
      <td>${b.status === "ACTIVE" ? `<span class="tag t-active">${esc(t("bingo.statusActive"))}</span>` : `<span class="tag t-old">${esc(t("bingo.statusInactive"))}</span>`}</td>
      <td>${esc(new Date(b.startDateTime).toLocaleString())}</td>
      <td>${b.endDateTime ? esc(new Date(b.endDateTime).toLocaleString()) : "—"}</td>
      <td>${b.repeatEveryMinutes != null ? esc(String(b.repeatEveryMinutes)) : "—"}</td>
      <td>${esc(b.cardPrice)}</td>
      <td>${esc(String(b.minPlayersToStart ?? "—"))}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button type="button" class="btn btn--ghost btn--sm bo-rounds-bingo">${esc(t("bingo.roundsOpen"))}</button>
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

  tbody.querySelectorAll(".bo-rounds-bingo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      const nameCell = tr?.querySelector(".cell-name");
      const bingoName = nameCell?.textContent?.trim() ?? "";
      if (!id) return;
      await openBingoRoundsModal(id, bingoName);
    });
  });

  tbody.querySelectorAll(".bo-edit-bingo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr")?.dataset?.id;
      if (!id) return;
      const msg = document.getElementById("bo-bingos-msg");
      try {
        await fillRoomSelects();
        const { bingo } = await api.bingos.get(id);
        editingId = id;
        const heading = document.getElementById("bo-bingo-edit-heading");
        if (heading) {
          const name = bingo?.name ? String(bingo.name) : "";
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

async function fillRoomSelects() {
  const { rooms } = await api.rooms.list({});
  const opts = rooms
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}${s.status !== "ACTIVE" ? " (" + t("room.statusInactive") + ")" : ""}</option>`)
    .join("");
  const createSel = document.getElementById("create-roomId");
  const editSel = document.getElementById("edit-roomId");
  if (createSel) createSel.innerHTML = opts;
  if (editSel) editSel.innerHTML = opts;
}

export async function initBingosPage() {
  const wrap = document.querySelector("[data-bo-bingos-wrap]");
  if (!wrap) return;

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
      if (!editingId) return;
      try {
        const payload = collectPayload("edit");
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

