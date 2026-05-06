import "./style.css";
import {
  fetchLiveSnapshot,
  fetchPublicRooms,
  fetchUpcoming,
  liveEventsUrl,
  type LivePhase,
  type LiveSnapshot,
  type OccurrencePrize,
} from "./api.js";
import { setRoomSlug } from "./config.js";
import {
  BALL_DROP_DURATION_MS,
  BALL_EASE,
  BALL_FADE_IN_PORTION,
  BALL_PATH,
  ballNumberedUrl,
  BINGO_CLOSE_AFTER_LANDING_MS,
  BINGO_CLOSE_CURTAIN_MS,
  BINGO_CLOSE_REDUCED_MOTION_FACTOR,
  BALL_LANDING_HERO_TOTAL_MS,
  CURRENT_BALL_CENTER,
  ROUND_COUNTDOWN_STEP_MS,
  ROUND_COUNTDOWN_VALUES,
} from "./broadcast-manifest.js";

type Pt = { readonly x: number; readonly y: number };

function cubicNormComponent(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Reloj lineal t∈[0,1] → parámetro de easing CSS cubic-bezier (progreso a lo largo de la caída). */
function cssBezierProgress(t: number, x1: number, y1: number, x2: number, y2: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const x = cubicNormComponent(mid, 0, x1, x2, 1);
    if (x < t) lo = mid;
    else hi = mid;
  }
  const s = (lo + hi) / 2;
  return cubicNormComponent(s, 0, y1, y2, 1);
}

function cubicBezierPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt {
  const o = 1 - u;
  const o2 = o * o;
  const o3 = o2 * o;
  const u2 = u * u;
  const u3 = u2 * u;
  return {
    x: o3 * p0.x + 3 * o2 * u * p1.x + 3 * o * u2 * p2.x + u3 * p3.x,
    y: o3 * p0.y + 3 * o2 * u * p1.y + 3 * o * u2 * p2.y + u3 * p3.y,
  };
}

/** Rebote al impactar en el tubo: scale(1) → scale(1.15) → scale(1) */
const BALL_IMPACT_MS = 320;
/** Flash dorado breve (box-shadow en la bola) */
const BALL_IMPACT_FLASH_MS = 120;

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Escala de impacto: subida a 1.15 en ~42% del tiempo, vuelta a 1 después. */
function impactScaleFromT(t: number): number {
  const split = 0.42;
  if (t <= split) {
    const u = smoothstep01(t / split);
    return 1 + u * 0.15;
  }
  const u = smoothstep01((t - split) / (1 - split));
  return 1.15 - u * 0.15;
}

function triggerBolilleroImpactVibration(): void {
  const inner = document.querySelector<HTMLElement>(".bd-bolillero-inner");
  if (!inner) return;
  inner.classList.remove("bd-bolillero-inner--impact");
  void inner.offsetWidth;
  inner.classList.add("bd-bolillero-inner--impact");
  const done = (): void => {
    inner.classList.remove("bd-bolillero-inner--impact");
  };
  inner.addEventListener("animationend", done, { once: true });
  window.setTimeout(done, 450);
}

