import "./style.css";
import { connectSseWithReconnect, escapeHtml, formatDecimalPrice, formatMoneyFromCents } from "@shared/index.ts";
import { API_BASE, apiJson, publicJson } from "./lib/api.js";
import { el } from "./lib/dom.js";
import { formatWhen, friendlyError } from "./lib/format.js";
import {
  PP_TAB_KEY,
  consumeAuthExpiredFlash,
  getToken,
  isSessionHandledError,
  setAuthExpiredFlash,
  setSessionExpiredHandler,
  setToken,
} from "./lib/session.js";

const formatMoney = formatMoneyFromCents;

type TxDetail = {
  kind: "prize" | "purchase" | "deposit" | "refund" | "adjustment" | null;
  bingoName?: string;
  figure?: string;
  roundSequence?: number | null;
  depositNote?: string | null;
  roomSlug?: string | null;
  bingoId?: string | null;
  bingoRoundId?: string | null;
};

type MyCardRow = {
  id: string;
  cardIndex: number;
  bingoRoundId: string;
  round: {
    id: string;
    bingoId: string;
    sequence: number;
    startsAt: string;
    bingoName: string;
    bingoType: string;
    roomSlug?: string;
    roomName?: string;
  };
  grid: Array<Array<{ number: number | null; isFree: boolean }>>;
};

type LiveSnap = {
  phase: "idle" | "drawing";
  roomSlug: string;
  current: null | {
    roundId: string;
    drawn: number[];
    lastBall: number | null;
  };
};

type PpTab = "buy" | "cards" | "tx";

let disconnectLiveStreams: (() => void) | null = null;

setSessionExpiredHandler(() => {
  disconnectLiveStreams?.();
  disconnectLiveStreams = null;
  render();
});

