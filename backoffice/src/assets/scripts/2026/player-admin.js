/**
 * Players — list + manual wallet credit (backoffice).
 */
import { api } from "./bo-api.js";
import { t, applyDomI18n } from "./bo-i18n.js";
import { attachBoPager, pagerAnchorFromTbody } from "./bo-pager.js";
import { esc, formatBoMoneyFromCents } from "./bo-shared.js";

function showToast(el, msg, isError) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.color = isError ? "var(--danger, #c0392b)" : "var(--t-muted)";
}

/**
 * @param {string} type
 */
function walletTypeLabel(type) {
  const key = `players.walletType.${type}`;
  const lbl = t(key);
  return lbl === key ? String(type) : lbl;
}

/**
 * @param {Record<string, unknown>} tx
 */
function walletDetailLine(tx) {
  const detail = /** @type {{ kind?: string; bingoName?: string; figure?: string; roundSequence?: number | null; depositNote?: string | null }} */ (
    tx.detail || {}
  );
  if (!detail.kind) return "—";
  if (detail.kind === "prize") {
    const figKey = `players.walletFigure.${detail.figure}`;
    const figLbl = t(figKey);
    const figure = figLbl === figKey ? detail.figure : figLbl;
    return figure || "—";
  }
  if (detail.kind === "purchase" || detail.kind === "refund") {
    return "—";
  }
  if (detail.kind === "deposit") {
    return "";
  }
  if (detail.kind === "adjustment") {
    return "";
  }
  return "—";
}

const WALLET_TX_TYPES = ["DEPOSIT", "CARTON_PURCHASE", "PRIZE_CREDIT", "REFUND", "ADJUSTMENT"];

/** @type {Record<string, unknown>[] | null} */
let walletLedgerCache = null;
/** @type {ReturnType<typeof attachBoPager> | null} */
let walletPager = null;

/** Fecha local `YYYY-MM-DD` para inputs type=date. */
function walletLocalDateInputValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resetWalletFilters() {
  const typeEl = /** @type {HTMLSelectElement | null} */ (document.getElementById("bo-wallet-filter-type"));
  if (typeEl) typeEl.value = "";
  for (const id of ["bo-wallet-filter-room", "bo-wallet-filter-bingo", "bo-wallet-filter-round"]) {
    const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
    if (el) el.value = "";
  }
  const today = walletLocalDateInputValue();
  const fromEl = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-wallet-filter-from"));
  const toEl = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-wallet-filter-to"));
  if (fromEl) fromEl.value = today;
  if (toEl) toEl.value = today;
}

/**
 * @param {number | string | null | undefined} seq
 * @param {string} q trimmed lowercase needle
 */
