export type AllocateUniqueFingerprintResult<T> =
  | { ok: true; value: T; fingerprint: string }
  | { ok: false; reason: "exhausted" };

/**
 * Genera valores hasta obtener un fingerprint no usado.
 * `persist` puede fallar con `duplicate: true` (p. ej. race en unique DB) y se reintenta.
 */
export async function allocateWithUniqueFingerprint<T>(params: {
  maxAttempts: number;
  generate: () => T;
  getFingerprint: (value: T) => string;
  isTaken: (fingerprint: string) => Promise<boolean>;
  persist: (value: T, fingerprint: string) => Promise<void>;
}): Promise<AllocateUniqueFingerprintResult<T>> {
  const { maxAttempts, generate, getFingerprint, isTaken, persist } = params;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const value = generate();
    const fingerprint = getFingerprint(value);
    if (await isTaken(fingerprint)) continue;

    try {
      await persist(value, fingerprint);
      return { ok: true, value, fingerprint };
    } catch (e) {
      if (isDuplicatePersistError(e)) continue;
      throw e;
    }
  }

  return { ok: false, reason: "exhausted" };
}

export function isDuplicatePersistError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "duplicate" in e &&
    (e as { duplicate: boolean }).duplicate === true
  );
}

export class DuplicateFingerprintError extends Error {
  readonly duplicate = true;

  constructor(message = "Fingerprint already persisted") {
    super(message);
    this.name = "DuplicateFingerprintError";
  }
}
