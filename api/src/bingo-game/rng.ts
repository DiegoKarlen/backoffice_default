import { randomInt as nodeRandomInt } from "node:crypto";

/**
 * =============================================================================
 * Gaming RNG — orientación a revisión de laboratorio (p. ej. GLI)
 * =============================================================================
 *
 * Esto NO es una certificación GLI: la certificación la otorga un laboratorio
 * sobre el producto y el proceso. Este módulo sigue prácticas que suelen
 * solicitarse en auditorías de RNG para juegos de azar:
 *
 * 1) Fuente de aleatoriedad
 *    - Solo `crypto.randomInt` de Node.js (`node:crypto`), respaldado por el
 *      CSPRNG del sistema operativo (vía OpenSSL/LibreSSL según build).
 *    - No usar `Math.random()` ni PRNGs débiles para resultados de juego.
 *
 * 2) Uniformidad
 *    - Enteros uniformes en rango inclusivo mediante la API nativa de Node.
 *    - Permutaciones: Fisher–Yates (barajado in-place), sin sesgo conocido
 *      cuando los índices j son uniformes en [0..i].
 *
 * 3) Aislamiento
 *    - Todo sorteo usado por el motor de bingo debe pasar por este archivo.
 *
 * 4) Trazabilidad (opcional en runtime)
 *    - `BINGO_RNG_AUDIT_LOG=1`: líneas JSON (una por evento) — aptas para
 *      correlacionar con registros de partida en revisión.
 *    - `BINGO_RNG_AUDIT_VERBOSE=1`: además, una línea por cada entero
 *      aleatorio interno (barajado; puede ser muy verboso).
 *
 * Identidad de implementación (para trazabilidad de build / informes):
 */
export const RNG_IMPLEMENTATION_ID = "bingo-game/rng";
export const RNG_IMPLEMENTATION_VERSION = "1.1.0";
export const RNG_CRYPTO_SOURCE = "node:crypto.randomInt";

type AuditPayload = Record<string, unknown>;

function audit(payload: AuditPayload): void {
  if (process.env.BINGO_RNG_AUDIT_LOG !== "1") return;
  console.info(
    JSON.stringify({
      audit: "bingo_rng",
      ts: new Date().toISOString(),
      implId: RNG_IMPLEMENTATION_ID,
      implVersion: RNG_IMPLEMENTATION_VERSION,
      cryptoSource: RNG_CRYPTO_SOURCE,
      ...payload,
    }),
  );
}

/** Para registrar hitos de juego desde `engine.ts` / sesión (fuera del sorteo puro). */
export function emitGameRngAudit(payload: AuditPayload): void {
  audit({ ...payload, layer: "game" });
}

/**
 * Entero aleatorio uniforme en [min, max] (ambos inclusive).
 * Implementación: `crypto.randomInt(min, maxExclusive)` con maxExclusive = max + 1.
 */
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

/**
 * Fisher–Yates in-place: permutación uniforme entre todas las ordenaciones posibles,
 * asumiendo `randomIntInclusive` uniforme en cada paso.
 */
export function shuffleInPlace<T>(arr: T[]): void {
  const length = arr.length;
  audit({ op: "shuffle_start", length, layer: "rng" });

  for (let i = length - 1; i > 0; i--) {
    const j = randomIntInclusive(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  audit({ op: "shuffle_end", length, layer: "rng" });
}
