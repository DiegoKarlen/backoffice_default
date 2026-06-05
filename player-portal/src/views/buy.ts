import { escapeHtml, formatDecimalPrice } from "@shared/index.ts";
import { el } from "../lib/dom.js";
import { formatWhen } from "../lib/format.js";
import type { OccRow } from "../types.js";

export function renderRoundsTable(
  rows: OccRow[],
  currencyCode: string,
  onBuy: (roundId: string, qty: number) => void,
): HTMLElement {
  const wrap = el(`<div class="pp-table-wrap"></div>`);
  if (!rows.length) {
    wrap.innerHTML =
      `<p class="pp-muted">No hay partidas programadas en el horizonte para esta sala (o los bingos no están activos).</p>`;
    return wrap;
  }

  const table = document.createElement("table");
  table.className = "pp-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Inicio</th>
        <th>Bingo</th>
        <th>Tipo</th>
        <th>Cartón</th>
        <th>Partida</th>
        <th>Comprar</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector("tbody")!;

  for (const r of rows) {
    const tr = document.createElement("tr");
    const can75 = r.bingoType === "BINGO_75";
    const hasRound = !!r.bingoRoundId;
    const seq =
      r.roundSequence != null ? `#${r.roundSequence}` : `<span class="pp-muted">—</span>`;
    const typeLabel = can75
      ? `<span class="pp-badge ok">75</span>`
      : `<span class="pp-badge no">90</span>`;

    let buyCell: string;
    if (!can75) {
      buyCell = `<span class="pp-muted">Solo 75</span>`;
    } else if (!hasRound) {
      buyCell = `<span class="pp-muted" title="La partida aún no está generada en base">Pendiente</span>`;
    } else {
      const rid = r.bingoRoundId!;
      buyCell = `
        <div class="pp-actions" data-buy-row="${escapeHtml(rid)}">
          <input type="number" min="1" max="99" value="1" aria-label="Cantidad" />
          <button type="button" class="pp-btn" data-buy="${escapeHtml(rid)}">Comprar</button>
        </div>`;
    }

    tr.innerHTML = `
      <td>${formatWhen(r.startsAt)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${typeLabel}</td>
      <td>${escapeHtml(formatDecimalPrice(r.cardPrice, currencyCode))}</td>
      <td>${seq}</td>
      <td>${buyCell}</td>`;
    tbody.appendChild(tr);
  }

  wrap.appendChild(table);

  wrap.querySelectorAll("[data-buy]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      const id = (ev.currentTarget as HTMLElement).getAttribute("data-buy");
      if (!id) return;
      const row = wrap.querySelector(`[data-buy-row="${CSS.escape(id)}"]`);
      const input = row?.querySelector('input[type="number"]') as HTMLInputElement | null;
      const qty = Math.min(99, Math.max(1, Math.trunc(Number(input?.value) || 1)));
      onBuy(id, qty);
    });
  });

  return wrap;
}
