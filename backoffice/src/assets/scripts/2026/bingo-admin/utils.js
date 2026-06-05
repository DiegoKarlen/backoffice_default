/**
 * Bingo admin — date/money helpers and toast.
 */
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

import { parseDecimalMoneyAmount } from "../bo-shared.js";

/** @deprecated Use `parseDecimalMoneyAmount` from `bo-shared.js`. */
const parseMoneyAmount = parseDecimalMoneyAmount;

export {
  showToast,
  isoToDatetimeLocal,
  datetimeLocalToIso,
  defaultStartDtLocal,
  defaultEndFromStart,
  parseMoneyAmount,
  parseDecimalMoneyAmount,
};