function runImpactAtChute(img: HTMLImageElement, p3: Pt, onDone: () => void): void {
  img.classList.add("bd-fly-ball--impact-flash");
  window.setTimeout(() => {
    img.classList.remove("bd-fly-ball--impact-flash");
  }, BALL_IMPACT_FLASH_MS);

  triggerBolilleroImpactVibration();

  const start = performance.now();

  function bounce(now: number): void {
    const t = Math.min(1, (now - start) / BALL_IMPACT_MS);
    const scale = impactScaleFromT(t);
    img.style.left = `${p3.x}px`;
    img.style.top = `${p3.y}px`;
    img.style.transform = `translate(-50%, -50%) rotate(0deg) scale(${scale})`;
    img.style.filter = "";
    if (t < 1) {
      requestAnimationFrame(bounce);
    } else {
      img.classList.remove("bd-fly-ball--impact-flash");
      img.style.transform = `translate(-50%, -50%) rotate(0deg) scale(1)`;
      onDone();
    }
  }

  requestAnimationFrame(bounce);
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/** Pulso de escala al bajar el contador de bolas restantes. */
function triggerFaltanCountPop(el: HTMLElement): void {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  el.classList.remove("bd-faltan-bolas__num--pop");
  void el.offsetWidth;
  el.classList.add("bd-faltan-bolas__num--pop");
  const done = (): void => {
    el.classList.remove("bd-faltan-bolas__num--pop");
  };
  el.addEventListener("animationend", done, { once: true });
}

const FALTAN_ROW_MARKUP =
  '<span class="bd-faltan-bolas__label">FALTAN</span><span class="bd-faltan-bolas__num mono" id="bd-faltan-count">—</span><span class="bd-faltan-bolas__label">BOLAS</span>';

function restoreFaltanThreePartRow(faltanEl: HTMLElement): HTMLElement {
  faltanEl.classList.remove("bd-faltan-line--ultima");
  faltanEl.innerHTML = FALTAN_ROW_MARKUP;
  const num = faltanEl.querySelector<HTMLElement>("#bd-faltan-count");
  if (!num) throw new Error("#bd-faltan-count missing after restore");
  return num;
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

function ballLabel(bingoType: string): string {
  const n = bingoType.replace(/\D/g, "");
  return n || "?";
}

/** Inicio de partida: fecha y hora legibles (próximos sorteos). */
function formatUpcomingStart(iso: string): string {
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
    return `<p class="bd-muted">Este bingo no tiene premios configurados.</p>`;
  }
  const ordered = [...prizes].sort((a, b) => a.figure.localeCompare(b.figure));
  return ordered
    .map(
      (p) => `
    <article class="bd-prize bd-card bd-card--prize">
      <span class="bd-prize__lbl">${esc(FIGURE_LABEL[p.figure] ?? p.figure)}</span>
      <span class="bd-prize__val mono">$ ${esc(formatMoney(p.amount))}</span>
    </article>`,
    )
    .join("");
}

let prevLastBall: number | null = null;
/** True while the broadcast ball trajectory animation is running */
let ballAnimRunning = false;

let lastSnap: LiveSnapshot | null = null;

/** Refresco del panel «Próximos sorteos» (se asigna en mount). */
let refreshUpcomingPanel: (() => void) | null = null;

/** Última fase aplicada al DOM (para detectar fin de sorteo sin parpadeo a espera). */
let lastAppliedPhase: LivePhase | null = null;

/** Fin estimado de la animación de aterrizaje en el disco (0 = sin landing activo). */
let heroLandingUntilMs = 0;

/** Tras idle→sorteo: no aplica `applySnapshotInner` hasta terminar 3-2-1 + bolillero (evita bola antes de tiempo). */
let roundOpeningHoldApply = false;

let bingoClosePipelineActive = false;
let bingoCloseRafId = 0;
const bingoCloseTimeouts: ReturnType<typeof setTimeout>[] = [];

/** Aborta el GET /live/state anterior para que una respuesta lenta no pise un snapshot más nuevo. */
let liveSnapshotAbort: AbortController | null = null;

function snapshotTimeMs(s: LiveSnapshot): number {
  const t = Date.parse(s.serverTime);
  return Number.isFinite(t) ? t : 0;
}

/** Descarta estados obsoletos (varios fetch en vuelo o SSE fuera de orden). */
function shouldApplyIncomingSnapshot(incoming: LiveSnapshot): boolean {
  if (!lastSnap) return true;
  return snapshotTimeMs(incoming) >= snapshotTimeMs(lastSnap);
}

/** GET consolidado: aborta peticiones previas y aplica solo si el snapshot no es más viejo que `lastSnap`. */
function fetchAndApplyLiveSnapshot(onFetchError?: () => void): void {
  liveSnapshotAbort?.abort();
  liveSnapshotAbort = new AbortController();
  const { signal } = liveSnapshotAbort;
  void fetchLiveSnapshot(signal)
    .then((s) => {
      if (!shouldApplyIncomingSnapshot(s)) return;
      lastSnap = s;
      applySnapshot(s);
      tickClocks(s);
    })
    .catch((e) => {
      if (e instanceof DOMException && e.name === "AbortError") return;
      onFetchError?.();
    });
}

function pushBingoCloseTimeout(fn: () => void, ms: number): void {
  const id = window.setTimeout(() => {
    const i = bingoCloseTimeouts.indexOf(id);
    if (i >= 0) bingoCloseTimeouts.splice(i, 1);
    fn();
  }, ms);
  bingoCloseTimeouts.push(id);
}

function cancelBingoClosing(): void {
  bingoClosePipelineActive = false;
  if (bingoCloseRafId !== 0) {
    cancelAnimationFrame(bingoCloseRafId);
    bingoCloseRafId = 0;
  }
  for (const t of bingoCloseTimeouts) clearTimeout(t);
  bingoCloseTimeouts.length = 0;
  document.querySelector("#bd-root")?.classList.remove("sd--closing");
}

function scheduleBingoCloseSequence(): void {
  const root = document.querySelector<HTMLDivElement>("#bd-root");
  if (!root) return;
  if (bingoClosePipelineActive) return;

  cancelBingoClosing();
  bingoClosePipelineActive = true;

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const afterLandingMs = reduced
    ? Math.max(80, Math.round(BINGO_CLOSE_AFTER_LANDING_MS * BINGO_CLOSE_REDUCED_MOTION_FACTOR))
    : BINGO_CLOSE_AFTER_LANDING_MS;
  const curtainMs = reduced
    ? Math.max(400, Math.round(BINGO_CLOSE_CURTAIN_MS * BINGO_CLOSE_REDUCED_MOTION_FACTOR))
    : BINGO_CLOSE_CURTAIN_MS;

  const waitTrajectory = (): void => {
    if (!bingoClosePipelineActive) return;
    if (ballAnimRunning) {
      bingoCloseRafId = requestAnimationFrame(waitTrajectory);
      return;
    }
    bingoCloseRafId = 0;

    const landingRemain = Math.max(0, heroLandingUntilMs - performance.now());
    const delayMs = landingRemain + afterLandingMs;

    pushBingoCloseTimeout(() => {
      if (!bingoClosePipelineActive) return;
      root.classList.add("sd--closing");
      pushBingoCloseTimeout(() => {
        if (!bingoClosePipelineActive) return;
        root.classList.remove("sd--closing");
        const snap = lastSnap;
        if (snap) {
          applySnapshotInner(snap);
          lastAppliedPhase = snap.phase;
          tickClocks(snap);
        }
        bingoClosePipelineActive = false;
        fetchAndApplyLiveSnapshot();
      }, curtainMs);
    }, delayMs);
  };

  waitTrajectory();
}

/** Deben coincidir con `.bd-hist-img` y `gap` en estilos del historial */
const HISTORY_BASE_BALL_PX = 92;
const HISTORY_BASE_GAP_PX = 14;

/** Contexto del último render del historial (para recalcular al redimensionar el panel). */
let lastHistoryStripCur: NonNullable<LiveSnapshot["current"]> | null = null;

/** Cuántas bolas caben a tamaño fijo en el strip (sin escalar ni scroll). */
function historyMaxBallsForInnerWidth(innerPx: number): number {
  const slot = HISTORY_BASE_BALL_PX + HISTORY_BASE_GAP_PX;
  return Math.max(1, Math.floor((innerPx + HISTORY_BASE_GAP_PX) / slot));
}

function measureHistoryStripInnerPx(): number {
  const row = document.querySelector<HTMLElement>("#bd-history");
  const strip = row?.parentElement;
  if (!row || !strip?.classList.contains("bd-historial-panel__strip")) return 0;
  const cs = getComputedStyle(strip);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  return Math.max(0, strip.clientWidth - padX);
}

/** Tamaño fijo siempre; sin scroll — el sobrante se resuelve mostrando solo las más recientes. */
function applyHistoryStripFixedLayout(): void {
  const row = document.querySelector<HTMLElement>("#bd-history");
  const strip = row?.parentElement;
  if (!row || !strip?.classList.contains("bd-historial-panel__strip")) return;

  const n = row.children.length;
  if (n === 0) {
    row.style.removeProperty("gap");
    row.style.removeProperty("width");
    row.style.removeProperty("min-width");
    row.style.removeProperty("box-sizing");
    strip.scrollLeft = 0;
    return;
  }

  row.style.gap = `${HISTORY_BASE_GAP_PX}px`;
  row.style.width = "max-content";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";
  row.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    img.style.width = `${HISTORY_BASE_BALL_PX}px`;
    img.style.height = `${HISTORY_BASE_BALL_PX}px`;
  });
  strip.scrollLeft = 0;
}