function matchesRoundSearch(seq, q) {
  if (!q) return true;
  if (seq == null || seq === "") return false;
  const s = String(seq);
  const display = `#${s}`.toLowerCase();
  const qNoHash = q.replace(/^#/, "").trim();
  if (/^\d+$/.test(qNoHash)) return s === qNoHash;
  return display.includes(q) || s.toLowerCase().includes(q);
}

function fillWalletTypeFilterOptions() {
  const sel = /** @type {HTMLSelectElement | null} */ (document.getElementById("bo-wallet-filter-type"));
  if (!sel) return;
  const keep = sel.value;
  sel.innerHTML = `<option value="">${esc(t("players.walletFilterAll"))}</option>${WALLET_TX_TYPES.map(
    (typ) => `<option value="${esc(typ)}">${esc(walletTypeLabel(typ))}</option>`,
  ).join("")}`;
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}

/**
 * @param {Record<string, unknown>[]} rows
 */
function filterWalletLedgerRows(rows) {
  const typeF = /** @type {HTMLSelectElement | null} */ (document.getElementById("bo-wallet-filter-type"))?.value ?? "";
  const roomRaw = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-wallet-filter-room"))?.value ?? "";
  const bingoRaw = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-wallet-filter-bingo"))?.value ?? "";
  const roundRaw = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-wallet-filter-round"))?.value ?? "";

  const roomNeedle = roomRaw.trim().toLowerCase();
  const bingoNeedle = bingoRaw.trim().toLowerCase();
  const roundNeedle = roundRaw.trim().toLowerCase();

  const filtered = rows.filter((tx) => {
    if (typeF && String(tx.type) !== typeF) return false;
    const d = /** @type {{ roomName?: string | null; bingoName?: string | null; roundSequence?: number | null }} */ (
      tx.detail || {}
    );
    if (roomNeedle) {
      const hay = String(d.roomName ?? "").toLowerCase();
      if (!hay.includes(roomNeedle)) return false;
    }
    if (bingoNeedle) {
      const hay = String(d.bingoName ?? "").toLowerCase();
      if (!hay.includes(bingoNeedle)) return false;
    }
    if (roundNeedle && !matchesRoundSearch(d.roundSequence, roundNeedle)) return false;
    return true;
  });
  return filtered.sort((a, b) => {
    const tb = Date.parse(String(b.createdAt ?? ""));
    const ta = Date.parse(String(a.createdAt ?? ""));
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}

/**
 * @param {Array<Record<string, unknown>>} rows
 */
function paintWalletRows(rows) {
  const tbody = document.getElementById("bo-player-wallet-tbody");
  const emptyEl = document.getElementById("bo-player-wallet-empty");
  if (!tbody) return;
  if (rows.length === 0) {
    tbody.innerHTML = "";
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  tbody.innerHTML = rows.map((row) => renderWalletRow(row)).join("");
  if (emptyEl) emptyEl.hidden = true;
}

function renderWalletLedgerFromCache() {
  if (!walletLedgerCache) return;
  const tbody = document.getElementById("bo-player-wallet-tbody");
  const anchor = tbody ? pagerAnchorFromTbody(tbody) : null;
  if (!walletPager && anchor) {
    walletPager = attachBoPager({
      anchor,
      getItems: () => filterWalletLedgerRows(walletLedgerCache || []),
      renderPage: (slice) => paintWalletRows(/** @type {Array<Record<string, unknown>>} */ (slice)),
    });
  } else {
    walletPager?.reset();
  }
  walletPager?.refresh();
}

/**
 * @param {unknown[][]} grid
 * @param {Set<string>} highlightRc "r,c"
 */
function renderBingo75GridHtml(grid, highlightRc) {
  let html = '<div class="bo-bingo-card-grid">';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = /** @type {{ number?: number | null; isFree?: boolean }} */ (grid[r]?.[c] ?? {});
      const key = `${r},${c}`;
      const cls = ["bo-bingo-cell"];
      if (cell.isFree) cls.push("bo-bingo-cell--free");
      if (highlightRc.has(key)) cls.push("bo-bingo-cell--figure");
      const inner = cell.isFree ? "★" : cell.number != null ? String(cell.number) : "";
      html += `<div class="${cls.join(" ")}">${esc(inner)}</div>`;
    }
  }
  html += "</div>";
  return html;
}

function figureLabel(fig) {
  const key = `players.walletFigure.${fig}`;
  const lbl = t(key);
  return lbl === key ? String(fig) : lbl;
}

/**
 * @param {Record<string, unknown>} tx
 */
function renderWalletRow(tx) {
  const amount = Number(tx.amountCents);
  const amtSign = amount < 0 ? "wallet-amt--out" : "wallet-amt--in";
  const when = tx.createdAt ? new Date(String(tx.createdAt)).toLocaleString(moneyLocaleTag()) : "—";
  const d = /** @type {{ roomName?: string | null; bingoName?: string | null; roundSequence?: number | null }} */ (
    tx.detail || {}
  );
  const room = d.roomName != null && String(d.roomName).trim() !== "" ? String(d.roomName) : "—";
  const bingo = d.bingoName != null && String(d.bingoName).trim() !== "" ? String(d.bingoName) : "—";
  const partida =
    d.roundSequence != null && d.roundSequence !== ""
      ? `#${d.roundSequence}`
      : "—";
  const detailText = walletDetailLine(tx);
  const typ = String(tx.type);
  const showCardBtn = typ === "CARTON_PURCHASE" || typ === "PRIZE_CREDIT";
  const btnHtml = showCardBtn
    ? `<button type="button" class="btn btn--ghost btn--sm bo-wallet-open-card" data-wallet-tx-id="${esc(String(tx.id))}">${esc(t("players.walletDetailViewBtn"))}</button>`
    : "";
  const detailParts = [];
  const showDetailText =
    detailText !== "" && detailText !== "—" && typ !== "PRIZE_CREDIT";
  if (showDetailText) detailParts.push(`<span>${esc(detailText)}</span>`);
  if (btnHtml) detailParts.push(btnHtml);
  const detailTd =
    detailParts.length > 0
      ? `<div class="bo-wallet-detail-stack">${detailParts.join("")}</div>`
      : "";

  return `<tr>
    <td class="mono">${esc(when)}</td>
    <td>${esc(walletTypeLabel(typ))}</td>
    <td>${esc(room)}</td>
    <td>${esc(bingo)}</td>
    <td class="mono">${esc(partida)}</td>
    <td class="mono ${amtSign}">${esc(formatBoMoneyFromCents(amount))}<span class="field-help"> (${esc(String(tx.amountCents))})</span></td>
    <td class="mono">${esc(formatBoMoneyFromCents(tx.balanceAfterCents))}</td>
    <td>${detailTd}</td>
  </tr>`;
}

/**
 * @param {string} playerId
 * @param {{ resetFilters?: boolean }} [opts]
 */
async function refreshWalletLedger(playerId, opts = {}) {
  const resetFilters = opts.resetFilters !== false;
  const tbody = document.getElementById("bo-player-wallet-tbody");
  const emptyEl = document.getElementById("bo-player-wallet-empty");
  const wrap = document.getElementById("bo-player-wallet-wrap");
  if (!tbody) return;
  if (resetFilters) resetWalletFilters();
  tbody.innerHTML = `<tr><td colspan="8" class="field-help">${esc(t("players.walletLoading"))}</td></tr>`;
  if (emptyEl) emptyEl.hidden = true;
  walletLedgerCache = null;
  try {
    const fromVal = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-wallet-filter-from"))?.value?.trim();
    const toVal = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-wallet-filter-to"))?.value?.trim();
    const hasRange = !!(fromVal || toVal);
    const limit = hasRange ? 800 : 200;
    const data = await api.players.walletTransactions(playerId, {
      limit,
      from: fromVal || undefined,
      to: toVal || undefined,
    });
    const rows = Array.isArray(data.transactions) ? data.transactions : [];
    walletLedgerCache = rows;
    fillWalletTypeFilterOptions();
    if (rows.length === 0) {
      walletLedgerCache = [];
      renderWalletLedgerFromCache();
      if (wrap) applyDomI18n(wrap);
      return;
    }
    renderWalletLedgerFromCache();
    if (wrap) applyDomI18n(wrap);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    tbody.innerHTML = `<tr><td colspan="8">${esc(msg)}</td></tr>`;
    walletLedgerCache = null;
    walletPager = null;
  }
}

function wireWalletLedgerFiltersOnce() {
  const form = document.getElementById("bo-player-wallet-filters-form");
  if (!form || form.dataset.boWired) return;
  form.dataset.boWired = "1";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pid = document.getElementById("bo-player-wallet-player-id")?.value?.trim();
    if (pid) {
      await refreshWalletLedger(pid, { resetFilters: false });
    } else {
      renderWalletLedgerFromCache();
    }
  });
}

