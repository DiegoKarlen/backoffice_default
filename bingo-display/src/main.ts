import "./style.css";
import {
  fetchLiveSnapshot,
  fetchPublicRooms,
  fetchUpcoming,
  liveEventsUrl,
  type LiveSnapshot,
  type OccurrencePrize,
} from "./api.js";
import { setRoomSlug } from "./config.js";

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function formatWhen(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

function formatLongDate(): string {
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function ballLabel(bingoType: string): string {
  const n = bingoType.replace(/\D/g, "");
  return n || "?";
}

const FIGURE_LABEL: Record<string, string> = {
  LINE: "Premio línea",
  PERIMETER: "Premio perímetro",
  FULL_HOUSE: "Premio cartón lleno",
};

function formatMoney(amount: string): string {
  const normalized = amount.replace(",", ".").trim();
  const n = Number(normalized);
  if (!Number.isFinite(n)) return amount;
  return new Intl.NumberFormat("es", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function renderPrizesHtml(prizes: OccurrencePrize[]): string {
  if (!prizes.length) {
    return `<p class="sd-muted sd-prizes-empty">Este bingo no tiene premios configurados.</p>`;
  }
  const ordered = [...prizes].sort((a, b) => a.figure.localeCompare(b.figure));
  return ordered
    .map(
      (p) => `
    <div class="sd-stat">
      <span class="sd-stat__label sd-stat__label--gold">${esc(FIGURE_LABEL[p.figure] ?? p.figure)}</span>
      <span class="sd-stat__val sd-stat__val--gold mono">$ ${esc(formatMoney(p.amount))}</span>
    </div>`,
    )
    .join("");
}

let prevLastBall: number | null = null;

function applySnapshot(s: LiveSnapshot): void {
  const root = document.querySelector<HTMLDivElement>("#bd-root");
  const cur = s.current;
  const live = s.phase === "drawing";

  if (root) {
    root.classList.toggle("sd--idle", !live);
    root.classList.toggle("sd--live", live);
  }

  const brandBan = document.querySelector<HTMLParagraphElement>("#bd-room-banner");
  if (brandBan) {
    brandBan.textContent =
      s.roomTitle && s.roomSlug ? `${s.roomTitle} · /r/${s.roomSlug}` : "";
  }

  const liveDot = document.querySelector<HTMLSpanElement>("#bd-live-dot");
  const phaseLive = document.querySelector<HTMLDivElement>("#bd-phase-live");
  if (liveDot && phaseLive) {
    liveDot.dataset.on = live ? "1" : "0";
    phaseLive.dataset.active = live ? "1" : "0";
  }

  const footTime = document.querySelector<HTMLSpanElement>("#bd-server-time");
  if (footTime) footTime.textContent = formatWhen(s.serverTime);

  const roomLine = document.querySelector<HTMLParagraphElement>("#bd-room-line");
  if (roomLine) {
    roomLine.textContent = cur ? `ROOM: ${cur.name}` : "ROOM: —";
  }

  const matchId = document.querySelector<HTMLSpanElement>("#bd-match-id");
  if (matchId) {
    matchId.textContent =
      cur && typeof cur.roundSequence === "number" ? `#${cur.roundSequence}` : "#—";
  }

  const footerType = document.querySelector<HTMLSpanElement>("#bd-footer-type");
  if (footerType) footerType.textContent = cur ? `${ballLabel(cur.bingoType)} bolas` : "—";

  const footerState = document.querySelector<HTMLSpanElement>("#bd-footer-state");
  if (footerState) {
    footerState.textContent = live ? "En sorteo" : s.nextScheduledAt ? "Esperando inicio" : "Sin agenda";
  }

  const nextBanner = document.querySelector<HTMLParagraphElement>("#bd-next-banner");
  if (nextBanner) {
    if (!live && s.nextScheduledAt && s.nextName) {
      nextBanner.innerHTML = `PRÓXIMO SORTEO · <span class="mono">${esc(s.nextName)}</span> · ${esc(formatWhen(s.nextScheduledAt))}`;
      nextBanner.hidden = false;
    } else if (!live) {
      nextBanner.textContent = "Sin partidas programadas en el horizonte.";
      nextBanner.hidden = false;
    } else {
      nextBanner.hidden = true;
    }
  }

  const idleRoom = document.querySelector<HTMLParagraphElement>("#bd-idle-room");
  const idleWhen = document.querySelector<HTMLParagraphElement>("#bd-idle-when");
  if (idleRoom && idleWhen) {
    if (!live && s.nextScheduledAt && s.nextName) {
      idleRoom.textContent = s.nextName;
      idleWhen.textContent = formatWhen(s.nextScheduledAt);
    } else if (!live) {
      idleRoom.textContent = "Sin agenda próxima";
      idleWhen.textContent = "";
    } else {
      idleRoom.textContent = "";
      idleWhen.textContent = "";
    }
  }

  const prizesEl = document.querySelector<HTMLDivElement>("#bd-prizes");
  if (prizesEl) {
    prizesEl.innerHTML = cur ? renderPrizesHtml(cur.prizes ?? []) : "";
  }

  const remainSidebar = document.querySelector<HTMLSpanElement>("#bd-stat-balls");
  const remainPill = document.querySelector<HTMLSpanElement>("#bd-faltan-num");
  const remainCount =
    cur && live ? cur.remainingBallNumbers?.length ?? cur.remainingInQueue : null;
  if (remainSidebar) remainSidebar.textContent = remainCount != null ? String(remainCount) : "—";
  if (remainPill) remainPill.textContent = remainCount != null ? String(remainCount) : "—";

  const tumbler = document.querySelector<HTMLDivElement>("#bd-tumbler");
  if (tumbler) tumbler.dataset.mixing = live ? "1" : "0";

  const currentNum = document.querySelector<HTMLDivElement>("#bd-current-num");
  const beam = document.querySelector<HTMLDivElement>("#bd-beam");
  const flyingBall = document.querySelector<HTMLDivElement>("#bd-flying-ball");

  if (currentNum) {
    const v = cur?.lastBall;
    const numStr = v != null ? String(v) : "—";
    const changed = v != null && v !== prevLastBall;
    prevLastBall = v ?? null;

    if (changed && flyingBall && beam && numStr !== "—") {
      flyingBall.textContent = numStr;
      flyingBall.dataset.show = "1";
      beam.dataset.flash = "1";
      window.setTimeout(() => {
        flyingBall.dataset.show = "0";
        beam.dataset.flash = "0";
      }, 900);
    }

    currentNum.textContent = numStr;
    if (changed) {
      currentNum.classList.remove("bd-current-num--pop");
      void currentNum.offsetWidth;
      currentNum.classList.add("bd-current-num--pop");
    }
  }

  const bar = document.querySelector<HTMLDivElement>("#bd-progress-bar");
  if (bar && cur) bar.style.width = `${Math.min(100, Math.round(cur.progress * 100))}%`;
  else if (bar) bar.style.width = "0%";

  const strip = document.querySelector<HTMLDivElement>("#bd-history");
  if (strip && cur) {
    const tail = cur.drawn.slice(-20);
    strip.innerHTML = tail
      .map((n, i) => {
        const c = i % 5;
        return `<span class="bd-hist-chip mono bd-hist-chip--c${c}" data-new="${n === cur.lastBall ? "1" : "0"}">${esc(String(n))}</span>`;
      })
      .join("");
  } else if (strip) strip.innerHTML = "";

  const hint = document.querySelector<HTMLParagraphElement>("#bd-live-hint");
  if (hint) {
    hint.textContent = cur
      ? `${cur.drawn.length} / ${cur.totalBalls} · cada ${(s.drawIntervalMs / 1000).toFixed(1)} s`
      : "";
  }
}

function tickClocks(s: LiveSnapshot | null): void {
  const clockEl = document.querySelector<HTMLSpanElement>("#bd-clock");
  const cdEl = document.querySelector<HTMLSpanElement>("#bd-next-cd");
  const idleCdEl = document.querySelector<HTMLSpanElement>("#bd-idle-cd");

  let cdText = "—";
  if (clockEl) {
    clockEl.textContent = new Date().toLocaleTimeString("es", { hour12: false });
  }
  if (s?.phase === "idle" && s.nextScheduledAt) {
    const t = new Date(s.nextScheduledAt).getTime() - Date.now();
    if (t <= 0) cdText = "00:00";
    else {
      const m = Math.floor(t / 60000);
      const sec = Math.floor((t % 60000) / 1000);
      cdText = `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }
  } else if (s?.phase === "drawing") {
    cdText = "—";
  }

  if (cdEl) cdEl.textContent = cdText;
  if (idleCdEl) idleCdEl.textContent = cdText;

  const footDate = document.querySelector<HTMLSpanElement>("#bd-footer-date");
  if (footDate) footDate.textContent = formatLongDate();
}

let lastSnap: LiveSnapshot | null = null;

const DISPLAY_MARKUP = `
  <div class="sd sd--idle" id="bd-root">
    <header class="sd-top glass">
      <div class="sd-top__brand">
        <div class="sd-brand">
          <span class="sd-brand__crown" aria-hidden="true">♛</span>
          <span class="sd-brand__text">BINGO</span>
          <p class="sd-brand__banner mono" id="bd-room-banner"></p>
        </div>
      </div>
      <div class="sd-top__rail">
        <div class="sd-live" id="bd-phase-live" data-active="0">
          <span class="sd-live__dot" id="bd-live-dot" data-on="0"></span>
          <span class="sd-live__txt">EN VIVO</span>
        </div>
        <div class="sd-pill sd-clock mono" id="bd-clock">00:00:00</div>
        <p class="sd-pill sd-room mono sd-show-live" id="bd-room-line">ROOM: —</p>
        <p class="sd-pill sd-match mono sd-show-live">PARTIDA <span id="bd-match-id">#—</span></p>
        <div class="sd-countdown sd-show-live">
          <span class="sd-countdown__lbl">PRÓXIMO SORTEO EN</span>
          <span class="sd-countdown__val mono" id="bd-next-cd">—</span>
        </div>
      </div>
    </header>

    <p class="sd-next-banner" id="bd-next-banner" hidden></p>

    <main class="sd-grid">
      <aside class="sd-side sd-side--left glass sd-show-live" aria-label="Premios y sorteo">
        <div class="sd-side__head">
          <span class="sd-side__kicker">Premios</span>
        </div>
        <div id="bd-prizes" class="sd-prizes"></div>
        <div class="sd-stat sd-stat--accent">
          <span class="sd-stat__label">Bolas restantes</span>
          <span class="sd-stat__val mono" id="bd-stat-balls">—</span>
        </div>
      </aside>

      <section class="sd-idle-hero glass sd-show-idle" aria-label="Próximo sorteo">
        <p class="sd-idle-hero__kicker">Próximo sorteo</p>
        <p class="sd-idle-hero__room mono" id="bd-idle-room">—</p>
        <p class="sd-idle-hero__when mono" id="bd-idle-when"></p>
        <div class="sd-idle-hero__cd-wrap">
          <span class="sd-idle-hero__cd mono" id="bd-idle-cd">—</span>
        </div>
        <p class="sd-idle-hero__sub">Tiempo restante para el inicio</p>
      </section>

      <section class="sd-stage glass sd-show-live" aria-label="Bolillero y bola actual">
        <div class="sd-stage__hero">
          <div class="sd-tumbler-wrap">
            <div class="sd-tumbler" id="bd-tumbler" data-mixing="0">
              <div class="sd-tumbler__ring sd-tumbler__ring--a"></div>
              <div class="sd-tumbler__ring sd-tumbler__ring--b"></div>
              <div class="sd-tumbler__globe">
                <div class="sd-tumbler__balls" aria-hidden="true"></div>
              </div>
              <div class="sd-tumbler__base"></div>
            </div>
            <div class="sd-beam" id="bd-beam" data-flash="0"></div>
            <div class="sd-flying-ball mono" id="bd-flying-ball" data-show="0">00</div>
          </div>

          <div class="sd-current">
            <p class="sd-current__lbl">Bola actual</p>
            <div class="sd-current__num mono" id="bd-current-num">—</div>
            <div class="sd-faltan">
              <span class="sd-faltan__pill">FALTAN <span id="bd-faltan-num">—</span> BOLAS</span>
            </div>
          </div>
        </div>

        <div class="sd-progress">
          <div class="sd-progress__meta">
            <span class="sd-progress__lbl">Avance del sorteo</span>
            <span id="bd-live-hint" class="sd-progress__hint mono"></span>
          </div>
          <div class="sd-progress__track">
            <div id="bd-progress-bar" class="sd-progress__fill"></div>
          </div>
        </div>

        <div class="sd-history-block">
          <p class="sd-history__title">Últimas bolas</p>
          <div id="bd-history" class="sd-history" aria-live="polite"></div>
        </div>
      </section>

      <aside class="sd-side sd-side--right glass">
        <div class="sd-side__head">
          <h3 class="sd-side__title">Próximos sorteos</h3>
        </div>
        <div id="bd-upcoming-body" class="sd-upcoming">
          <p class="sd-muted">Cargando…</p>
        </div>
        <button type="button" class="sd-more" disabled title="Próximamente">Ver programación completa</button>
      </aside>
    </main>

    <footer class="sd-foot glass">
      <span id="bd-footer-date"></span>
      <span class="sd-foot__sep sd-show-live">·</span>
      <span class="sd-show-live">Tipo de bingo: <strong id="bd-footer-type">—</strong></span>
      <span class="sd-foot__sep sd-show-live">·</span>
      <span class="sd-show-live">Estado: <strong class="sd-foot__state" id="bd-footer-state">—</strong></span>
      <span class="sd-foot__sep">·</span>
      <span class="mono">Sync <span id="bd-server-time">—</span></span>
    </footer>
  </div>
`;

function connectEventSource(): void {
  const url = liveEventsUrl();
  const es = new EventSource(url);

  es.addEventListener("state", (ev) => {
    try {
      const s = JSON.parse((ev as MessageEvent).data) as LiveSnapshot;
      lastSnap = s;
      applySnapshot(s);
      tickClocks(s);
    } catch {
      /* ignore */
    }
  });

  es.addEventListener("ball", () => {
    void fetchLiveSnapshot()
      .then((s) => {
        lastSnap = s;
        applySnapshot(s);
        tickClocks(s);
      })
      .catch(() => {});
  });

  es.addEventListener("round_start", () => {
    prevLastBall = null;
    void fetchLiveSnapshot()
      .then((s) => {
        lastSnap = s;
        applySnapshot(s);
        tickClocks(s);
      })
      .catch(() => {});
  });

  es.addEventListener("round_end", () => {
    void fetchLiveSnapshot()
      .then((s) => {
        lastSnap = s;
        applySnapshot(s);
        tickClocks(s);
      })
      .catch(() => {});
  });

  es.addEventListener("idle", () => {
    void fetchLiveSnapshot()
      .then((s) => {
        lastSnap = s;
        applySnapshot(s);
        tickClocks(s);
      })
      .catch(() => {});
  });

  es.onerror = () => {
    es.close();
    setTimeout(connectEventSource, 2500);
  };
}

function mountDisplay(host: HTMLElement): void {
  host.innerHTML = DISPLAY_MARKUP;

  const upcomingBody = host.querySelector<HTMLElement>("#bd-upcoming-body")!;
  if (!upcomingBody) throw new Error("#bd-upcoming-body missing");

  async function renderUpcoming() {
    try {
      const data = await fetchUpcoming({ limit: 12, horizonDays: 14 });
      const rows = data.upcoming;
      if (!rows.length) {
        upcomingBody.innerHTML = `<p class="sd-muted">Sin fechas en el horizonte.</p>`;
        return;
      }

      upcomingBody.innerHTML = `
      <ul class="sd-up-list">
        ${rows
          .map(
            (r, i) => `
          <li class="sd-up-item">
            <span class="sd-up-item__n mono">${i + 1}</span>
            <div class="sd-up-item__body">
              <span class="sd-up-item__room">${esc(r.name)}</span>
              <span class="sd-up-item__time mono">${esc(formatWhen(r.startsAt))}</span>
            </div>
            <span class="sd-up-item__chip mono">${esc(ballLabel(r.bingoType))}</span>
          </li>
        `,
          )
          .join("")}
      </ul>
    `;
    } catch (e) {
      upcomingBody.innerHTML = `<p class="sd-err">${esc(e instanceof Error ? e.message : "Error")}</p>`;
    }
  }

  void fetchLiveSnapshot()
    .then((s) => {
      lastSnap = s;
      applySnapshot(s);
      tickClocks(s);
    })
    .catch(() => {
      tickClocks(null);
    });

  setInterval(() => tickClocks(lastSnap), 1000);

  void renderUpcoming();
  connectEventSource();
}

async function renderRoomPicker(host: HTMLElement): Promise<void> {
  host.innerHTML = `
    <div class="sd-picker glass" style="max-width:560px;margin:48px auto;padding:32px;border-radius:16px;">
      <h1 style="margin:0 0 8px;font-size:1.5rem;">Bingo — elegir sala</h1>
      <p class="sd-muted" style="margin:0 0 24px;">Salas activas con pantalla pública.</p>
      <ul id="bd-room-links" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;"></ul>
      <p id="bd-picker-err" class="sd-err" style="display:none;margin-top:16px;"></p>
    </div>`;
  const ul = host.querySelector("#bd-room-links");
  const errEl = host.querySelector<HTMLParagraphElement>("#bd-picker-err");
  try {
    const rooms = await fetchPublicRooms();
    if (!rooms.length) {
      if (ul) ul.innerHTML = `<li class="sd-muted">No hay salas activas.</li>`;
      return;
    }
    if (ul) {
      ul.innerHTML = rooms
        .map(
          (r) =>
            `<li><a class="sd-picker-link" href="/r/${encodeURIComponent(r.slug)}" style="display:block;padding:12px 16px;border-radius:10px;text-decoration:none;color:inherit;background:rgba(255,255,255,0.06);">${esc(r.name)} <span class="mono sd-muted" style="font-size:0.85rem;">/r/${esc(r.slug)}</span></a></li>`,
        )
        .join("");
    }
  } catch (e) {
    if (errEl) {
      errEl.style.display = "block";
      errEl.textContent = e instanceof Error ? e.message : "Error";
    }
  }
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

const pathNorm = (location.pathname.replace(/\/$/, "") || "/") as string;
const roomMatch = pathNorm.match(/^\/r\/([^/]+)$/);

if (roomMatch) {
  setRoomSlug(decodeURIComponent(roomMatch[1]));
  mountDisplay(app);
} else if (pathNorm === "/") {
  setRoomSlug(null);
  void renderRoomPicker(app);
} else {
  app.innerHTML = `<div class="sd-picker glass" style="max-width:480px;margin:48px auto;padding:24px;"><p>Ruta no válida. <a href="/">Inicio</a></p></div>`;
}