function refreshHistoryStripOnResize(): void {
  if (lastHistoryStripCur) {
    renderHistoryStrip(lastHistoryStripCur);
  } else {
    applyHistoryStripFixedLayout();
  }
}

function renderHistoryStrip(cur: NonNullable<LiveSnapshot["current"]>): void {
  lastHistoryStripCur = cur;
  const row = document.querySelector<HTMLDivElement>("#bd-history");
  if (!row) return;

  const inner = measureHistoryStripInnerPx();
  const maxBalls = inner > 0 ? historyMaxBallsForInnerWidth(inner) : 12;
  const drawn = cur.drawn;
  const visible =
    drawn.length <= maxBalls ? drawn : drawn.slice(Math.max(0, drawn.length - maxBalls));

  row.innerHTML = visible
    .map((n) => {
      const isNew = n === cur.lastBall;
      const src = esc(ballNumberedUrl(n));
      return `<img class="bd-hist-img" src="${src}" alt="" data-new="${isNew ? "1" : "0"}" loading="eager" decoding="async" />`;
    })
    .join("");
  applyHistoryStripFixedLayout();
}

function syncCurrentBallHero(v: number | null): void {
  const hero = document.querySelector<HTMLDivElement>("#bd-current-hero");
  const ballImg = document.querySelector<HTMLImageElement>("#bd-current-ball-img");
  const numEl = document.querySelector<HTMLDivElement>("#bd-current-num");
  if (!numEl) return;
  if (v != null && ballImg) {
    const url = ballNumberedUrl(v);
    numEl.textContent = String(v);
    numEl.classList.add("sr-only");
    numEl.classList.remove("bd-bola-actual__num--ghost");
    hero?.setAttribute("data-has-ball", "1");

    const prevBall = hero?.dataset.currentBall;
    const ballChanged = prevBall !== String(v);
    if (hero) hero.dataset.currentBall = String(v);

    ballImg.alt = `Bola ${v}`;
    ballImg.hidden = false;

    const reveal = (): void => {
      ballImg.classList.remove("bd-bola-actual__img--swap");
    };

    if (ballChanged && prevBall !== undefined) {
      ballImg.classList.add("bd-bola-actual__img--swap");
    }
    ballImg.src = url;

    if (ballChanged && prevBall !== undefined) {
      if (typeof ballImg.decode === "function") {
        void ballImg.decode().then(reveal).catch(reveal);
      } else if (ballImg.complete) {
        requestAnimationFrame(reveal);
      } else {
        ballImg.addEventListener("load", reveal, { once: true });
        ballImg.addEventListener("error", reveal, { once: true });
      }
    } else {
      reveal();
    }
  } else {
    numEl.textContent = v != null ? String(v) : "—";
    numEl.classList.remove("sr-only");
    numEl.classList.toggle("bd-bola-actual__num--ghost", v == null);
    if (ballImg) {
      ballImg.hidden = true;
      ballImg.classList.remove("bd-bola-actual__img--swap");
    }
    hero?.removeAttribute("data-has-ball");
    if (hero) delete hero.dataset.currentBall;
  }
}

