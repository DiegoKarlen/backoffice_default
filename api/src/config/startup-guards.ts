/** Known insecure JWT secrets — must not be used when NODE_ENV=production. */
export const INSECURE_JWT_SECRETS = new Set([
  "dev-secret-change-in-production-min-32-chars-long-ok",
  "dev-secret",
  "change-me",
  "changeme",
  "secret",
  "your-secret-key",
]);

export type ProductionStartupOptions = {
  nodeEnv?: string;
  jwtSecret?: string;
};

/**
 * Fail-fast checks before serving traffic in production.
 * WEBHOOK_STUB in prod is validated in `payments/config.ts` at module load.
 */
export function assertProductionStartupConfig(options: ProductionStartupOptions = {}): void {
  const nodeEnv = (options.nodeEnv ?? process.env.NODE_ENV ?? "development").trim();
  if (nodeEnv !== "production") return;

  const jwtSecret = (options.jwtSecret ?? process.env.JWT_SECRET ?? "").trim();
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is required in production");
  }
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }
  const normalized = jwtSecret.toLowerCase();
  if (INSECURE_JWT_SECRETS.has(normalized) || INSECURE_JWT_SECRETS.has(jwtSecret)) {
    throw new Error("JWT_SECRET must not use a development default in production");
  }
  if (/change.?me|dev-secret|example\.com/i.test(jwtSecret)) {
    throw new Error("JWT_SECRET appears to be a development placeholder — rotate before production");
  }
}
