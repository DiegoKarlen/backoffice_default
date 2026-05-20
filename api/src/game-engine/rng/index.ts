import { randomInt as nodeRandomInt } from "node:crypto";

/**
 * Gaming RNG — orientación a revisión de laboratorio (p. ej. GLI).
 * Fuente única de aleatoriedad para todos los motores en `game-engine/`.
 */
export const RNG_IMPLEMENTATION_ID = "game-engine/rng";
export const RNG_IMPLEMENTATION_VERSION = "1.2.0";
export const RNG_CRYPTO_SOURCE = "node:crypto.randomInt";

type AuditPayload = Record<string, unknown>;

function audit(payload: AuditPayload): void {
  if (process.env.BINGO_RNG_AUDIT_LOG !== "1") return;
  console.info(
    JSON.stringify({
      audit: "game_rng",
      ts: new Date().toISOString(),
      implId: RNG_IMPLEMENTATION_ID,
      implVersion: RNG_IMPLEMENTATION_VERSION,
      cryptoSource: RNG_CRYPTO_SOURCE,
      ...payload,
    }),
  );
}

/** Hitos de juego desde motores / sesión en vivo (fuera del sorteo puro). */
export function emitGameRngAudit(payload: AuditPayload): void {
  audit({ ...payload, layer: "game" });
}

export function randomIntInclusive(min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    throw new RangeError("randomIntInclusive: invalid range");
  }
  const value = nodeRandomInt(min, max + 1);
  if (process.env.BINGO_RNG_AUDIT_VERBOSE === "1") {
    audit({ op: "randomIntInclusive", min, max, value, layer: "rng" });
  }
  return value;
}

export function shuffleInPlace<T>(arr: T[]): void {
  const length = arr.length;
  audit({ op: "shuffle_start", length, layer: "rng" });

  for (let i = length - 1; i > 0; i--) {
    const j = randomIntInclusive(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  audit({ op: "shuffle_end", length, layer: "rng" });
}

/** `count` enteros distintos uniformes en [min, max] (sin reemplazo). */
export function pickDistinct(count: number, min: number, max: number): number[] {
  const pool: number[] = [];
  for (let i = min; i <= max; i++) pool.push(i);
  shuffleInPlace(pool);
  return pool.slice(0, count);
}