function flushBallFromLastSnap(): void {
  document.getElementById("bd-root")?.removeAttribute("data-ball-flight");
  const s = lastSnap;
  if (!s?.current || s.phase !== "drawing") return;
  const cur = s.current;
  const v = cur.lastBall ?? null;
  syncCurrentBallHero(v);
  const currentNum = document.querySelector<HTMLDivElement>("#bd-current-num");
  if (currentNum) {
    currentNum.classList.remove("bd-bola-actual__num--pop");
    void currentNum.offsetWidth;
    currentNum.classList.add("bd-bola-actual__num--pop");
  }
  renderHistoryStrip(cur);
}

function updateBallDisplay(s: LiveSnapshot, playPop: boolean): void {
  const cur = s.current;
  const v = cur?.lastBall ?? null;
  syncCurrentBallHero(v);
  const currentNum = document.querySelector<HTMLDivElement>("#bd-current-num");
  if (currentNum && playPop) {
    currentNum.classList.remove("bd-bola-actual__num--pop");
    void currentNum.offsetWidth;
    currentNum.classList.add("bd-bola-actual__num--pop");
  }
  if (cur && s.phase === "drawing") renderHistoryStrip(cur);
  else {
    lastHistoryStripCur = null;
    const row = document.querySelector<HTMLDivElement>("#bd-history");
    if (row) {
      row.innerHTML = "";
      applyHistoryStripFixedLayout();
    }
  }
}

function runTrajectoryAnimation(img: HTMLImageElement, onDone: () => void): void {
  const { p0, p1, p2, p3 } = BALL_PATH;
  const dur = BALL_DROP_DURATION_MS;
  const fadeCut = Math.min(0.42, Math.max(0, BALL_FADE_IN_PORTION));
  const { x1: ex1, y1: ey1, x2: ex2, y2: ey2 } = BALL_EASE;
  const start = performance.now();

  function frame(now: number): void {
    const linearT = Math.min(1, (now - start) / dur);
    const uPath = cssBezierProgress(linearT, ex1, ey1, ex2, ey2);
    const pos = cubicBezierPoint(p0, p1, p2, p3, uPath);

    img.style.left = `${pos.x}px`;
    img.style.top = `${pos.y}px`;
    let opacity = 1;
    if (fadeCut > 0 && linearT < fadeCut) {
      const u = linearT / fadeCut;
      opacity = 1 - (1 - u) * (1 - u);
    }
    img.style.opacity = String(opacity);
    img.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
    const falling = linearT > 0 && linearT < 1;
    img.classList.toggle("bd-fly-ball--falling", falling);
    img.style.filter = falling ? "blur(1px)" : "";

    if (linearT < 1) {
      requestAnimationFrame(frame);
    } else {
      img.classList.remove("bd-fly-ball--falling");
      img.style.filter = "";
      posAtEnd(img, p3);
      runImpactAtChute(img, p3, onDone);
    }
  }

  img.dataset.show = "1";
  img.classList.add("bd-fly-ball--falling");
  requestAnimationFrame(frame);
}

function posAtEnd(img: HTMLImageElement, p3: Pt): void {
  img.style.left = `${p3.x}px`;
  img.style.top = `${p3.y}px`;
  img.style.filter = "";
  img.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
}

const BALL_SPAWN_FX_MS = 300;

/** Partículas discretas al aparecer la bola en el tubo (salida p0). */
function playBallSpawnSparkle(x: number, y: number): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = document.getElementById("bd-fly-spawn");
  if (!el) return;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.hidden = false;
  el.classList.remove("bd-fly-spawn--play");
  void el.offsetWidth;
  el.classList.add("bd-fly-spawn--play");
  window.setTimeout(() => {
    el.classList.remove("bd-fly-spawn--play");
    el.hidden = true;
  }, BALL_SPAWN_FX_MS);
}

function playCurrentBallLandingFx(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    heroLandingUntilMs = 0;
    return;
  }
  const disk = document.querySelector<HTMLElement>("#bd-current-disk");
  if (!disk) {
    heroLandingUntilMs = 0;
    return;
  }
  const endAt = performance.now() + BALL_LANDING_HERO_TOTAL_MS + 80;
  heroLandingUntilMs = endAt;
  disk.classList.remove("bd-bola-actual--landing");
  void disk.offsetWidth;
  disk.classList.add("bd-bola-actual--landing");
  const done = (): void => {
    disk.classList.remove("bd-bola-actual--landing");
    heroLandingUntilMs = 0;
  };
  disk.addEventListener("animationend", done, { once: true });
  window.setTimeout(done, BALL_LANDING_HERO_TOTAL_MS + 80);
}

