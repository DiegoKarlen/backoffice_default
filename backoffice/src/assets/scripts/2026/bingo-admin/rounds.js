/**
 * Bingo admin — rounds modal, cards and prizes detail.
 */
import { api } from "../bo-api.js";
import { t, applyDomI18n } from "../bo-i18n.js";
import { attachBoPager } from "../bo-pager.js";
import { esc, formatBoMoneyFromCents } from "../bo-shared.js";
import { datetimeLocalToIso, showToast } from "./utils.js";

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
    ROOM_DRAW_IN_PROGRESS: "bingo.roundCancelRoomDrawInProgress",
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
        `<span class="bo-round-detail-card-prize-tag">${esc(roundFigureLabel(p.figure))} · ${esc(formatBoMoneyFromCents(p.amountCents, "ARS", { minimumFractionDigits: 0 }))}</span>`,
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
  </header>
  ${reasonBlock}
  ${renderRoundPrizeBreakdownHtml(r)}
  ${renderRoundPrizeSubCard(t("bingo.roundsColBalls"), renderRoundBallsCell(r))}
  <div class="bo-round-card__actions">
    <button type="button" class="btn btn--ghost btn--sm bo-round-view-cards" data-round-id="${esc(roundId)}" data-round-seq="${esc(partidaLabel)}">${esc(t("bingo.roundsViewCards"))}</button>
    <button type="button" class="btn btn--ghost btn--sm bo-round-view-prizes" data-round-id="${esc(roundId)}" data-round-seq="${esc(partidaLabel)}">${esc(t("bingo.roundsViewPrizes"))}</button>
  </div>
</article>`;
}

/**
 * @param {Array<Record<string, unknown>>} rounds
 */
function renderRoundRowsHtml(rounds) {
  return rounds.map((r) => renderRoundCardHtml(r)).join("");
}

/**
 * @param {Record<string, unknown>} r
 */
function renderRoundPoolCompositionHtml(r) {
  const poolCents = r.prizePoolCents;
  if (poolCents == null || poolCents === "") return "";

  const fmt = (cents) =>
    formatBoMoneyFromCents(Number(cents), "ARS", { minimumFractionDigits: 0 });

  const seed = Number(r.prizePoolSeedCents ?? 0);
  const cards = Number(r.cardsSold ?? 0);
  const priceCents = Number(r.cardPriceCents ?? 0);
  const sales = Number(r.cardSalesCents ?? 0);

  /** @type {Array<{ label: string; value: string }>} */
  const rows = [
    { label: t("bingo.roundsPrizePoolSeed"), value: fmt(seed) },
    { label: t("bingo.roundsCardsSoldCount"), value: String(cards) },
    { label: t("bingo.roundsCardPrice"), value: fmt(priceCents) },
  ];

  const expectedSales = cards * priceCents;
  if (sales !== expectedSales) {
    rows.push({ label: t("bingo.roundsCardSales"), value: fmt(sales) });
  }

  const detailRows = rows
    .map(
      (row) => `<div class="bo-round-card__pool-row">
      <span class="bo-round-card__pool-row-label">${esc(row.label)}</span>
      <span class="bo-round-card__pool-row-value mono">${esc(row.value)}</span>
    </div>`,
    )
    .join("");

  return `<div class="bo-round-card__pool-compose">
    ${detailRows}
    <div class="bo-round-card__pool-row bo-round-card__pool-row--total">
      <span class="bo-round-card__pool-row-label">${esc(t("bingo.roundsPrizePool"))}</span>
      <span class="bo-round-card__pool-row-value mono">${esc(fmt(Number(poolCents)))}</span>
    </div>
  </div>`;
}

/**
 * @param {string} title
 * @param {string} bodyHtml
 */
function renderRoundPrizeSubCard(title, bodyHtml) {
  return `<article class="bo-round-prize-card">
    <header class="bo-round-prize-card__head">${esc(title)}</header>
    <div class="bo-round-prize-card__body">${bodyHtml}</div>
  </article>`;
}

function renderRoundPrizeBreakdownHtml(r) {
  const lines = Array.isArray(r.prizeLines) ? r.prizeLines : [];
  const poolCents = r.prizePoolCents;
  if (!lines.length && (poolCents == null || poolCents === "")) return "";

  /** @type {string[]} */
  const cards = [];

  const poolBody = renderRoundPoolCompositionHtml(r);
  if (poolBody) {
    cards.push(renderRoundPrizeSubCard(t("bingo.roundsPrizePoolCard"), poolBody));
  }

  if (lines.length > 0) {
    const rows = lines
      .map((line) => {
        const fig = /** @type {string} */ (line.figure);
        return `<tr>
      <td>${esc(roundFigureLabel(fig))}</td>
      <td class="mono">${esc(String(line.displayAmount ?? line.amount ?? "—"))}</td>
      <td class="mono bo-round-card__payout">${esc(
        formatBoMoneyFromCents(Number(line.payoutCents ?? 0), "ARS", {
          minimumFractionDigits: 0,
        }),
      )}</td>
    </tr>`;
      })
      .join("");

    const tableHtml = `<div class="bo-round-detail-table-wrap">
    <table class="table table--compact bo-round-card__prize-table">
      <thead><tr>
        <th>${esc(t("bingo.roundDetailFigure"))}</th>
        <th>${esc(t("bingo.roundsPrizeRule"))}</th>
        <th>${esc(t("bingo.roundsPrizePayout"))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
    cards.push(renderRoundPrizeSubCard(t("bingo.roundsPrizeFiguresCard"), tableHtml));
  }

  return `<section class="bo-round-card__prizes-section" aria-label="${esc(t("bingo.roundsPrizeBreakdown"))}">
    <div class="bo-round-card__prizes-grid">${cards.join("")}</div>
  </section>`;
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
      <td class="mono">${esc(formatBoMoneyFromCents(p.amountCents, "ARS", { minimumFractionDigits: 0 }))}</td>
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

export { wireBingoRoundsDialog, openBingoRoundsModal };

export function resetRoundsPager() {
  roundsPager = null;
}
