/**
 * Bingos — admin ABM matching Users flow (list → create panel → edit panel).
 */
import { api } from "./bo-api.js";
import { t, applyDomI18n } from "./bo-i18n.js";
import { attachBoPager, pagerAnchorFromTbody } from "./bo-pager.js";
import { esc } from "./bo-escape.js";

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

const BINGO_PRIZE_FIGURES = [
  "LINE",
  "DOUBLE_LINE",
  "LETTER_B",
  "LETTER_I",
  "LETTER_N",
  "LETTER_G",
  "LETTER_O",
  "PERIMETER",
  "FULL_HOUSE",
];

const BINGO_PRIZE_DEFAULT_ENABLED = new Set(["LINE", "PERIMETER", "FULL_HOUSE"]);

function prizeFigureLabel(fig) {
  const key = `players.walletFigure.${fig}`;
  const lbl = t(key);
  return lbl === key ? String(fig) : lbl;
}

function defaultPrizeCatalog() {
  return BINGO_PRIZE_FIGURES.map((figure) => ({
    figure,
    enabled: BINGO_PRIZE_DEFAULT_ENABLED.has(figure),
    amount: "1",
    uniquePerRound: true,
  }));
}

function getPrizeModeForPrefix(prefix) {
  const sel = document.getElementById(`${prefix}-prizeMode`);
  return sel instanceof HTMLSelectElement && sel.value === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
}

function syncBingoPrizeModeUi(prefix) {
  const isPct = getPrizeModeForPrefix(prefix) === "PERCENTAGE";
  const wrap = document.getElementById(`${prefix}-prize-pool-wrap`);
  if (wrap) wrap.hidden = !isPct;

  const valueLabel = isPct ? t("bingo.prizePercent") : t("bingo.prizeAmount");
  const host = document.getElementById(`${prefix}-prizes`);
  if (host) {
    host.querySelectorAll("[data-bo-prize-value-label]").forEach((el) => {
      el.textContent = valueLabel;
    });
  }
}

function wireBingoPrizeMode(prefix) {
  const sel = document.getElementById(`${prefix}-prizeMode`);
  if (!sel || sel.dataset.boPrizeModeWired === "1") return;
  sel.dataset.boPrizeModeWired = "1";
  sel.addEventListener("change", () => syncBingoPrizeModeUi(prefix));
  syncBingoPrizeModeUi(prefix);
}

/**
 * @param {Array<{ figure: string; amount?: string | number; uniquePerRound?: boolean }>} [prizes]
 */
function prizesForEditor(prizes) {
  if (!prizes?.length) return defaultPrizeCatalog();
  const byFig = new Map();
  for (const p of prizes) {
    if (p?.figure) byFig.set(p.figure, p);
  }
  return BINGO_PRIZE_FIGURES.map((figure) => {
    const existing = byFig.get(figure);
    if (existing) {
      return {
        figure,
        enabled: true,
        amount: String(existing.amount ?? "1"),
        uniquePerRound: existing.uniquePerRound !== false,
      };
    }
    return { figure, enabled: false, amount: "1", uniquePerRound: true };
  });
}

/**
 * @param {{ figure: string; enabled?: boolean; amount?: string; uniquePerRound?: boolean }} item
 * @param {string} prefix
 */
function buildPrizeItemHtml(item, prefix) {
  const enabled = item.enabled !== false;
  const uniqueChecked = item.uniquePerRound !== false;
  const isPct = getPrizeModeForPrefix(prefix) === "PERCENTAGE";
  const valueLabel = isPct ? t("bingo.prizePercent") : t("bingo.prizeAmount");
  const cls = ["bo-bingo-prize-item"];
  if (!enabled) cls.push("bo-bingo-prize-item--off");
  const disabledAttr = enabled ? "" : " disabled";
  return `<div class="${cls.join(" ")}" data-bo-prize-item data-figure="${esc(item.figure)}">
  <div class="bo-bingo-prize-item__lead">
    <label class="check bo-bingo-prize-item__toggle" title="${esc(t("bingo.prizeEnable"))}">
      <input type="checkbox" data-bo-prize-enabled${enabled ? " checked" : ""} />
      <span class="box"></span>
    </label>
    <span class="bo-bingo-prize-item__name">${esc(prizeFigureLabel(item.figure))}</span>
  </div>
  <div class="bo-bingo-prize-item__value-row">
    <span class="bo-bingo-prize-item__value-label" data-bo-prize-value-label>${esc(valueLabel)}</span>
    <input class="input input--underline bo-bingo-prize-item__value-input" type="text" inputmode="decimal" value="${esc(item.amount ?? "")}" data-bo-prize-amount${disabledAttr}>
  </div>
  <label class="check bo-bingo-prize-item__unique">
    <input type="checkbox" data-bo-prize-unique${uniqueChecked && enabled ? " checked" : ""}${disabledAttr} />
    <span class="box"></span>
    <span data-i18n="bingo.prizeUniquePerRound"></span>
  </label>
</div>`;
}

