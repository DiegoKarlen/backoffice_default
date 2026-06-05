import { escapeHtml } from "@shared/index.ts";
import { formatWhen } from "../lib/format.js";
import type { LiveSnap, MyCardRow } from "../types.js";

export function uniqueRoomSlugsFromCards(cards: MyCardRow[]): string[] {
  const slugs = cards.map((c) => c.round.roomSlug).filter((s): s is string => !!s && s.trim().length > 0);
  return [...new Set(slugs)];
}

function cellAttrsForLive(
  cell: { number: number | null; isFree: boolean },
  card: MyCardRow,
  liveByRoom: Map<string, LiveSnap>,
): string {
  const slug = card.round.roomSlug;
  const snap = slug ? liveByRoom.get(slug) : undefined;
  const active =
    snap?.phase === "drawing" && snap.current != null && snap.current.roundId === card.bingoRoundId;
  const drawn = active && snap.current ? new Set(snap.current.drawn) : null;
  let hit = false;
  if (active && drawn) {
    if (cell.isFree) hit = true;
    else if (cell.number != null) hit = drawn.has(cell.number);
  }
  const classes: string[] = [];
  if (cell.isFree) classes.push("pp-cell-free");
  if (hit) classes.push("pp-cell-hit");
  return classes.length ? ` class="${classes.join(" ")}"` : "";
}

function cardCaptionHtml(card: MyCardRow, liveByRoom: Map<string, LiveSnap>): string {
  const slug = card.round.roomSlug;
  const snap = slug ? liveByRoom.get(slug) : undefined;
  const live =
    snap?.phase === "drawing" && snap.current != null && snap.current.roundId === card.bingoRoundId;
  const liveTag = live
    ? ` <span class="pp-live-badge" title="Bolillas saliendo en esta partida">En vivo</span>`
    : "";
  const cap = `${escapeHtml(card.round.bingoName)} · Partida #${card.round.sequence} · ${formatWhen(card.round.startsAt)} · Cartón ${card.cardIndex + 1}`;
  return `<p class="pp-card-caption">${cap}${liveTag}</p>`;
}

export function renderMyCardsHtml(cards: MyCardRow[], liveByRoom: Map<string, LiveSnap>): string {
  if (!cards.length) {
    return `<p class="pp-muted">Todavía no tenés cartones. Podés comprarlos en <strong>Comprar cartones</strong>.</p>`;
  }
  return cards
    .map((card) => {
      const rows = card.grid
        .map((r) => {
          const cells = r
            .map((cell) => {
              const attrs = cellAttrsForLive(cell, card, liveByRoom);
              if (cell.isFree) return `<td${attrs}>Libre</td>`;
              const n = cell.number;
              return `<td${attrs}>${n != null ? escapeHtml(String(n)) : "—"}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<div class="pp-card-unit">${cardCaptionHtml(card, liveByRoom)}<table class="pp-bingo-grid" aria-label="Cartón bingo">${rows}</table></div>`;
    })
    .join("");
}

export function repopulateCardsBingoRound(viewCards: HTMLElement, cards: MyCardRow[]): void {
  const roomSel = viewCards.querySelector("#pp-cf-room") as HTMLSelectElement | null;
  const bingoSel = viewCards.querySelector("#pp-cf-bingo") as HTMLSelectElement | null;
  const roundSel = viewCards.querySelector("#pp-cf-round") as HTMLSelectElement | null;
  if (!roomSel || !bingoSel || !roundSel) return;
  const room = roomSel.value.trim();
  const filtered = room ? cards.filter((c) => (c.round.roomSlug ?? "") === room) : cards;
  const bingos = uniqueBingosFromCards(filtered);
  const prevBingo = bingoSel.value;
  bingoSel.innerHTML =
    `<option value="">Todos</option>` +
    bingos.map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join("");
  if (prevBingo && bingos.some((b) => b.id === prevBingo)) bingoSel.value = prevBingo;

  const bingo = bingoSel.value.trim();
  const forRounds = bingo ? filtered.filter((c) => c.round.bingoId === bingo) : filtered;
  const roundsMap = new Map<string, { seq: number; startsAt: string }>();
  for (const c of forRounds) {
    if (!roundsMap.has(c.bingoRoundId)) {
      roundsMap.set(c.bingoRoundId, { seq: c.round.sequence, startsAt: c.round.startsAt });
    }
  }
  const prevRound = roundSel.value;
  const rounds = [...roundsMap.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  roundSel.innerHTML =
    `<option value="">Todas</option>` +
    rounds
      .map(
        (r) =>
          `<option value="${escapeHtml(r.id)}">Partida #${r.seq} · ${escapeHtml(formatWhen(r.startsAt))}</option>`,
      )
      .join("");
  if (prevRound && rounds.some((r) => r.id === prevRound)) roundSel.value = prevRound;
}

export function uniqueBingosFromCards(cards: MyCardRow[]): Array<{ id: string; name: string }> {
  const m = new Map<string, string>();
  for (const c of cards) {
    m.set(c.round.bingoId, c.round.bingoName);
  }
  return [...m.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
