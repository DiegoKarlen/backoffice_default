/**
 * Punto de entrada del paquete de motores de juego (in-process, no microservicio).
 * Guía para agregar variantes/familias: docs/game-engine.md
 */
export type { GameEngineFamily } from "./types.js";

export {
  RNG_IMPLEMENTATION_ID,
  RNG_IMPLEMENTATION_VERSION,
  RNG_CRYPTO_SOURCE,
  emitGameRngAudit,
  randomIntInclusive,
  shuffleInPlace,
  pickDistinct,
} from "./rng/index.js";

export {
  getBingoEngine,
  ballCountForType,
  createBallQueue,
  type BingoVariantEngine,
  type EvaluateAfterBallParams,
  type PrizeAwardBroadcastPayload,
} from "./bingo/registry.js";

export {
  ensureLiveSessionForRoom,
  getLiveSession,
  registerLiveSession,
  rescheduleLiveSessionForRoom,
  type LiveSnapshot,
} from "./bingo/live-session.js";

export {
  bingo75Engine,
  generateBingo75Cells,
  fingerprintCells,
  buildMarkedGrid,
  figureHighlightSlots,
  figureSatisfied,
  type Bingo75Cell,
  type CardCellInput,
} from "./bingo/bingo-75/index.js";

export { bingo90Engine } from "./bingo/bingo-90/index.js";
