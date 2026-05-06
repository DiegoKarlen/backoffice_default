/** Lienzo fijo broadcast (coordenadas en píxeles). */
export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

/** Caída con sensación de gravedad (no velocidad constante en el espacio). */
export const BALL_DROP_DURATION_MS = 1340;

/**
 * Parte inicial del recorrido (0–1) dedicada al fade-in de la bola (evita aparición brusca).
 */
export const BALL_FADE_IN_PORTION = 0.26;

/**
 * Centro del bloque `.bd-current-hero` en el lienzo (translate -50% -50%).
 * El disco físico queda **más abajo** que este punto porque encima va el texto «FALTAN».
 */
export const HERO_LAYOUT_CENTER = { x: 1180, y: 452 } as const;

/**
 * Curva cúbica: boca del bolillero → centro visual del disco `#bd-current-disk`.
 * p3 ≠ {@link HERO_LAYOUT_CENTER}: el vuelo debe terminar en el disco, no en el centro geométrico
 * de todo el hero (título + disco).
 */
export const BALL_PATH = {
  p0: { x: 798, y: 586 },
  p1: { x: 804, y: 892 },
  p2: { x: 1142, y: 560 },
  p3: { x: 1180, y: 480 },
} as const;

/** Variables CSS `--bd-cball-*`: ancla del hero (la UI no se mueve al retocar solo `BALL_PATH.p3`). */
export const CURRENT_BALL_CENTER = HERO_LAYOUT_CENTER;

/**
 * Easing temporal sobre el parámetro de la trayectoria (caída → remonte más fluido en la parte final).
 */
export const BALL_EASE = {
  x1: 0.38,
  y1: 0.02,
  x2: 0.22,
  y2: 0.94,
} as const;

export function ballNumberedUrl(n: number): string {
  const nn = Math.min(75, Math.max(1, Math.floor(n)));
  return `/broadcast/balls/numbered/ball-${String(nn).padStart(2, "0")}.png`;
}

/**
 * Duración total de la animación de aterrizaje en la bola actual (`#bd-current-disk`).
 * Debe coincidir con `@keyframes bd-bola-actual-landing` en `style.css` (p. ej. 2.2s → 2200).
 */
export const BALL_LANDING_HERO_TOTAL_MS = 2200;

/** Tras terminar el aterrizaje en el disco, espera antes del velo "Sorteo finalizado". */
export const BINGO_CLOSE_AFTER_LANDING_MS = 1000;

/** Cuánto permanece visible el mensaje de cierre antes de pasar a espera / cuenta atrás. */
export const BINGO_CLOSE_CURTAIN_MS = 5000;

/**
 * Con `prefers-reduced-motion`, los dos valores anteriores se multiplican por este factor
 * (esperas más cortas; mínimos aplicados en código).
 */
export const BINGO_CLOSE_REDUCED_MOTION_FACTOR = 0.15;

/**
 * Cuenta atrás al pasar de espera → sorteo (valores mostrados en orden).
 * `ROUND_OPENING_TOTAL_MS` = cuenta + espera antes de la 1ª bola → alinear con API (`BINGO_ROUND_INTRO_MS`).
 */
export const ROUND_COUNTDOWN_VALUES = [3, 2, 1] as const;
/** Tiempo que permanece cada número en pantalla antes del siguiente (ms). */
export const ROUND_COUNTDOWN_STEP_MS = 1800;

/**
 * Tras el 3-2-1 la UI ya muestra el sorteo normal; el servidor espera este tiempo antes de sacar la 1ª bola.
 * Alinear con `BINGO_ROUND_POST_COUNTDOWN_WAIT_MS` / legacy `BINGO_ROUND_BOLILLERO_BEAT_MS` en la API.
 */
export const ROUND_POST_COUNTDOWN_WAIT_MS = 2000;

/** Ms hasta la 1ª bola en servidor = cuenta + esta espera (pantalla normal intermedia). */
export const ROUND_OPENING_TOTAL_MS =
  ROUND_COUNTDOWN_VALUES.length * ROUND_COUNTDOWN_STEP_MS + ROUND_POST_COUNTDOWN_WAIT_MS;

export const BINGO2 = {
  background: "/Bingo2/background.png",
  bolillero: "/Bingo2/bolillero.png",
} as const;
