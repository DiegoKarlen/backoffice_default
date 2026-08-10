import { z } from "zod";

const boolFromEnv = z.union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")]).optional();

function parseBool(v: string | undefined, defaultValue: boolean): boolean {
  if (v === undefined) return defaultValue;
  return v === "true" || v === "1";
}

export type PaymentsProviderId = "stub" | "mixer-gaming";

export type PaymentsEnv = {
  enabled: boolean;
  defaultProvider: PaymentsProviderId;
  defaultCurrency: string;
  defaultCountry: string;
  returnUrlBase: string;
  depositRateLimitMax: number;
  depositRateLimitWindowMs: number;
  mixerGaming?: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
  };
};

function resolveDefaultProvider(raw: string | undefined): PaymentsProviderId {
  if (raw === "mixer-gaming") return "mixer-gaming";
  return "stub";
}

function buildPaymentsEnv(): PaymentsEnv {
  const enabled = parseBool(process.env.PAYMENTS_ENABLED, true);
  const baseUrl = process.env.PAYMENTS_MIXER_GAMING_BASE_URL?.trim().replace(/\/$/, "");
  const clientId = process.env.PAYMENTS_MIXER_GAMING_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYMENTS_MIXER_GAMING_CLIENT_SECRET?.trim();

  let defaultProvider = resolveDefaultProvider(process.env.PAYMENTS_DEFAULT_PROVIDER);
  let mixerGaming: PaymentsEnv["mixerGaming"];

  if (baseUrl && clientId && clientSecret) {
    mixerGaming = { baseUrl, clientId, clientSecret };
  } else if (defaultProvider === "mixer-gaming") {
    defaultProvider = "stub";
  }

  return {
    enabled,
    defaultProvider,
    defaultCurrency: process.env.PAYMENTS_DEFAULT_CURRENCY?.trim() || "ARS",
    defaultCountry: process.env.PAYMENTS_DEFAULT_COUNTRY?.trim() || "AR",
    returnUrlBase: process.env.PAYMENTS_RETURN_URL_BASE?.trim().replace(/\/$/, "") || "http://localhost:5175",
    depositRateLimitMax: Number(process.env.PAYMENTS_DEPOSIT_RATE_LIMIT_MAX ?? 20),
    depositRateLimitWindowMs: Number(process.env.PAYMENTS_DEPOSIT_RATE_LIMIT_WINDOW_MS ?? 900_000),
    mixerGaming,
  };
}

export const paymentsEnv: PaymentsEnv = buildPaymentsEnv();

export function isPaymentsEnabled(): boolean {
  return paymentsEnv.enabled;
}