function uniqueRoomSlugsFromCards(cards: MyCardRow[]): string[] {
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
  const drawn = active && snap!.current ? new Set(snap!.current!.drawn) : null;
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

type RoomOpt = { id: string; name: string; slug: string };

type OccRow = {
  bingoId: string;
  name: string;
  bingoType: string;
  cardPrice: string;
  startsAt: string;
  startsAtMs: number;
  roundSequence: number | null;
  bingoRoundId: string | null;
};

async function loadRooms(): Promise<RoomOpt[]> {
  const data = (await publicJson("/public/bingos/rooms")) as { rooms?: RoomOpt[] };
  return data.rooms ?? [];
}

async function loadUpcomingForRoom(slug: string): Promise<OccRow[]> {
  const q = new URLSearchParams({
    roomSlug: slug,
    limit: "48",
    horizonDays: "21",
  });
  const data = (await publicJson(`/public/bingos/upcoming?${q.toString()}`)) as {
    upcoming?: OccRow[];
  };
  return data.upcoming ?? [];
}

function qs(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && String(v).trim() !== "") q.set(k, String(v).trim());
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function datetimeLocalToIso(val: string | undefined): string | undefined {
  if (val == null || !String(val).trim()) return undefined;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function renderLoggedShell(root: HTMLElement): void {
  root.innerHTML = "";
  root.appendChild(
    el(`
    <div class="pp-root pp-root--app">
      <header class="pp-app-header">
        <div class="pp-app-header__text">
          <h1 class="pp-title">Portal jugador</h1>
          <p class="pp-userline" id="pp-user-line"></p>
        </div>
        <div class="pp-wallet-chip" aria-live="polite">
          <span class="pp-wallet-label">Saldo disponible</span>
          <p class="pp-wallet-amount" id="pp-balance-amount">—</p>
        </div>
        <button type="button" class="pp-btn pp-btn-ghost pp-btn-logout" id="btn-logout">Cerrar sesión</button>
      </header>
      <nav class="pp-nav" id="pp-main-nav" aria-label="Secciones">
        <button type="button" class="pp-nav-btn pp-nav-btn--active" data-view="buy">Comprar cartones</button>
        <button type="button" class="pp-nav-btn" data-view="cards">Cartones comprados</button>
        <button type="button" class="pp-nav-btn" data-view="tx">Movimientos</button>
      </nav>
      <div id="panel-logged"><p class="pp-loading">Cargando…</p></div>
      <div id="msg" class="pp-msg"></div>
    </div>`),
  );

  root.querySelector("#btn-logout")?.addEventListener("click", () => {
    setToken(null);
    try {
      sessionStorage.removeItem(PP_TAB_KEY);
    } catch {
      /* ignore */
    }
    render();
  });
}

function renderTxList(transactions: Array<Record<string, unknown>>, currency: string): string {
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

function renderMyCardsHtml(cards: MyCardRow[], liveByRoom: Map<string, LiveSnap>): string {
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
              if (cell.isFree) {
                return `<td${attrs}>Libre</td>`;
              }
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

function renderRoundsTable(
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

function readSavedTab(): PpTab {
  try {
    const v = sessionStorage.getItem(PP_TAB_KEY);
    if (v === "buy" || v === "cards" || v === "tx") return v;
  } catch {
    /* ignore */
  }
  return "buy";
}

function setActiveTab(root: HTMLElement, tab: PpTab): void {
  try {
    sessionStorage.setItem(PP_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
  root.querySelectorAll(".pp-nav-btn").forEach((b) => {
    const btn = b as HTMLButtonElement;
    const v = btn.getAttribute("data-view") as PpTab | null;
    btn.classList.toggle("pp-nav-btn--active", v === tab);
  });
  root.querySelectorAll(".pp-view").forEach((sec) => {
    const s = sec as HTMLElement;
    s.classList.toggle("pp-view--active", s.getAttribute("data-view") === tab);
    s.hidden = s.getAttribute("data-view") !== tab;
  });
}

async function mountDashboard(root: HTMLElement, msg: HTMLElement | null): Promise<void> {
  disconnectLiveStreams?.();

  const liveSnapshots = new Map<string, LiveSnap>();
  const liveSources = new Map<string, () => void>();
  let latestCards: MyCardRow[] = [];

  const panel = root.querySelector("#panel-logged") as HTMLElement | null;
  const balanceEl = root.querySelector("#pp-balance-amount");
  const userLineEl = root.querySelector("#pp-user-line");
  if (!panel) return;

  function paintMyCardsHost(): void {
    const cardsHost = panel.querySelector("#pp-cards-host");
    if (cardsHost) cardsHost.innerHTML = renderMyCardsHtml(latestCards, liveSnapshots);
  }

  async function seedLiveSnapshots(slugs: string[]): Promise<void> {
    await Promise.all(
      slugs.map(async (slug) => {
        try {
          const data = (await publicJson(
            `/public/bingos/live/state?roomSlug=${encodeURIComponent(slug)}`,
          )) as LiveSnap;
          liveSnapshots.set(slug, data);
        } catch {
          /* ignore */
        }
      }),
    );
  }

  function syncLiveConnections(slugs: string[]): void {
    for (const slug of slugs) {
      if (liveSources.has(slug)) continue;
      const url = `${API_BASE}/public/bingos/live/events?roomSlug=${encodeURIComponent(slug)}`;
      const disconnect = connectSseWithReconnect({
        url,
        listeners: {
          state: (data) => {
            liveSnapshots.set(slug, data as LiveSnap);
            paintMyCardsHost();
          },
        },
      });
      liveSources.set(slug, disconnect);
    }
    for (const [slug, disconnect] of [...liveSources.entries()]) {
      if (!slugs.includes(slug)) {
        disconnect();
        liveSources.delete(slug);
        liveSnapshots.delete(slug);
      }
    }
  }

  disconnectLiveStreams = () => {
    for (const disconnect of liveSources.values()) disconnect();
    liveSources.clear();
    liveSnapshots.clear();
  };

  const me = (await apiJson("/player/me")) as {
    player: {
      email: string;
      username: string;
      wallet: { balanceCents: number; currencyCode: string } | null;
    };
  };
  const w = me.player.wallet;
  const balanceCents = w?.balanceCents ?? 0;
  const currency = w?.currencyCode ?? "ARS";

  if (userLineEl) {
    userLineEl.innerHTML = `<strong>${escapeHtml(me.player.username)}</strong> · ${escapeHtml(me.player.email)}`;
  }
  if (balanceEl) {
    balanceEl.textContent = formatMoney(balanceCents, currency);
  }

  const [rooms, txData, myCardsPayload] = await Promise.all([
    loadRooms(),
    apiJson(`/player/wallet/transactions${qs({ limit: "100" })}`) as Promise<{ transactions: unknown[] }>,
    apiJson("/player/my-cards") as Promise<{ cards: MyCardRow[] }>,
  ]);

  latestCards = myCardsPayload.cards;
  const initialSlugs = uniqueRoomSlugsFromCards(latestCards);
  await seedLiveSnapshots(initialSlugs);

  const buySectionInner = el(`<div class="pp-card-block" id="buy-section-inner"></div>`);
  buySectionInner.appendChild(el(`<h2 class="pp-section-title">Comprar cartones</h2>`));
  buySectionInner.appendChild(
    el(
      `<p class="pp-hint">Elegí una sala y una partida futura. Solo se pueden comprar cartones para bingos tipo <strong>75</strong> cuando la partida ya está creada en el sistema.</p>`,
    ),
  );
  const fieldRoom = el(`<div class="pp-field"></div>`);
  const opts =
    rooms.length === 0
      ? `<option value="">— No hay salas activas —</option>`
      : `<option value="">Seleccioná sala…</option>${rooms
          .map((r) => `<option value="${escapeHtml(r.slug)}">${escapeHtml(r.name)}</option>`)
          .join("")}`;
  fieldRoom.innerHTML = `<label for="pp-room">Sala</label><select id="pp-room">${opts}</select>`;
  buySectionInner.appendChild(fieldRoom);
  const roundsHost = el(`<div id="pp-rounds-host"></div>`);
  buySectionInner.appendChild(roundsHost);
  const viewBuy = el(`<section class="pp-view pp-view--active" data-view="buy" id="view-buy"></section>`);
  viewBuy.appendChild(buySectionInner);

  let txMasterList: Array<Record<string, unknown>> = [...(txData.transactions as Array<Record<string, unknown>>)];

  const roomOptsCards =
    rooms.length === 0
      ? `<option value="">—</option>`
      : `<option value="">Todas</option>${rooms
          .map((r) => `<option value="${escapeHtml(r.slug)}">${escapeHtml(r.name)}</option>`)
          .join("")}`;

  const viewCards = el(`<section class="pp-view" data-view="cards" id="view-cards" hidden></section>`);
  viewCards.innerHTML = `
    <div class="pp-card-block">
      <h2 class="pp-section-title">Mis cartones</h2>
      <div class="pp-filters pp-filters--cards" id="pp-cards-filters">
        <div class="pp-field pp-field--filter"><label for="pp-cf-room">Sala</label><select id="pp-cf-room" class="pp-select">${roomOptsCards}</select></div>
        <div class="pp-field pp-field--filter"><label for="pp-cf-bingo">Bingo</label><select id="pp-cf-bingo" class="pp-select"><option value="">Todos</option></select></div>
        <div class="pp-field pp-field--filter"><label for="pp-cf-round">Partida</label><select id="pp-cf-round" class="pp-select"><option value="">Todas</option></select></div>
        <div class="pp-field pp-field--filter"><label for="pp-cf-from">Desde</label><input id="pp-cf-from" type="datetime-local" class="pp-input pp-input--datetime" /></div>
        <div class="pp-field pp-field--filter"><label for="pp-cf-to">Hasta</label><input id="pp-cf-to" type="datetime-local" class="pp-input pp-input--datetime" /></div>
        <div class="pp-filters__actions">
          <button type="button" class="pp-btn" id="pp-cf-apply">Aplicar</button>
          <button type="button" class="pp-btn pp-btn-ghost" id="pp-cf-clear">Limpiar</button>
        </div>
      </div>
      <div id="pp-cards-host" class="pp-cards-block">${renderMyCardsHtml(latestCards, liveSnapshots)}</div>
    </div>`;

  const roomOptsTx =
    rooms.length === 0
      ? `<option value="">—</option>`
      : `<option value="">Todas</option>${rooms
          .map((r) => `<option value="${escapeHtml(r.slug)}">${escapeHtml(r.name)}</option>`)
          .join("")}`;

  const viewTx = el(`<section class="pp-view" data-view="tx" id="view-tx" hidden></section>`);
  viewTx.innerHTML = `
    <div class="pp-card-block">
      <h2 class="pp-section-title">Movimientos</h2>
      <div class="pp-filters pp-filters--tx" id="pp-tx-filters">
        <div class="pp-field pp-field--filter"><label for="pp-tf-room">Sala</label><select id="pp-tf-room" class="pp-select">${roomOptsTx}</select></div>
        <div class="pp-field pp-field--filter"><label for="pp-tf-bingo">Bingo</label><select id="pp-tf-bingo" class="pp-select"><option value="">Todos</option></select></div>
        <div class="pp-field pp-field--filter"><label for="pp-tf-round">Partida</label><select id="pp-tf-round" class="pp-select"><option value="">Todas</option></select></div>
        <div class="pp-field pp-field--filter"><label for="pp-tf-type">Tipo</label>
          <select id="pp-tf-type" class="pp-select">
            <option value="">Todos</option>
            <option value="DEPOSIT">Ingreso / depósito</option>
            <option value="CARTON_PURCHASE">Compra cartones</option>
            <option value="PRIZE_CREDIT">Premio</option>
            <option value="REFUND">Reembolso</option>
            <option value="ADJUSTMENT">Ajuste</option>
          </select>
        </div>
        <div class="pp-field pp-field--filter"><label for="pp-tf-from">Desde</label><input id="pp-tf-from" type="datetime-local" class="pp-input pp-input--datetime" /></div>
        <div class="pp-field pp-field--filter"><label for="pp-tf-to">Hasta</label><input id="pp-tf-to" type="datetime-local" class="pp-input pp-input--datetime" /></div>
        <div class="pp-filters__actions">
          <button type="button" class="pp-btn" id="pp-tf-apply">Aplicar</button>
          <button type="button" class="pp-btn pp-btn-ghost" id="pp-tf-clear">Limpiar</button>
        </div>
      </div>
      <div id="pp-tx">${renderTxList(txData.transactions as Array<Record<string, unknown>>, currency)}</div>
    </div>`;

  function uniqueBingosFromCards(cards: MyCardRow[]): Array<{ id: string; name: string }> {
    const m = new Map<string, string>();
    for (const c of cards) {
      m.set(c.round.bingoId, c.round.bingoName);
    }
    return [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function repopulateCardsBingoRound(cards: MyCardRow[]): void {
    const roomSel = viewCards.querySelector("#pp-cf-room") as HTMLSelectElement | null;
    const bingoSel = viewCards.querySelector("#pp-cf-bingo") as HTMLSelectElement | null;
    const roundSel = viewCards.querySelector("#pp-cf-round") as HTMLSelectElement | null;
    if (!roomSel || !bingoSel || !roundSel) return;
    const room = roomSel.value.trim();
    const filtered = room
      ? cards.filter((c) => (c.round.roomSlug ?? "") === room)
      : cards;
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

  function repopulateTxBingoRound(transactions: Array<Record<string, unknown>>): void {
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

  async function reloadMyCards(): Promise<void> {
    try {
      const room = (viewCards.querySelector("#pp-cf-room") as HTMLSelectElement)?.value.trim() ?? "";
      const bingoId = (viewCards.querySelector("#pp-cf-bingo") as HTMLSelectElement)?.value.trim() ?? "";
      const bingoRoundId = (viewCards.querySelector("#pp-cf-round") as HTMLSelectElement)?.value.trim() ?? "";
      const from = datetimeLocalToIso((viewCards.querySelector("#pp-cf-from") as HTMLInputElement)?.value);
      const to = datetimeLocalToIso((viewCards.querySelector("#pp-cf-to") as HTMLInputElement)?.value);
      const q = qs({
        limit: "200",
        roomSlug: room || undefined,
        bingoId: bingoId || undefined,
        bingoRoundId: bingoRoundId || undefined,
        from,
        to,
      });
      const mc = (await apiJson(`/player/my-cards${q}`)) as { cards: MyCardRow[] };
      latestCards = mc.cards;
      repopulateCardsBingoRound(latestCards);
      const slugs = uniqueRoomSlugsFromCards(latestCards);
      await seedLiveSnapshots(slugs);
      syncLiveConnections(slugs);
      paintMyCardsHost();
    } catch (err) {
      if (isSessionHandledError(err)) return;
      if (msg) msg.textContent = friendlyError(err);
    }
  }

  async function reloadTx(): Promise<void> {
    try {
      const room = (viewTx.querySelector("#pp-tf-room") as HTMLSelectElement)?.value.trim() ?? "";
      const bingoId = (viewTx.querySelector("#pp-tf-bingo") as HTMLSelectElement)?.value.trim() ?? "";
      const bingoRoundId = (viewTx.querySelector("#pp-tf-round") as HTMLSelectElement)?.value.trim() ?? "";
      const type = (viewTx.querySelector("#pp-tf-type") as HTMLSelectElement)?.value.trim() ?? "";
      const from = datetimeLocalToIso((viewTx.querySelector("#pp-tf-from") as HTMLInputElement)?.value);
      const to = datetimeLocalToIso((viewTx.querySelector("#pp-tf-to") as HTMLInputElement)?.value);
      const q = qs({
        limit: "200",
        roomSlug: room || undefined,
        bingoId: bingoId || undefined,
        bingoRoundId: bingoRoundId || undefined,
        type: type || undefined,
        from,
        to,
      });
      const tx2 = (await apiJson(`/player/wallet/transactions${q}`)) as { transactions: unknown[] };
      const txHost = viewTx.querySelector("#pp-tx");
      if (txHost) txHost.innerHTML = renderTxList(tx2.transactions as Array<Record<string, unknown>>, currency);
    } catch (err) {
      if (isSessionHandledError(err)) return;
      if (msg) msg.textContent = friendlyError(err);
    }
  }

  repopulateCardsBingoRound(latestCards);
  repopulateTxBingoRound(txMasterList);

  viewCards.querySelector("#pp-cf-room")?.addEventListener("change", () => {
    repopulateCardsBingoRound(latestCards);
  });
  viewCards.querySelector("#pp-cf-bingo")?.addEventListener("change", () => {
    repopulateCardsBingoRound(latestCards);
  });
  viewCards.querySelector("#pp-cf-apply")?.addEventListener("click", () => {
    void reloadMyCards();
  });
  viewCards.querySelector("#pp-cf-clear")?.addEventListener("click", () => {
    const room = viewCards.querySelector("#pp-cf-room") as HTMLSelectElement | null;
    const bingo = viewCards.querySelector("#pp-cf-bingo") as HTMLSelectElement | null;
    const round = viewCards.querySelector("#pp-cf-round") as HTMLSelectElement | null;
    const from = viewCards.querySelector("#pp-cf-from") as HTMLInputElement | null;
    const to = viewCards.querySelector("#pp-cf-to") as HTMLInputElement | null;
    if (room) room.value = "";
    if (bingo) bingo.innerHTML = `<option value="">Todos</option>`;
    if (round) round.innerHTML = `<option value="">Todas</option>`;
    if (from) from.value = "";
    if (to) to.value = "";
    void reloadMyCards();
  });

  viewTx.querySelector("#pp-tf-room")?.addEventListener("change", () => {
    repopulateTxBingoRound(txMasterList);
  });
  viewTx.querySelector("#pp-tf-bingo")?.addEventListener("change", () => {
    repopulateTxBingoRound(txMasterList);
  });
  viewTx.querySelector("#pp-tf-apply")?.addEventListener("click", () => {
    void reloadTx();
  });
  viewTx.querySelector("#pp-tf-clear")?.addEventListener("click", () => {
    const room = viewTx.querySelector("#pp-tf-room") as HTMLSelectElement | null;
    const bingo = viewTx.querySelector("#pp-tf-bingo") as HTMLSelectElement | null;
    const round = viewTx.querySelector("#pp-tf-round") as HTMLSelectElement | null;
    const type = viewTx.querySelector("#pp-tf-type") as HTMLSelectElement | null;
    const from = viewTx.querySelector("#pp-tf-from") as HTMLInputElement | null;
    const to = viewTx.querySelector("#pp-tf-to") as HTMLInputElement | null;
    if (room) room.value = "";
    if (type) type.value = "";
    if (from) from.value = "";
    if (to) to.value = "";
    if (bingo) bingo.innerHTML = `<option value="">Todos</option>`;
    if (round) round.innerHTML = `<option value="">Todas</option>`;
    void (async () => {
      try {
        const txU = (await apiJson(`/player/wallet/transactions${qs({ limit: "200" })}`)) as {
          transactions: unknown[];
        };
        txMasterList = [...(txU.transactions as Array<Record<string, unknown>>)];
        repopulateTxBingoRound(txMasterList);
        const txHost = viewTx.querySelector("#pp-tx");
        if (txHost) txHost.innerHTML = renderTxList(txMasterList, currency);
      } catch (err) {
        if (isSessionHandledError(err)) return;
        /* ignore */
      }
    })();
  });

  panel.innerHTML = "";
  panel.appendChild(viewBuy);
  panel.appendChild(viewCards);
  panel.appendChild(viewTx);

  syncLiveConnections(initialSlugs);

  const initialTab = readSavedTab();
  setActiveTab(root, initialTab);

  root.querySelectorAll(".pp-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = (btn as HTMLButtonElement).getAttribute("data-view") as PpTab | null;
      if (v === "buy" || v === "cards" || v === "tx") setActiveTab(root, v);
    });
  });

  async function refreshAfterPurchase(): Promise<void> {
    if (msg) msg.textContent = "";
    try {
      const me2 = (await apiJson("/player/me")) as {
        player: { wallet: { balanceCents: number; currencyCode: string } | null };
      };
      const w2 = me2.player.wallet;
      const cents = w2?.balanceCents ?? 0;
      const cur = w2?.currencyCode ?? "ARS";
      if (balanceEl) balanceEl.textContent = formatMoney(cents, cur);

      const txU = (await apiJson(`/player/wallet/transactions${qs({ limit: "200" })}`)) as {
        transactions: unknown[];
      };
      txMasterList = [...(txU.transactions as Array<Record<string, unknown>>)];
      const txHost = viewTx.querySelector("#pp-tx");
      if (txHost) txHost.innerHTML = renderTxList(txMasterList, cur);
      repopulateTxBingoRound(txMasterList);

      const mc = (await apiJson("/player/my-cards")) as { cards: MyCardRow[] };
      latestCards = mc.cards;
      repopulateCardsBingoRound(latestCards);
      const slugs = uniqueRoomSlugsFromCards(latestCards);
      await seedLiveSnapshots(slugs);
      syncLiveConnections(slugs);
      paintMyCardsHost();
    } catch (err) {
      if (isSessionHandledError(err)) return;
      render();
    }
  }

  async function onBuy(roundId: string, qty: number): Promise<void> {
    if (msg) msg.textContent = "";
    try {
      await apiJson(`/player/bingo-rounds/${encodeURIComponent(roundId)}/carton-purchase`, {
        method: "POST",
        body: JSON.stringify({ quantity: qty }),
      });
      await refreshAfterPurchase();
    } catch (err) {
      if (isSessionHandledError(err)) return;
      if (msg) msg.textContent = friendlyError(err);
    }
  }

  const select = fieldRoom.querySelector("#pp-room") as HTMLSelectElement | null;

  async function showRoundsForSlug(slug: string): Promise<void> {
    roundsHost.innerHTML = `<p class="pp-loading">Cargando partidas…</p>`;
    if (!slug) {
      roundsHost.innerHTML = `<p class="pp-muted">Seleccioná una sala para ver las partidas.</p>`;
      return;
    }
    try {
      const upcoming = await loadUpcomingForRoom(slug);
      roundsHost.innerHTML = "";
      roundsHost.appendChild(renderRoundsTable(upcoming, currency, onBuy));
    } catch (e) {
      roundsHost.innerHTML = "";
      roundsHost.appendChild(el(`<p class="pp-msg">${escapeHtml(friendlyError(e))}</p>`));
    }
  }

  select?.addEventListener("change", () => {
    void showRoundsForSlug(select.value.trim());
  });

  if (select?.value) void showRoundsForSlug(select.value);
  else roundsHost.innerHTML = `<p class="pp-muted">Seleccioná una sala para ver las partidas.</p>`;
}

function mountGuestAuth(root: HTMLElement): void {
  let mode: "login" | "register" = "login";

  const msg = root.querySelector("#msg") as HTMLElement | null;
  const host = root.querySelector("#auth-forms");
  if (!host) return;

  function paint(): void {
    host.innerHTML = "";
    if (mode === "login") {
      host.appendChild(
        el(`
        <section class="pp-card-block pp-auth-card">
          <h2 class="pp-section-title">Iniciar sesión</h2>
          <p class="pp-hint">Ingresá con tu email y contraseña.</p>
          <form id="form-login" method="post">
            <p class="pp-field"><label for="login-email">Email</label><input id="login-email" name="email" type="email" autocomplete="email" required class="pp-input" /></p>
            <p class="pp-field"><label for="login-password">Contraseña</label><input id="login-password" name="password" type="password" autocomplete="current-password" required class="pp-input" /></p>
            <p class="pp-auth-actions">
              <button type="submit" class="pp-btn">Ingresar</button>
            </p>
          </form>
          <p class="pp-auth-footer">
            ¿No tenés cuenta?
            <button type="button" class="pp-btn-link" id="btn-show-register">Registrate</button>
          </p>
        </section>`),
      );
      host.querySelector("#btn-show-register")?.addEventListener("click", () => {
        mode = "register";
        if (msg) msg.textContent = "";
        paint();
      });
      host.querySelector("#form-login")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (msg) msg.textContent = "";
        const fd = new FormData(e.target as HTMLFormElement);
        try {
          const data = (await apiJson("/player/login", {
            method: "POST",
            body: JSON.stringify({
              email: String(fd.get("email") ?? ""),
              password: String(fd.get("password") ?? ""),
            }),
          })) as { accessToken?: string };
          if (data.accessToken) setToken(data.accessToken);
          render();
        } catch (err) {
          if (msg) msg.textContent = friendlyError(err);
        }
      });
    } else {
      host.appendChild(
        el(`
        <section class="pp-card-block pp-auth-card">
          <h2 class="pp-section-title">Crear cuenta</h2>
          <p class="pp-hint">Completá los datos para registrarte.</p>
          <form id="form-reg" method="post">
            <p class="pp-field"><label for="reg-email">Email</label><input id="reg-email" name="email" type="email" autocomplete="email" required class="pp-input" /></p>
            <p class="pp-field"><label for="reg-username">Usuario</label><input id="reg-username" name="username" required minlength="3" autocomplete="username" class="pp-input" /></p>
            <p class="pp-field"><label for="reg-password">Contraseña</label><input id="reg-password" name="password" type="password" minlength="8" autocomplete="new-password" required class="pp-input" /></p>
            <p class="pp-auth-actions">
              <button type="submit" class="pp-btn">Crear cuenta</button>
            </p>
          </form>
          <p class="pp-auth-footer">
            <button type="button" class="pp-btn-link" id="btn-show-login">Volver al inicio de sesión</button>
          </p>
        </section>`),
      );
      host.querySelector("#btn-show-login")?.addEventListener("click", () => {
        mode = "login";
        if (msg) msg.textContent = "";
        paint();
      });
      host.querySelector("#form-reg")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (msg) msg.textContent = "";
        const fd = new FormData(e.target as HTMLFormElement);
        try {
          const data = (await apiJson("/player/register", {
            method: "POST",
            body: JSON.stringify({
              email: String(fd.get("email") ?? ""),
              username: String(fd.get("username") ?? ""),
              password: String(fd.get("password") ?? ""),
            }),
          })) as { accessToken?: string };
          if (data.accessToken) setToken(data.accessToken);
          render();
        } catch (err) {
          if (msg) msg.textContent = friendlyError(err);
        }
      });
    }
  }

  paint();
}

function render(): void {
  const root = document.getElementById("app");
  if (!root) return;

  const loggedIn = !!getToken();

  if (!loggedIn) {
    disconnectLiveStreams?.();
    disconnectLiveStreams = null;
    root.innerHTML = "";
    root.appendChild(
      el(`
    <div class="pp-root pp-root--guest">
      <h1 class="pp-title">Portal jugador</h1>
      <p class="pp-meta">API: <code>${escapeHtml(API_BASE)}</code></p>
      <div id="auth-forms"></div>
      <div id="msg" class="pp-msg"></div>
    </div>`),
    );
    mountGuestAuth(root);
    const msgGuest = root.querySelector("#msg") as HTMLElement | null;
    const flash = consumeAuthExpiredFlash();
    if (flash && msgGuest) msgGuest.textContent = flash;
    return;
  }

  renderLoggedShell(root);
  const panel = root.querySelector("#panel-logged");
  const msg = root.querySelector("#msg") as HTMLElement | null;
  if (!panel) return;

  void (async () => {
    try {
      await mountDashboard(root, msg);
    } catch (err) {
      if (isSessionHandledError(err)) return;
      if (msg) msg.textContent = friendlyError(err);
      setToken(null);
      try {
        sessionStorage.removeItem(PP_TAB_KEY);
      } catch {
        /* ignore */
      }
      render();
    }
  })();
}

render();
