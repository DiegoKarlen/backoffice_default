/**
 * Home — marcado de bolillas para bingos Live (solo backoffice autenticado).
 */
import { api } from "../bo-api.js";
import { hasFunctionality } from "../bo-config.js";
import { esc } from "../bo-escape.js";
import { t } from "../bo-i18n.js";

const POLL_MS = 2000;

/** @type {number | null} */
let pollTimer = null;
/** @type {boolean} */
let drawBusy = false;

function roundFigureLabel(fig) {
  const key = `players.walletFigure.${fig}`;
  const lbl = t(key);
  return lbl === key ? String(fig) : lbl;
}

function disposeHomeLiveDraw() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  drawBusy = false;
}

/**
 * @param {NonNullable<import("@shared/index.ts").LiveSnapshot["current"]>} cur
 * @param {boolean} markingEnabled
 */
function renderHomeLivePicker(cur, markingEnabled) {
  const grid = document.getElementById("bo-home-live-picker");
  if (!grid) return;

  const total = cur.totalBalls || (cur.bingoType === "BINGO_90" ? 90 : 75);
  const drawnSet = new Set(cur.drawn);
  const cols = total <= 75 ? 15 : 18;
  grid.style.setProperty("--bo-live-cols", String(cols));

  const parts = [];
  for (let n = 1; n <= total; n++) {
    const isDrawn = drawnSet.has(n);
    let cls = "bo-home-live-ball is-drawn";
    if (!isDrawn) {
      cls = markingEnabled ? "bo-home-live-ball is-available" : "bo-home-live-ball is-locked";
    }
    const disabled = isDrawn || !markingEnabled || drawBusy;
    parts.push(
      `<button type="button" class="${cls}" data-ball="${n}"${disabled ? " disabled" : ""} aria-label="${esc(t("home.liveDrawBallAria", { n: String(n) }))}"><span class="mono">${n}</span></button>`,
    );
  }
  grid.innerHTML = parts.join("");
}

/**
 * @param {import("@shared/index.ts").LiveSnapshot} snap
 */
function paintHomeLiveDraw(snap) {
  const section = document.getElementById("bo-home-live");
  const statusEl = document.getElementById("bo-home-live-status");
  const pickerWrap = document.getElementById("bo-home-live-picker-wrap");
  const hintEl = document.getElementById("bo-home-live-hint");
  const metaEl = document.getElementById("bo-home-live-meta");
  if (!section || !statusEl || !pickerWrap) return;

  statusEl.style.color = "";

  const cur = snap.current;
  const isLiveDraw =
    snap.phase === "drawing" && cur?.drawMode === "LIVE" && cur.canMarkLiveBall !== false;
  const isLiveIdle =
    snap.phase === "drawing" && cur?.drawMode === "LIVE" && cur.canMarkLiveBall === false;

  if (metaEl && cur) {
    metaEl.textContent = `${cur.name || "—"} · #${cur.roundSequence ?? "—"}`;
    metaEl.hidden = false;
  } else if (metaEl) {
    metaEl.hidden = true;
  }

  if (isLiveDraw && cur) {
    statusEl.textContent = t("home.liveDrawStatusOpen");
    pickerWrap.hidden = false;
    if (hintEl) hintEl.textContent = t("home.liveDrawHintOpen");
    renderHomeLivePicker(cur, true);
    return;
  }

  pickerWrap.hidden = true;
  if (isLiveIdle) {
    statusEl.textContent = t("home.liveDrawStatusClosed");
    return;
  }
  if (snap.phase === "drawing" && cur?.drawMode === "VIRTUAL") {
    statusEl.textContent = t("home.liveDrawStatusVirtual");
    return;
  }
  statusEl.textContent = t("home.liveDrawStatusIdle");
}

async function refreshHomeLiveDraw(roomSlug) {
  const section = document.getElementById("bo-home-live");
  if (!section) return;

  const slug = typeof roomSlug === "string" ? roomSlug.trim() : "";
  if (!hasFunctionality("bo.bingo.manage")) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  if (!slug) {
    const pickerWrapEmpty = document.getElementById("bo-home-live-picker-wrap");
    const metaEmpty = document.getElementById("bo-home-live-meta");
    if (pickerWrapEmpty) pickerWrapEmpty.hidden = true;
    if (metaEmpty) metaEmpty.hidden = true;
    statusEl.textContent = t("home.liveDrawSelectRoom");
    return;
  }
  try {
    const snap = await api.bingos.liveState({ roomSlug: slug });
    paintHomeLiveDraw(snap);
  } catch (e) {
    const statusEl = document.getElementById("bo-home-live-status");
    if (statusEl) {
      statusEl.textContent = e instanceof Error ? e.message : String(e);
    }
    const pickerWrap = document.getElementById("bo-home-live-picker-wrap");
    if (pickerWrap) pickerWrap.hidden = true;
  }
}

/**
 * @param {string} roomSlug
 */
function startHomeLiveDrawPolling(roomSlug) {
  disposeHomeLiveDraw();
  if (!hasFunctionality("bo.bingo.manage")) return;

  const slug = typeof roomSlug === "string" ? roomSlug.trim() : "";
  void refreshHomeLiveDraw(slug);
  pollTimer = window.setInterval(() => {
    const sel = /** @type {HTMLSelectElement | null} */ (document.getElementById("bo-home-room"));
    void refreshHomeLiveDraw(sel?.value?.trim() ?? slug);
  }, POLL_MS);
}

function wireHomeLiveDraw() {
  const grid = document.getElementById("bo-home-live-picker");
  if (!grid || grid.dataset.boWired === "1") return;
  grid.dataset.boWired = "1";

  grid.addEventListener("click", (ev) => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest(".bo-home-live-ball.is-available");
    if (!btn || !(btn instanceof HTMLButtonElement) || btn.disabled || drawBusy) return;
    const n = Number(btn.dataset.ball);
    if (!Number.isInteger(n)) return;

    const roomSel = /** @type {HTMLSelectElement | null} */ (document.getElementById("bo-home-room"));
    const slug = roomSel?.value?.trim() ?? "";
    if (!slug) return;

    drawBusy = true;
    btn.disabled = true;
    void api.bingos
      .liveDrawBall({ roomSlug: slug }, n)
      .then(() => refreshHomeLiveDraw(slug))
      .catch((e) => {
        const statusEl = document.getElementById("bo-home-live-status");
        if (statusEl) {
          statusEl.textContent = e instanceof Error ? e.message : String(e);
          statusEl.style.color = "var(--danger, #c0392b)";
        }
      })
      .finally(() => {
        drawBusy = false;
        void refreshHomeLiveDraw(slug);
      });
  });
}

export { disposeHomeLiveDraw, refreshHomeLiveDraw, startHomeLiveDrawPolling, wireHomeLiveDraw };
