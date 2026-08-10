/**
 * Bingo admin — create/edit forms and payload.
 */
import { t } from "../bo-i18n.js";
import {
  collectPrizesFromHost,
  getPrizeModeForPrefix,
  renderPrizesEditor,
  wireBingoPrizeMode,
} from "./prizes.js";
import {
  collectJackpotPayload,
  fillJackpotFields,
  resetJackpotFields,
  wireJackpotFields,
} from "./jackpot.js";
import {
  datetimeLocalToIso,
  defaultEndFromStart,
  defaultStartDtLocal,
  isoToDatetimeLocal,
  parseMoneyAmount,
} from "./utils.js";

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
  const jackpot = collectJackpotPayload(prefix);

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
    ...jackpot,
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
  wireJackpotFields("create");
  resetJackpotFields("create");
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
  wireJackpotFields("edit");
  fillJackpotFields("edit", bingo);
  renderPrizesEditor(
    document.getElementById("edit-prizes"),
    (bingo.prizes || [])
      .filter((p) => p.figure !== "JACKPOT")
      .map((p) => ({
      figure: p.figure,
      amount: p.amount,
    })),
    "edit",
  );
}

function typeLabel(tpe) {
  if (tpe === "BINGO_75") return t("bingo.type75");
  if (tpe === "BINGO_90") return t("bingo.type90");
  return tpe;
}

export { collectPayload, resetCreateForm, fillEditForm, typeLabel };
