/**

 * Bingo admin — jackpot configuration (full card before ball X).

 */

import { t } from "../bo-i18n.js";



function jackpotMaxBallInput(prefix) {

  const el = document.getElementById(`${prefix}-jackpotMaxBall`);

  return el instanceof HTMLInputElement ? el : null;

}



function jackpotAmountInput(prefix) {

  const el = document.getElementById(`${prefix}-jackpotAmount`);

  return el instanceof HTMLInputElement ? el : null;

}



function syncJackpotFieldsUi(prefix) {

  const enabled = !!document.getElementById(`${prefix}-jackpotEnabled`)?.checked;

  const maxBall = jackpotMaxBallInput(prefix);

  const amount = jackpotAmountInput(prefix);



  if (maxBall) {

    maxBall.disabled = !enabled;

    if (!enabled) maxBall.value = "";

  }

  if (amount) {

    amount.disabled = !enabled;

    if (!enabled) amount.value = "";

  }

}



export function wireJackpotFields(prefix) {

  const toggle = document.getElementById(`${prefix}-jackpotEnabled`);

  if (!toggle || toggle.dataset.boJackpotWired === "1") return;

  toggle.dataset.boJackpotWired = "1";

  toggle.addEventListener("change", () => syncJackpotFieldsUi(prefix));

  syncJackpotFieldsUi(prefix);

}



export function resetJackpotFields(prefix) {

  const toggle = document.getElementById(`${prefix}-jackpotEnabled`);

  if (toggle instanceof HTMLInputElement) toggle.checked = false;

  syncJackpotFieldsUi(prefix);

}



export function fillJackpotFields(prefix, bingo) {

  const enabled = bingo?.jackpotEnabled === true;

  const toggle = document.getElementById(`${prefix}-jackpotEnabled`);

  const maxBall = jackpotMaxBallInput(prefix);

  const amount = jackpotAmountInput(prefix);



  if (toggle instanceof HTMLInputElement) toggle.checked = enabled;



  if (enabled) {

    if (maxBall) {

      maxBall.disabled = false;

      maxBall.value = bingo?.jackpotMaxBall != null ? String(bingo.jackpotMaxBall) : "";

    }

    if (amount) {

      amount.disabled = false;

      amount.value = bingo?.jackpotAmount != null ? String(bingo.jackpotAmount) : "";

    }

  } else {

    syncJackpotFieldsUi(prefix);

  }

}



export function collectJackpotPayload(prefix) {

  const enabled = !!document.getElementById(`${prefix}-jackpotEnabled`)?.checked;

  if (!enabled) {

    return { jackpotEnabled: false, jackpotMaxBall: null, jackpotAmount: null };

  }



  const maxRaw = jackpotMaxBallInput(prefix)?.value;

  const amountRaw = jackpotAmountInput(prefix)?.value;

  const jackpotMaxBall = Number(String(maxRaw ?? "").trim());

  const jackpotAmount = String(amountRaw ?? "").trim();



  if (!Number.isInteger(jackpotMaxBall) || jackpotMaxBall < 2 || jackpotMaxBall > 75) {

    throw new Error(t("bingo.errJackpotMaxBall"));

  }

  if (!jackpotAmount) {

    throw new Error(t("bingo.errJackpotAmount"));

  }



  return { jackpotEnabled: true, jackpotMaxBall, jackpotAmount };

}