function showPlayersListView() {
  document.getElementById("bo-players-list-view").hidden = false;
  document.getElementById("bo-player-credit-panel").hidden = true;
  const prize = document.getElementById("bo-player-prize-panel");
  if (prize) prize.hidden = true;
  const act = document.getElementById("bo-player-activity-panel");
  if (act) act.hidden = true;
}

function showCreditPanel(playerLabel, playerId) {
  document.getElementById("bo-players-list-view").hidden = true;
  const act = document.getElementById("bo-player-activity-panel");
  if (act) act.hidden = true;
  const prize = document.getElementById("bo-player-prize-panel");
  if (prize) prize.hidden = true;
  const panel = document.getElementById("bo-player-credit-panel");
  if (!panel) return;
  panel.hidden = false;
  const hiddenId = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-player-credit-id"));
  if (hiddenId) hiddenId.value = playerId;
  const target = document.getElementById("bo-player-credit-target");
  if (target) target.textContent = playerLabel;
  const amt = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-player-credit-amount"));
  const note = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("bo-player-credit-note"));
  if (amt) amt.value = "";
  if (note) note.value = "";
  applyDomI18n(panel);
}

function showPrizePanel(playerLabel, playerId) {
  document.getElementById("bo-players-list-view").hidden = true;
  document.getElementById("bo-player-credit-panel").hidden = true;
  const act = document.getElementById("bo-player-activity-panel");
  if (act) act.hidden = true;
  const panel = document.getElementById("bo-player-prize-panel");
  if (!panel) return;
  panel.hidden = false;
  const hiddenPid = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-player-prize-player-id"));
  const target = document.getElementById("bo-player-prize-target");
  const prizePrizeId = /** @type {HTMLInputElement | null} */ (
    document.getElementById("bo-player-prize-bingo-prize-id")
  );
  const prizeCardId = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-player-prize-card-id"));
  if (hiddenPid) hiddenPid.value = playerId;
  if (target) target.textContent = playerLabel;
  if (prizePrizeId) prizePrizeId.value = "";
  if (prizeCardId) prizeCardId.value = "";
  applyDomI18n(panel);
}

