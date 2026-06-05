import { escapeHtml, formatMoneyFromCents } from "@shared/index.ts";
import { formatWhen } from "../lib/format.js";
import type { TxDetail } from "../types.js";

const formatMoney = formatMoneyFromCents;

export function renderTxList(transactions: Array<Record<string, unknown>>, currency: string): string {
  if (!transactions.length) {
    return `<p class="pp-muted">Sin movimientos recientes.</p>`;
  }
  return `<ul class="pp-tx-list">${transactions
    .map((t) => {
      const amt = Number(t.amountCents ?? 0);
      const when = t.createdAt ? formatWhen(String(t.createdAt)) : "";
      const sign = amt >= 0 ? "+" : "";
      const detail = t.detail as TxDetail | undefined;
      let labelHtml: string;
      if (detail?.kind === "prize" && detail.bingoName && detail.figure) {
        labelHtml = `Premio · ${escapeHtml(detail.bingoName)} · ${escapeHtml(detail.figure)}`;
      } else if (detail?.kind === "purchase" && detail.bingoName) {
        labelHtml = `Compra cartones · ${escapeHtml(detail.bingoName)}${
          detail.roundSequence != null ? ` · Partida #${detail.roundSequence}` : ""
        }`;
      } else if (detail?.kind === "refund" && detail.bingoName) {
        labelHtml = `Reembolso · partida cancelada · ${escapeHtml(detail.bingoName)}${
          detail.roundSequence != null ? ` · Partida #${detail.roundSequence}` : ""
        }`;
      } else if (detail?.kind === "deposit") {
        labelHtml = "Ingreso / depósito";
      } else if (detail?.kind === "adjustment") {
        labelHtml = "Ajuste de saldo";
      } else {
        labelHtml = escapeHtml(String(t.type ?? ""));
      }
      const money = formatMoney(Math.abs(amt), currency);
      return `<li><span>${labelHtml} <span class="pp-muted">· ${escapeHtml(when)}</span></span><span><strong>${sign}${escapeHtml(money)}</strong></span></li>`;
    })
    .join("")}</ul>`;
}

export function repopulateTxBingoRound(
  viewTx: HTMLElement,
  transactions: Array<Record<string, unknown>>,
): void {
  const roomSel = viewTx.querySelector("#pp-tf-room") as HTMLSelectElement | null;
  const bingoSel = viewTx.querySelector("#pp-tf-bingo") as HTMLSelectElement | null;
  const roundSel = viewTx.querySelector("#pp-tf-round") as HTMLSelectElement | null;
  if (!roomSel || !bingoSel || !roundSel) return;
  const room = roomSel.value.trim();
  const bingoMap = new Map<string, string>();
  const roundMap = new Map<string, { seq: number | null; label: string; bingoId: string | null }>();
  for (const t of transactions) {
    const d = t.detail as TxDetail | undefined;
    if (!d?.bingoId || !d.bingoName) continue;
    if (room && (d.roomSlug ?? "") !== room) continue;
    bingoMap.set(d.bingoId, d.bingoName);
    if (d.bingoRoundId) {
      const label =
        d.roundSequence != null
          ? `Partida #${d.roundSequence} · ${d.bingoName ?? ""}`
          : `${d.bingoName ?? ""}`;
      roundMap.set(d.bingoRoundId, { seq: d.roundSequence ?? null, label, bingoId: d.bingoId });
    }
  }
  const prevBingo = bingoSel.value;
  const bingos = [...bingoMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  bingoSel.innerHTML =
    `<option value="">Todos</option>` +
    bingos.map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join("");
  if (prevBingo && bingos.some((b) => b.id === prevBingo)) bingoSel.value = prevBingo;

  const bingo = bingoSel.value.trim();
  const prevRound = roundSel.value;
  let rounds = [...roundMap.entries()].map(([id, v]) => ({ id, ...v }));
  if (bingo) rounds = rounds.filter((r) => r.bingoId === bingo);
  rounds.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
  roundSel.innerHTML =
    `<option value="">Todas</option>` +
    rounds.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`).join("");
  if (prevRound && rounds.some((r) => r.id === prevRound)) roundSel.value = prevRound;
}
