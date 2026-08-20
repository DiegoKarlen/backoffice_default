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
  /** Allow POST /webhooks/payments/stub (never in production). */
  webhookStubEnabled: boolean;
  webhookStubSecret: string | undefined;
  webhookMixerSecret: string | undefined;
  webhookRateLimitMax: number;
  webhookRateLimitWindowMs: number;
  isProduction: boolean;
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
  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const isProduction = nodeEnv === "production";

  if (isProduction && parseBool(process.env.WEBHOOK_STUB_ENABLED, false)) {
    throw new Error("WEBHOOK_STUB_ENABLED must be 0 in production");
  }

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

  const webhookStubEnabled = !isProduction && parseBool(process.env.WEBHOOK_STUB_ENABLED, true);
  let webhookStubSecret = process.env.PAYMENTS_WEBHOOK_STUB_SECRET?.trim() || undefined;
  if (webhookStubEnabled && !webhookStubSecret && !isProduction) {
    webhookStubSecret = "dev-webhook-stub-secret";
  }
  const webhookMixerSecret = process.env.PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET?.trim() || undefined;

  if (webhookStubEnabled && !webhookStubSecret) {
    throw new Error("PAYMENTS_WEBHOOK_STUB_SECRET is required when stub webhooks are enabled");
  }

  if (isProduction && mixerGaming && !webhookMixerSecret) {
    throw new Error(
      "PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET is required in production when Mixer is configured",
    );
  }

  return {
    enabled,
    defaultProvider,
    defaultCurrency: process.env.PAYMENTS_DEFAULT_CURRENCY?.trim() || "ARS",
    defaultCountry: process.env.PAYMENTS_DEFAULT_COUNTRY?.trim() || "AR",
    returnUrlBase: process.env.PAYMENTS_RETURN_URL_BASE?.trim().replace(/\/$/, "") || "http://localhost:5175",
    depositRateLimitMax: Number(process.env.PAYMENTS_DEPOSIT_RATE_LIMIT_MAX ?? 20),
    depositRateLimitWindowMs: Number(process.env.PAYMENTS_DEPOSIT_RATE_LIMIT_WINDOW_MS ?? 900_000),
    webhookStubEnabled,
    webhookStubSecret,
    webhookMixerSecret,
    webhookRateLimitMax: Number(process.env.PAYMENTS_WEBHOOK_RATE_LIMIT_MAX ?? 120),
    webhookRateLimitWindowMs: Number(process.env.PAYMENTS_WEBHOOK_RATE_LIMIT_WINDOW_MS ?? 900_000),
    isProduction,
    mixerGaming,
  };
}

export const paymentsEnv: PaymentsEnv = buildPaymentsEnv();

export function isPaymentsEnabled(): boolean {
  return paymentsEnv.enabled;
}

export function isStubWebhookEnabled(): boolean {
  return paymentsEnv.webhookStubEnabled;
}
