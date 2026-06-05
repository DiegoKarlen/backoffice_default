function envMs(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

let drawInterval = envMs("BINGO_DRAW_INTERVAL_MS", 2200);
if (drawInterval < 300) drawInterval = 300;

export const drawIntervalMs = drawInterval;

const ROUND_COUNTDOWN_UI_MS = 5400;
const ROUND_POST_COUNTDOWN_WAIT_MS = envMs(
  "BINGO_ROUND_POST_COUNTDOWN_WAIT_MS",
  envMs("BINGO_ROUND_BOLILLERO_BEAT_MS", 2000),
);

export const ROUND_INTRO_MS = envMs(
  "BINGO_ROUND_INTRO_MS",
  ROUND_COUNTDOWN_UI_MS + ROUND_POST_COUNTDOWN_WAIT_MS,
);

export const IDLE_POLL_MS = envMs("BINGO_SCHEDULER_POLL_MS", 60_000);
