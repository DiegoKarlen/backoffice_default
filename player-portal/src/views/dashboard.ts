import { escapeHtml, formatMoneyFromCents } from "@shared/index.ts";
import { API_BASE, apiJson, publicJson } from "../lib/api.js";
import { loadRooms, loadUpcomingForRoom } from "../lib/bingo-public.js";
import { connectPortalRoomLive } from "../lib/live-sse.js";
import { el } from "../lib/dom.js";
import { friendlyError } from "../lib/format.js";
import { disconnectAllLiveStreams, registerLiveDisconnect } from "../lib/live-streams.js";
import { datetimeLocalToIso, qs } from "../lib/query.js";
import { isSessionHandledError } from "../lib/session.js";
import type { LiveSnap, MyCardRow, PpTab } from "../types.js";
import { renderRoundsTable } from "./buy.js";
import { renderMyCardsHtml, repopulateCardsBingoRound, uniqueRoomSlugsFromCards } from "./cards.js";
import { readSavedTab, setActiveTab } from "./shell.js";
import { renderTxList, repopulateTxBingoRound } from "./transactions.js";

const formatMoney = formatMoneyFromCents;

export async function mountDashboard(root: HTMLElement, msg: HTMLElement | null, onRerender: () => void): Promise<void> {
  disconnectAllLiveStreams();

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

  async function refreshLiveSnapshot(slug: string): Promise<void> {
    try {
      const data = (await publicJson(
        `/public/bingos/live/state?roomSlug=${encodeURIComponent(slug)}`,
      )) as LiveSnap;
      liveSnapshots.set(slug, data);
      paintMyCardsHost();
    } catch {
      /* ignore */
    }
  }

  async function seedLiveSnapshots(slugs: string[]): Promise<void> {
    await Promise.all(slugs.map((slug) => refreshLiveSnapshot(slug)));
  }

  function syncLiveConnections(slugs: string[]): void {
    for (const slug of slugs) {
      if (liveSources.has(slug)) continue;
      const disconnect = connectPortalRoomLive(API_BASE, slug, {
        onSnapshot: (data) => {
          liveSnapshots.set(slug, data as LiveSnap);
          paintMyCardsHost();
        },
        onActivity: () => {
          void refreshLiveSnapshot(slug);
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

  registerLiveDisconnect(() => {
    for (const disconnect of liveSources.values()) disconnect();
    liveSources.clear();
    liveSnapshots.clear();
  });

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
      repopulateCardsBingoRound(viewCards, latestCards);
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

  repopulateCardsBingoRound(viewCards, latestCards);
  repopulateTxBingoRound(viewTx, txMasterList);

  viewCards.querySelector("#pp-cf-room")?.addEventListener("change", () => {
    repopulateCardsBingoRound(viewCards, latestCards);
  });
  viewCards.querySelector("#pp-cf-bingo")?.addEventListener("change", () => {
    repopulateCardsBingoRound(viewCards, latestCards);
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
    repopulateTxBingoRound(viewTx, txMasterList);
  });
  viewTx.querySelector("#pp-tf-bingo")?.addEventListener("change", () => {
    repopulateTxBingoRound(viewTx, txMasterList);
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
        repopulateTxBingoRound(viewTx, txMasterList);
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
      repopulateTxBingoRound(viewTx, txMasterList);

      const mc = (await apiJson("/player/my-cards")) as { cards: MyCardRow[] };
      latestCards = mc.cards;
      repopulateCardsBingoRound(viewCards, latestCards);
      const slugs = uniqueRoomSlugsFromCards(latestCards);
      await seedLiveSnapshots(slugs);
      syncLiveConnections(slugs);
      paintMyCardsHost();
    } catch (err) {
      if (isSessionHandledError(err)) return;
      onRerender();
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