function scheduleBallDropAnimation(ballNum: number): void {
  const img = document.querySelector<HTMLImageElement>("#bd-flying-ball-img");
  if (!img) {
    ballAnimRunning = false;
    flushBallFromLastSnap();
    return;
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const url = ballNumberedUrl(ballNum);
  img.alt = String(ballNum);

  const finish = (): void => {
    ballAnimRunning = false;
    const s = lastSnap;
    const cur = s?.current;
    /** Si el snapshot ya pasó a idle mientras volaba la bola, igual mostrar esa bola en el disco y el landing. */
    const v = cur?.lastBall ?? ballNum;

    if (v != null) {
      syncCurrentBallHero(v);
    }

    img.classList.remove("bd-fly-ball--falling", "bd-fly-ball--impact-flash");
    img.dataset.show = "0";
    img.style.left = "";
    img.style.top = "";
    img.style.transform = "";
    img.style.opacity = "";
    img.style.filter = "";

    document.getElementById("bd-root")?.removeAttribute("data-ball-flight");

    if (v != null) {
      playCurrentBallLandingFx();
    }

    if (cur && s?.phase === "drawing") {
      renderHistoryStrip(cur);
    }
  };

  if (reduced) {
    const { p3 } = BALL_PATH;
    const snap = (): void => {
      document.getElementById("bd-root")?.setAttribute("data-ball-flight", "1");
      img.style.opacity = "1";
      img.dataset.show = "1";
      img.style.left = `${p3.x}px`;
      img.style.top = `${p3.y}px`;
      img.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
      window.setTimeout(finish, 120);
    };
    img.onerror = () => {
      img.onerror = null;
      finish();
    };
    img.src = url;
    if (typeof img.decode === "function") {
      void img.decode().then(snap).catch(snap);
    } else if (img.complete) {
      snap();
    } else {
      img.onload = () => {
        img.onload = null;
        snap();
      };
    }
    return;
  }

  const startAnim = (): void => {
    const { p0 } = BALL_PATH;
    document.getElementById("bd-root")?.setAttribute("data-ball-flight", "1");
    img.style.opacity = "0";
    img.style.left = `${p0.x}px`;
    img.style.top = `${p0.y}px`;
    img.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
    playBallSpawnSparkle(p0.x, p0.y);
    runTrajectoryAnimation(img, finish);
  };

  img.onerror = () => {
    img.onerror = null;
    finish();
  };
  img.src = url;
  if (typeof img.decode === "function") {
    void img.decode().then(startAnim).catch(startAnim);
  } else {
    img.onload = () => {
      img.onload = null;
      startAnim();
    };
    if (img.complete) startAnim();
  }
}

/** Invalida callbacks del overlay 3-2-1 al salir de sorteo o al iniciar otro ciclo. */
let roundIntroChainId = 0;
const roundIntroTimerIds: ReturnType<typeof setTimeout>[] = [];

function hideRoundIntroLayer(): void {
  const layer = document.querySelector<HTMLElement>("#bd-round-intro");
  const numEl = document.querySelector<HTMLElement>("#bd-round-intro-num");
  numEl?.classList.remove("bd-round-intro__num--pop");
  if (layer) {
    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
  }
  document.querySelector("#bd-root")?.classList.remove("sd--round-intro");
}

function clearRoundIntroTimers(): void {
  for (const id of roundIntroTimerIds) clearTimeout(id);
  roundIntroTimerIds.length = 0;
}

function cancelRoundIntro(): void {
  roundIntroChainId++;
  clearRoundIntroTimers();
  hideRoundIntroLayer();
}

function finishRoundOpeningSequence(chain: number): void {
  if (chain !== roundIntroChainId) return;
  roundOpeningHoldApply = false;
  const snap = lastSnap;
  if (snap?.phase === "drawing") {
    applySnapshotInner(snap);
    tickClocks(snap);
  }
}

/** Cuenta 3-2-1 y pasa al sorteo normal; la API espera `ROUND_POST_COUNTDOWN_WAIT_MS` antes de la 1ª bola. */
function startRoundIntroCountdown(): void {
  cancelRoundIntro();
  const root = document.querySelector<HTMLElement>("#bd-root");
  const layer = document.querySelector<HTMLElement>("#bd-round-intro");
  const numEl = document.querySelector<HTMLElement>("#bd-round-intro-num");
  if (!layer || !numEl || !root) return;

  const chain = roundIntroChainId;
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced) {
    finishRoundOpeningSequence(chain);
    return;
  }

  const stepMs = ROUND_COUNTDOWN_STEP_MS;
  const values = ROUND_COUNTDOWN_VALUES;

  root.classList.add("sd--round-intro");
  layer.hidden = false;
  layer.setAttribute("aria-hidden", "false");

  const step = (idx: number): void => {
    if (chain !== roundIntroChainId) return;
    if (idx >= values.length) {
      clearRoundIntroTimers();
      hideRoundIntroLayer();
      finishRoundOpeningSequence(chain);
      return;
    }
    numEl.textContent = String(values[idx]);
    numEl.classList.remove("bd-round-intro__num--pop");
    void numEl.offsetWidth;
    numEl.classList.add("bd-round-intro__num--pop");
    const id = window.setTimeout(() => step(idx + 1), stepMs);
    roundIntroTimerIds.push(id);
  };

  step(0);
}