function wirePrizeItemToggles(host) {
  host.querySelectorAll("[data-bo-prize-enabled]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const row = cb.closest("[data-bo-prize-item]");
      if (!(row instanceof HTMLElement)) return;
      const on = /** @type {HTMLInputElement} */ (cb).checked;
      row.classList.toggle("bo-bingo-prize-item--off", !on);
      row.querySelectorAll("[data-bo-prize-amount], [data-bo-prize-unique]").forEach((el) => {
        if (el instanceof HTMLInputElement) el.disabled = !on;
      });
    });
  });
}

function renderPrizesEditor(host, prizes, prefix) {
  if (!host || !prefix) return;
  const items = prizesForEditor(prizes);
  host.innerHTML = `<div class="bo-bingo-prize-list" data-bo-prize-list>${items.map((p) => buildPrizeItemHtml(p, prefix)).join("")}</div>`;
  wirePrizeItemToggles(host);
  applyDomI18n(host);
  syncBingoPrizeModeUi(prefix);
}

function collectPrizesFromHost(host, prefix) {
  if (!host) return [];
  const prizes = [];
  const isPct = getPrizeModeForPrefix(prefix) === "PERCENTAGE";

  for (const row of host.querySelectorAll("[data-bo-prize-item]")) {
    const enabled = row.querySelector("[data-bo-prize-enabled]");
    if (!(enabled instanceof HTMLInputElement) || !enabled.checked) continue;

    const fig = row.getAttribute("data-figure") ?? "";
    const amtRaw = row.querySelector("[data-bo-prize-amount]")?.value;
    const amt = amtRaw != null ? String(amtRaw).trim() : "";
    if (!amt) {
      throw new Error(isPct ? t("bingo.errPrizePercentMissing") : t("bingo.errPrizeAmountMissing"));
    }
    const n = parseMoneyAmount(amt);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(isPct ? t("bingo.errPrizePercentInvalid") : t("bingo.errPrizeAmountInvalid"));
    }
    if (isPct && n > 100) throw new Error(t("bingo.errPrizePercentInvalid"));

    const uniqueEl = row.querySelector("[data-bo-prize-unique]");
    const uniquePerRound = uniqueEl instanceof HTMLInputElement ? uniqueEl.checked : true;
    prizes.push({ figure: fig, amount: amt, uniquePerRound });
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

  const defRadio = /** @type {HTMLInputElement | null} */ (document.getElementById(`${prefix}-prizePayoutMode-deferred`));
  const prizePayoutMode = defRadio?.checked ? "DEFERRED_SPLIT_AT_ROUND_END" : "IMMEDIATE_FULL_PER_WINNER";

  const liveDrawRadio = /** @type {HTMLInputElement | null} */ (document.getElementById(`${prefix}-drawMode-live`));
  const drawMode = liveDrawRadio?.checked ? "LIVE" : "VIRTUAL";

  const bingoType = document.getElementById(`${prefix}-bingoType`)?.value?.trim();
  if (!bingoType) throw new Error(t("bingo.errTypeRequired"));

  const active = !!document.getElementById(`${prefix}-active`)?.checked;

  const prizesHost = document.getElementById(`${prefix}-prizes`);
  const prizes = collectPrizesFromHost(prizesHost, prefix);
  const prizeMode = getPrizeModeForPrefix(prefix);

  let prizePoolSeed = "0";
  if (prizeMode === "PERCENTAGE") {
    const poolRaw = document.getElementById(`${prefix}-prizePoolSeed`)?.value;
    prizePoolSeed = String(poolRaw ?? "0").trim();
    const poolNum = parseMoneyAmount(prizePoolSeed);
    if (!Number.isFinite(poolNum) || poolNum < 0) {
      throw new Error(t("bingo.errPrizePoolSeedInvalid"));
    }
  }

  return {
    roomId,
    name,
    status: active ? "ACTIVE" : "INACTIVE",
    bingoType,
    startDateTime: startIso,
    endDateTime: endIso,
    repeatEveryMinutes,
    cardPrice,
    prizeMode,
    prizePoolSeed,
    minPlayersToStart,
    prizePayoutMode,
    drawMode,
    prizes,
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
  const createDef = /** @type {HTMLInputElement | null} */ (document.getElementById("create-prizePayoutMode-immediate"));
  const createDefOff = /** @type {HTMLInputElement | null} */ (document.getElementById("create-prizePayoutMode-deferred"));
  if (createDef) createDef.checked = true;
  if (createDefOff) createDefOff.checked = false;
  const createVirt = /** @type {HTMLInputElement | null} */ (document.getElementById("create-drawMode-virtual"));
  const createLive = /** @type {HTMLInputElement | null} */ (document.getElementById("create-drawMode-live"));
  if (createVirt) createVirt.checked = true;
  if (createLive) createLive.checked = false;
  document.getElementById("create-active").checked = false;
  const createMode = document.getElementById("create-prizeMode");
  if (createMode instanceof HTMLSelectElement) createMode.value = "FIXED";
  const createPool = document.getElementById("create-prizePoolSeed");
  if (createPool) createPool.value = "0";
  wireBingoPrizeMode("create");
  renderPrizesEditor(document.getElementById("create-prizes"), [], "create");
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
  const imm = /** @type {HTMLInputElement | null} */ (document.getElementById("edit-prizePayoutMode-immediate"));
  const def = /** @type {HTMLInputElement | null} */ (document.getElementById("edit-prizePayoutMode-deferred"));
  const ppm = bingo.prizePayoutMode === "DEFERRED_SPLIT_AT_ROUND_END" ? "DEFERRED_SPLIT_AT_ROUND_END" : "IMMEDIATE_FULL_PER_WINNER";
  if (imm && def) {
    imm.checked = ppm === "IMMEDIATE_FULL_PER_WINNER";
    def.checked = ppm === "DEFERRED_SPLIT_AT_ROUND_END";
  }
  const dm = bingo.drawMode === "LIVE" ? "LIVE" : "VIRTUAL";
  const editVirt = /** @type {HTMLInputElement | null} */ (document.getElementById("edit-drawMode-virtual"));
  const editLive = /** @type {HTMLInputElement | null} */ (document.getElementById("edit-drawMode-live"));
  if (editVirt && editLive) {
    editVirt.checked = dm === "VIRTUAL";
    editLive.checked = dm === "LIVE";
  }
  document.getElementById("edit-active").checked = bingo.status === "ACTIVE";
  const editMode = document.getElementById("edit-prizeMode");
  const mode = bingo.prizeMode === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
  if (editMode instanceof HTMLSelectElement) editMode.value = mode;
  const editPool = document.getElementById("edit-prizePoolSeed");
  if (editPool) editPool.value = String(bingo.prizePoolSeed ?? "0");
  wireBingoPrizeMode("edit");
  renderPrizesEditor(
    document.getElementById("edit-prizes"),
    (bingo.prizes || []).map((p) => ({
      figure: p.figure,
      amount: p.amount,
      uniquePerRound: p.uniquePerRound !== false,
    })),
    "edit",
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

function cancellationReasonLabel(code) {
  if (code == null || String(code).trim() === "") {
    return "—";
  }
  const map = {
    MIN_CARTONS_NOT_MET: "bingo.roundCancelMinCartons",
    MANUAL_STOP: "bingo.roundCancelManualStop",
    BINGO_INACTIVE: "bingo.roundCancelBingoInactive",
    SCHEDULE_REMOVED: "bingo.roundCancelScheduleRemoved",
  };
  const key = map[code];
  return key ? t(key) : String(code);
}

/** Sin filtros personalizados: últimas N partidas finalizadas, más recientes primero. */
const ROUNDS_DEFAULT_FINISHED_LIMIT = 500;
const ROUNDS_FILTER_STATUS_DEFAULT = "COMPLETED";

function getRoundsFilterStatusValue() {
  const el = /** @type {HTMLSelectElement | null} */ (document.getElementById("bo-rounds-filter-status"));
  const v = el?.value?.trim();
  return v || ROUNDS_FILTER_STATUS_DEFAULT;
}

function clearRoundsFilters() {
  const fromEl = document.getElementById("bo-rounds-filter-from");
  const toEl = document.getElementById("bo-rounds-filter-to");
  const seqEl = document.getElementById("bo-rounds-filter-sequence");
  const statusEl = /** @type {HTMLSelectElement | null} */ (document.getElementById("bo-rounds-filter-status"));
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  if (seqEl) seqEl.value = "";
  if (statusEl) statusEl.value = ROUNDS_FILTER_STATUS_DEFAULT;
}

function hasActiveRoundFilters() {
  const fromIso = datetimeLocalToIso(document.getElementById("bo-rounds-filter-from")?.value);
  const toIso = datetimeLocalToIso(document.getElementById("bo-rounds-filter-to")?.value);
  const seqRaw = document.getElementById("bo-rounds-filter-sequence")?.value;
  const seqTrim = seqRaw != null ? String(seqRaw).trim() : "";
  const status = getRoundsFilterStatusValue();
  return !!(fromIso || toIso || seqTrim !== "" || status !== ROUNDS_FILTER_STATUS_DEFAULT);
}

/**
 * @param {string} statusFilter
 */
function appendRoundsStatusToQuery(query, statusFilter) {
  if (statusFilter !== "ALL") {
    query.status = statusFilter;
  }
}

function getRoundsFilterQuery() {
  const statusFilter = getRoundsFilterStatusValue();
  /** @type {{ from?: string; to?: string; sequence?: string; status?: string; limit: string; sort: string }} */
  const query = {
    limit: String(ROUNDS_DEFAULT_FINISHED_LIMIT),
    sort: "desc",
  };
  if (!hasActiveRoundFilters()) {
    query.status = ROUNDS_FILTER_STATUS_DEFAULT;
    return query;
  }
  const fromIso = datetimeLocalToIso(document.getElementById("bo-rounds-filter-from")?.value);
  const toIso = datetimeLocalToIso(document.getElementById("bo-rounds-filter-to")?.value);
  const seqRaw = document.getElementById("bo-rounds-filter-sequence")?.value;
  const seqTrim = seqRaw != null ? String(seqRaw).trim() : "";
  if (fromIso) query.from = fromIso;
  if (toIso) query.to = toIso;
  if (seqTrim !== "") query.sequence = seqTrim;
  appendRoundsStatusToQuery(query, statusFilter);
  return query;
}

/**
 * @param {Array<Record<string, unknown>>} rounds
 */
function sortRoundsNewestFirst(rounds) {
  return [...rounds].sort((a, b) => {
    const ta = new Date(/** @type {string} */ (a.startsAt)).getTime();
    const tb = new Date(/** @type {string} */ (b.startsAt)).getTime();
    if (tb !== ta) return tb - ta;
    return Number(b.sequence) - Number(a.sequence);
  });
}

/** @type {Array<Record<string, unknown>>} */
let roundsListCache = [];
/** @type {ReturnType<typeof attachBoPager> | null} */
let roundsPager = null;

function moneyLocaleTag() {
  const lang = document.documentElement.lang || "es";
  return lang.startsWith("es") ? "es-AR" : lang;
}

function formatArsFromCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(moneyLocaleTag(), {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n / 100);
}

function roundFigureLabel(fig) {
  const key = `players.walletFigure.${fig}`;
  const lbl = t(key);
  return lbl === key ? String(fig) : lbl;
}

const BINGO75_COLS = ["B", "I", "N", "G", "O"];

/**
 * @param {unknown[][]} grid
 * @param {string} cardLabel
 * @param {Array<{ figure: string; amountCents: number; highlight?: { row: number; col: number }[] }>} [prizes]
 */
function renderBingo75CardTileHtml(grid, cardLabel, prizes = []) {
  const hlSet = new Set();
  for (const p of prizes) {
    for (const h of p.highlight ?? []) hlSet.add(`${h.row},${h.col}`);
  }
  const tileCls = ["bo-round-detail-card-tile"];
  if (prizes.length) tileCls.push("bo-round-detail-card-tile--won");

  const prizeTags = prizes
    .map(
      (p) =>
        `<span class="bo-round-detail-card-prize-tag">${esc(roundFigureLabel(p.figure))} · ${esc(formatArsFromCents(p.amountCents))}</span>`,
    )
    .join("");

  const headInner = prizeTags
    ? `<div class="bo-round-detail-card-tile__head-row"><span class="bo-round-detail-card-tile__label">${esc(cardLabel)}</span><div class="bo-round-detail-card-tile__prizes">${prizeTags}</div></div>`
    : esc(cardLabel);

  let html = `<article class="${tileCls.join(" ")}">
    <header class="bo-round-detail-card-tile__head">${headInner}</header>
    <div class="bo-bingo-card-grid bo-bingo-card-grid--labeled" role="grid" aria-label="${esc(cardLabel)}">`;
  for (const letter of BINGO75_COLS) {
    html += `<div class="bo-bingo-colhead" role="columnheader">${esc(letter)}</div>`;
  }
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = /** @type {{ number?: number | null; isFree?: boolean }} */ (grid[r]?.[c] ?? {});
      const cls = ["bo-bingo-cell"];
      if (cell.isFree) cls.push("bo-bingo-cell--free");
      if (hlSet.has(`${r},${c}`)) cls.push("bo-bingo-cell--figure");
      const inner = cell.isFree ? "★" : cell.number != null ? String(cell.number) : "";
      html += `<div class="${cls.join(" ")}" role="gridcell">${esc(inner)}</div>`;
    }
  }
  html += "</div></article>";
  return html;
}

/** @typedef {{ playerUsername: string; cardIndex: number; grid: unknown[][]; prizes?: Array<{ figure: string; amountCents: number; highlight?: { row: number; col: number }[] }> }} RoundPurchasedCard */

/** @type {{ cards: RoundPurchasedCard[]; sequence: number | string } | null} */
let roundCardsDetailCache = null;

/**
 * @param {RoundPurchasedCard[]} cards
 */
function groupRoundCardsByPlayer(cards) {
  /** @type {Map<string, RoundPurchasedCard[]>} */
  const byPlayer = new Map();
  for (const c of cards) {
    const key = c.playerUsername || "—";
    const list = byPlayer.get(key) ?? [];
    list.push(c);
    byPlayer.set(key, list);
  }
  return [...byPlayer.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * @param {RoundPurchasedCard[]} cards
 */
function renderRoundPurchasedCardsSummaryHtml(cards) {
  const rows = groupRoundCardsByPlayer(cards)
    .map(
      ([username, playerCards]) => `<tr>
      <td>${esc(username)}</td>
      <td class="mono">${esc(String(playerCards.length))}</td>
      <td class="bo-round-detail-cards-actions">
        <button type="button" class="btn btn--ghost btn--sm bo-round-cards-view-player" data-player="${esc(encodeURIComponent(username))}">${esc(t("bingo.roundDetailViewPlayerCards"))}</button>
      </td>
    </tr>`,
    )
    .join("");

  return `<p class="bo-round-detail-cards-summary field-help">${esc(
    t("bingo.roundDetailCardsSummary", { count: String(cards.length) }),
  )}</p>
  <div class="bo-round-detail-table-wrap">
    <table class="table table--compact bo-round-detail-cards-table">
      <thead><tr>
        <th>${esc(t("bingo.roundDetailPlayer"))}</th>
        <th>${esc(t("bingo.roundDetailCardsCount"))}</th>
        <th>${esc(t("bingo.roundDetailActions"))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/**
 * @param {string} username
 * @param {RoundPurchasedCard[]} cards
 */
function renderRoundPurchasedCardsPlayerHtml(username, cards) {
  const sorted = [...cards].sort((a, b) => a.cardIndex - b.cardIndex);
  let tiles = "";
  for (const c of sorted) {
    const label = `${t("bingo.roundDetailCardLabel")} #${c.cardIndex + 1}`;
    tiles += renderBingo75CardTileHtml(c.grid, label, c.prizes ?? []);
  }
  return `<div class="bo-round-detail-cards-player">
    <button type="button" class="btn btn--ghost btn--sm bo-round-cards-back">${esc(t("bingo.roundDetailBackToList"))}</button>
    <div class="bo-round-detail-player__cards">${tiles}</div>
  </div>`;
}

function showRoundCardsSummaryView() {
  const dlg = /** @type {HTMLDialogElement | null} */ (document.getElementById("bo-round-detail-dialog"));
  const titleEl = document.getElementById("bo-round-detail-dialog-title");
  const body = document.getElementById("bo-round-detail-dialog-body");
  if (!dlg || !titleEl || !body || !roundCardsDetailCache) return;
  dlg.classList.remove("bo-round-detail-dialog--cards-player");
  titleEl.textContent = tSeq("bingo.roundDetailCardsTitle", roundCardsDetailCache.sequence);
  body.innerHTML = renderRoundPurchasedCardsSummaryHtml(roundCardsDetailCache.cards);
}

/**
 * @param {string} username
 */
function showRoundCardsPlayerView(username) {
  const dlg = /** @type {HTMLDialogElement | null} */ (document.getElementById("bo-round-detail-dialog"));
  const titleEl = document.getElementById("bo-round-detail-dialog-title");
  const body = document.getElementById("bo-round-detail-dialog-body");
  if (!dlg || !titleEl || !body || !roundCardsDetailCache) return;

  const playerCards = roundCardsDetailCache.cards.filter((c) => (c.playerUsername || "—") === username);
  if (!playerCards.length) return;

  dlg.classList.add("bo-round-detail-dialog--cards-player");
  titleEl.textContent = t("bingo.roundDetailCardsPlayerTitle", {
    user: username,
    seq:
      roundCardsDetailCache.sequence != null && roundCardsDetailCache.sequence !== "—"
        ? String(roundCardsDetailCache.sequence)
        : "—",
  });
  body.innerHTML = renderRoundPurchasedCardsPlayerHtml(username, playerCards);
}

function renderRoundsListHtml(rounds) {
  if (!rounds.length) {
    return `<p class="bo-rounds-empty">${esc(t("bingo.roundsEmpty"))}</p>`;
  }
  return `<div class="bo-rounds-list" id="bo-rounds-list">${rounds.map((r) => renderRoundCardHtml(r)).join("")}</div>`;
}

/**
 * @param {Record<string, unknown>} r
 */
function renderRoundCardHtml(r) {
  const tagClass = ROUND_STATUS_TAG[/** @type {string} */ (r.status)] ?? "t-old";
  const seq = r.sequence;
  const partidaLabel = seq != null && Number.isFinite(Number(seq)) ? String(Number(seq)) : "—";
  const roundId = String(r.id ?? "");
  const cardsSold = Number(r.cardsSold ?? 0);
  const prizesPaid = Number(r.prizesPaid ?? 0);
  const reasonBlock =
    r.status === "CANCELLED"
      ? `<p class="bo-round-card__reason">${esc(cancellationReasonLabel(/** @type {string | null | undefined} */ (r.cancellationReason)))}</p>`
      : "";

  return `<article class="bo-round-card" data-round-id="${esc(roundId)}">
  <header class="bo-round-card__head">
    <div class="bo-round-card__meta">
      <span class="bo-round-card__seq mono">#${esc(partidaLabel)}</span>
      <span class="tag ${tagClass}">${esc(roundStatusLabel(/** @type {string} */ (r.status)))}</span>
      <span class="bo-round-card__date cell-date">${esc(new Date(/** @type {string} */ (r.startsAt)).toLocaleString())}</span>
    </div>
    <div class="bo-round-card__stats mono">
      <span>${esc(t("bingo.roundsCardsSold"))}: <strong>${esc(String(cardsSold))}</strong></span>
      <span>${esc(t("bingo.roundsPrizesPaid"))}: <strong>${esc(String(prizesPaid))}</strong></span>
    </div>
  </header>
  ${reasonBlock}
  <div class="bo-round-card__actions">
    <button type="button" class="btn btn--ghost btn--sm bo-round-view-cards" data-round-id="${esc(roundId)}" data-round-seq="${esc(partidaLabel)}">${esc(t("bingo.roundsViewCards"))}</button>
    <button type="button" class="btn btn--ghost btn--sm bo-round-view-prizes" data-round-id="${esc(roundId)}" data-round-seq="${esc(partidaLabel)}">${esc(t("bingo.roundsViewPrizes"))}</button>
  </div>
  <section class="bo-round-card__balls-section" aria-label="${esc(t("bingo.roundsColBalls"))}">
    <h4 class="bo-round-card__balls-title">${esc(t("bingo.roundsColBalls"))}</h4>
    ${renderRoundBallsCell(r)}
  </section>
</article>`;
}

/**
 * @param {Array<Record<string, unknown>>} rounds
 */
function renderRoundRowsHtml(rounds) {
  return rounds.map((r) => renderRoundCardHtml(r)).join("");
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
  if (r.status === "CANCELLED") {
    return `<span class="bo-rounds-muted">${esc(t("bingo.roundsCancelledNoDraw"))}</span>`;
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
    const rounds = sortRoundsNewestFirst(data.rounds || []);
    roundsListCache = rounds;
    content.innerHTML = renderRoundsListHtml(rounds);
    if (!rounds.length) {
      roundsPager = null;
      return;
    }
    const anchor = document.getElementById("bo-rounds-list");
    if (!anchor) return;
    roundsPager = attachBoPager({
      anchor,
      getItems: () => roundsListCache,
      renderPage: (slice) => {
        const list = document.getElementById("bo-rounds-list");
        if (list) list.innerHTML = renderRoundRowsHtml(/** @type {typeof roundsListCache} */ (slice));
      },
      pageSize: 8,
    });
    roundsPager.refresh();
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

function tSeq(key, seq) {
  const label =
    seq != null && seq !== "—" && Number.isFinite(Number(seq)) ? String(Number(seq)) : "—";
  return t(key, { seq: label });
}

async function openRoundCardsDetail(bingoId, roundId, sequence) {
  const dlg = /** @type {HTMLDialogElement | null} */ (document.getElementById("bo-round-detail-dialog"));
  const titleEl = document.getElementById("bo-round-detail-dialog-title");
  const body = document.getElementById("bo-round-detail-dialog-body");
  if (!dlg || !titleEl || !body) return;

  dlg.classList.add("bo-round-detail-dialog--cards");
  dlg.classList.remove("bo-round-detail-dialog--prizes");
  titleEl.textContent = tSeq("bingo.roundDetailCardsTitle", sequence);
  body.innerHTML = `<p class="field-help">${esc(t("bingo.roundDetailLoading"))}</p>`;
  dlg.showModal();
  applyDomI18n(dlg);

  try {
    const data = /** @type {{ cards?: RoundPurchasedCard[]; roundStatus?: string }} */ (
      await api.bingos.roundCards(bingoId, roundId)
    );
    const cards = Array.isArray(data.cards) ? data.cards : [];
    if (!cards.length) {
      roundCardsDetailCache = null;
      body.innerHTML = `<p class="field-help">${esc(t("bingo.roundDetailCardsEmpty"))}</p>`;
      return;
    }
    roundCardsDetailCache = { cards, sequence };
    dlg.classList.remove("bo-round-detail-dialog--cards-player");
    body.innerHTML = renderRoundPurchasedCardsSummaryHtml(cards);
  } catch (e) {
    roundCardsDetailCache = null;
    body.innerHTML = `<p class="field-help" style="color:var(--danger,#c0392b);">${esc(e instanceof Error ? e.message : String(e))}</p>`;
  }
}

async function openRoundPrizesDetail(bingoId, roundId, sequence) {
  const dlg = /** @type {HTMLDialogElement | null} */ (document.getElementById("bo-round-detail-dialog"));
  const titleEl = document.getElementById("bo-round-detail-dialog-title");
  const body = document.getElementById("bo-round-detail-dialog-body");
  if (!dlg || !titleEl || !body) return;

  dlg.classList.remove("bo-round-detail-dialog--cards");
  dlg.classList.add("bo-round-detail-dialog--prizes");
  titleEl.textContent = tSeq("bingo.roundDetailPrizesTitle", sequence);
  body.innerHTML = `<p class="field-help">${esc(t("bingo.roundDetailLoading"))}</p>`;
  dlg.showModal();
  applyDomI18n(dlg);

  try {
    const data = /** @type {{ prizes?: { playerUsername: string; figure: string; amountCents: number; cardIndex: number }[] }} */ (
      await api.bingos.roundPrizes(bingoId, roundId)
    );
    const prizes = Array.isArray(data.prizes) ? data.prizes : [];
    if (!prizes.length) {
      body.innerHTML = `<p class="field-help">${esc(t("bingo.roundDetailPrizesEmpty"))}</p>`;
      return;
    }
    const rows = prizes
      .map(
        (p) => `<tr>
      <td>${esc(p.playerUsername)}</td>
      <td class="mono">#${esc(String(p.cardIndex + 1))}</td>
      <td>${esc(roundFigureLabel(p.figure))}</td>
      <td class="mono">${esc(formatArsFromCents(p.amountCents))}</td>
    </tr>`,
      )
      .join("");
    body.innerHTML = `<div class="bo-round-detail-table-wrap"><table class="table table--compact">
      <thead><tr>
        <th>${esc(t("bingo.roundDetailPlayer"))}</th>
        <th>${esc(t("bingo.roundDetailCardLabel"))}</th>
        <th>${esc(t("bingo.roundDetailFigure"))}</th>
        <th>${esc(t("bingo.roundDetailAmount"))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } catch (e) {
    body.innerHTML = `<p class="field-help" style="color:var(--danger,#c0392b);">${esc(e instanceof Error ? e.message : String(e))}</p>`;
  }
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

  const content = document.getElementById("bo-bingo-rounds-content");
  content?.addEventListener("click", (ev) => {
    const el = ev.target;
    if (!(el instanceof Element)) return;
    const cardsBtn = el.closest(".bo-round-view-cards");
    const prizesBtn = el.closest(".bo-round-view-prizes");
    const bingoId = dlg.dataset.bingoId;
    if (!bingoId) return;
    const btn = cardsBtn ?? prizesBtn;
    const roundId = btn?.getAttribute("data-round-id");
    if (!roundId) return;
    const seqFromBtn = btn.getAttribute("data-round-seq");
    const round = roundsListCache.find((r) => String(r.id) === roundId);
    const seq =
      seqFromBtn && seqFromBtn !== "—"
        ? seqFromBtn
        : round?.sequence != null && Number.isFinite(Number(round.sequence))
          ? Number(round.sequence)
          : "—";
    if (cardsBtn) void openRoundCardsDetail(bingoId, roundId, seq);
    else if (prizesBtn) void openRoundPrizesDetail(bingoId, roundId, seq);
  });

  const detailDlg = document.getElementById("bo-round-detail-dialog");
  const detailBody = document.getElementById("bo-round-detail-dialog-body");
  document.getElementById("bo-round-detail-dialog-close")?.addEventListener("click", () => {
    /** @type {HTMLDialogElement | null} */ (detailDlg)?.close();
  });
  detailDlg?.addEventListener("cancel", (e) => {
    e.preventDefault();
    /** @type {HTMLDialogElement | null} */ (detailDlg)?.close();
  });
  detailDlg?.addEventListener("close", () => {
    roundCardsDetailCache = null;
    /** @type {HTMLDialogElement | null} */ (detailDlg)?.classList.remove(
      "bo-round-detail-dialog--cards-player",
    );
  });
  detailBody?.addEventListener("click", (ev) => {
    const el = ev.target;
    if (!(el instanceof Element)) return;
    const viewBtn = el.closest(".bo-round-cards-view-player");
    if (viewBtn) {
      const raw = viewBtn.getAttribute("data-player");
      if (raw) showRoundCardsPlayerView(decodeURIComponent(raw));
      return;
    }
    if (el.closest(".bo-round-cards-back")) showRoundCardsSummaryView();
  });
}

/** @type {Array<Record<string, unknown>>} */
let bingosListCache = [];
/** @type {ReturnType<typeof attachBoPager> | null} */
let bingosPager = null;

/**
 * @param {HTMLElement} tbody
 * @param {Array<Record<string, unknown>>} bingos
 */
function paintBingosPage(tbody, bingos) {
  tbody.innerHTML = bingos
    .map(
      (b) => `
    <tr data-id="${esc(b.id)}">
      <td class="cell-name">${esc(b.name)}</td>
      <td>${esc(/** @type {{ name?: string }} */ (b.room)?.name ?? "—")}</td>
      <td>${esc(typeLabel(/** @type {string} */ (b.bingoType)))}</td>
      <td>${b.status === "ACTIVE" ? `<span class="tag t-active">${esc(t("bingo.statusActive"))}</span>` : `<span class="tag t-old">${esc(t("bingo.statusInactive"))}</span>`}</td>
      <td>${esc(new Date(/** @type {string} */ (b.startDateTime)).toLocaleString())}</td>
      <td>${b.endDateTime ? esc(new Date(/** @type {string} */ (b.endDateTime)).toLocaleString()) : "—"}</td>
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
  bingosListCache = bingos;
  const anchor = pagerAnchorFromTbody(tbody);
  if (!bingosPager && anchor) {
    bingosPager = attachBoPager({
      anchor,
      getItems: () => bingosListCache,
      renderPage: (slice) => paintBingosPage(tbody, /** @type {typeof bingosListCache} */ (slice)),
    });
  } else {
    bingosPager?.reset();
  }
  bingosPager?.refresh();
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

  /** SPA: al cambiar de página el <main> es nuevo; el pager viejo seguía pintando un tbody desconectado. */
  bingosPager = null;
  roundsPager = null;

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

  renderPrizesEditor(document.getElementById("create-prizes"), [], "create");

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

