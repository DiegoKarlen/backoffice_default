import { z } from "zod";

const boolFromEnv = z
  .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
  .optional();

function parseBool(v: string | undefined, defaultValue: boolean): boolean {
  if (v === undefined) return defaultValue;
  return v === "true" || v === "1";
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  JWT_2FA_EXPIRES_IN: z.string().default("5m"),
  PUBLIC_BINGO_DISPLAY_ORIGIN: z
    .string()
    .url()
    .optional()
    .transform((v) => (v ? v.replace(/\/$/, "") : undefined)),
  CORS_ORIGINS: z.string().optional(),
  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900_000),
  UPCOMING_CACHE_TTL_MS: z.coerce.number().int().min(0).default(10_000),
  SSE_BALL_DELTA: boolFromEnv,
  OPENAPI_ENABLED: boolFromEnv,
  OPENAPI_SERVER_URL: z.string().url().optional(),
  MAX_MANUAL_CREDIT_CENTS: z.coerce.number().int().min(1).default(10_000_000),
});

export type AppEnv = {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwt2faExpiresIn: string;
  publicBingoDisplayOrigin?: string;
  corsOrigins: string[];
  authLoginRateLimitMax: number;
  authLoginRateLimitWindowMs: number;
  upcomingCacheTtlMs: number;
  /** When true, emits lightweight `ball_delta` events in addition to `ball`. */
  sseBallDelta: boolean;
  /** Serve Swagger UI at `/api/swagger` when true. */
  openapiEnabled: boolean;
  /** Base URL shown in OpenAPI `servers` (defaults to http://localhost:PORT). */
  openapiServerUrl: string;
  /** Maximum amount (cents) for a single manual wallet credit from backoffice. */
  maxManualCreditCents: number;
};

function buildEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  const e = parsed.data;

  const defaultOrigins = [
    e.PUBLIC_BINGO_DISPLAY_ORIGIN,
    "http://localhost:4000",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:4000",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
  ].filter((x): x is string => Boolean(x));

  const corsFromEnv = parseOrigins(e.CORS_ORIGINS);
  const corsOrigins = [...new Set([...corsFromEnv, ...defaultOrigins])];

  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    jwtExpiresIn: e.JWT_EXPIRES_IN,
    jwt2faExpiresIn: e.JWT_2FA_EXPIRES_IN,
    publicBingoDisplayOrigin: e.PUBLIC_BINGO_DISPLAY_ORIGIN,
    corsOrigins,
    authLoginRateLimitMax: e.AUTH_LOGIN_RATE_LIMIT_MAX,
    authLoginRateLimitWindowMs: e.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
    upcomingCacheTtlMs: e.UPCOMING_CACHE_TTL_MS,
    sseBallDelta: parseBool(e.SSE_BALL_DELTA, false),
    openapiEnabled: parseBool(e.OPENAPI_ENABLED, e.NODE_ENV !== "production"),
    openapiServerUrl:
      e.OPENAPI_SERVER_URL?.replace(/\/$/, "") ?? `http://localhost:${e.PORT}`,
    maxManualCreditCents: e.MAX_MANUAL_CREDIT_CENTS,
  };
}

/** Validated once at process startup. */
export const env: AppEnv = buildEnv();