function applySnapshotInner(s: LiveSnapshot): void {
  const root = document.querySelector<HTMLDivElement>("#bd-root");
  const cur = s.current;
  const live = s.phase === "drawing";

  if (root) {
    root.classList.toggle("sd--idle", !live);
    root.classList.toggle("sd--live", live);
  }

  const liveDot = document.querySelector<HTMLSpanElement>("#bd-live-dot");
  const phaseLive = document.querySelector<HTMLDivElement>("#bd-phase-live");
  if (liveDot && phaseLive) {
    liveDot.dataset.on = live ? "1" : "0";
    phaseLive.dataset.active = live ? "1" : "0";
  }

  const roomLine = document.querySelector<HTMLElement>("#bd-room-line");
  if (roomLine) {
    roomLine.textContent = cur ? cur.name : s.roomTitle || "—";
  }

  const matchId = document.querySelector<HTMLSpanElement>("#bd-match-id");
  if (matchId) {
    matchId.textContent =
      cur && typeof cur.roundSequence === "number" ? `#${cur.roundSequence}` : "#—";
  }

  const bingoTypeEl = document.querySelector<HTMLSpanElement>("#bd-bingo-type");
  if (bingoTypeEl) bingoTypeEl.textContent = cur ? `${ballLabel(cur.bingoType)} bolas` : "—";

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

  const remainCount =
    cur && live ? cur.remainingBallNumbers?.length ?? cur.remainingInQueue : null;

  const faltanEl = document.querySelector<HTMLElement>("#bd-faltan-bolas");
  if (faltanEl) {
    if (remainCount != null) {
      if (remainCount === 0) {
        const prevStr = faltanEl.dataset.remain ?? "";
        if (!faltanEl.classList.contains("bd-faltan-line--ultima")) {
          faltanEl.classList.add("bd-faltan-line--ultima");
          faltanEl.innerHTML =
            '<span class="bd-faltan-bolas__num bd-faltan-bolas__num--ultima mono" id="bd-faltan-count">ÚLTIMA BOLA</span>';
          faltanEl.dataset.remain = "0";
          if (prevStr !== "" && prevStr !== "0") {
            const popEl = faltanEl.querySelector<HTMLElement>("#bd-faltan-count");
            if (popEl) triggerFaltanCountPop(popEl);
          }
        }
        faltanEl.hidden = false;
      } else {
        let faltanNumEl = faltanEl.querySelector<HTMLElement>("#bd-faltan-count");
        if (faltanEl.classList.contains("bd-faltan-line--ultima") || !faltanNumEl) {
          faltanNumEl = restoreFaltanThreePartRow(faltanEl);
        }
        const nextStr = String(remainCount);
        const prevStr = faltanEl.dataset.remain ?? "";
        faltanNumEl.textContent = nextStr;
        faltanEl.dataset.remain = nextStr;
        faltanEl.hidden = false;
        if (prevStr !== "" && prevStr !== nextStr) {
          triggerFaltanCountPop(faltanNumEl);
        }
      }
    } else {
      let faltanNumEl = faltanEl.querySelector<HTMLElement>("#bd-faltan-count");
      if (faltanEl.classList.contains("bd-faltan-line--ultima") || !faltanNumEl) {
        faltanNumEl = restoreFaltanThreePartRow(faltanEl);
      } else {
        faltanEl.classList.remove("bd-faltan-line--ultima");
      }
      faltanNumEl.textContent = "—";
      delete faltanEl.dataset.remain;
      faltanEl.hidden = false;
    }
  }

  const bolilleroEl = document.querySelector<HTMLElement>("#bd-bolillero");
  if (bolilleroEl) bolilleroEl.dataset.mixing = live ? "1" : "0";

  const v = cur?.lastBall ?? null;
  const changed = v != null && v !== prevLastBall;
  const flyingImg = document.querySelector<HTMLImageElement>("#bd-flying-ball-img");
  const drawnLen = cur?.drawn?.length ?? 0;
  const isFirstBallOfRound = drawnLen === 1 && prevLastBall == null;
  const shouldAnimateBall = Boolean(
    live &&
      changed &&
      flyingImg &&
      v != null &&
      !ballAnimRunning &&
      (prevLastBall != null || isFirstBallOfRound),
  );

  if (shouldAnimateBall && v != null) {
    prevLastBall = v;
    ballAnimRunning = true;
    scheduleBallDropAnimation(v);
  } else if (!ballAnimRunning) {
    prevLastBall = v;
    updateBallDisplay(s, Boolean(changed && live));
  }
}

function applySnapshot(s: LiveSnapshot): void {
  const root = document.querySelector<HTMLDivElement>("#bd-root");
  const live = s.phase === "drawing";

  if (!live) {
    cancelRoundIntro();
    roundOpeningHoldApply = false;
  }

  if (live && root?.classList.contains("sd--closing")) {
    cancelBingoClosing();
    applySnapshotInner(s);
    lastAppliedPhase = s.phase;
    return;
  }

  if (!live && lastAppliedPhase === "drawing") {
    if (bingoClosePipelineActive) return;
    scheduleBingoCloseSequence();
    return;
  }

  if (live && lastAppliedPhase === "idle") {
    cancelBingoClosing();
    roundOpeningHoldApply = true;
    applySnapshotInner(s);
    lastAppliedPhase = s.phase;
    startRoundIntroCountdown();
    return;
  }

  if (live && roundOpeningHoldApply) {
    tickClocks(s);
    return;
  }

  cancelBingoClosing();
  applySnapshotInner(s);
  lastAppliedPhase = s.phase;
}

/** Cuenta atrás al próximo sorteo (`nextScheduledAt`). Idle: bloque central; sorteo: cabecera. */
function formatNextDrawCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  if (totalSec >= 86400) {
    const d = Math.floor(totalSec / 86400);
    const rest = totalSec % 86400;
    const h = Math.floor(rest / 3600);
    const m = Math.floor((rest % 3600) / 60);
    const sec = rest % 60;
    return `${d}d ${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
  }
  if (totalSec >= 3600) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const sec = totalSec % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
  }
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${pad2(m)}:${pad2(sec)}`;
}

