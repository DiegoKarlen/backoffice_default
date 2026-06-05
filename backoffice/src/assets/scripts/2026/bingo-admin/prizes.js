/**
 * Bingo admin — prize catalog and editor.
 */
import { applyDomI18n, t } from "../bo-i18n.js";
import { esc } from "../bo-escape.js";
import { parseMoneyAmount } from "./utils.js";

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

export {
  prizeFigureLabel,
  defaultPrizeCatalog,
  getPrizeModeForPrefix,
  syncBingoPrizeModeUi,
  wireBingoPrizeMode,
  renderPrizesEditor,
  collectPrizesFromHost,
};