async function showActivityPanel(_playerLabel, playerId) {
  document.getElementById("bo-players-list-view").hidden = true;
  document.getElementById("bo-player-credit-panel").hidden = true;
  const prize = document.getElementById("bo-player-prize-panel");
  if (prize) prize.hidden = true;
  const panel = document.getElementById("bo-player-activity-panel");
  if (!panel) return;
  panel.hidden = false;
  const walletPid = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-player-wallet-player-id"));
  if (walletPid) walletPid.value = playerId;
  applyDomI18n(panel);
  wireWalletLedgerFiltersOnce();
  wireWalletCardDetailUiOnce();
  await refreshWalletLedger(playerId, { resetFilters: true });
}

/**
 * @param {string} walletTxId
 */
async function openWalletCardDetail(walletTxId) {
  const playerId = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-player-wallet-player-id"))
    ?.value?.trim();
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById("bo-wallet-card-dialog"));
  const body = document.getElementById("bo-wallet-card-dialog-body");
  const titleEl = document.getElementById("bo-wallet-card-dialog-title");
  if (!playerId || !dialog || !body || !titleEl) return;

  titleEl.textContent = t("players.walletCardDetailLoading");
  body.innerHTML = `<p class="field-help">${esc(t("players.walletCardDetailLoading"))}</p>`;
  dialog.showModal();
  applyDomI18n(dialog);

  try {
    const data = /** @type {Record<string, unknown>} */ (await api.players.walletTransactionCardDetail(playerId, walletTxId));
    const kind = data.kind;

    if (kind === "purchase") {
      titleEl.textContent = t("players.walletCardDetailPurchaseTitle");
      const cards = /** @type {{ cardIndex: number; grid: unknown[][] }[]} */ (
        Array.isArray(data.cards) ? data.cards : []
      );
      let html = "";
      for (const c of cards) {
        const label = `${t("players.walletCardDetailCardLabel")} #${c.cardIndex + 1}`;
        html += `<div class="bo-wallet-card-pack"><div class="bo-wallet-card-pack__label">${esc(label)}</div>`;
        html += renderBingo75GridHtml(c.grid, new Set());
        html += "</div>";
      }
      body.innerHTML = html || `<p class="field-help">${esc(t("players.walletEmpty"))}</p>`;
      return;
    }

    if (kind === "prize") {
      const figure = String(data.figure ?? "");
      const grid = /** @type {unknown[][]} */ (data.grid);
      const hl = /** @type {{ row: number; col: number }[]} */ (Array.isArray(data.highlight) ? data.highlight : []);
      const drawn = /** @type {number[]} */ (Array.isArray(data.drawnNumbers) ? data.drawnNumbers : []);
      const hlSet = new Set(hl.map((h) => `${h.row},${h.col}`));
      titleEl.textContent = t("players.walletCardDetailPrizeTitle");
      const figLine = figureLabel(figure);
      const ballsText = drawn.map((n) => esc(String(n))).join(", ");
      const figBlock = `<p class="field-help bo-wallet-card-dialog__figure-line">${esc(figLine)}</p>`;
      const gridHtml = renderBingo75GridHtml(grid, hlSet);
      if (drawn.length === 0) {
        body.innerHTML = `${figBlock}${gridHtml}`;
        return;
      }
      body.innerHTML = `${figBlock}<div class="bo-wallet-card-dialog__prize-layout">
  <div class="bo-wallet-card-dialog__prize-col bo-wallet-card-dialog__prize-col--card">${gridHtml}</div>
  <aside class="bo-wallet-card-dialog__prize-col bo-wallet-card-dialog__prize-col--drawn" aria-label="${esc(t("players.walletCardDetailDrawn"))}">
    <div class="bo-wallet-card-dialog__drawn-label">${esc(t("players.walletCardDetailDrawn"))}</div>
    <p class="bo-wallet-card-dialog__drawn-text">${ballsText}</p>
  </aside>
</div>`;
      return;
    }

    body.innerHTML = `<p>${esc(t("players.walletCardDetailErr"))}</p>`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    titleEl.textContent = t("players.walletCardDetailErr");
    body.innerHTML = `<p>${esc(msg)}</p>`;
  }
}