function tickClocks(s: LiveSnapshot | null): void {
  const clockEl = document.querySelector<HTMLSpanElement>("#bd-clock");
  const cdEl = document.querySelector<HTMLSpanElement>("#bd-next-cd");
  const idleCdEl = document.querySelector<HTMLSpanElement>("#bd-idle-cd");

  /** Cabecera (solo visible en sorteo): mismo tiempo al próximo sorteo que en espera. */
  let headerCd = "—";
  /** Centro (solo visible en espera): tiempo al próximo sorteo. */
  let idleCd = "—";

  if (clockEl) {
    clockEl.textContent = new Date().toLocaleTimeString("es", { hour12: false });
  }

  if (s?.nextScheduledAt) {
    const t = new Date(s.nextScheduledAt).getTime() - Date.now();
    const txt = formatNextDrawCountdown(t);
    if (s.phase === "idle") idleCd = txt;
    else if (s.phase === "drawing") headerCd = txt;
  }

  if (cdEl) cdEl.textContent = headerCd;
  if (idleCdEl) idleCdEl.textContent = idleCd;
}

const DISPLAY_MARKUP = `
  <div class="bd-canvas sd--idle" id="bd-root">
    <div class="bd-fondo" aria-hidden="true"></div>

    <div class="bd-machine-cluster" aria-hidden="true">
      <div class="bd-glow bd-glow--bol"></div>
      <div class="bd-escenario bd-escenario--machine"></div>
      <div class="bd-bolillero-sombra"></div>
      <div class="bd-bolillero-wrap" id="bd-bolillero" data-mixing="0">
        <div class="bd-bolillero-inner">
          <img
            class="bd-bolillero bd-bolillero--main"
            src="/Bingo2/bolillero.png"
            alt=""
          />
          <img
            class="bd-bolillero bd-bolillero--reflect"
            src="/Bingo2/bolillero.png"
            alt=""
            aria-hidden="true"
          />
        </div>
      </div>
    </div>

    <div class="bd-fly" id="bd-fly-layer">
      <div class="bd-fly-spawn" id="bd-fly-spawn" hidden aria-hidden="true">
        <span class="bd-fly-spawn__dot"></span>
        <span class="bd-fly-spawn__dot"></span>
        <span class="bd-fly-spawn__dot"></span>
        <span class="bd-fly-spawn__dot"></span>
        <span class="bd-fly-spawn__dot"></span>
        <span class="bd-fly-spawn__dot"></span>
      </div>
      <img class="bd-fly-ball" id="bd-flying-ball-img" data-show="0" alt="" />
    </div>

    <div class="bd-current-hero sd-show-live" id="bd-current-hero" aria-label="Sorteo en vivo">
      <p class="bd-current-hero__title bd-faltan-line" id="bd-faltan-bolas">
        <span class="bd-faltan-bolas__label">FALTAN</span>
        <span class="bd-faltan-bolas__num mono" id="bd-faltan-count">—</span>
        <span class="bd-faltan-bolas__label">BOLAS</span>
      </p>
      <div class="bd-bola-actual" id="bd-current-disk">
        <img class="bd-bola-actual__img" id="bd-current-ball-img" hidden alt="" />
        <div id="bd-current-num" class="bd-bola-actual__num mono bd-bola-actual__num--ghost" aria-live="polite">—</div>
      </div>
    </div>

    <header class="bd-header">
      <div class="bd-brand">
        <span class="bd-brand__crown" aria-hidden="true">♛</span>
        <span class="bd-brand__text">BINGO</span>
      </div>
      <div class="bd-header__cluster">
        <div class="bd-hcard bd-hcard--live bd-live" id="bd-phase-live" data-active="0">
          <span class="bd-live__dot" id="bd-live-dot" data-on="0"></span>
          <span>EN VIVO</span>
        </div>
        <div class="bd-hcard bd-hcard--clock mono">
          <span class="bd-hcard__k">HORA</span>
          <span class="bd-hcard__v" id="bd-clock">00:00:00</span>
        </div>
        <div class="bd-hcard bd-hcard--meta sd-show-live">
          <span class="bd-hcard__k">ROOM</span>
          <span class="bd-hcard__v mono" id="bd-room-line">—</span>
        </div>
        <div class="bd-hcard bd-hcard--meta sd-show-live">
          <span class="bd-hcard__k">TIPO DE BINGO</span>
          <span class="bd-hcard__v mono" id="bd-bingo-type">—</span>
        </div>
        <div class="bd-hcard bd-hcard--meta sd-show-live">
          <span class="bd-hcard__k">PARTIDA</span>
          <span class="bd-hcard__v mono"><span id="bd-match-id">#—</span></span>
        </div>
        <div class="bd-hcard bd-hcard--next sd-show-live">
          <span class="bd-hcard__k">PRÓXIMO SORTEO EN</span>
          <span class="bd-hcard__v mono bd-hcard__v--gold" id="bd-next-cd">—</span>
        </div>
      </div>
    </header>

    <p class="bd-banner sd-next-banner" id="bd-next-banner" hidden></p>

    <section class="bd-idle sd-show-idle" aria-label="Próximo sorteo">
      <p class="bd-idle__kicker">Próximo sorteo</p>
      <p class="bd-idle__room mono" id="bd-idle-room">—</p>
      <p class="bd-idle__when mono" id="bd-idle-when"></p>
      <div class="bd-idle__cd mono" id="bd-idle-cd">—</div>
      <p class="bd-idle__sub">Tiempo restante para el inicio</p>
    </section>

    <aside class="bd-rail bd-rail--izq sd-show-live" aria-label="Premios y métricas">
      <div class="bd-rail-block">
        <h2 class="bd-rail-title">Premios</h2>
        <div class="bd-prizes-stack" id="bd-prizes"></div>
      </div>
      <article class="bd-card bd-card--metric">
        <span class="bd-card__label">Jugadores conectados</span>
        <strong class="bd-card__value mono" id="bd-stat-players">—</strong>
      </article>
    </aside>

    <aside class="bd-rail bd-rail--der sd-show-live" aria-label="Próximos sorteos">
      <h2 class="bd-rail-title">Próximos sorteos</h2>
      <div id="bd-upcoming-body"><p class="bd-muted">Cargando…</p></div>
    </aside>

    <section class="bd-historial-panel sd-show-live" aria-label="Últimas bolas">
      <h3 class="bd-historial-panel__title">ÚLTIMAS BOLAS</h3>
      <div class="bd-historial-panel__strip">
        <div id="bd-history" class="bd-historial-panel__row"></div>
      </div>
    </section>

    <div class="bd-bingo-close" aria-hidden="true">
      <div class="bd-bingo-close__veil"></div>
      <div class="bd-bingo-close__content">
        <p class="bd-bingo-close__title">Sorteo finalizado</p>
        <p class="bd-bingo-close__sub">Gracias por jugar</p>
      </div>
    </div>

    <div id="bd-round-intro" class="bd-round-intro" hidden aria-hidden="true">
      <div class="bd-round-intro__backdrop" aria-hidden="true"></div>
      <div class="bd-round-intro__center">
        <span id="bd-round-intro-num" class="bd-round-intro__num mono" aria-live="assertive"></span>
      </div>
    </div>
  </div>
`;