function wireWalletCardDetailUiOnce() {
  const wrap = document.getElementById("bo-player-wallet-wrap");
  if (!wrap || wrap.dataset.cardDetailWired) return;
  wrap.dataset.cardDetailWired = "1";
  wrap.addEventListener("click", (ev) => {
    const el = ev.target;
    if (!(el instanceof Element)) return;
    const btn = el.closest(".bo-wallet-open-card");
    if (!btn) return;
    const txId = btn.getAttribute("data-wallet-tx-id");
    if (txId) void openWalletCardDetail(txId);
  });

  const dlg = document.getElementById("bo-wallet-card-dialog");
  const closeBtn = document.getElementById("bo-wallet-card-dialog-close");
  closeBtn?.addEventListener("click", () => {
    /** @type {HTMLDialogElement | null} */ (dlg)?.close();
  });
  dlg?.addEventListener("cancel", (e) => {
    e.preventDefault();
    /** @type {HTMLDialogElement | null} */ (dlg)?.close();
  });
}

/** @type {Array<Record<string, unknown>>} */
let playersListCache = [];
/** @type {ReturnType<typeof attachBoPager> | null} */
let playersPager = null;

/**
 * @param {HTMLElement} tbody
 * @param {Array<Record<string, unknown>>} players
 */
function paintPlayersPage(tbody, players) {
  tbody.innerHTML = players
    .map(
      (p) => `
    <tr data-id="${esc(p.id)}">
      <td class="cell-name">${esc(p.email)}</td>
      <td>${esc(p.username)}</td>
      <td class="mono">${p.wallet != null ? esc(String(/** @type {{ balanceCents: number }} */ (p.wallet).balanceCents)) : "—"}</td>
      <td class="mono">${p.wallet != null ? esc(/** @type {{ currencyCode: string }} */ (p.wallet).currencyCode) : "—"}</td>
      <td>${p.active ? `<span class="tag t-active">${esc(t("players.active"))}</span>` : `<span class="tag t-old">${esc(t("players.inactive"))}</span>`}</td>
      <td>${esc(new Date(/** @type {string} */ (p.createdAt)).toLocaleString())}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button type="button" class="btn btn--ghost btn--sm bo-activity-player">${esc(t("players.btnActivity"))}</button>
        <button type="button" class="btn btn--ghost btn--sm bo-credit-player"${p.active ? "" : " disabled"}>${esc(t("players.btnCredit"))}</button>
        <button type="button" class="btn btn--ghost btn--sm bo-prize-player"${p.active ? "" : " disabled"}>${esc(t("players.btnPrizeCredit"))}</button>
      </td>
    </tr>`,
    )
    .join("");

  tbody.querySelectorAll(".bo-activity-player").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      if (!id) return;
      const email = tr.querySelector(".cell-name")?.textContent?.trim() || id;
      void showActivityPanel(email, id);
    });
  });

  tbody.querySelectorAll(".bo-credit-player").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      if (!id || btn.hasAttribute("disabled")) return;
      const email = tr.querySelector(".cell-name")?.textContent?.trim() || id;
      showCreditPanel(email, id);
    });
  });

  tbody.querySelectorAll(".bo-prize-player").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      if (!id || btn.hasAttribute("disabled")) return;
      const email = tr.querySelector(".cell-name")?.textContent?.trim() || id;
      showPrizePanel(email, id);
    });
  });
}

async function renderPlayersTable(tbody, q) {
  const { players } = await api.players.list({ q: q || undefined, limit: 200 });
  playersListCache = players;
  const anchor = pagerAnchorFromTbody(tbody);
  if (!playersPager && anchor) {
    playersPager = attachBoPager({
      anchor,
      getItems: () => playersListCache,
      renderPage: (slice) => paintPlayersPage(tbody, /** @type {typeof playersListCache} */ (slice)),
    });
  } else {
    playersPager?.reset();
  }
  playersPager?.refresh();
}

export async function initPlayersPage() {
  const tbody = document.querySelector("#bo-players-tbody");
  const msg = document.getElementById("bo-players-msg");
  const form = document.getElementById("bo-players-filters-form");
  const cancelBtn = document.getElementById("bo-player-credit-cancel");
  const creditForm = document.getElementById("bo-player-credit-form");

  if (!tbody || !msg) return;

  playersPager = null;
  walletPager = null;

  wireWalletLedgerFiltersOnce();
  wireWalletCardDetailUiOnce();

  try {
    await renderPlayersTable(tbody, "");
  } catch (e) {
    showToast(msg, e.message, true);
    return;
  }

  showPlayersListView();

  if (form && !form.dataset.boWired) {
    form.dataset.boWired = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.style.display = "none";
      const q = document.getElementById("players-filter-q")?.value?.trim() ?? "";
      try {
        await renderPlayersTable(tbody, q);
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }

  if (cancelBtn && !cancelBtn.dataset.boWired) {
    cancelBtn.dataset.boWired = "1";
    cancelBtn.addEventListener("click", () => {
      showPlayersListView();
      msg.style.display = "none";
    });
  }

  const activityClose = document.getElementById("bo-player-activity-close");
  if (activityClose && !activityClose.dataset.boWired) {
    activityClose.dataset.boWired = "1";
    activityClose.addEventListener("click", () => {
      showPlayersListView();
      msg.style.display = "none";
    });
  }

  const prizeCancel = document.getElementById("bo-player-prize-cancel");
  if (prizeCancel && !prizeCancel.dataset.boWired) {
    prizeCancel.dataset.boWired = "1";
    prizeCancel.addEventListener("click", () => {
      showPlayersListView();
      msg.style.display = "none";
    });
  }

  const prizeForm = document.getElementById("bo-player-prize-form");
  if (prizeForm && !prizeForm.dataset.boWired) {
    prizeForm.dataset.boWired = "1";
    prizeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.style.display = "none";
      const playerId = /** @type {HTMLInputElement | null} */ (
        document.getElementById("bo-player-prize-player-id")
      )?.value?.trim();
      const bingoPrizeId = /** @type {HTMLInputElement | null} */ (
        document.getElementById("bo-player-prize-bingo-prize-id")
      )?.value?.trim();
      const playerRoundCardId = /** @type {HTMLInputElement | null} */ (
        document.getElementById("bo-player-prize-card-id")
      )?.value?.trim();
      if (!playerId || !bingoPrizeId || !playerRoundCardId) {
        showToast(msg, t("players.prizeCreditErrFields"), true);
        return;
      }
      try {
        await api.players.prizeCredit(playerId, { bingoPrizeId, playerRoundCardId });
        showToast(msg, t("players.prizeCreditOk"), false);
        const q = document.getElementById("players-filter-q")?.value?.trim() ?? "";
        await renderPlayersTable(tbody, q);
        showPlayersListView();
      } catch (ex) {
        showToast(msg, ex.message || String(ex), true);
      }
    });
  }

  if (creditForm && !creditForm.dataset.boWired) {
    creditForm.dataset.boWired = "1";
    creditForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.style.display = "none";
      const playerId = /** @type {HTMLInputElement | null} */ (document.getElementById("bo-player-credit-id"))?.value?.trim();
      const amountRaw = /** @type {HTMLInputElement | null} */ (
        document.getElementById("bo-player-credit-amount")
      )?.value;
      const note = /** @type {HTMLTextAreaElement | null} */ (
        document.getElementById("bo-player-credit-note")
      )?.value?.trim();
      if (!playerId) return;
      const amountCents = Number.parseInt(String(amountRaw ?? ""), 10);
      if (!Number.isFinite(amountCents) || amountCents < 1) {
        showToast(msg, t("players.errAmount"), true);
        return;
      }
      try {
        await api.players.manualCredit(playerId, {
          amountCents,
          note: note || undefined,
        });
        showToast(msg, t("players.msgCredited"), false);
        const q = document.getElementById("players-filter-q")?.value?.trim() ?? "";
        await renderPlayersTable(tbody, q);
        showPlayersListView();
      } catch (ex) {
        showToast(msg, ex.message, true);
      }
    });
  }
}