function connectEventSource(): void {
  const url = liveEventsUrl();
  const es = new EventSource(url);

  es.addEventListener("state", (ev) => {
    try {
      const s = JSON.parse((ev as MessageEvent).data) as LiveSnapshot;
      if (!shouldApplyIncomingSnapshot(s)) return;
      lastSnap = s;
      applySnapshot(s);
      tickClocks(s);
    } catch {
      /* ignore */
    }
  });

  es.addEventListener("ball", () => {
    fetchAndApplyLiveSnapshot();
  });

  es.addEventListener("round_start", () => {
    prevLastBall = null;
    fetchAndApplyLiveSnapshot();
    refreshUpcomingPanel?.();
  });

  es.addEventListener("round_end", () => {
    fetchAndApplyLiveSnapshot();
    refreshUpcomingPanel?.();
  });

  es.addEventListener("idle", () => {
    fetchAndApplyLiveSnapshot();
    refreshUpcomingPanel?.();
  });

  es.onerror = () => {
    es.close();
    setTimeout(connectEventSource, 2500);
  };
}

function applyBallAnchorCss(root: HTMLElement): void {
  const { x, y } = CURRENT_BALL_CENTER;
  root.style.setProperty("--bd-cball-x", `${x}px`);
  root.style.setProperty("--bd-cball-y", `${y}px`);
}

function mountDisplay(host: HTMLElement): void {
  host.innerHTML = DISPLAY_MARKUP;

  const canvas = host.querySelector<HTMLElement>("#bd-root");
  if (canvas) applyBallAnchorCss(canvas);

  const histOuter = host.querySelector<HTMLElement>(".bd-historial-panel__strip");
  if (histOuter && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => refreshHistoryStripOnResize());
    ro.observe(histOuter);
  }

  const upcomingBody = host.querySelector<HTMLElement>("#bd-upcoming-body")!;
  if (!upcomingBody) throw new Error("#bd-upcoming-body missing");

  async function renderUpcoming() {
    try {
      const data = await fetchUpcoming({ limit: 5, horizonDays: 14 });
      const rows = data.upcoming.slice(0, 5);
      if (!rows.length) {
        upcomingBody.innerHTML = `<p class="bd-muted">Sin fechas en el horizonte.</p>`;
        return;
      }

      upcomingBody.innerHTML = `
      <ul class="bd-up-list">
        ${rows
          .map(
            (r, idx) => {
              const cdMs = new Date(r.startsAt).getTime() - Date.now();
              const cd = formatNextDrawCountdown(cdMs);
              return `
          <li class="bd-up-card">
            <span class="bd-up-card__badge mono">${idx + 1}</span>
            <div class="bd-up-card__body">
              <span class="bd-up-card__partida mono">PARTIDA #${r.roundSequence != null ? esc(String(r.roundSequence)) : "—"}</span>
              <span class="bd-up-card__time mono">${esc(formatUpcomingStart(r.startsAt))}</span>
              <span class="bd-up-card__cd mono">en ${esc(cd)}</span>
            </div>
          </li>`;
            },
          )
          .join("")}
      </ul>
    `;
    } catch (e) {
      upcomingBody.innerHTML = `<p class="bd-err">${esc(e instanceof Error ? e.message : "Error")}</p>`;
    }
  }

  fetchAndApplyLiveSnapshot(() => tickClocks(null));

  setInterval(() => tickClocks(lastSnap), 1000);

  refreshUpcomingPanel = () => void renderUpcoming();
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
